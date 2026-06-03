import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

////////
// Notes

const FIXTURE_NOTE = "05 - Settings Variations/Buffer Lines Fixture Test.md";
const DYNAMIC_NOTE = "05 - Settings Variations/Buffer Lines Dynamic Test.md";
const EMBED_SELECTOR = ".ddc_ink_embed-block, .ddc_ink_widget-root";

const WRITING_LINE_HEIGHT = 150;
const WRITING_MIN_PAGE_HEIGHT = 375; // 2.5 * WRITING_LINE_HEIGHT
const L = WRITING_LINE_HEIGHT;

////////
// Browser-context helpers
//
// These helpers are installed on window.__inkTest inside browser.execute()
// so they can be reused across calls. The editor is located via React fiber
// traversal — an internal API but stable for the tldraw version in use.

async function installBrowserHelpers() {
	await browser.execute(() => {
		// Start from .ddc_ink_writing-editor (rendered directly by TldrawWritingEditor)
		// and traverse UP through parent fibers to find TldrawWritingEditor's hook states.
		// This avoids traversing thousands of tldraw-internal fiber nodes.
		function findTldrawEditor() {
			// Try multiple candidate root elements, closest-to-component first
			const candidates = [
				document.querySelector(".ddc_ink_writing-editor"),
				document.querySelector(".tl-container"),
			];

			for (const root of candidates) {
				if (!root) continue;

				const fiberKey = Object.keys(root).find(
					(k) =>
						k.startsWith("__reactFiber") ||
						k.startsWith("__reactInternalInstance") ||
						k.startsWith("_reactFiber")
				);
				if (!fiberKey) continue;

				let fiber = (root as any)[fiberKey];

				// Walk UP through parent component fibers looking for a useRef
				// whose .current is a tldraw Editor (has getShape + store).
				for (let depth = 0; depth < 50 && fiber; depth++) {
					fiber = fiber.return;
					if (!fiber) break;

					let hook = fiber.memoizedState;
					while (hook) {
						const s = hook.memoizedState;
						if (s && typeof s === "object" && "current" in s) {
							const cur = s.current;
							if (
								cur &&
								typeof cur === "object" &&
								typeof cur.getShape === "function" &&
								typeof cur.createShape === "function" &&
								cur.store
							) {
								return cur;
							}
						}
						hook = hook.next;
					}
				}
			}
			return null;
		}

		(window as any).__inkTest = {
			shapeIds: [],

			getTemplateHeight() {
				const editor = findTldrawEditor();
				if (!editor) return null;
				const shape = editor.getShape("shape:writing-container");
				return shape ? shape.props.h : null;
			},

			// Creates a stroke and returns whether it succeeded.
			// Height is NOT returned here — the tldraw store fires its listener via
			// throttleToNextFrame (asynchronously), so the template shape is not yet
			// updated when this function returns. Call getTemplateHeight() after a
			// brief pause to read the post-resize height.
			createStroke(lineNum) {
				const editor = findTldrawEditor();
				if (!editor) return false;
				const yPos = (lineNum - 1) * 150 + 50;
				const shapeId =
					"shape:ink-test-line" + lineNum + "-" + Date.now();
				editor.createShape({
					id: shapeId,
					type: "draw",
					x: 500,
					y: yPos,
					props: {
						segments: [
							{
								type: "free",
								points: [
									{ x: 0, y: 0, z: 0.5 },
									{ x: 100, y: 0, z: 0.5 },
								],
							},
						],
						isComplete: true,
						isClosed: false,
						isPen: false,
						scale: 1,
						color: "black",
						fill: "none",
						dash: "draw",
						size: "m",
					},
				});
				(window as any).__inkTest.shapeIds.push(shapeId);
				return true;
			},

			// Deletes the last created stroke. Height is NOT returned for the same
			// reason as createStroke — read it after a pause.
			eraseStroke() {
				const editor = findTldrawEditor();
				const ids = (window as any).__inkTest.shapeIds;
				if (!editor || ids.length === 0) return false;
				const lastId = ids.pop();
				editor.deleteShapes([lastId]);
				return true;
			},

			resetShapeTracking() {
				(window as any).__inkTest.shapeIds = [];
			},
		};
	});
}

async function getTemplateHeight(): Promise<number | null> {
	return browser.execute(() => (window as any).__inkTest.getTemplateHeight());
}

async function addStrokeAtLine(lineNum: number): Promise<number | null> {
	await browser.execute(
		(n: number) => (window as any).__inkTest.createStroke(n),
		lineNum
	);
	// tldraw fires store listeners via throttleToNextFrame (asynchronously).
	// Pause to let the listener fire and the template shape update.
	await browser.pause(100);
	return getTemplateHeight();
}

async function eraseLastStroke(): Promise<number | null> {
	await browser.execute(() => (window as any).__inkTest.eraseStroke());
	await browser.pause(100);
	return getTemplateHeight();
}

async function resetShapeTracking(): Promise<void> {
	await browser.execute(() => (window as any).__inkTest?.resetShapeTracking());
}

////////
// Shared setup

async function openWritingEditor(notePath: string) {
	// Set the flag that WritingEmbed checks on mount so the editor activates
	// immediately without requiring a manual click on the preview.
	await browser.execute(() => {
		localStorage.setItem("AU_activateNextEmbed", "true");
	});

	await obsidianPage.openFile(notePath);

	// Wait for the tldraw container to appear in the DOM — confirms the writing
	// editor has mounted and tldraw has initialised.
	await browser.waitUntil(
		() => browser.execute(() => !!document.querySelector(".tl-container")),
		{ timeout: 15000, interval: 200 }
	);

	// Brief extra settle time for the initial resize to complete
	await browser.pause(500);
}

async function setBufferLines(value: number) {
	// executeObsidian serializes its callback as a string so outer-scope variables
	// are not available inside. Store the value on window first, then read it back.
	await browser.execute((v: number) => {
		(window as any).__inkTestBufferLines = v;
	}, value);
	await browser.executeObsidian(async ({ app }) => {
		const plugin = (app.plugins.plugins as any)["ink"];
		if (plugin) {
			plugin.settings.writingBufferLines = (window as any).__inkTestBufferLines;
			await plugin.saveSettings();
		}
	});
}

////////
// Helpers that compute expected inviting heights (mirror of the formula in source)
// formula: (Math.ceil(h / L) + bufferLines + 0.5) * L  floored at WRITING_MIN_PAGE_HEIGHT

function invitingHeight(contentLines: number, bufferLines: number): number {
	return Math.max(
		(contentLines + bufferLines + 0.5) * L,
		WRITING_MIN_PAGE_HEIGHT
	);
}

////////
////////

describe("Writing Embed Buffer Lines — Settings", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () =>
				browser.executeObsidian(
					({ app }) => !!(app.plugins.plugins as any)["ink"]
				),
			{ timeout: 15000 }
		);
		await dismissBlockingPopups();
		// Reset to the current default
		await setBufferLines(3);
	});

	after(async function () {
		await setBufferLines(3);
	});

	it("default buffer setting is 3", async function () {
		const bufferLines = await browser.executeObsidian(({ app }) => {
			const plugin = (app.plugins.plugins as any)["ink"];
			return plugin?.settings?.writingBufferLines ?? null;
		});
		expect(bufferLines).toBe(3);
	});

	it("buffer lines setting appears in settings UI", async function () {
		await browser.executeObsidianCommand("app:open-settings");
		await browser.pause(500);

		const modal = await browser.$(".modal-container");
		await modal.waitForExist({ timeout: 5000 });

		await browser.execute(() => {
			const navItems = document.querySelectorAll(".vertical-tab-nav-item");
			for (const item of navItems) {
				if (item.textContent?.trim().toLowerCase() === "ink") {
					(item as HTMLElement).click();
					break;
				}
			}
		});
		await browser.pause(500);

		const settingExists = await browser.execute(() => {
			const names = document.querySelectorAll(".setting-item-name");
			for (const name of names) {
				if (name.textContent?.toLowerCase().includes("buffer lines"))
					return true;
			}
			return false;
		});

		expect(settingExists).toBe(true);

		await browser.keys(["Escape"]);
		await browser.pause(300);
	});

	it("changing buffer lines setting persists after save", async function () {
		await setBufferLines(2);
		const saved = await browser.executeObsidian(({ app }) => {
			const plugin = (app.plugins.plugins as any)["ink"];
			return plugin?.settings?.writingBufferLines ?? null;
		});
		expect(saved).toBe(2);
	});
});

////////
////////

describe("Writing Embed Buffer Lines — Mount Resize", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () =>
				browser.executeObsidian(
					({ app }) => !!(app.plugins.plugins as any)["ink"]
				),
			{ timeout: 15000 }
		);
		await dismissBlockingPopups();
		await setBufferLines(3);
	});

	after(async function () {
		await setBufferLines(3);
	});

	it("fixture file (9 lines) mounts with expected template height (bufferLines=3)", async function () {
		await openWritingEditor(FIXTURE_NOTE);
		await installBrowserHelpers();

		const height = await getTemplateHeight();
		// Fixture has strokes on lines 1–9. Content spans 9 lines.
		// inviting = (9 + 3 + 0.5) * 150 = 1875
		expect(height).toBe(invitingHeight(9, 3));
	});

	it("fixture file mounts with a smaller template height when bufferLines=1", async function () {
		// Reload first so the vault copy is fresh, then apply the setting so it
		// is in memory when the embed mounts (reloadObsidian restores the vault
		// copy, which would overwrite any setting saved before the reload).
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () =>
				browser.executeObsidian(
					({ app }) => !!(app.plugins.plugins as any)["ink"]
				),
			{ timeout: 15000 }
		);
		await setBufferLines(1);

		await openWritingEditor(FIXTURE_NOTE);
		await installBrowserHelpers();

		const height = await getTemplateHeight();
		// inviting = (9 + 1 + 0.5) * 150 = 1575
		expect(height).toBe(invitingHeight(9, 1));
		expect(height).toBeLessThan(invitingHeight(9, 3));
	});

	it("mount resize uses WRITING_LINE_HEIGHT units (height is a multiple of 0.5 lines)", async function () {
		await setBufferLines(3);
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () =>
				browser.executeObsidian(
					({ app }) => !!(app.plugins.plugins as any)["ink"]
				),
			{ timeout: 15000 }
		);

		await openWritingEditor(FIXTURE_NOTE);
		await installBrowserHelpers();

		const height = await getTemplateHeight();
		expect(height).not.toBeNull();
		// All inviting heights are multiples of 0.5 * WRITING_LINE_HEIGHT (75px)
		expect((height as number) % 75).toBe(0);
	});
});

////////
////////

describe("Writing Embed Buffer Lines — Sequential Add", function () {
	// Starting state for an empty editor with bufferLines=3:
	//   After mount, curHeight = (0 + 3 + 0.5) * L = 525 (3.5 lines of initial space)
	//
	// Resize pattern (threshold = curHeight + (bufferLines-1)*L = 525 + 300 = 825):
	//   Lines 1, 2: no resize (inviting 675, 825 ≤ threshold 825)
	//   Line 3:     resize to 975 (inviting 975 > 825)
	//   Lines 4, 5: no resize (inviting 1125, 1275 ≤ new threshold 1275)
	//   Line 6:     resize to 1425 (inviting 1425 > 1275)

	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () =>
				browser.executeObsidian(
					({ app }) => !!(app.plugins.plugins as any)["ink"]
				),
			{ timeout: 15000 }
		);
		await dismissBlockingPopups();
		await setBufferLines(3);
		await openWritingEditor(DYNAMIC_NOTE);
		await installBrowserHelpers();
	});

	after(async function () {
		await setBufferLines(3);
	});

	it("empty editor starts with buffer-sized initial height", async function () {
		const height = await getTemplateHeight();
		// Mount resize for empty content: (0+3+0.5)*L = 525
		expect(height).toBe(3.5 * L);
	});

	it("two strokes on the same line do not resize", async function () {
		await resetShapeTracking();
		const h1 = await addStrokeAtLine(1);
		const h2 = await addStrokeAtLine(1); // second stroke same line
		expect(h1).toBe(h2);
	});

	it("strokes on lines 1 and 2 stay within the buffer zone — no resize", async function () {
		// Fresh reload for clean curHeight
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () =>
				browser.executeObsidian(
					({ app }) => !!(app.plugins.plugins as any)["ink"]
				),
			{ timeout: 15000 }
		);
		await setBufferLines(3);
		await openWritingEditor(DYNAMIC_NOTE);
		await installBrowserHelpers();

		const initialHeight = await getTemplateHeight(); // 525
		const h1 = await addStrokeAtLine(1); // inviting 675 ≤ threshold 825 → no resize
		const h2 = await addStrokeAtLine(2); // inviting 825 ≤ threshold 825 → no resize

		expect(h1).toBe(initialHeight);
		expect(h2).toBe(initialHeight);
	});

	it("stroke on line 3 triggers the first resize", async function () {
		// Continuing from previous state: lines 1,2 added (curHeight=525)
		// (This test runs after the previous, no reload needed)
		const h3 = await addStrokeAtLine(3); // inviting 975 > threshold 825 → resize
		expect(h3).toBe(invitingHeight(3, 3)); // 975
	});

	it("strokes on lines 4 and 5 stay within new buffer zone after resize", async function () {
		// Continuing: curHeight=975 after line 3 resize
		const h4 = await addStrokeAtLine(4); // inviting 1125 ≤ threshold 1275 → no resize
		const h5 = await addStrokeAtLine(5); // inviting 1275 ≤ threshold 1275 → no resize

		expect(h4).toBe(invitingHeight(3, 3)); // still 975
		expect(h5).toBe(invitingHeight(3, 3)); // still 975
	});

	it("stroke on line 6 triggers the second resize", async function () {
		// Continuing: curHeight=975 after line 3 resize
		const h6 = await addStrokeAtLine(6); // inviting 1425 > threshold 1275 → resize
		expect(h6).toBe(invitingHeight(6, 3)); // 1425
	});
});

////////
////////

describe("Writing Embed Buffer Lines — Sequential Erase", function () {
	// Start by adding strokes on lines 1–6 (same as end-state of Sequential Add).
	// Then erase in reverse. Every erase shrinks content → resize triggers.

	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () =>
				browser.executeObsidian(
					({ app }) => !!(app.plugins.plugins as any)["ink"]
				),
			{ timeout: 15000 }
		);
		await dismissBlockingPopups();
		await setBufferLines(3);
		await openWritingEditor(DYNAMIC_NOTE);
		await installBrowserHelpers();

		// Build up to 6 lines so we have content to erase
		for (let n = 1; n <= 6; n++) {
			await addStrokeAtLine(n);
		}
		// After this: curHeight=1425 (line 6 triggered the last resize)
	});

	after(async function () {
		await setBufferLines(3);
	});

	it("erasing line 6 resizes down to 5-line inviting height", async function () {
		const h = await eraseLastStroke(); // erases line 6 stroke
		// content = lines 1–5, inviting = (5+3+0.5)*L = 1275
		expect(h).toBe(invitingHeight(5, 3));
	});

	it("erasing line 5 resizes down to 4-line inviting height", async function () {
		const h = await eraseLastStroke();
		expect(h).toBe(invitingHeight(4, 3)); // 1125
	});

	it("erasing line 4 resizes down to 3-line inviting height", async function () {
		const h = await eraseLastStroke();
		expect(h).toBe(invitingHeight(3, 3)); // 975
	});

	it("erasing line 3 resizes down to 2-line inviting height", async function () {
		const h = await eraseLastStroke();
		expect(h).toBe(invitingHeight(2, 3)); // 825
	});

	it("erasing line 2 resizes down to 1-line inviting height", async function () {
		const h = await eraseLastStroke();
		expect(h).toBe(invitingHeight(1, 3)); // 675
	});

	it("erasing line 1 resizes down to empty inviting height", async function () {
		const h = await eraseLastStroke();
		expect(h).toBe(invitingHeight(0, 3)); // 525
	});
});

////////
////////

describe("Writing Embed Buffer Lines — Add, Erase, Add Again", function () {
	// Verify the buffer zone guard correctly handles re-adding content after partial erasure.
	//
	// Sequence:
	//   Add lines 1–3  → resize at line 3 (curHeight=975)
	//   Erase line 3   → content=lines1+2, inviting=825 < 975 → resize to 825
	//   Re-add line 3  → inviting=975, shouldResize(975, 825, 3): 975 > 825+300=1125? No → no resize
	//   Re-add line 4  → inviting=1125, 1125 > 1125? No → no resize (at exact boundary)
	//   Re-add line 5  → inviting=1275, 1275 > 1125? YES → resize to 1275

	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () =>
				browser.executeObsidian(
					({ app }) => !!(app.plugins.plugins as any)["ink"]
				),
			{ timeout: 15000 }
		);
		await dismissBlockingPopups();
		await setBufferLines(3);
		await openWritingEditor(DYNAMIC_NOTE);
		await installBrowserHelpers();
	});

	after(async function () {
		await setBufferLines(3);
	});

	it("adding lines 1–3: resize happens at line 3", async function () {
		await addStrokeAtLine(1);
		await addStrokeAtLine(2);
		const h3 = await addStrokeAtLine(3);
		expect(h3).toBe(invitingHeight(3, 3)); // 975
	});

	it("erasing line 3 shrinks height", async function () {
		const h = await eraseLastStroke();
		expect(h).toBe(invitingHeight(2, 3)); // 825
	});

	it("re-adding line 3 does not resize (within buffer zone)", async function () {
		const h = await addStrokeAtLine(3);
		// shouldResize(975, 825, 3): 975 > 825+300=1125? No
		expect(h).toBe(invitingHeight(2, 3)); // stays 825
	});

	it("re-adding line 4 does not resize (at exact threshold boundary)", async function () {
		const h = await addStrokeAtLine(4);
		// shouldResize(1125, 825, 3): 1125 > 1125? No (not strictly greater)
		expect(h).toBe(invitingHeight(2, 3)); // stays 825
	});

	it("re-adding line 5 triggers resize", async function () {
		const h = await addStrokeAtLine(5);
		// shouldResize(1275, 825, 3): 1275 > 1125? YES
		expect(h).toBe(invitingHeight(5, 3)); // 1275
	});
});

////////
////////

describe("Writing Embed Buffer Lines — Minimum Height Floor", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () =>
				browser.executeObsidian(
					({ app }) => !!(app.plugins.plugins as any)["ink"]
				),
			{ timeout: 15000 }
		);
		await dismissBlockingPopups();
	});

	after(async function () {
		await setBufferLines(3);
	});

	it("template height is never below WRITING_MIN_PAGE_HEIGHT (bufferLines=1, empty file)", async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () =>
				browser.executeObsidian(
					({ app }) => !!(app.plugins.plugins as any)["ink"]
				),
			{ timeout: 15000 }
		);
		await setBufferLines(1);

		await openWritingEditor(DYNAMIC_NOTE);
		await installBrowserHelpers();

		const height = await getTemplateHeight();
		// Empty file with bufferLines=1: (0+1+0.5)*150=225, but floor is 375
		expect(height).toBeGreaterThanOrEqual(WRITING_MIN_PAGE_HEIGHT);
		expect(height).toBe(WRITING_MIN_PAGE_HEIGHT);
	});

	it("template height stays at or above minimum after erasing all strokes", async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () =>
				browser.executeObsidian(
					({ app }) => !!(app.plugins.plugins as any)["ink"]
				),
			{ timeout: 15000 }
		);
		await setBufferLines(3);

		await openWritingEditor(DYNAMIC_NOTE);
		await installBrowserHelpers();

		// Add and then erase all strokes
		await addStrokeAtLine(1);
		await addStrokeAtLine(2);
		await addStrokeAtLine(3);
		await eraseLastStroke();
		await eraseLastStroke();
		const h = await eraseLastStroke();

		expect(h).not.toBeNull();
		expect(h as number).toBeGreaterThanOrEqual(WRITING_MIN_PAGE_HEIGHT);
	});
});

////////
////////

describe("Writing Embed Buffer Lines — Setting Respected at Runtime", function () {
	// Verify that changing writingBufferLines mid-session takes effect immediately
	// on the next stroke, without requiring a reload.

	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await browser.waitUntil(
			async () =>
				browser.executeObsidian(
					({ app }) => !!(app.plugins.plugins as any)["ink"]
				),
			{ timeout: 15000 }
		);
		await dismissBlockingPopups();
		await setBufferLines(3);
		await openWritingEditor(DYNAMIC_NOTE);
		await installBrowserHelpers();
	});

	after(async function () {
		await setBufferLines(3);
	});

	it("changing bufferLines to 1 makes the next stroke compute a smaller inviting height", async function () {
		// Set up: add line 3 to trigger an initial resize (curHeight → 975 with bufferLines=3)
		await addStrokeAtLine(1);
		await addStrokeAtLine(2);
		await addStrokeAtLine(3); // curHeight becomes 975

		// Change setting mid-session
		await setBufferLines(1);

		// Add the same line 3 position again.
		// With bufferLines=3: inviting would be (3+3+0.5)*150=975; 975<975 → no resize (stays 975).
		// With bufferLines=1: inviting is (3+1+0.5)*150=675; 675 < 975 (curHeight) → resize DOWN to 675.
		const h = await addStrokeAtLine(3);

		expect(h).toBe(invitingHeight(3, 1)); // 675
		// Confirm it is different from what bufferLines=3 would produce
		expect(h).not.toBe(invitingHeight(3, 3)); // not 975
	});

	it("reverting bufferLines to 3 restores the larger buffer on the next stroke", async function () {
		// Current state: height=675, bufferLines=1
		// Change back to 3
		await setBufferLines(3);

		// Add line 6: with bufferLines=3 → (6+3+0.5)*150=1425. 1425 > 675+300=975? YES → resize to 1425.
		const h = await addStrokeAtLine(6);
		expect(h).toBe(invitingHeight(6, 3)); // 1425
	});
});
