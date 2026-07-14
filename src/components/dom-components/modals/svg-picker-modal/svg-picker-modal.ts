import "./svg-picker-modal.scss";
import { App, Modal, prepareFuzzySearch, SearchComponent, TFile } from "obsidian";
import type { SectionedFiles } from "src/logic/utils/open-ink-file-picker";
import {
	embedPreviewClassForFileType,
	mountInlineSvgPreview,
} from "src/logic/utils/inline-svg-preview";

////////
////////

/** Cap concurrent SVG parses so scrolling does not stampede vault reads + DOMParser. */
const MAX_CONCURRENT_PREVIEW_LOADS = 4;
/** Prefetch slightly outside the scroller so fast scrolls still feel continuous. */
const PREVIEW_ROOT_MARGIN = "120px 0px";

function fileMatchesQuery(file: TFile, query: string): boolean {
	const trimmed = query.trim();
	if (trimmed === "") return true;
	const searchFn = prepareFuzzySearch(trimmed);
	return searchFn(file.basename) !== null || searchFn(file.path) !== null;
}

function filterFiles(files: TFile[], query: string): TFile[] {
	return files.filter((file) => fileMatchesQuery(file, query));
}

type CardPreviewState = {
	file: TFile;
	previewHost: HTMLElement;
	isMounted: boolean;
	loadGeneration: number;
};

export class SvgFilePickerModal extends Modal {
	titleText: string;
	sections: SectionedFiles;
	fileType: "inkWriting" | "inkDrawing";
	onChoose: (file: TFile) => void;
	searchQuery = "";
	/** True after onClose — discovery must not refresh a dismissed modal. */
	hasClosed = false;
	private isScanning = false;
	private svgContentCache = new Map<string, string>();
	private previewObserver: IntersectionObserver | null = null;
	private cardPreviewStates = new Map<HTMLElement, CardPreviewState>();
	private activePreviewLoads = 0;
	private pendingPreviewLoads: CardPreviewState[] = [];
	private searchComponent: SearchComponent | null = null;
	private sectionsContainer: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;

	constructor(
		app: App,
		options: {
			title: string;
			sections: SectionedFiles;
			fileType: "inkWriting" | "inkDrawing";
			onChoose: (file: TFile) => void;
			isScanning?: boolean;
		}
	) {
		super(app);
		this.titleText = options.title;
		this.sections = options.sections;
		this.fileType = options.fileType;
		this.onChoose = options.onChoose;
		this.isScanning = options.isScanning === true;
	}

	/**
	 * Replace sectioned files after async discovery finishes (or streams updates).
	 * Re-renders the filtered grid while keeping the search query.
	 */
	setSections(sections: SectionedFiles, isScanning: boolean) {
		if (this.hasClosed) return;
		this.sections = sections;
		this.isScanning = isScanning;
		this.updateStatusText();
		this.applyFilter();
	}

	private updateStatusText() {
		if (!this.statusEl) return;
		if (this.isScanning) {
			this.statusEl.setText("Scanning vault for ink files…");
			this.statusEl.show();
			return;
		}
		this.statusEl.hide();
	}

	private disconnectPreviewObserver() {
		this.previewObserver?.disconnect();
		this.previewObserver = null;
		this.cardPreviewStates.clear();
		this.pendingPreviewLoads = [];
		this.activePreviewLoads = 0;
	}

	private ensurePreviewObserver() {
		if (this.previewObserver || !this.sectionsContainer) return;
		// Observe against the sections scroller so off-screen grid cards unload.
		this.previewObserver = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const state = this.cardPreviewStates.get(entry.target as HTMLElement);
					if (!state) continue;
					if (entry.isIntersecting) {
						this.enqueuePreviewMount(state);
					} else if (state.isMounted) {
						this.unloadPreview(state);
					}
				}
			},
			{
				root: this.sectionsContainer,
				rootMargin: PREVIEW_ROOT_MARGIN,
				threshold: 0.01,
			},
		);
	}

	private enqueuePreviewMount(state: CardPreviewState) {
		if (state.isMounted) return;
		if (this.pendingPreviewLoads.includes(state)) return;
		this.pendingPreviewLoads.push(state);
		this.pumpPreviewLoadQueue();
	}

	private pumpPreviewLoadQueue() {
		while (
			this.activePreviewLoads < MAX_CONCURRENT_PREVIEW_LOADS
			&& this.pendingPreviewLoads.length > 0
		) {
			const next = this.pendingPreviewLoads.shift();
			if (!next) break;
			if (next.isMounted) continue;
			this.activePreviewLoads++;
			void this.loadInlinePreview(next).finally(() => {
				this.activePreviewLoads = Math.max(0, this.activePreviewLoads - 1);
				this.pumpPreviewLoadQueue();
			});
		}
	}

	private unloadPreview(state: CardPreviewState) {
		// Keep string cache; drop DOM so off-screen complex SVGs do not stay mounted.
		state.loadGeneration++;
		state.isMounted = false;
		state.previewHost.empty();
		state.previewHost.createDiv({
			cls: "ink-svg-picker-preview-placeholder",
			text: "",
		});
	}

	private async loadInlinePreview(state: CardPreviewState): Promise<void> {
		const generation = ++state.loadGeneration;
		const { previewHost, file } = state;
		try {
			let svgString = this.svgContentCache.get(file.path);
			if (svgString === undefined) {
				svgString = await this.app.vault.cachedRead(file);
				this.svgContentCache.set(file.path, svgString);
			}
			// Card may have scrolled out or been re-rendered while we awaited
			if (generation !== state.loadGeneration) return;
			if (![...this.cardPreviewStates.values()].includes(state)) return;

			if (mountInlineSvgPreview(previewHost, svgString)) {
				state.isMounted = true;
				return;
			}
		} catch {
			// fall through to placeholder
		}
		if (generation !== state.loadGeneration) return;
		if (![...this.cardPreviewStates.values()].includes(state)) return;
		previewHost.empty();
		previewHost.createDiv({
			cls: "ink-svg-picker-preview-placeholder",
			text: "Preview unavailable",
		});
		state.isMounted = true;
	}

	private createFileCard(container: HTMLElement, file: TFile, isHorizontalRow = false): void {
		const card = container.createDiv({
			cls: isHorizontalRow
				? "ink-svg-picker-item ink-svg-picker-item--row-fixed-width"
				: "ink-svg-picker-item",
		});

		const previewWrapper = card.createDiv({ cls: "ink-svg-picker-preview" });
		const previewHost = previewWrapper.createDiv({
			cls: embedPreviewClassForFileType(this.fileType),
		});
		// Placeholder until the card intersects the scroll viewport
		previewHost.createDiv({
			cls: "ink-svg-picker-preview-placeholder",
			text: "",
		});

		const state: CardPreviewState = {
			file,
			previewHost,
			isMounted: false,
			loadGeneration: 0,
		};
		this.cardPreviewStates.set(card, state);
		this.previewObserver?.observe(card);

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
		this.disconnectPreviewObserver();
		container.empty();
		this.ensurePreviewObserver();

		const otherLabel =
			this.fileType === "inkDrawing" ? "Other drawings" : "Other writing";
		const recentLabel =
			this.fileType === "inkDrawing" ? "Recent drawings" : "Recent writing";

		const hasAnyResults = filteredRecent.length > 0 || filteredOnPage.length > 0 || filteredOther.length > 0;
		if (!hasAnyResults) {
			const emptyEl = container.createDiv({ cls: "ink-svg-picker-empty" });
			emptyEl.setText(this.isScanning ? "Scanning vault…" : "No files match your search");
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

	private applyFilter() {
		if (!this.sectionsContainer || !this.searchComponent) return;
		this.searchQuery = this.searchComponent.getValue();
		const filteredRecent = filterFiles(this.sections.recent, this.searchQuery);
		const filteredOnPage = filterFiles(this.sections.onCurrentPage, this.searchQuery);
		const filteredOther = filterFiles(this.sections.other, this.searchQuery);
		this.renderSections(this.sectionsContainer, filteredRecent, filteredOnPage, filteredOther);
	}

	onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.setText(this.titleText);

		this.statusEl = contentEl.createDiv({ cls: "ink-svg-picker-status" });
		this.updateStatusText();

		const searchContainer = contentEl.createDiv({ cls: "ink-svg-picker-search" });
		this.searchComponent = new SearchComponent(searchContainer);
		this.searchComponent.setPlaceholder("Search by filename...");
		this.searchComponent.setValue(this.searchQuery);

		this.sectionsContainer = contentEl.createDiv({ cls: "ink-svg-picker-sections" });

		this.searchComponent.onChange(() => this.applyFilter());

		this.applyFilter();

		window.requestAnimationFrame(() => {
			this.searchComponent?.inputEl.focus();
		});
	}

	onClose() {
		this.hasClosed = true;
		this.disconnectPreviewObserver();
		this.svgContentCache.clear();
		this.searchComponent = null;
		this.sectionsContainer = null;
		this.statusEl = null;
		this.contentEl.empty();
	}
}
