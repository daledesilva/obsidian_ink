import { FileView, TextFileView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import InkPlugin from "src/main";
import "./writing-view.scss";
import { InkFileData } from "src/components/formats/current/types/file-data";
import { WritingEditor } from "../writing-editor/writing-editor";
import { type MenuOption } from "src/components/jsx-components/overflow-menu/overflow-menu";
import { buildFileStr } from "../../utils/buildFileStr";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { WritingEditorControls } from "../writing-embed/writing-embed";
import { ensureThemedNativeInkSvgView } from "src/logic/utils/addEditButtonToSvgView";
import { openInkFileInView, restoreSidebarsAfterInkView } from "src/logic/utils/open-file";
import { FileConversionModal } from "src/components/dom-components/modals/file-conversion-modal/file-conversion-modal";
import { ConfirmationModal } from "src/components/dom-components/modals/confirmation-modal/confirmation-modal";
import { buildWritingEmbedLine } from "../../utils/build-embeds";
import { copyEmbedMarkdownToClipboard } from "src/logic/utils/copy-embed-to-clipboard";
import { readWritingFileAspectRatio } from "src/logic/utils/writing-embed-aspect-ratio";

////////
////////

export const WRITING_VIEW_TYPE = "ink_writing-view";

////////

export function registerWritingView (plugin: InkPlugin) {
    plugin.registerView(
        WRITING_VIEW_TYPE,
        (leaf) => new WritingView(leaf, plugin)
    );

    // Native SVG leaf: suppress black-img flash early, then theme + Edit when ink.
    // Shared with drawing via ensureThemedNativeInkSvgView (handles both file types).
    plugin.registerEvent(
        plugin.app.workspace.on('file-open', async (file) => {
            if (!file) return;
            const targetLeaf = plugin.app.workspace.getMostRecentLeaf();
            if (targetLeaf) {
                await ensureThemedNativeInkSvgView(plugin, targetLeaf, file);
            }
        })
    );

    plugin.registerEvent(
        plugin.app.workspace.on('active-leaf-change', async (leaf) => {
            if (!leaf) return;
            const view = leaf.view;
            if (view instanceof FileView && view.file) {
                await ensureThemedNativeInkSvgView(plugin, leaf, view.file);
            }
        })
    );
}

export class WritingView extends TextFileView {
    root: null | Root;
    plugin: InkPlugin;
    inkFileData: InkFileData;
    editorControls: WritingEditorControls | null = null;
    tldrawControls: {
        resize?: () => void,
    } = {}
    hostEl: HTMLElement | null;
    /** Prevents active-leaf-change from being registered more than once per view instance. */
    private leafChangeListenerRegistered = false;

    constructor(leaf: WorkspaceLeaf, plugin: InkPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.hostEl = null;
    }

    getViewType(): string {
        return WRITING_VIEW_TYPE;
    }

    getDisplayText = () => {
        return this.file?.basename || "Handwritten note";
    }
    
    // This provides the data from the file for placing into the view (Called by Obsidian when file is opening)
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
        host.className = 'ink-writing-view-host';
        viewContent.appendChild(host);
        this.hostEl = host;

        this.root = createRoot(host);

        this.root.render(
            <WritingEditor
                plugin={this.plugin}
                workspaceLeafId={this.leaf.id}
                writingFile={this.file}
                save={this.saveFile}
                saveControlsReference={this.registerEditorControls}
                extendedMenu={this.buildExtendedMenu()}
            />
        );

		// Close the Boox overlay when navigating away from this leaf; restore when returning.
		// Guard: setViewData can run multiple times — register at most once per view instance.
		if (!this.leafChangeListenerRegistered) {
			this.leafChangeListenerRegistered = true;
			this.registerEvent(
				this.plugin.app.workspace.on('active-leaf-change', (leaf) => {
					const isThisLeafActive = leaf === this.leaf;
					const isThisViewStillInLeaf = this.leaf?.view?.getViewType?.() === WRITING_VIEW_TYPE;
					this.editorControls?.setBooxOverlayActive?.(isThisLeafActive && isThisViewStillInLeaf);
				}),
			);
		}
    }

    private buildExtendedMenu(): MenuOption[] {
        return [
            { separator: true },
            {
                text: 'Copy embed',
                action: () => {
                    if (!this.file) return;
                    void (async () => {
                        if (!this.file) return;
                        const aspectRatio = await readWritingFileAspectRatio(this.plugin, this.file);
                        const embedStr = buildWritingEmbedLine(
                            this.file.path,
                            aspectRatio != null ? { aspectRatio } : undefined,
                        );
                        void copyEmbedMarkdownToClipboard(embedStr);
                    })();
                },
            },
            {
                text: 'Convert to Drawing',
                action: () => {
                    if (!this.file) return;
                    new FileConversionModal(this.plugin, this.file, 'inkDrawing', {
                        onConversionComplete: (finalFile) => {
                            if (finalFile) void openInkFileInView(finalFile, 'inkDrawing');
                        },
                    }).open();
                },
            },
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
                        confirmAction: () => { void this.editorControls?.eraseAll?.(); },
                    }).open();
                },
            },
        ] as MenuOption[];
    }

    saveFile = (inkFileData: InkFileData) => {
        this.inkFileData = inkFileData;
        void this.save(false);   // Obsidian will call getViewData during this method
    }

    // Register editor controls for saving before unmount
    registerEditorControls = (controls: WritingEditorControls) => {
        this.editorControls = controls;
        // Also store resize for backward compatibility
        this.tldrawControls.resize = controls.resize;
    }
    
    // This allows you to return the data you want Obsidian to save (Called by Obsidian when file is closing)
    getViewData = (): string => {
        return buildFileStr(this.inkFileData);
    }

    // This is sometimes called by Obsidian, and also called manually on file changes
    clear = (): void => {
        // Clear editor controls reference
        this.editorControls = null;
        
        // NOTE: Unmounting forces the store listeners in the React app to stop (Without that, old files can save data over new files)
        try {
            if(this.root) this.root.unmount();
        } catch {
            // Root may already be unmounted.
        }
        this.root = null;
        if(this.hostEl && this.hostEl.isConnected) {
            try { this.hostEl.remove(); } catch {
                // Host may already be detached.
            }
        }
        this.hostEl = null;
    }

    onResize = () => {
        // TODO: Currently this doesn't refresh the width stored in the camera limits, so removed it for now
        // if(this.tldrawControls.resize) this.tldrawControls.resize();
    }

    async onClose(): Promise<void> {
        // Save current state before unmounting to prevent empty SVG
        if (this.editorControls) {
            await this.editorControls.saveAndHalt();
        }
        
        // Then cleanup
        this.clear();
        restoreSidebarsAfterInkView();
        return await super.onClose();
    }
}











