import { App, Modal, TFile } from "obsidian";

////////
////////

export class SvgFilePickerModal extends Modal {
	titleText: string;
	files: TFile[];
	onChoose: (file: TFile) => void;

	constructor(app: App, options: { title: string; files: TFile[]; onChoose: (file: TFile) => void }) {
		super(app);
		this.titleText = options.title;
		this.files = options.files;
		this.onChoose = options.onChoose;
	}

	onOpen() {
		const { titleEl, contentEl } = this;
		titleEl.setText(this.titleText);

		const grid = contentEl.createDiv({ cls: "ink-svg-picker-grid" });
		grid.style.display = "grid";
		grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(140px, 1fr))";
		grid.style.gap = "12px";

		for (let i = 0; i < this.files.length; i++) {
			const file = this.files[i];
			const card = grid.createDiv({ cls: "ink-svg-picker-item" });
			card.style.cursor = "pointer";
			card.style.border = "1px solid var(--background-modifier-border)";
			card.style.borderRadius = "8px";
			card.style.padding = "8px";
			card.style.display = "flex";
			card.style.flexDirection = "column";
			card.style.alignItems = "stretch";
			card.style.justifyContent = "flex-start";

			const previewWrapper = card.createDiv({ cls: "ink-svg-picker-preview" });
			previewWrapper.style.display = "flex";
			previewWrapper.style.alignItems = "center";
			previewWrapper.style.justifyContent = "center";
			previewWrapper.style.height = "160px";
			previewWrapper.style.overflow = "hidden";
			previewWrapper.style.backgroundColor = "var(--background-primary)";

			const imgEl = previewWrapper.createEl("img");
			// Obsidian recommended: use resource path for vault media
			const resourcePath = (this.app.vault as any).getResourcePath(file);
			imgEl.src = resourcePath;
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
	}

	onClose() {
		this.contentEl.empty();
	}
}


