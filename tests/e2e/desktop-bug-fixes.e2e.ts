import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

/**
 * Regression coverage for the six desktop-validatable issues from the triage.
 * Each test targets the mechanism that caused the report, so a regression fails here
 * rather than only reappearing as a user bug.
 *
 *   #64  dotted custom subfolder silently created nothing
 *   #69  "Remove Embed" silently did nothing
 *   #124 main toolbar parked inside the drawing area
 *   #126 empty Obsidian attachments folder created as a side effect
 *   #132 selection draggable off the page and unrecoverable
 *   #180 drawing preview cropped by a default viewBox the file never used
 *
 * Tests deliberately reload the app per case. Embeds render through CodeMirror and a stale
 * widget from one case will happily answer a DOM query from the next one.
 */

////////
// Helpers

async function waitForPluginReady() {
	await browser.waitUntil(
		async () => browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)["ink"]),
		{ timeout: 15000 },
	);
}

/** Reloads the test vault and waits for Ink. Use at the start of each case. */
async function reloadVault() {
	await browser.reloadObsidian({ vault: "qa-test-vault" });
	await waitForPluginReady();
	await dismissBlockingPopups();
}

/** Writes a note, replacing any existing content. */
async function writeNote(notePath: string, content: string) {
	await browser.executeObsidian(async ({ app }, args) => {
		const existing = app.vault.getAbstractFileByPath(args.notePath);
		if (existing) {
			await app.vault.modify(existing as any, args.content);
			return;
		}
		await app.vault.create(args.notePath, args.content);
	}, { notePath, content });
}

/** Reads a note's current markdown. */
async function readNote(notePath: string): Promise<string> {
	return browser.executeObsidian(async ({ app }, path) => {
		const file = app.vault.getAbstractFileByPath(path) as any;
		if (!file) return "";
		return app.vault.read(file);
	}, notePath);
}

/** Applies plugin settings and saves them. */
async function setInkSettings(settings: Record<string, unknown>) {
	await browser.executeObsidian(async ({ app }, patch) => {
		const plugin = (app.plugins.plugins as any)["ink"];
		Object.assign(plugin.settings, patch);
		await plugin.saveSettings();
	}, settings);
}

/** Deletes a vault folder if it exists. */
async function deleteFolderIfPresent(folderPath: string) {
	await browser.executeObsidian(async ({ app }, path) => {
		const folder = app.vault.getAbstractFileByPath(path) as any;
		if (!folder) return;
		// deleteFolder handles directories; vault.delete only removes files and throws EISDIR.
		await (app.vault as any).deleteFolder(folder, true);
	}, folderPath);
}

/** Opens a note and waits for its ink embeds to render. */
async function openNoteAndWaitForEmbeds(notePath: string) {
	await obsidianPage.openFile(notePath);
	await browser.pause(1500);
	await browser.waitUntil(
		() => browser.execute(() => document.querySelectorAll(".ddc_ink_embed").length > 0),
		{ timeout: 20000, interval: 250 },
	);
	await browser.pause(800);
}

/** Clicks the first writing embed preview to unlock the editor. */
async function unlockFirstWritingEmbed() {
	await browser.execute(() => {
		const preview = document.querySelector(".ddc_ink_writing-embed-preview") as HTMLElement | null;
		preview?.click();
	});
	await browser.waitUntil(
		() => browser.execute(() => !!document.querySelector(".ddc_ink_writing-editor")),
		{ timeout: 20000, interval: 250 },
	);
	await browser.pause(1200);
}

////////
////////

describe("Desktop-validatable bug fixes", function () {
	this.timeout(120000);

	// ───────────────────────────────────────────────────────────────────────────
	// #126 — an empty Obsidian attachments folder must not be created
	// ───────────────────────────────────────────────────────────────────────────

	describe("#126 unnecessary attachments folder", function () {
		const ATTACHMENT_FOLDER = "Issue126Attachments";

		beforeEach(async function () {
			await reloadVault();
			await deleteFolderIfPresent(ATTACHMENT_FOLDER);
		});

		afterEach(async function () {
			await deleteFolderIfPresent(ATTACHMENT_FOLDER);
			await browser.executeObsidian(({ app }) => {
				(app.vault as any).setConfig("attachmentFolderPath", "/");
			});
		});

		it("does not create the Obsidian attachment folder just to read its path", async function () {
			await browser.executeObsidian(({ app }, folderPath) => {
				(app.vault as any).setConfig("attachmentFolderPath", folderPath);
			}, ATTACHMENT_FOLDER);

			// Resolving the destination used to create the folder via getAvailablePathForAttachment.
			const resolvedPath = await browser.executeObsidian(async ({ app }) => {
				const plugin = (app.plugins.plugins as any)["ink"];
				return plugin.getNewTimestampedWritingSvgFilepath(plugin, null);
			});

			const folderExistedAfterwards = await browser.executeObsidian(({ app }, folderPath) => {
				return !!app.vault.getAbstractFileByPath(folderPath);
			}, ATTACHMENT_FOLDER);

			// The resolved path must still honour the setting...
			expect(String(resolvedPath)).toContain(ATTACHMENT_FOLDER);
			// ...but reading the setting must not create the folder.
			expect(folderExistedAfterwards).toBe(false);
		});
	});

	// ───────────────────────────────────────────────────────────────────────────
	// #64 — dotted custom subfolder is repaired instead of failing silently
	// ───────────────────────────────────────────────────────────────────────────

	describe("#64 custom file organisation validation", function () {
		afterEach(async function () {
			await setInkSettings({
				customAttachmentFolders: false,
				writingSubfolder: "Ink/Writing",
				drawingSubfolder: "Ink/Drawing",
				noteAttachmentFolderLocation: "obsidian",
			});
		});

		it("creates the writing folder when the configured subfolder starts with a dot", async function () {
			await reloadVault();
			// The exact accident from the report: a dotted folder that Obsidian refuses to create.
			await setInkSettings({
				customAttachmentFolders: true,
				writingSubfolder: ".issue64/ink/writing",
				noteAttachmentFolderLocation: "root",
			});

			await obsidianPage.openFile("01 - Basic Embeds/Single Writing Embed.md");
			await browser.pause(800);
			await browser.executeObsidianCommand("ink:create-handwritten-section");

			// A dotted folder can never exist; the repaired `issue64/...` folder must.
			await browser.waitUntil(
				async () =>
					browser.executeObsidian(({ app }) => {
						const folder = app.vault.getAbstractFileByPath("issue64/ink/writing");
						if (!folder) return false;
						return ((folder as any).children ?? []).some(
							(child: any) => typeof child.path === "string" && child.path.endsWith(".svg"),
						);
					}),
				{ timeout: 20000, interval: 500 },
			);

			const dottedFolderExists = await browser.executeObsidian(({ app }) => {
				return !!app.vault.getAbstractFileByPath(".issue64");
			});
			expect(dottedFolderExists).toBe(false);
		});

		it("still creates the folder when the subfolder is already valid", async function () {
			await reloadVault();
			await setInkSettings({
				customAttachmentFolders: true,
				writingSubfolder: "issue64valid/writing",
				noteAttachmentFolderLocation: "root",
			});

			await obsidianPage.openFile("01 - Basic Embeds/Single Writing Embed.md");
			await browser.pause(800);
			await browser.executeObsidianCommand("ink:create-handwritten-section");

			await browser.waitUntil(
				async () =>
					browser.executeObsidian(({ app }) => {
						const folder = app.vault.getAbstractFileByPath("issue64valid/writing");
						if (!folder) return false;
						return ((folder as any).children ?? []).some(
							(child: any) => typeof child.path === "string" && child.path.endsWith(".svg"),
						);
					}),
				{ timeout: 20000, interval: 500 },
			);
		});
	});

	// ───────────────────────────────────────────────────────────────────────────
	// #69 — Remove Embed must always do something visible
	// ───────────────────────────────────────────────────────────────────────────

	describe("#69 remove embed", function () {
		const NOTE_PATH = "Issue69 Remove Embed.md";
		const EMBEDDED_PATH = "Ink/Writing/line-height-200-fixture.svg";

		beforeEach(async function () {
			await reloadVault();
			await writeNote(
				NOTE_PATH,
				[
					"# Remove embed probe",
					"",
					` ![InkWriting](<${EMBEDDED_PATH}>) [Edit Writing](https://youtu.be/2arL1jh8ihA?type=inkWriting)`,
					"",
					"Trailing text",
				].join("\n"),
			);
		});

		it("deletes the embed line and keeps the rest of the note", async function () {
			await openNoteAndWaitForEmbeds(NOTE_PATH);

			await browser.executeObsidian(async ({ app }, args) => {
				const plugin = (app.plugins.plugins as any)["ink"];
				const embeddedFile = app.vault.getAbstractFileByPath(args.embeddedPath);
				const sourceMdFile = app.vault.getAbstractFileByPath(args.notePath);
				await plugin.removeAllEmbedsOfFileFromNote(
					app.vault,
					sourceMdFile,
					(embeddedFile as any).path,
					"inkWriting",
				);
			}, { embeddedPath: EMBEDDED_PATH, notePath: NOTE_PATH });
			await browser.pause(1200);

			const content = await readNote(NOTE_PATH);
			expect(content).not.toContain(EMBEDDED_PATH);
			expect(content).toContain("Trailing text");
		});

		it("finds the embed by file path alone, independent of any live widget", async function () {
			// The #69 failure mode: the decoration lookup missed, so nothing was removed.
			const found = await browser.executeObsidian(async ({ app }, args) => {
				const plugin = (app.plugins.plugins as any)["ink"];
				const file = app.vault.getAbstractFileByPath(args.notePath) as any;
				const content = await app.vault.read(file);
				return !!plugin.findEmbedMarkdownRangeInString(content, args.embeddedPath, "inkWriting");
			}, { notePath: NOTE_PATH, embeddedPath: EMBEDDED_PATH });
			expect(found).toBe(true);
		});

		it("returns no range for a file that is not embedded, so no wrong line is removed", async function () {
			const found = await browser.executeObsidian(async ({ app }, args) => {
				const plugin = (app.plugins.plugins as any)["ink"];
				const file = app.vault.getAbstractFileByPath(args.notePath) as any;
				const content = await app.vault.read(file);
				return plugin.findEmbedMarkdownRangeInString(content, "Ink/Writing/not-embedded.svg", "inkWriting");
			}, { notePath: NOTE_PATH });
			expect(found).toBeNull();
		});
	});

	// ───────────────────────────────────────────────────────────────────────────
	// #124 — the main toolbar must sit above the canvas, never inside it
	// ───────────────────────────────────────────────────────────────────────────

	describe("#124 menu placement", function () {
		beforeEach(async function () {
			await reloadVault();
			await openNoteAndWaitForEmbeds("01 - Basic Embeds/Single Writing Embed.md");
			await unlockFirstWritingEmbed();
		});

		it("keeps the toolbar above the canvas while editing", async function () {
			const geometry = await browser.execute(() => {
				const editor = document.querySelector(".ddc_ink_writing-editor") as HTMLElement | null;
				const menuBar = editor?.querySelector(".ink_primary-menu-bar") as HTMLElement | null;
				const canvas = editor?.querySelector(".ink-svg-canvas-container") as HTMLElement | null;
				if (!menuBar || !canvas) return null;
				const menuBarRect = menuBar.getBoundingClientRect();
				const canvasRect = canvas.getBoundingClientRect();
				return {
					menuBarBottom: menuBarRect.bottom,
					menuBarTop: menuBarRect.top,
					menuBarHeight: menuBarRect.height,
					canvasTop: canvasRect.top,
				};
			});
			expect(geometry).not.toBeNull();
			if (!geometry) return;

			// The bar is translated up by its own height, so its bottom sits at the canvas top.
			// Before the fix (#124), leaked scroll handlers could park it inside the canvas.
			expect(geometry.menuBarBottom).toBeLessThanOrEqual(geometry.canvasTop + 1);
			expect(geometry.menuBarHeight).toBeGreaterThan(0);
			expect(geometry.menuBarBottom).toBeGreaterThan(0);
		});

		it("does not accumulate scroll handlers across re-renders", async function () {
			// Count the writes each handler makes: duplicated handlers would each set `top`.
			const topWrites = await browser.execute(() => {
				const editor = document.querySelector(".ddc_ink_writing-editor") as HTMLElement | null;
				const menuBar = editor?.querySelector(".ink_primary-menu-bar") as HTMLElement | null;
				const scroller = editor?.closest(".cm-scroller") as HTMLElement | null;
				if (!menuBar || !scroller) return -1;

				let writeCount = 0;
				const originalSetProperty = menuBar.style.setProperty.bind(menuBar.style);
				const originalRemoveProperty = menuBar.style.removeProperty.bind(menuBar.style);
				(menuBar.style as any).setProperty = (property: string, value: string, priority?: string) => {
					if (property === "top") writeCount++;
					return originalSetProperty(property, value, priority);
				};
				(menuBar.style as any).removeProperty = (property: string) => {
					if (property === "top") writeCount++;
					return originalRemoveProperty(property);
				};

				// One scroll event must produce at most one write per live handler.
				scroller.dispatchEvent(new CustomEvent("scroll"));

				(menuBar.style as any).setProperty = originalSetProperty;
				(menuBar.style as any).removeProperty = originalRemoveProperty;
				return writeCount;
			});
			// The embed is fully visible at this scroll position, so the handler clears `top` (1 write).
			expect(topWrites).toBeLessThanOrEqual(1);
		});
	});

	// ───────────────────────────────────────────────────────────────────────────
	// #132 — a selected fragment must stay reachable on a writing page
	// ───────────────────────────────────────────────────────────────────────────

	describe("#132 selection stays reachable", function () {
		beforeEach(async function () {
			await reloadVault();
			await openNoteAndWaitForEmbeds("01 - Basic Embeds/Empty Embeds.md");
			await unlockFirstWritingEmbed();
		});

		it("keeps a dragged selection overlapping the page", async function () {
			// Draw ink: there must be a stroke before a selection can exist.
			await browser.execute(() => {
				const canvas = document.querySelector(".ink-svg-canvas") as SVGSVGElement | null;
				if (!canvas) return;
				const rect = canvas.getBoundingClientRect();
				const opts = (x: number, y: number, buttons: number) => ({
					bubbles: true, cancelable: true, pointerId: 7, pointerType: "pen",
					isPrimary: true, clientX: x, clientY: y, pressure: 0.5, buttons, view: window,
				});
				const startX = rect.left + 140;
				const startY = rect.top + 90;
				canvas.dispatchEvent(new PointerEvent("pointerdown", opts(startX, startY, 1)));
				for (let step = 1; step <= 15; step++) {
					canvas.dispatchEvent(new PointerEvent("pointermove", opts(startX + step * 9, startY + step * 3, 1)));
				}
				canvas.dispatchEvent(new PointerEvent("pointerup", opts(startX + 135, startY + 45, 0)));
			});
			await browser.waitUntil(
				() => browser.execute(() => document.querySelectorAll("[data-stroke-group]").length > 0),
				{ timeout: 15000, interval: 200 },
			);

			// Switch to the select tool, then lasso the stroke.
			await browser.execute(() => {
				const button = document.querySelector(".ink_tool-menu button[aria-label='Select']") as HTMLButtonElement | null;
				button?.click();
			});
			await browser.pause(600);

			await browser.execute(() => {
				const canvas = document.querySelector(".ink-svg-canvas") as SVGSVGElement | null;
				if (!canvas) return;
				const rect = canvas.getBoundingClientRect();
				const dispatch = (type: string, x: number, y: number, buttons: number) => {
					canvas.dispatchEvent(new PointerEvent(type, {
						bubbles: true, cancelable: true, pointerId: 9, pointerType: "pen",
						isPrimary: true, clientX: x, clientY: y, buttons, view: window,
					}));
				};
				const left = rect.left + 110;
				const right = rect.left + 300;
				const top = rect.top + 60;
				const bottom = rect.top + 190;
				dispatch("pointerdown", left, top, 1);
				dispatch("pointermove", left, bottom, 1);
				dispatch("pointermove", right, bottom, 1);
				dispatch("pointermove", right, top, 1);
				dispatch("pointerup", right, top, 0);
			});
			await browser.pause(900);

			const selectionChromePresent = await browser.execute(() => {
				return !!document.querySelector(".ink-canvas-selection-overlay, .ink-canvas-selection-bounds");
			});
			expect(selectionChromePresent).toBe(true);

			// Drag the selection far above the page start and release.
			await browser.execute(() => {
				const canvas = document.querySelector(".ink-svg-canvas") as SVGSVGElement | null;
				if (!canvas) return;
				const rect = canvas.getBoundingClientRect();
				const startX = rect.left + 200;
				const startY = rect.top + 120;
				const dispatch = (type: string, y: number, buttons: number) => {
					canvas.dispatchEvent(new PointerEvent(type, {
						bubbles: true, cancelable: true, pointerId: 11, pointerType: "pen",
						isPrimary: true, clientX: startX, clientY: y, buttons, view: window,
					}));
				};
				dispatch("pointerdown", startY, 1);
				for (let step = 1; step <= 20; step++) dispatch("pointermove", startY - step * 40, 1);
				dispatch("pointerup", startY - 800, 0);
			});
			await browser.pause(900);

			const afterDrag = await browser.execute(() => {
				const canvas = document.querySelector(".ink-svg-canvas") as SVGSVGElement | null;
				if (!canvas) return null;
				const canvasRect = canvas.getBoundingClientRect();
				const groups = Array.from(document.querySelectorAll("[data-stroke-group]")) as SVGGElement[];
				if (groups.length === 0) return null;
				const groupRect = groups[0].getBoundingClientRect();
				return {
					groupTop: groupRect.top,
					groupBottom: groupRect.bottom,
					canvasTop: canvasRect.top,
					canvasBottom: canvasRect.bottom,
					offsetY: groups[0].getAttribute("data-offset-y"),
				};
			});
			expect(afterDrag).not.toBeNull();
			if (!afterDrag) return;

			// The stroke must still overlap the canvas so it can be grabbed again (#132).
			const overlapsCanvas =
				afterDrag.groupBottom > afterDrag.canvasTop && afterDrag.groupTop < afterDrag.canvasBottom;
			expect(overlapsCanvas).toBe(true);
		});
	});

	// ───────────────────────────────────────────────────────────────────────────
	// #180 — drawing preview must not crop with a viewBox the file never used
	// ───────────────────────────────────────────────────────────────────────────

	describe("#180 drawing render drift", function () {
		const NOTE_PATH = "Issue180 ViewBox Drift.md";
		const DRAWING_PATH = "_test-fixtures/v2-tldraw-drawing-tasks-priority.svg";

		/** Reads the viewBox the preview actually applied to the SVG element. */
		async function readAppliedViewBox(): Promise<string | null> {
			const applied = await browser.execute(() => {
				const preview = document.querySelector(".ddc_ink_drawing-embed-preview");
				const svg = preview?.querySelector("svg");
				return svg?.getAttribute("viewBox") ?? null;
			});
			return applied;
		}

		it("renders with the SVG file's own viewBox when the URL has none", async function () {
			await reloadVault();
			const fileViewBox = await browser.executeObsidian(async ({ app }, drawingPath) => {
				const file = app.vault.getAbstractFileByPath(drawingPath) as any;
				const content = await app.vault.read(file);
				const match = content.match(/<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i);
				return match ? match[1] : null;
			}, DRAWING_PATH);
			expect(fileViewBox).not.toBeNull();

			await writeNote(
				NOTE_PATH,
				[
					"# ViewBox drift probe",
					"",
					` ![InkDrawing](<${DRAWING_PATH}>) [Edit Drawing](https://youtu.be/2arL1jh8ihA?type=inkDrawing&width=500&aspectRatio=1.000)`,
					"",
				].join("\n"),
			);
			await openNoteAndWaitForEmbeds(NOTE_PATH);

			const appliedViewBox = await readAppliedViewBox();
			expect(appliedViewBox).not.toBeNull();
			// The regression: the preview forced the default 500×281 box and cropped the ink.
			expect(appliedViewBox).not.toBe("0 0 500 281");

			const appliedNumbers = String(appliedViewBox).trim().split(/[\s,]+/).map(Number);
			const fileNumbers = String(fileViewBox).trim().split(/[\s,]+/).map(Number);
			expect(appliedNumbers[2]).toBeCloseTo(fileNumbers[2], 0);
			expect(appliedNumbers[3]).toBeCloseTo(fileNumbers[3], 0);
		});

		it("still honours an explicit viewBox from the embed URL", async function () {
			await reloadVault();
			await writeNote(
				NOTE_PATH,
				[
					"# ViewBox drift probe",
					"",
					` ![InkDrawing](<${DRAWING_PATH}>) [Edit Drawing](https://youtu.be/2arL1jh8ihA?type=inkDrawing&width=500&aspectRatio=1.000&viewBoxX=453.58&viewBoxY=197.5&viewBoxW=829.74&viewBoxH=1533.25)`,
					"",
				].join("\n"),
			);
			await openNoteAndWaitForEmbeds(NOTE_PATH);

			const appliedViewBox = await readAppliedViewBox();
			expect(appliedViewBox).not.toBeNull();
			expect(String(appliedViewBox)).toContain("829");
		});
	});
});
