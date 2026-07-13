import { FileView, TFile, WorkspaceLeaf } from "obsidian";
import InkPlugin from "src/main";
import {
	embedPreviewClassForFileType,
	mountInlineSvgPreview,
} from "src/logic/utils/inline-svg-preview";
import "./svg-edit-button.scss";

////////
////////

const THEMED_PREVIEW_HOST_CLASS = 'ddc_ink_svg-native-view-preview';

/**
 * Overlay an Edit button on Obsidian's native SVG leaf, and replace the baked-black
 * img/object display with an inlined SVG so theme stroke CSS can recolour paths.
 */
export function addEditButtonToSvgView(
	plugin: InkPlugin,
	leaf: WorkspaceLeaf,
	file: TFile,
	viewType: string,
	svgString: string,
	fileType: 'inkWriting' | 'inkDrawing',
) {
	// Wait for the SVG view to be rendered
	window.setTimeout(() => {
		const view = leaf.view;
		if (!view) return;

		// Find the view container
		const containerEl = view.containerEl;
		if (!containerEl) return;

		// Check if button already exists
		if (containerEl.querySelector('.ddc_ink_svg-edit-button')) return;

		// Find the view content area - Obsidian's SVG view typically uses .view-content
		const viewContent = containerEl.querySelector('.view-content') ||
			containerEl.querySelector('.markdown-source-view') ||
			containerEl;

		// Ensure the container has relative positioning for absolute button positioning
		const computedStyle = window.getComputedStyle(viewContent);
		if (computedStyle.position === 'static') {
			viewContent.classList.add('ddc_ink_svg-view-content--anchor');
		}

		mountThemedNativeViewPreview(viewContent as HTMLElement, svgString, fileType);

		// Create the button container
		const buttonContainer = document.createElement('div');
		buttonContainer.className = 'ddc_ink_svg-edit-button-container';

		// Determine button text based on view type
		const isDrawing = viewType.includes('drawing');
		const buttonText = isDrawing ? 'Edit drawing' : 'Edit writing';

		// Create the edit button
		const editButton = document.createElement('button');
		editButton.className = 'ddc_ink_btn-slim ddc_ink_svg-edit-button';
		editButton.textContent = buttonText;
		editButton.title = `Edit ${isDrawing ? 'drawing' : 'writing'} in custom view`;

		// Handle button click
		editButton.addEventListener('click', (e) => {
			e.stopPropagation();
			e.preventDefault();

			void leaf.setViewState({
				type: viewType,
				state: { file: file.path },
				active: true,
			});
		});

		buttonContainer.appendChild(editButton);
		viewContent.appendChild(buttonContainer);

		// Clean up when the view changes
		const cleanup = () => {
			const existingButton = containerEl.querySelector('.ddc_ink_svg-edit-button-container');
			if (existingButton) {
				existingButton.remove();
			}
			const existingPreview = containerEl.querySelector(`.${THEMED_PREVIEW_HOST_CLASS}`);
			if (existingPreview) {
				existingPreview.remove();
			}
			containerEl.querySelectorAll('.ddc_ink_svg-native-media--hidden').forEach((el) => {
				el.classList.remove('ddc_ink_svg-native-media--hidden');
			});
		};

		// Register cleanup on file close
		plugin.registerEvent(
			plugin.app.workspace.on('file-open', () => {
				// Clean up when a different file is opened
				const currentView = leaf.view;
				if (currentView instanceof FileView && currentView.file !== file) {
					cleanup();
				}
			})
		);
	}, 100);
}

/**
 * Hide Obsidian's native img/object media and mount an inlined SVG under the
 * writing/drawing preview host class so ink-svg-preview-theme.scss applies.
 */
function mountThemedNativeViewPreview(
	viewContent: HTMLElement,
	svgString: string,
	fileType: 'inkWriting' | 'inkDrawing',
) {
	if (viewContent.querySelector(`.${THEMED_PREVIEW_HOST_CLASS}`)) return;

	const nativeMedia = viewContent.querySelectorAll('img, object, embed');
	nativeMedia.forEach((el) => {
		el.classList.add('ddc_ink_svg-native-media--hidden');
	});

	const previewHost = document.createElement('div');
	previewHost.className = `${THEMED_PREVIEW_HOST_CLASS} ${embedPreviewClassForFileType(fileType)}`;
	if (!mountInlineSvgPreview(previewHost, svgString)) {
		// Restore native media if inline mount fails so the leaf still shows something
		nativeMedia.forEach((el) => {
			el.classList.remove('ddc_ink_svg-native-media--hidden');
		});
		return;
	}

	viewContent.appendChild(previewHost);
}
