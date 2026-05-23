import { TextFileView, TFile, WorkspaceLeaf, FileView } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { DRAW_FILE_V1_EXT } from "src/constants";
import "./drawing-view.scss";
import InkPlugin from "src/main";
import { TldrawDrawingEditor_v1 } from "src/components/formats/v1-code-blocks/drawing/tldraw-drawing-editor/tldraw-drawing-editor";
import { 
	Provider as JotaiProvider
} from "jotai";
import { buildFileStr } from "../../utils/buildFileStr";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { addEditButtonToSvgView } from "src/logic/utils/addEditButtonToSvgView";
import { openInkFileInView, restoreSidebarsAfterInkView } from "src/logic/utils/open-file";
import { FileConversionModal } from "src/components/dom-components/modals/file-conversion-modal/file-conversion-modal";
import { ConfirmationModal } from "src/components/dom-components/modals/confirmation-modal/confirmation-modal";
import { TldrawDrawingEditor } from "../tldraw-drawing-editor/tldraw-drawing-editor";
import { InkCanvasDrawingEditor } from "../ink-canvas-drawing-editor/ink-canvas-drawing-editor";
import { InkFileData } from "../../types/file-data";
import { DrawingEditorControls } from "../drawing-embed/drawing-embed";
import { type MenuOption } from "src/components/jsx-components/overflow-menu/overflow-menu";

////////
////////

export const DRAWING_VIEW_TYPE = "ink_drawing-view";

function getExtendedOptions(plugin: InkPlugin, fileRef: TFile): MenuOption[] {
    return [
        { separator: true },
        {
            text: 'Convert to Writing',
            action: () => {
                if (!fileRef) return;
                new FileConversionModal(plugin, fileRef, 'inkWriting', {
                    onConversionComplete: (finalFile) => {
                        if (finalFile) void openInkFileInView(finalFile, 'inkWriting');
                    },
                }).open();
            }
        },
    ] as MenuOption[];
}

////////

export function registerDrawingView (plugin: InkPlugin) {
    plugin.registerView(
        DRAWING_VIEW_TYPE,
        (leaf) => new DrawingView(leaf, plugin)
    );

    // Helper function to check and add edit button for drawing files
    async function checkAndAddEditButton(leaf: WorkspaceLeaf, file: TFile) {
        if (!file || file.extension !== 'svg') return;
        
        const currentViewType = leaf.view?.getViewType?.();
        // Skip if already in our custom view
        if (currentViewType === DRAWING_VIEW_TYPE) return;

        try {
            const svgString = await plugin.app.vault.read(file);
            if (!svgString || !svgString.trim().startsWith('<svg')) return;

            // Re-check after the async read — the leaf may have transitioned to
            // DRAWING_VIEW_TYPE while vault.read was awaited (race condition when
            // opening via Obsidian Menu whose onClick is not awaited by Obsidian)
            if (leaf.view?.getViewType?.() === DRAWING_VIEW_TYPE) return;

            const inkFileData = extractInkJsonFromSvg(svgString);
            if (!inkFileData) return;
            if (inkFileData.meta.fileType !== "inkDrawing") return;

            // Add edit button to the SVG view
            addEditButtonToSvgView(plugin, leaf, file, DRAWING_VIEW_TYPE);
        } catch (_) {
            // Fail silently; fall back to default SVG handling
        }
    }

    // Add edit button to SVG views that contain ink drawing data
    plugin.registerEvent(
        plugin.app.workspace.on('file-open', async (file) => {
            if (!file) return;
            const targetLeaf = plugin.app.workspace.getMostRecentLeaf();
            if (targetLeaf) {
                await checkAndAddEditButton(targetLeaf, file);
            }
        })
    );

    // Also check when a leaf becomes active (e.g., when navigating back)
    plugin.registerEvent(
        plugin.app.workspace.on('active-leaf-change', async (leaf) => {
            if (!leaf) return;
            const view = leaf.view;
            if (view instanceof FileView && view.file) {
                await checkAndAddEditButton(leaf, view.file);
            }
        })
    );
}

export class DrawingView extends TextFileView {
    root: null | Root;
    plugin: InkPlugin;
    inkFileData: InkFileData;
    hostEl: HTMLElement | null;
    editorControls: DrawingEditorControls | null = null; // Add this
    /** Prevents active-leaf-change from being registered more than once per view instance. */
    private leafChangeListenerRegistered = false;

    constructor(leaf: WorkspaceLeaf, plugin: InkPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.hostEl = null;
    }

    getViewType(): string {
        return DRAWING_VIEW_TYPE;
    }

    getDisplayText = () => {
        return this.file?.basename || "Drawing";
    }
    
    // This provides the data from the file for placing into the view (Called when file is opening)
    setViewData = (fileContents: string, clear: boolean) => {
        if(!this.file) return;
        
        const inkFileData = extractInkJsonFromSvg(fileContents);
        if(inkFileData) {
            this.inkFileData = inkFileData;
        }

        const viewContent = this.containerEl.children[1] as HTMLElement;
        viewContent.setAttr('style', 'padding: 0;');
		
        // If a new file is opening in the same leaf, then clear the old one instead of creating a new one
        if(this.root) this.clear();

        // Create a dedicated host for React to avoid conflicts with Obsidian lifecycle
        const host = viewContent.ownerDocument.createElement('div');
        host.className = 'ink-drawing-view-host';
        viewContent.appendChild(host);
        this.hostEl = host;

        this.root = createRoot(host);

		const useInkCanvas = this.inkFileData?.meta?.format === 'ink-canvas' || true; // Default to ink-canvas for all drawings

		const editorElement = useInkCanvas
			? <InkCanvasDrawingEditor
					onReady = {() => {}}
					workspaceLeafId = {this.leaf.id}
					drawingFile = {this.file}
					save = {this.saveFile}
					extendedMenu = {[
						...getExtendedOptions(this.plugin, this.file),
						{ separator: true },
						{
							text: 'Erase all',
							warning: true,
							action: () => {
								new ConfirmationModal({
									plugin: this.plugin,
									title: 'Erase all strokes?',
									message: 'This will remove all strokes from the canvas.',
									confirmLabel: 'Erase all',
									confirmAction: () => void this.editorControls?.eraseAll?.(),
								}).open();
							},
						},
					] as MenuOption[]}
					saveControlsReference = {this.registerEditorControls}
				/>
			: <TldrawDrawingEditor
					onReady = {() => {}}
					workspaceLeafId = {this.leaf.id}
					drawingFile = {this.file}
					save = {this.saveFile}
					extendedMenu = {[
						...getExtendedOptions(this.plugin, this.file),
						{ separator: true },
						{
							text: 'Erase all',
							warning: true,
							action: () => {
								new ConfirmationModal({
									plugin: this.plugin,
									title: 'Erase all strokes?',
									message: 'This will remove all strokes from the canvas.',
									confirmLabel: 'Erase all',
									confirmAction: () => void this.editorControls?.eraseAll?.(),
								}).open();
							},
						},
					] as MenuOption[]}
					saveControlsReference = {this.registerEditorControls}
				/>;

		this.root.render(
            <JotaiProvider>
                {editorElement}
            </JotaiProvider>
        );

		// Close the Boox overlay when the user navigates away from this view leaf,
		// and restore it when they navigate back.
		// Note: when the user clicks "back", Obsidian reuses the same leaf object but
		// replaces the view type (it now shows a Markdown note). We must also verify
		// the leaf's current view is still the drawing view, not just the same leaf.
		// Guard: setViewData can be called multiple times (e.g. when the SVG is saved by
		// the embed and Obsidian detects the external change), which would register multiple
		// listeners — causing multiple close-drawing-area sends per tab switch.
		if (!this.leafChangeListenerRegistered) {
			this.leafChangeListenerRegistered = true;
			this.registerEvent(
				this.plugin.app.workspace.on('active-leaf-change', (leaf) => {
					const isThisLeafActive = leaf === this.leaf;
					const isThisViewStillInLeaf = this.leaf?.view?.getViewType?.() === DRAWING_VIEW_TYPE;
					this.editorControls?.setBooxOverlayActive?.(isThisLeafActive && isThisViewStillInLeaf);
				})
			);
		}
    }

    saveFile = (inkFileData: InkFileData) => {
        this.inkFileData = inkFileData;
        void this.save(false);   // Obsidian will call getViewData during this method
    }
    
    // This allows you to return the data you want Obsidian to save (Called by Obsidian when file is closing)
    getViewData = (): string => {
        return buildFileStr(this.inkFileData);
    }

    // This is sometimes called by Obsidian, and also called manually on file changes
    clear = (): void => {
        // Clear editor controls reference
        this.editorControls = null;

        // NOTE: Unmounting forces the store listeners in the React app to stop (Without that, old files can save data into new ones)
        try {
            if(this.root) this.root.unmount();
        } catch (_error) {
			void _error;
        }
        this.root = null;
        if(this.hostEl && this.hostEl.isConnected) {
            try { this.hostEl.remove(); } catch (_error) {
				void _error;
			}
        }
        this.hostEl = null;
    }

    // Add method to register editor controls
    registerEditorControls = (controls: DrawingEditorControls) => {
        this.editorControls = controls;
    }

    async onClose(): Promise<void> {
        // Save current state before unmounting
        if (this.root && this.editorControls) {
            await this.editorControls.saveAndHalt();
        }
        
        // Then cleanup
        this.clear();
        restoreSidebarsAfterInkView();
        return await super.onClose();
    }

    // onResize()

}











