import { App, Modal, prepareFuzzySearch, SearchComponent, TFile } from "obsidian";
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

function fileMatchesQuery(file: TFile, query: string): boolean {
	const trimmed = query.trim();
	if (trimmed === "") return true;
	const searchFn = prepareFuzzySearch(trimmed);
	return searchFn(file.basename) !== null || searchFn(file.path) !== null;
}

function filterFiles(files: TFile[], query: string): TFile[] {
	return files.filter((file) => fileMatchesQuery(file, query));
}

export class SvgFilePickerModal extends Modal {
	titleText: string;
	sections: SectionedFiles;
	fileType: "inkWriting" | "inkDrawing";
	onChoose: (file: TFile) => void;
	searchQuery = "";

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

	private renderSections(container: HTMLElement, filteredRecent: TFile[], filteredOnPage: TFile[], filteredOther: TFile[]): void {
		container.empty();
		const otherLabel =
			this.fileType === "inkDrawing" ? "Other drawings" : "Other writing";
		const recentLabel =
			this.fileType === "inkDrawing" ? "Recent drawings" : "Recent writing";

		const hasAnyResults = filteredRecent.length > 0 || filteredOnPage.length > 0 || filteredOther.length > 0;
		if (!hasAnyResults) {
			const emptyEl = container.createDiv({ cls: "ink-svg-picker-empty" });
			emptyEl.style.padding = "24px";
			emptyEl.style.textAlign = "center";
			emptyEl.style.color = "var(--text-muted)";
			emptyEl.setText("No files match your search");
			return;
		}

		if (filteredRecent.length > 0) {
			this.renderSectionHeader(container, recentLabel);
			this.renderHorizontalRow(container, filteredRecent);
		}

		if (filteredOnPage.length > 0) {
			this.renderSectionHeader(container, "On current page");
			this.renderHorizontalRow(container, filteredOnPage);
		}

		if (filteredOther.length > 0) {
			const isOnlySection = filteredRecent.length === 0 && filteredOnPage.length === 0;
			if (!isOnlySection) this.renderSectionHeader(container, otherLabel);
			const grid = container.createDiv({ cls: "ink-svg-picker-grid" });
			grid.style.display = "grid";
			grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(140px, 1fr))";
			grid.style.gap = "12px";
			for (const file of filteredOther) {
				this.createFileCard(grid, file);
			}
		}
	}

	onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.setText(this.titleText);

		const searchContainer = contentEl.createDiv({ cls: "ink-svg-picker-search" });
		searchContainer.style.marginBottom = "8px";
		const searchComponent = new SearchComponent(searchContainer);
		searchComponent.setPlaceholder("Search by filename...");
		searchComponent.setValue(this.searchQuery);

		const sectionsContainer = contentEl.createDiv({ cls: "ink-svg-picker-sections" });

		const applyFilter = () => {
			this.searchQuery = searchComponent.getValue();
			const filteredRecent = filterFiles(this.sections.recent, this.searchQuery);
			const filteredOnPage = filterFiles(this.sections.onCurrentPage, this.searchQuery);
			const filteredOther = filterFiles(this.sections.other, this.searchQuery);
			this.renderSections(sectionsContainer, filteredRecent, filteredOnPage, filteredOther);
		};

		searchComponent.onChange(applyFilter);

		applyFilter();

		requestAnimationFrame(() => {
			searchComponent.inputEl.focus();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}


