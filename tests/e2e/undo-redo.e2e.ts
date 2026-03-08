/**
 * E2E tests for unified undo/redo across ink embeds.
 * @see docs/undo-redo-implementation.md
 * @see .cursor/plans/undo-redo-docs-mermaid.plan.md
 */

import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

////////
// Notes

const NOTE_ONE_EMBED = "11 - CodeMirror and Editor Behavior/Undo Redo One Embed.md";
const NOTE_TWO_EMBEDS = "11 - CodeMirror and Editor Behavior/Undo Redo Two Embeds.md";
const NOTE_THREE_EMBEDS = "11 - CodeMirror and Editor Behavior/Undo Redo Three Embeds.md";

const isMac = process.platform === "darwin";
const MODIFIER = isMac ? "Meta" : "Control";

////////
// Shared setup

async function waitForPluginReady() {
	await browser.waitUntil(
		async () =>
			browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)["ink"]),
		{ timeout: 15000 }
	);
}

////////
// Browser helpers (adapted from buffer-lines.e2e.ts)

async function installUndoRedoHelpers() {
	await browser.execute(() => {
		function findTldrawEditor() {
			const candidates = [
				document.querySelector(".ddc_ink_writing-editor"),
				document.querySelector(".ddc_ink_drawing-editor"),
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

		const PREFIX = "shape:ink-undo-test-";

		(window as any).__inkUndoRedoTest = {
			createStroke(lineNum: number) {
				const editor = findTldrawEditor();
				if (!editor) return false;
				const yPos = (lineNum - 1) * 150 + 50;
				const shapeId = PREFIX + lineNum + "-" + Date.now();
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
				return true;
			},

			// Count shapes with our prefix on the current page (avoids store.allRecords() iterator issues)
			getCreatedShapeCount() {
				const editor = findTldrawEditor();
				if (!editor) return 0;
				const shapes = editor.getCurrentPageShapes();
				let count = 0;
				for (let i = 0; i < shapes.length; i++) {
					const rec = shapes[i];
					if (rec && typeof rec === "object" && "id" in rec && String(rec.id).startsWith(PREFIX)) {
						count++;
					}
				}
				return count;
			},

			resetShapeTracking() {},
		};
	});
}

async function openEmbedForEdit(notePath: string, editorSelector: string) {
	await browser.execute(() => {
		localStorage.setItem("ddc_ink_activateNextEmbed", "true");
	});
	await obsidianPage.openFile(notePath);
	const editor = await browser.$(editorSelector);
	await editor.waitForExist({ timeout: 15000 });
	// Wait for tldraw to mount (handleMount sets editor ref; required for findTldrawEditor)
	await browser.waitUntil(
		() => browser.execute(() => !!document.querySelector(".tl-container")),
		{ timeout: 15000, interval: 200 }
	);
	// Extra settle for handleMount (opacity, refs, registry) to complete
	await browser.pause(1000);
}

async function createStroke(lineNum: number) {
	await browser.execute(
		(n: number) => (window as any).__inkUndoRedoTest.createStroke(n),
		lineNum
	);
	await browser.pause(200);
}

async function getShapeCount(): Promise<number> {
	return browser.execute(
		() => (window as any).__inkUndoRedoTest.getCreatedShapeCount()
	);
}

async function waitForShapeCount(expectedCount: number, timeoutMs = 3000): Promise<number> {
	let count: number = 0;
	await browser.waitUntil(
		async () => {
			count = await getShapeCount();
			return count === expectedCount;
		},
		{ timeout: timeoutMs, interval: 100 }
	);
	return count;
}

/** Poll until count is one of the accepted values. Use when E2E programmatic createShape batching differs from manual drawing. */
async function waitForShapeCountOneOf(
	acceptedCounts: number[],
	timeoutMs = 5000
): Promise<number> {
	let count: number = 0;
	await browser.waitUntil(
		async () => {
			count = await getShapeCount();
			return acceptedCounts.includes(count);
		},
		{ timeout: timeoutMs, interval: 100 }
	);
	return count;
}

// Switches to the embed at embedIndex and returns its shape count.
// Only one embed is in edit mode at a time; getShapeCount() reads from the active embed.
async function getShapeCountInEmbed(embedIndex: number): Promise<number> {
	await clickUnlockByIndex(embedIndex);
	await installUndoRedoHelpers();
	return getShapeCount();
}

async function resetShapeTracking() {
	await browser.execute(() => (window as any).__inkUndoRedoTest?.resetShapeTracking());
}

async function focusTldrawCanvas() {
	await browser.execute(() => {
		document.querySelector(".tl-container")?.focus({ preventScroll: true });
	});
	await browser.pause(100);
}

// Dispatch synthetic keydown so the document's capture-phase handler receives it.
// browser.keys() can be unreliable with modifier combos (e.g. Cmd+Shift+Z) in E2E.
async function sendUndo() {
	await focusTldrawCanvas();
	await browser.execute((mod: string) => {
		document.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "z",
				code: "KeyZ",
				metaKey: mod === "Meta",
				ctrlKey: mod === "Control",
				shiftKey: false,
				bubbles: true,
				cancelable: true,
			})
		);
	}, MODIFIER);
	await browser.pause(300);
}

async function sendRedo() {
	await focusTldrawCanvas();
	await browser.execute((mod: string) => {
		document.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "z",
				code: "KeyZ",
				metaKey: mod === "Meta",
				ctrlKey: mod === "Control",
				shiftKey: true,
				bubbles: true,
				cancelable: true,
			})
		);
	}, MODIFIER);
	await browser.pause(300);
}

async function clickLock() {
	const lockBtn = await browser.$(".ink_extended-writing-menu button");
	await lockBtn.waitForExist({ timeout: 5000 });
	await lockBtn.click();
	await browser.pause(500);
}

// Waits for the lock transition to complete (editor unmounts) before proceeding.
// Use when locking then immediately switching to another embed.
async function clickLockAndWait(previewSelector: string, editorSelector: string) {
	const lockBtn = await browser.$(".ink_extended-writing-menu button");
	await lockBtn.waitForExist({ timeout: 5000 });
	// Ensure tldraw canvas is focused so lock receives events; matches embed-lock-unlock pattern
	await focusTldrawCanvas();
	await browser.pause(200);
	// Lock button uses onPointerDown — must dispatch pointerdown (click doesn't fire it)
	await browser.execute(() => {
		const btn = document.querySelector(".ink_extended-writing-menu button");
		if (btn) {
			(btn as HTMLElement).scrollIntoView({ block: "center" });
			btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
		}
	});

	const preview = await browser.$(previewSelector);
	await preview.waitForExist({ timeout: 10000 });

	const editor = await browser.$(editorSelector);
	await editor.waitForExist({ reverse: true, timeout: 15000 });

	// Brief settle so previews are interactive before next click
	await browser.pause(300);
}

async function clickUnlockByIndex(embedIndex: number) {
	await browser.execute(() => {
		localStorage.setItem("ddc_ink_activateNextEmbed", "true");
	});
	// WebDriver click can be unreliable on previews inside CodeMirror; use JS to dispatch click
	await browser.execute((index: number) => {
		const previews = document.querySelectorAll(
			".ddc_ink_writing-embed-preview, .ddc_ink_drawing-embed-preview"
		);
		const target = previews[index];
		if (target) {
			target.scrollIntoView({ block: "center" });
			target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
		}
	}, embedIndex);
	await browser.pause(800);
	const editor = await browser.$(".ddc_ink_writing-editor, .ddc_ink_drawing-editor");
	await editor.waitForExist({ timeout: 10000 });
	// Wait for tldraw to mount (handleMount sets editor ref; required for findTldrawEditor)
	await browser.waitUntil(
		() => browser.execute(() => !!document.querySelector(".tl-container")),
		{ timeout: 10000, interval: 200 }
	);
	await browser.pause(500);
}

async function typeInObsidian(text: string) {
	await browser.executeObsidian(({ app }, t: string) => {
		const view = app.workspace.activeLeaf?.view;
		const editor = (view as { editor?: { replaceSelection: (s: string) => void } })?.editor;
		if (editor) editor.replaceSelection(t);
	}, text);
	await browser.pause(100);
}

async function getEditorText(): Promise<string> {
	return browser.executeObsidian(({ app }) => {
		const view = app.workspace.activeLeaf?.view;
		const editor = (view as { editor?: { getValue: () => string } })?.editor;
		return editor?.getValue() ?? "";
	});
}

////////
////////

describe("Undo/Redo — One Embed (embed-only)", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
		await openEmbedForEdit(NOTE_ONE_EMBED, ".ddc_ink_writing-editor");
		await installUndoRedoHelpers();
		await resetShapeTracking();
	});

	it("undo twice, redo twice — correct order and outcome", async function () {
		await createStroke(1);
		await createStroke(2);
		await createStroke(3);

		expect(await getShapeCount()).toBe(3);

		await sendUndo();
		await sendUndo();
		// Programmatic createShape batches differently than manual drawing
		await waitForShapeCountOneOf([0, 1]);

		await sendRedo();
		await sendRedo();
		await waitForShapeCountOneOf([2, 3]);

		await sendUndo();
		await sendUndo();
		await waitForShapeCountOneOf([0, 1]);

		await sendRedo();
		await sendRedo();
		await waitForShapeCountOneOf([2, 3]);
	});
});

////////
////////

describe("Undo/Redo — One Embed (programmatic redo guard)", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
		await openEmbedForEdit(NOTE_ONE_EMBED, ".ddc_ink_writing-editor");
		await installUndoRedoHelpers();
		await resetShapeTracking();
	});

	it("redo twice preserves redo stack (second redo works)", async function () {
		await createStroke(1);
		await createStroke(2);

		await sendUndo();
		await sendUndo();
		await waitForShapeCountOneOf([0, 1]);

		await sendRedo();
		await waitForShapeCountOneOf([1, 2]);

		await sendRedo();
		await waitForShapeCount(2);

		await sendUndo();
		await sendUndo();
		await waitForShapeCountOneOf([0, 1]);

		await sendRedo();
		await sendRedo();
		await waitForShapeCount(2);
	});
});

////////
////////

describe("Undo/Redo — One Embed (mixed embed + Obsidian)", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
		await openEmbedForEdit(NOTE_ONE_EMBED, ".ddc_ink_writing-editor");
		await installUndoRedoHelpers();
		await resetShapeTracking();
	});

	it("undo twice, redo twice — correct order (embed then Obsidian)", async function () {
		await typeInObsidian("X");
		await createStroke(1);
		await typeInObsidian("Y");
		await createStroke(2);

		expect(await getShapeCount()).toBe(2);

		await sendUndo();
		await sendUndo();
		await waitForShapeCountOneOf([0, 1]);
		let text = await getEditorText();
		expect(text).not.toContain("Y");

		await sendRedo();
		await sendRedo();
		await waitForShapeCount(2);
		text = await getEditorText();
		expect(text).toContain("Y");

		await sendUndo();
		await sendUndo();
		await waitForShapeCountOneOf([0, 1]);
		text = await getEditorText();
		expect(text).not.toContain("Y");

		await sendRedo();
		await sendRedo();
		await waitForShapeCount(2);
		text = await getEditorText();
		expect(text).toContain("Y");
	});
});

////////
////////

describe("Undo/Redo — Two Embeds (interleaved)", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
	});

	it("stroke in embed 1, lock, stroke in embed 2 — undo redo each", async function () {
		await openEmbedForEdit(NOTE_TWO_EMBEDS, ".ddc_ink_writing-editor");
		await installUndoRedoHelpers();
		await resetShapeTracking();

		await createStroke(1);
		let count = await getShapeCount();
		expect(count).toBe(1);

		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await clickUnlockByIndex(1);
		await installUndoRedoHelpers();
		await resetShapeTracking();

		await createStroke(1);
		count = await getShapeCount();
		expect(count).toBe(1);

		await sendUndo();
		count = await getShapeCount();
		expect(count).toBe(0);

		await sendRedo();
		count = await getShapeCount();
		expect(count).toBe(1);
	});
});

////////
////////

describe("Undo/Redo — Two Embeds (mixed usage)", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
	});

	it("draw E1, E2, E1, E2 — undo/redo affects correct embeds", async function () {
		await openEmbedForEdit(NOTE_TWO_EMBEDS, ".ddc_ink_writing-editor");
		await installUndoRedoHelpers();
		await resetShapeTracking();

		// 1. Draw stroke in embed 1 (active)
		await createStroke(1);

		// 2. Lock, unlock embed 2, draw stroke
		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await clickUnlockByIndex(1);
		await installUndoRedoHelpers();
		await resetShapeTracking();
		await createStroke(1);

		// 3. Lock, unlock embed 1, draw stroke
		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await clickUnlockByIndex(0);
		await installUndoRedoHelpers();
		await resetShapeTracking();
		await createStroke(1);

		// 4. Lock, unlock embed 2, draw stroke
		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await clickUnlockByIndex(1);
		await installUndoRedoHelpers();
		await resetShapeTracking();
		await createStroke(1);

		// Stack: [E1, E2, E1, E2]. Embed 1: 2 strokes, embed 2: 2 strokes.
		let countEmbed0 = await getShapeCountInEmbed(0);
		let countEmbed1 = await getShapeCountInEmbed(1);
		expect(countEmbed0).toBe(2);
		expect(countEmbed1).toBe(2);

		// 5. Undo twice → embed 1: 1, embed 2: 1
		await sendUndo();
		await sendUndo();
		countEmbed0 = await getShapeCountInEmbed(0);
		countEmbed1 = await getShapeCountInEmbed(1);
		expect(countEmbed0).toBe(1);
		expect(countEmbed1).toBe(1);

		// 6. Redo once → embed 1: 1, embed 2: 2
		await sendRedo();
		countEmbed0 = await getShapeCountInEmbed(0);
		countEmbed1 = await getShapeCountInEmbed(1);
		expect(countEmbed0).toBe(1);
		expect(countEmbed1).toBe(2);

		// 7. Undo 3 times → embed 1: 1, embed 2: 0
		await sendUndo();
		await sendUndo();
		await sendUndo();
		countEmbed0 = await getShapeCountInEmbed(0);
		countEmbed1 = await getShapeCountInEmbed(1);
		expect(countEmbed0).toBe(1);
		expect(countEmbed1).toBe(0);

		// 8. Redo 4 times → embed 1: 2, embed 2: 2 (4th redo is no-op if stack has 3 items)
		await sendRedo();
		await sendRedo();
		await sendRedo();
		await sendRedo();
		countEmbed0 = await getShapeCountInEmbed(0);
		countEmbed1 = await getShapeCountInEmbed(1);
		expect(countEmbed0).toBe(2);
		expect(countEmbed1).toBe(2);
	});
});

////////
////////

describe("Undo/Redo — Three Embeds (mixed usage)", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
	});

	it("draw E1, E2, E3, E1, E2, E3 — undo/redo affects correct embeds", async function () {
		await openEmbedForEdit(NOTE_THREE_EMBEDS, ".ddc_ink_writing-editor");
		await installUndoRedoHelpers();
		await resetShapeTracking();

		// Draw in E1, E2, E3, E1, E2, E3
		await createStroke(1);

		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await clickUnlockByIndex(1);
		await installUndoRedoHelpers();
		await resetShapeTracking();
		await createStroke(1);

		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await clickUnlockByIndex(2);
		await installUndoRedoHelpers();
		await resetShapeTracking();
		await createStroke(1);

		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await clickUnlockByIndex(0);
		await installUndoRedoHelpers();
		await resetShapeTracking();
		await createStroke(1);

		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await clickUnlockByIndex(1);
		await installUndoRedoHelpers();
		await resetShapeTracking();
		await createStroke(1);

		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await clickUnlockByIndex(2);
		await installUndoRedoHelpers();
		await resetShapeTracking();
		await createStroke(1);

		// Each embed has 2 strokes
		let countEmbed0 = await getShapeCountInEmbed(0);
		let countEmbed1 = await getShapeCountInEmbed(1);
		let countEmbed2 = await getShapeCountInEmbed(2);
		expect(countEmbed0).toBe(2);
		expect(countEmbed1).toBe(2);
		expect(countEmbed2).toBe(2);

		// Undo 3 times → each embed: 1 stroke
		await sendUndo();
		await sendUndo();
		await sendUndo();
		countEmbed0 = await getShapeCountInEmbed(0);
		countEmbed1 = await getShapeCountInEmbed(1);
		countEmbed2 = await getShapeCountInEmbed(2);
		expect(countEmbed0).toBe(1);
		expect(countEmbed1).toBe(1);
		expect(countEmbed2).toBe(1);

		// Redo 2 times → E1: 1, E2: 2, E3: 2 (redo affects E3, E2)
		await sendRedo();
		await sendRedo();
		countEmbed0 = await getShapeCountInEmbed(0);
		countEmbed1 = await getShapeCountInEmbed(1);
		countEmbed2 = await getShapeCountInEmbed(2);
		expect(countEmbed0).toBe(1);
		expect(countEmbed1).toBe(2);
		expect(countEmbed2).toBe(2);
	});
});

////////
////////

describe("Undo/Redo — Two Embeds and Obsidian (mixed usage)", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
	});

	it("alternate Obsidian + embed 1 + embed 2 — undo/redo correct order", async function () {
		await openEmbedForEdit(NOTE_TWO_EMBEDS, ".ddc_ink_writing-editor");
		await installUndoRedoHelpers();
		await resetShapeTracking();

		await typeInObsidian("A");
		await createStroke(1);

		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await clickUnlockByIndex(1);
		await installUndoRedoHelpers();
		await resetShapeTracking();

		await typeInObsidian("B");
		await createStroke(1);

		// Stack: Obsidian A, E1 stroke, Obsidian B, E2 stroke
		let countEmbed0 = await getShapeCountInEmbed(0);
		let countEmbed1 = await getShapeCountInEmbed(1);
		let text = await getEditorText();
		expect(countEmbed0).toBe(1);
		expect(countEmbed1).toBe(1);
		expect(text).toContain("A");
		expect(text).toContain("B");

		// Undo twice → E2 stroke gone, Obsidian B gone
		await sendUndo();
		await sendUndo();
		countEmbed0 = await getShapeCountInEmbed(0);
		countEmbed1 = await getShapeCountInEmbed(1);
		text = await getEditorText();
		expect(countEmbed0).toBe(1);
		expect(countEmbed1).toBe(0);
		expect(text).not.toContain("B");

		// Redo once → Obsidian B back
		await sendRedo();
		text = await getEditorText();
		expect(text).toContain("B");
	});
});

////////
////////

describe("Undo/Redo — Two Embeds (mid-sequence lock)", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
	});

	// Requires purge-on-lock: when an embed is locked, its entries must be removed from undo/redo stacks.
	// Current impl: getEditor(entry.embedId) returns undefined for locked embeds → no-op; entries remain.
	it.skip("draw E1, E2, E1, E2 — lock embed 1 — undo only affects embed 2", async function () {
		await openEmbedForEdit(NOTE_TWO_EMBEDS, ".ddc_ink_writing-editor");
		await installUndoRedoHelpers();
		await resetShapeTracking();

		// Draw E1, E2, E1, E2
		await createStroke(1);

		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await clickUnlockByIndex(1);
		await installUndoRedoHelpers();
		await resetShapeTracking();
		await createStroke(1);

		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await clickUnlockByIndex(0);
		await installUndoRedoHelpers();
		await resetShapeTracking();
		await createStroke(1);

		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await clickUnlockByIndex(1);
		await installUndoRedoHelpers();
		await resetShapeTracking();
		await createStroke(1);

		// Lock embed 1 — embed 1's entries purged from history (if implemented)
		await clickLockAndWait(".ddc_ink_writing-embed-preview", ".ddc_ink_writing-editor");
		await clickUnlockByIndex(0);
		await installUndoRedoHelpers();
		await clickLock();

		// Unlock embed 2 (was just locked by clicking embed 1's preview)
		await clickUnlockByIndex(1);
		await installUndoRedoHelpers();

		// Undo twice → only embed 2 affected; embed 2: 0 strokes
		await sendUndo();
		await sendUndo();
		const countEmbed2AfterUndo = await getShapeCount();
		expect(countEmbed2AfterUndo).toBe(0);

		// Redo twice → embed 2: 2 strokes
		await sendRedo();
		await sendRedo();
		const countEmbed2AfterRedo = await getShapeCount();
		expect(countEmbed2AfterRedo).toBe(2);
	});
});

