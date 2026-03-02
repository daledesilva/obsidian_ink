import { App, Modal, TFile } from "obsidian";
import type { SectionedFiles } from "src/logic/utils/open-ink-file-picker";

////////
////////

const CARD_STYLES = {
	card: {
		cursor: "pointer",
		border: "1px solid var(--background-modifier-border)",
		borderRadius: "8px",
		padding: "8px",
		display: "flex",
		flexDirection: "column",
		alignItems: "stretch",
		justifyContent: "flex-start",
	},
	previewWrapper: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		height: "160px",
		overflow: "hidden",
		backgroundColor: "var(--background-primary)",
	},
};

export class SvgFilePickerModal extends Modal {
	titleText: string;
	sections: SectionedFiles;
	fileType: "inkWriting" | "inkDrawing";
	onChoose: (file: TFile) => void;

	constructor(
		app: App,
		options: {
			title: string;
			sections: SectionedFiles;
			fileType: "inkWriting" | "inkDrawing";
			onChoose: (file: TFile) => void;
		}
	) {
		super(app);
		this.titleText = options.title;
		this.sections = options.sections;
		this.fileType = options.fileType;
		this.onChoose = options.onChoose;
	}

	private createFileCard(container: HTMLElement, file: TFile, isHorizontalRow = false): void {
		const card = container.createDiv({ cls: "ink-svg-picker-item" });
		Object.assign(card.style, CARD_STYLES.card);
		if (isHorizontalRow) {
			card.style.flexShrink = "0";
			card.style.width = "140px";
			card.style.minWidth = "140px";
			card.style.maxWidth = "140px";
		}

		const previewWrapper = card.createDiv({ cls: "ink-svg-picker-preview" });
		Object.assign(previewWrapper.style, CARD_STYLES.previewWrapper);

		const imgEl = previewWrapper.createEl("img");
		const basePath = (this.app.vault as any).getResourcePath(file);
		const mtime = file.stat?.mtime ?? 0;
		const separator = basePath.includes("?") ? "&" : "?";
		imgEl.src = `${basePath}${separator}t=${mtime}`;
		imgEl.style.maxWidth = "100%";
		imgEl.style.maxHeight = "100%";
		imgEl.style.objectFit = "contain";
		imgEl.alt = file.basename;

		const label = card.createDiv({ cls: "ink-svg-picker-label" });
		label.style.marginTop = "6px";
		label.style.fontSize = "12px";
		label.style.textAlign = "center";
		label.style.wordBreak = "break-word";
		label.setText(file.basename);

		card.addEventListener("click", () => {
			this.close();
			this.onChoose(file);
		});
	}

	private renderHorizontalRow(container: HTMLElement, files: TFile[]): void {
		const wrapper = container.createDiv({ cls: "ink-svg-picker-row-wrapper" });
		wrapper.style.position = "relative";
		wrapper.style.overflow = "hidden";
		wrapper.style.paddingBottom = "8px";

		const row = wrapper.createDiv({ cls: "ink-svg-picker-row" });
		row.style.display = "flex";
		row.style.flexWrap = "nowrap";
		row.style.overflowX = "auto";
		row.style.gap = "12px";

		for (const file of files) {
			this.createFileCard(row, file, true);
		}

		const scrollBtnStyles = {
			pointerEvents: "auto",
			cursor: "pointer",
			width: "28px",
			height: "28px",
			borderRadius: "50%",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			fontSize: "20px",
			color: "var(--text-muted)",
			transition: "background-color 0.15s, color 0.15s",
		};

		const createScrollBtn = (chevron: string, scrollDelta: number) => {
			const btn = wrapper.createDiv({ cls: "ink-svg-picker-scroll-btn" });
			Object.assign(btn.style, scrollBtnStyles);
			btn.setText(chevron);
			btn.addEventListener("mouseenter", () => {
				btn.style.backgroundColor = "rgba(255, 255, 255, 0.9)";
				btn.style.color = "#000";
			});
			btn.addEventListener("mouseleave", () => {
				btn.style.backgroundColor = "";
				btn.style.color = "var(--text-muted)";
			});
			btn.addEventListener("click", (event) => {
				event.stopPropagation();
				row.scrollBy({ left: scrollDelta, behavior: "smooth" });
			});
			return btn;
		};

		const leftOverlay = wrapper.createDiv({ cls: "ink-svg-picker-scroll-indicator ink-svg-picker-scroll-indicator--left" });
		leftOverlay.style.position = "absolute";
		leftOverlay.style.left = "0";
		leftOverlay.style.top = "0";
		leftOverlay.style.bottom = "8px";
		leftOverlay.style.width = "40px";
		leftOverlay.style.pointerEvents = "none";
		leftOverlay.style.display = "flex";
		leftOverlay.style.alignItems = "center";
		leftOverlay.style.justifyContent = "flex-start";
		leftOverlay.style.background =
			"linear-gradient(to right, var(--background-primary) 20%, transparent)";
		const leftBtn = createScrollBtn("‹", -140);
		leftOverlay.appendChild(leftBtn);

		const rightOverlay = wrapper.createDiv({ cls: "ink-svg-picker-scroll-indicator ink-svg-picker-scroll-indicator--right" });
		rightOverlay.style.position = "absolute";
		rightOverlay.style.right = "0";
		rightOverlay.style.top = "0";
		rightOverlay.style.bottom = "8px";
		rightOverlay.style.width = "40px";
		rightOverlay.style.pointerEvents = "none";
		rightOverlay.style.display = "flex";
		rightOverlay.style.alignItems = "center";
		rightOverlay.style.justifyContent = "flex-end";
		rightOverlay.style.background =
			"linear-gradient(to left, var(--background-primary) 20%, transparent)";
		const rightBtn = createScrollBtn("›", 140);
		rightOverlay.appendChild(rightBtn);

		const updateOverlayVisibility = () => {
			const isScrollable = row.scrollWidth > row.clientWidth;
			const atStart = row.scrollLeft <= 1;
			const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1;
			leftOverlay.style.display = isScrollable && !atStart ? "flex" : "none";
			rightOverlay.style.display = isScrollable && !atEnd ? "flex" : "none";
		};

		requestAnimationFrame(() => {
			updateOverlayVisibility();
			requestAnimationFrame(updateOverlayVisibility);
		});
		row.addEventListener("scroll", updateOverlayVisibility);
	}

	private renderSectionHeader(container: HTMLElement, label: string): void {
		const header = container.createEl("div", { cls: "ink-svg-picker-section-header" });
		header.style.fontSize = "13px";
		header.style.fontWeight = "600";
		header.style.marginTop = "12px";
		header.style.marginBottom = "6px";
		header.setText(label);
	}

	onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.setText(this.titleText);

		const otherLabel =
			this.fileType === "inkDrawing" ? "Other drawings" : "Other writing";
		const recentLabel =
			this.fileType === "inkDrawing" ? "Recent drawings" : "Recent writing";

		if (this.sections.recent.length > 0) {
			this.renderSectionHeader(contentEl, recentLabel);
			this.renderHorizontalRow(contentEl, this.sections.recent);
		}

		if (this.sections.onCurrentPage.length > 0) {
			this.renderSectionHeader(contentEl, "On current page");
			this.renderHorizontalRow(contentEl, this.sections.onCurrentPage);
		}

		if (this.sections.other.length > 0) {
			const isOnlySection =
				this.sections.recent.length === 0 && this.sections.onCurrentPage.length === 0;
			if (!isOnlySection) this.renderSectionHeader(contentEl, otherLabel);
			const grid = contentEl.createDiv({ cls: "ink-svg-picker-grid" });
			grid.style.display = "grid";
			grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(140px, 1fr))";
			grid.style.gap = "12px";
			for (const file of this.sections.other) {
				this.createFileCard(grid, file);
			}
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}


