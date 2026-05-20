import "./svg-picker-modal.scss";
import { App, Modal, prepareFuzzySearch, SearchComponent, TFile } from "obsidian";
import type { SectionedFiles } from "src/logic/utils/open-ink-file-picker";

////////
////////

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
		const card = container.createDiv({
			cls: isHorizontalRow
				? "ink-svg-picker-item ink-svg-picker-item--row-fixed-width"
				: "ink-svg-picker-item",
		});

		const previewWrapper = card.createDiv({ cls: "ink-svg-picker-preview" });
		const imgEl = previewWrapper.createEl("img");
		const basePath = this.app.vault.getResourcePath(file);
		const mtime = file.stat?.mtime ?? 0;
		const separator = basePath.includes("?") ? "&" : "?";
		imgEl.src = `${basePath}${separator}t=${mtime}`;
		imgEl.alt = file.basename;

		const label = card.createDiv({ cls: "ink-svg-picker-label" });
		label.setText(file.basename);

		card.addEventListener("click", () => {
			this.close();
			this.onChoose(file);
		});
	}

	private renderHorizontalRow(container: HTMLElement, files: TFile[]): void {
		const wrapper = container.createDiv({ cls: "ink-svg-picker-row-wrapper" });

		const row = wrapper.createDiv({ cls: "ink-svg-picker-row" });

		for (const file of files) {
			this.createFileCard(row, file, true);
		}

		const createScrollBtn = (chevron: string, scrollDelta: number) => {
			const btn = wrapper.createDiv({ cls: "ink-svg-picker-scroll-btn" });
			btn.setText(chevron);
			btn.addEventListener("click", (event) => {
				event.stopPropagation();
				row.scrollBy({ left: scrollDelta, behavior: "smooth" });
			});
			return btn;
		};

		const leftOverlay = wrapper.createDiv({
			cls: "ink-svg-picker-scroll-indicator ink-svg-picker-scroll-indicator--left",
		});
		const leftBtn = createScrollBtn("‹", -140);
		leftOverlay.appendChild(leftBtn);

		const rightOverlay = wrapper.createDiv({
			cls: "ink-svg-picker-scroll-indicator ink-svg-picker-scroll-indicator--right",
		});
		const rightBtn = createScrollBtn("›", 140);
		rightOverlay.appendChild(rightBtn);

		const updateOverlayVisibility = () => {
			const isScrollable = row.scrollWidth > row.clientWidth;
			const atStart = row.scrollLeft <= 1;
			const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1;
			leftOverlay.classList.toggle(
				"ink-svg-picker-scroll-indicator--hidden",
				!(isScrollable && !atStart)
			);
			rightOverlay.classList.toggle(
				"ink-svg-picker-scroll-indicator--hidden",
				!(isScrollable && !atEnd)
			);
		};

		window.requestAnimationFrame(() => {
			updateOverlayVisibility();
			window.requestAnimationFrame(updateOverlayVisibility);
		});
		row.addEventListener("scroll", updateOverlayVisibility);
	}

	private renderSectionHeader(container: HTMLElement, label: string): void {
		const header = container.createEl("div", { cls: "ink-svg-picker-section-header" });
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
			for (const file of filteredOther) {
				this.createFileCard(grid, file);
			}
		}
	}

	onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.setText(this.titleText);

		const searchContainer = contentEl.createDiv({ cls: "ink-svg-picker-search" });
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

		window.requestAnimationFrame(() => {
			searchComponent.inputEl.focus();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
