import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

const READING_NOTE = "09 - Edge Cases and Error States/Embed in Reading View.md";

async function openActiveNoteInReadingMode(): Promise<void> {
	await browser.executeObsidian(({ app }) => {
		const leaf = app.workspace.activeLeaf;
		if (!leaf) return;
		const viewState = leaf.getViewState();
		leaf.setViewState({
			type: "markdown",
			state: { ...viewState.state, mode: "preview" },
			popstate: true,
		});
	});
	// Post-processor defers to a microtask; allow replacement + React mount to finish.
	await browser.pause(1500);
}

describe("Reading mode ink embeds", function () {
	before(async function () {
		await dismissBlockingPopups();
	});

	it("replaces native embeds with inlined SVG previews", async function () {
		await obsidianPage.openFile(READING_NOTE);
		await openActiveNoteInReadingMode();

		const host = await browser.$(".markdown-preview-view .ddc_ink_reading-embed-host");
		await host.waitForExist({ timeout: 15000 });
		await expect(host).toExist();

		const writingPreview = await browser.$(
			".markdown-preview-view .ddc_ink_writing-embed-preview",
		);
		await writingPreview.waitForExist({ timeout: 15000 });
		await expect(writingPreview).toExist();

		const drawingPreview = await browser.$(
			".markdown-preview-view .ddc_ink_drawing-embed-preview",
		);
		await drawingPreview.waitForExist({ timeout: 15000 });
		await expect(drawingPreview).toExist();

		const inlinedSvgCount = await browser.execute(() => {
			const previews = document.querySelectorAll(
				".markdown-preview-view .ddc_ink_reading-embed-host .ddc_ink_writing-embed-preview svg, .markdown-preview-view .ddc_ink_reading-embed-host .ddc_ink_drawing-embed-preview svg",
			);
			return previews.length;
		});
		expect(inlinedSvgCount).toBeGreaterThanOrEqual(2);

		const nativeInkImgCount = await browser.execute(() => {
			const previewRoot = document.querySelector(".markdown-preview-view");
			if (!previewRoot) return 0;
			return previewRoot.querySelectorAll('img[alt="InkWriting"], img[alt="InkDrawing"]').length;
		});
		expect(nativeInkImgCount).toBe(0);
	});

	it("applies theme stroke colour to inlined ink paths when theme toggles", async function () {
		await obsidianPage.openFile(READING_NOTE);
		await openActiveNoteInReadingMode();

		const drawingPreview = await browser.$(
			".markdown-preview-view .ddc_ink_drawing-embed-preview",
		);
		await drawingPreview.waitForExist({ timeout: 15000 });

		const fillsByTheme = await browser.execute(() => {
			const pathEl = document.querySelector(
				".markdown-preview-view .ddc_ink_drawing-embed-preview path",
			) as SVGPathElement | null;
			if (!pathEl) return null;

			const readFill = () => getComputedStyle(pathEl).fill;

			document.body.classList.remove("theme-dark");
			document.body.classList.add("theme-light");
			const lightFill = readFill();

			document.body.classList.remove("theme-light");
			document.body.classList.add("theme-dark");
			const darkFill = readFill();

			return { lightFill, darkFill };
		});

		expect(fillsByTheme).not.toBeNull();
		expect(fillsByTheme!.lightFill).not.toBe(fillsByTheme!.darkFill);
		// Baked SVG uses #000000 — themed display must not stay hardcoded black in both themes.
		expect(fillsByTheme!.lightFill === "rgb(0, 0, 0)" && fillsByTheme!.darkFill === "rgb(0, 0, 0)").toBe(false);
	});
});
