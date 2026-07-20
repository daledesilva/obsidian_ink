import { FileView, TFile, WorkspaceLeaf } from "obsidian";
import InkPlugin from "src/main";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import {
	embedPreviewClassForFileType,
	mountInlineSvgPreview,
} from "src/logic/utils/inline-svg-preview";
import "./svg-edit-button.scss";

////////
////////

const THEMED_PREVIEW_HOST_CLASS = 'ddc_ink_svg-native-view-preview';
/** Marks the leaf while vault.read / mount run so baked-black img never paints. */
const AWAITING_THEME_CLASS = 'ddc_ink_svg-view--awaiting-theme';
const MAX_MOUNT_ATTEMPTS = 30;

// Keep in sync with WRITING_VIEW_TYPE / DRAWING_VIEW_TYPE exports (avoid circular imports).
const INK_WRITING_VIEW_TYPE = 'ink_writing-view';
const INK_DRAWING_VIEW_TYPE = 'ink_drawing-view';

/** Prevents file-open + active-leaf-change (and dual registers) from racing the same leaf. */
const themingInFlightByLeafFileKey = new Set<string>();

/**
 * Hide native SVG media immediately so Obsidian cannot paint baked-black strokes
 * before the themed inline preview mounts.
 */
function suppressNativeSvgFlash(leaf: WorkspaceLeaf) {
	leaf.view?.containerEl?.classList.add(AWAITING_THEME_CLASS);
}

/**
 * Undo flash suppression when the SVG is not ink (or mount is abandoned).
 */
function releaseNativeSvgFlashSuppression(leaf: WorkspaceLeaf) {
	leaf.view?.containerEl?.classList.remove(AWAITING_THEME_CLASS);
}

/**
 * On opening an `.svg` in Obsidian's native leaf: suppress black-img flash early,
 * then mount a theme-aware inline preview + Edit button when the file is ink.
 * Safe to call from both writing and drawing registers / multiple workspace events.
 */
export async function ensureThemedNativeInkSvgView(
	plugin: InkPlugin,
	leaf: WorkspaceLeaf,
	file: TFile,
) {
	if (!file || file.extension !== 'svg' || !leaf) return;

	const currentViewType = leaf.view?.getViewType?.();
	if (currentViewType === INK_WRITING_VIEW_TYPE || currentViewType === INK_DRAWING_VIEW_TYPE) {
		return;
	}

	const leafId = leaf.id ?? '';
	const inFlightKey = `${leafId}:${file.path}`;
	if (themingInFlightByLeafFileKey.has(inFlightKey)) return;
	themingInFlightByLeafFileKey.add(inFlightKey);

	const finishEnsure = () => {
		themingInFlightByLeafFileKey.delete(inFlightKey);
	};

	// Sync — before await — so media that appears during vault.read stays invisible.
	suppressNativeSvgFlash(leaf);

	try {
		const svgString = await plugin.app.vault.read(file);
		if (!svgString || !svgString.trim().startsWith('<svg')) {
			releaseNativeSvgFlashSuppression(leaf);
			finishEnsure();
			return;
		}

		const viewTypeAfterRead = leaf.view?.getViewType?.();
		// Leaf may have switched to the custom ink editor while we were reading.
		if (
			viewTypeAfterRead === INK_WRITING_VIEW_TYPE ||
			viewTypeAfterRead === INK_DRAWING_VIEW_TYPE
		) {
			releaseNativeSvgFlashSuppression(leaf);
			finishEnsure();
			return;
		}

		const inkFileData = extractInkJsonFromSvg(svgString);
		if (!inkFileData) {
			releaseNativeSvgFlashSuppression(leaf);
			finishEnsure();
			return;
		}

		if (inkFileData.meta.fileType === 'inkWriting') {
			addEditButtonToSvgView(
				plugin,
				leaf,
				file,
				INK_WRITING_VIEW_TYPE,
				svgString,
				'inkWriting',
				finishEnsure,
			);
			return;
		}

		if (inkFileData.meta.fileType === 'inkDrawing') {
			addEditButtonToSvgView(
				plugin,
				leaf,
				file,
				INK_DRAWING_VIEW_TYPE,
				svgString,
				'inkDrawing',
				finishEnsure,
			);
			return;
		}

		releaseNativeSvgFlashSuppression(leaf);
		finishEnsure();
	} catch {
		releaseNativeSvgFlashSuppression(leaf);
		finishEnsure();
	}
}

/**
 * Overlay an Edit button on Obsidian's native SVG leaf, and replace the baked-black
 * img/object display with an inlined SVG so theme stroke CSS can recolour paths.
 * Caller must already have suppressed the native-media flash for this open.
 */
function addEditButtonToSvgView(
	plugin: InkPlugin,
	leaf: WorkspaceLeaf,
	file: TFile,
	viewType: string,
	svgString: string,
	fileType: 'inkWriting' | 'inkDrawing',
	onSettled: () => void,
) {
	scheduleNativeSvgChrome(
		leaf,
		(viewContent, containerEl) => {
			if (containerEl.querySelector('.ddc_ink_svg-edit-button')) {
				releaseNativeSvgFlashSuppression(leaf);
				onSettled();
				return;
			}

			const computedStyle = window.getComputedStyle(viewContent);
			if (computedStyle.position === 'static') {
				viewContent.classList.add('ddc_ink_svg-view-content--anchor');
			}

			const didMountPreview = mountThemedNativeViewPreview(viewContent, svgString, fileType);
			if (!didMountPreview) {
				releaseNativeSvgFlashSuppression(leaf);
				onSettled();
				return;
			}

			const buttonContainer = activeDocument.createElement('div');
			buttonContainer.className = 'ddc_ink_svg-edit-button-container';

			const isDrawing = viewType.includes('drawing');
			const buttonText = isDrawing ? 'Edit drawing' : 'Edit writing';

			const editButton = activeDocument.createElement('button');
			editButton.className = 'ddc_ink_btn-slim ddc_ink_svg-edit-button';
			editButton.textContent = buttonText;
			editButton.title = `Edit ${isDrawing ? 'drawing' : 'writing'} in custom view`;

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

			// Themed SVG is visible; native media stays display:none via --hidden.
			releaseNativeSvgFlashSuppression(leaf);
			onSettled();

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
				containerEl.classList.remove(AWAITING_THEME_CLASS);
			};

			plugin.registerEvent(
				plugin.app.workspace.on('file-open', () => {
					const currentView = leaf.view;
					if (currentView instanceof FileView && currentView.file !== file) {
						cleanup();
					}
				})
			);
		},
		() => {
			releaseNativeSvgFlashSuppression(leaf);
			onSettled();
		},
	);
}

/**
 * Run `onReady` as soon as the leaf's view content exists — no fixed delay that
 * would let native media paint first.
 */
function scheduleNativeSvgChrome(
	leaf: WorkspaceLeaf,
	onReady: (viewContent: HTMLElement, containerEl: HTMLElement) => void,
	onGiveUp: () => void,
) {
	let attempts = 0;

	const tryMount = (): boolean => {
		const view = leaf.view;
		const containerEl = view?.containerEl;
		if (!containerEl) return false;

		const viewContent =
			containerEl.querySelector<HTMLElement>('.view-content') ||
			containerEl.querySelector<HTMLElement>('.markdown-source-view') ||
			containerEl;

		onReady(viewContent, containerEl);
		return true;
	};

	if (tryMount()) return;

	const tick = () => {
		attempts += 1;
		if (tryMount()) return;
		if (attempts >= MAX_MOUNT_ATTEMPTS) {
			onGiveUp();
			return;
		}
		window.requestAnimationFrame(tick);
	};
	window.requestAnimationFrame(tick);
}

/**
 * Hide Obsidian's native img/object media and mount an inlined SVG under the
 * writing/drawing preview host class so ink-svg-preview-theme.scss applies.
 * Returns false when inline mount fails so callers can restore native media.
 */
function mountThemedNativeViewPreview(
	viewContent: HTMLElement,
	svgString: string,
	fileType: 'inkWriting' | 'inkDrawing',
): boolean {
	if (viewContent.querySelector(`.${THEMED_PREVIEW_HOST_CLASS}`)) return true;

	const nativeMedia = viewContent.querySelectorAll('img, object, embed');
	nativeMedia.forEach((el) => {
		el.classList.add('ddc_ink_svg-native-media--hidden');
	});

	const previewHost = activeDocument.createElement('div');
	// Layout host + shared embed preview class: svg-edit-button.scss sizes the former;
	// ink-svg-preview-theme.scss recolours paths via the latter (same as embeds/picker).
	previewHost.className = `${THEMED_PREVIEW_HOST_CLASS} ${embedPreviewClassForFileType(fileType)}`;
	if (!mountInlineSvgPreview(previewHost, svgString)) {
		nativeMedia.forEach((el) => {
			el.classList.remove('ddc_ink_svg-native-media--hidden');
		});
		return false;
	}

	viewContent.appendChild(previewHost);
	return true;
}
