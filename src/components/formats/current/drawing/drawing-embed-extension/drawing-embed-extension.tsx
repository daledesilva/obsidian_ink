import { syntaxTree } from '@codemirror/language';
import {
    Extension,
    RangeSetBuilder,
    StateField,
    Transaction,
} from "@codemirror/state";
import {
    Decoration,
    DecorationSet,
    EditorView,
    WidgetType,
} from "@codemirror/view";
import { editorLivePreviewField, MarkdownView, normalizePath, TFile } from 'obsidian';
import InkPlugin from 'src/main';
import * as React from "react";
import { createRoot } from "react-dom/client";
import { getGlobals } from 'src/stores/global-store';
import {
    Provider as JotaiProvider
} from "jotai";
import { DrawingEmbed } from 'src/components/formats/current/drawing/drawing-embed/drawing-embed';
import { InkFileData } from 'src/components/formats/current/types/file-data';
import { SyntaxNodeRef } from '@lezer/common';
import { EmbedSettings } from 'src/types/embed-settings';
import './drawing-embed-extension.scss';
import { parseSettingsFromUrl } from '../../utils/parse-settings-from-url';
import { buildFileStr } from '../../utils/buildFileStr';

/////////////////////
/////////////////////

const mountedDecorationIds: string[] = [];

export class DrawingEmbedWidget extends WidgetType {
    id: string;
    mdFile: TFile;
    embeddedFile: TFile | null;
    embedSettings: any;
    partialEmbedFilepath: string;
    isHighlighted: boolean = false;
    // mounted = false;

    constructor(mdFile: TFile, embeddedFile: TFile | null, embedSettings: {}, partialEmbedFilepath: string) {
        super();
        this.mdFile = mdFile;
        this.id = crypto.randomUUID(); // REVIEW: Is this available everyhere? // Also, what's it for?
        this.embeddedFile = embeddedFile;
        this.embedSettings = embedSettings;
        this.partialEmbedFilepath = partialEmbedFilepath;
    }

    toDOM(view: EditorView): HTMLElement {

        const rootEl = document.createElement('div');
        rootEl.className = 'ddc_ink_widget-root';
        rootEl.setAttribute('data-widget-id', this.id);

        // Ensure the widget wrapper itself is not focusable
        // This prevents the keyboard reappearing when pen is lifted
        rootEl.tabIndex = -1;

        const root = createRoot(rootEl);

        mountedDecorationIds.push(this.id);

        // Update highlight state based on current selection
        this.updateHighlightState(view, rootEl);

        root.render(
            <JotaiProvider>
                <DrawingEmbed
                    embeddedFile={this.embeddedFile}
                    embedSettings={this.embedSettings}
                    saveSrcFile={this.save}
                    remove={() => { this.removeEmbed(view); }}
                    setEmbedProps={(width, aspectRatio) => this.setEmbedProps(view, width, aspectRatio)}
                    partialEmbedFilepath={this.partialEmbedFilepath}
                />
            </JotaiProvider>
        );
        return rootEl;
    }

    updateHighlightState(view: EditorView, rootEl: HTMLElement) {
        // Find this widget's position in the document
        const decorations = view.state.field(embedStateField, false);
        if (!decorations) return;
        
        const it = decorations.iter();
        while (it.value) {
            const widget = it.value.spec?.widget as DrawingEmbedWidget | undefined;
            if (widget && widget.id === this.id) {
                const widgetStart = it.from;
                const widgetEnd = it.to;
                
                // Check if any selection range actually spans across this widget
                // Selection must have length > 0 and either start before and end after, or encompass the widget
                const isHighlighted = view.state.selection.ranges.some(range => {
                    const hasSelection = range.from !== range.to; // Must be an actual selection, not just cursor position
                    const spansWidget = (range.from < widgetStart && range.to > widgetEnd) || // Selection encompasses entire widget
                                      (range.from < widgetStart && range.to > widgetStart && range.to <= widgetEnd) || // Selection starts before and ends within
                                      (range.from >= widgetStart && range.from < widgetEnd && range.to > widgetEnd); // Selection starts within and ends after
                    return hasSelection && spansWidget;
                });
                
                // Update the highlight state and CSS class
                if (isHighlighted !== this.isHighlighted) {
                    this.isHighlighted = isHighlighted;
                    if (isHighlighted) {
                        rootEl.classList.add('ddc_ink_widget-highlighted');
                    } else {
                        rootEl.classList.remove('ddc_ink_widget-highlighted');
                    }
                }
                break;
            }
            it.next();
        }
    }

	// Helper functions
	///////////////////

	save = async (inkFileData: InkFileData) => {
		if(!this.embeddedFile) return;
		const plugin = getGlobals().plugin;
		const inkFileContents = buildFileStr(inkFileData);
		await plugin.app.vault.modify(this.embeddedFile, inkFileContents);
	}

	setEmbedProps = async (view: EditorView, width: number, aspectRatio: number) => {
        const newEmbedSettings: EmbedSettings = {
            ...this.embedSettings,
            embedDisplay: {
                ...this.embedSettings?.embedDisplay,
                width,
                aspectRatio,
            },
            viewBox: {
                ...this.embedSettings?.viewBox,
            },
        }
        this.updateEmbed(view, newEmbedSettings);
	}

    private removeEmbed(view: EditorView) {
        // Find this widget's decoration range and remove it
        const decorations = view.state.field(embedStateField, false);
        if (!decorations) return;
        const it = decorations.iter();
        while (it.value) {
            const widget = it.value.spec?.widget as DrawingEmbedWidget | undefined;
            if (widget && widget.id === this.id) {
                const tr = view.state.update({ changes: { from: it.from, to: it.to, insert: '' } });
                view.dispatch(tr);
                return;
            }
            it.next();
        }
    }

    private updateEmbed(view: EditorView, newEmbedSettings: EmbedSettings) {
        // Find this widget's decoration range and update settings inside it
        const decorations = view.state.field(embedStateField, false);
        if (!decorations) return;
        const it = decorations.iter();
        while (it.value) {
            const widget = it.value.spec?.widget as DrawingEmbedWidget | undefined;
            if (widget && widget.id === this.id) {
                // Keep instance settings in sync
                this.embedSettings = newEmbedSettings;
                const from = it.from;
                const to = it.to;
                const currentText = view.state.doc.sliceString(from, to);
                let updated = currentText;
                // Replace if present
                if (/width=[^&\)]+/.test(updated)) {
                    updated = updated.replace(/(width=)([^&\)]+)/, `$1${newEmbedSettings.embedDisplay.width}`);
                }
                if (/aspectRatio=[^&\)]+/.test(updated)) {
                    updated = updated.replace(/(aspectRatio=)([^&\)]+)/, `$1${newEmbedSettings.embedDisplay.aspectRatio}`);
                }
                if (updated !== currentText) {
                    const tr = view.state.update({ changes: { from, to, insert: updated } });
                    view.dispatch(tr);
                }
                return;
            }
            it.next();
        }
    }
}


// Define a StateField to monitor the state of all decorations on the page
const embedStateField: StateField<DecorationSet> = StateField.define<DecorationSet>({

    // Starts with an empty DecorationSet
    create(): DecorationSet {
        return Decoration.none;
    },

    update(prevEmbeds: DecorationSet, transaction: Transaction): DecorationSet {
        const { plugin } = getGlobals();


        // TODO: This should map the changes first?
        // prevEmbeds = prevEmbeds.map(transaction.changes);

        // TODO: See here and use transaction.effects to add things:
        // https://codemirror.net/examples/decoration/
        // But this will mean inserting an embed will need to cause an effect.
        // Which would be good, but also won't help when document loads?



        // if it's not the first run, check if widgets need to be reinitialized first.
        // Skip updates if there are no changes to the markdown content.
        // To prevent the react components in the widgets remounting.
        const firstRun = prevEmbeds.size === 0;
        
        // Update highlight state for existing widgets when selection changes
        if (!firstRun && transaction.changes.empty && transaction.selection) {
            updateWidgetHighlights(transaction, prevEmbeds);
        }
        
        if ( !firstRun && transaction.changes.empty) {
                return prevEmbeds;
        }
        // debug(['transaction.changes', transaction.changes], {freeze: true});

        
        const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const activeEditor = activeView?.editor;
        if (!activeEditor) return prevEmbeds;

        // @ts-expect-error, not typed
        const cmEditorView = activeEditor.cm as EditorView;
        const isLivePreview = cmEditorView.state.field(editorLivePreviewField);

        // const isReadingView = activeView.getMode() === 'preview';
        
        if (!isLivePreview) {
            return Decoration.none;
        }

        const builder = new RangeSetBuilder<Decoration>();

        syntaxTree(transaction.state).iterate({
            enter(syntaxNodeRef) {
                const mdFile = activeView.file;
                if (!mdFile) return true; // continue traversal

                const {embedLinkInfo, alterFlow} = detectMarkdownEmbedLink(mdFile, syntaxNodeRef, transaction);
                
                if(!embedLinkInfo) return true; // continue traversal
                if(alterFlow === 'ignore-children') return false;
                if(alterFlow === 'continue-traversal') return true;
                
                // Require a space before and new line after the embed.
                // But consume two characters before to collapse the space and the new line before
                embedLinkInfo.startPosition -= 2;
                embedLinkInfo.endPosition += 1;

                let decorationAlreadyExists = false;
                const oldDecoration = prevEmbeds.iter();

                // Find the relevant decoration reference if it already exists
                while(oldDecoration.value) {
                    const oldDecFrom = transaction.changes.mapPos(oldDecoration.from);
                    const oldDecTo = transaction.changes.mapPos(oldDecoration.to); // TODO: Not sure about "to" as if I change the settings this will change.
                    decorationAlreadyExists = oldDecFrom === embedLinkInfo.startPosition && oldDecTo === embedLinkInfo.endPosition;
                    if(decorationAlreadyExists) break;
                    oldDecoration.next();
                }

                if(decorationAlreadyExists && oldDecoration.value) {
                    // Reuse previous decoration
                    builder.add(
                        embedLinkInfo.startPosition,
                        embedLinkInfo.endPosition,
                        oldDecoration.value
                    );
                } else {
                    // create new decoration
                    builder.add(
                        embedLinkInfo.startPosition,  
                        embedLinkInfo.endPosition,
                        Decoration.replace({
                            widget: new DrawingEmbedWidget(mdFile, embedLinkInfo.embeddedFile, embedLinkInfo.embedSettings, embedLinkInfo.partialEmbedFilepath),
                            isBlock: true,
                        })
                    );
                }

            }
        })

        return builder.finish();
    },

    // Tell the editor to use these decorations (ie. provide them from this statefield)
    provide(stateField: StateField<DecorationSet>): Extension {
        // return EditorView.decorations.from(stateField);

        // return EditorView.atomicRanges.of( (view: EditorView) => {
        //     return EditorView.decorations.from(stateField) || Decoration.none
        // });
        
        return [
            EditorView.decorations.from(stateField),

            // Providing atomic ranges like either of these makes it atomic but still has 1 extra cursor movement before and 1 after.
            // EditorView.atomicRanges.of(stateField),
            // OR
            // EditorView.atomicRanges.of( (view: EditorView) => {
            //     return EditorView.decorations.from(stateField) || Decoration.none
            // })
            
            // This one only has 1 extra cursor movement AFTER.
            // Typing in the after section doesn't break anything, but does type in reverse order.
            // TODO: The side setting might be confused. So it's typing on the wrong side of the cursor.
            EditorView.atomicRanges.of( (view: EditorView) => {
                const decorations = view.state.field(embedStateField, false);
                return decorations || Decoration.none;
            }),

            // TODO: Try adding this as a reusable component and use in v1 as well
            // Tell CM to ignore events that originate within the widget DOM
            EditorView.domEventHandlers({
                mousedown: (event, view) => {
                    const target = event.target as Element | null;
                    if (target && target.closest && target.closest('.ddc_ink_widget-root')) return true;
                    return false;
                },
                touchstart: (event, view) => {
                    const target = event.target as Element | null;
                    if (target && target.closest && target.closest('.ddc_ink_widget-root')) return true;
                    return false;
                },
                click: (event, view) => {
                    const target = event.target as Element | null;
                    if (target && target.closest && target.closest('.ddc_ink_widget-root')) return true;
                    return false;
                }
            })
            
        ];
    },
})

// Helper function to update widget highlight states when selection changes
function updateWidgetHighlights(transaction: Transaction, decorations: DecorationSet) {
    const { plugin } = getGlobals();
    const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const activeEditor = activeView?.editor;
    if (!activeEditor) return;

    // @ts-expect-error, not typed
    const view = activeEditor.cm as EditorView;
    
    // Build a map of widget positions and their highlight states
    const widgetHighlightStates = new Map<string, boolean>();
    
    const it = decorations.iter();
    while (it.value) {
        const widget = it.value.spec?.widget as DrawingEmbedWidget | undefined;
        if (widget) {
            const widgetStart = it.from;
            const widgetEnd = it.to;
            
            // Check if any selection range actually spans across this widget
            // Selection must have length > 0 and either start before and end after, or encompass the widget
            const isHighlighted = transaction.newSelection.ranges.some(range => {
                const hasSelection = range.from !== range.to; // Must be an actual selection, not just cursor position
                const spansWidget = (range.from < widgetStart && range.to > widgetEnd) || // Selection encompasses entire widget
                                  (range.from < widgetStart && range.to > widgetStart && range.to <= widgetEnd) || // Selection starts before and ends within
                                  (range.from >= widgetStart && range.from < widgetEnd && range.to > widgetEnd); // Selection starts within and ends after
                return hasSelection && spansWidget;
            });
            
            widgetHighlightStates.set(widget.id, isHighlighted);
        }
        it.next();
    }
    
    // Update each widget's DOM element based on its specific highlight state
    const widgetElements = view.dom.querySelectorAll('.ddc_ink_widget-root');
    for (const element of widgetElements) {
        const htmlElement = element as HTMLElement;
        
        // Find the corresponding widget by searching through decorations again
        const decorationsIter = decorations.iter();
        let matchedWidget: DrawingEmbedWidget | undefined;
        
        while (decorationsIter.value) {
            const widget = decorationsIter.value.spec?.widget as DrawingEmbedWidget | undefined;
            if (widget) {
                // Try to match this DOM element with the widget by checking if it's the same element
                // We'll use a data attribute approach for better matching
                const widgetId = htmlElement.getAttribute('data-widget-id');
                if (widgetId === widget.id || (!widgetId && matchedWidget === undefined)) {
                    matchedWidget = widget;
                    htmlElement.setAttribute('data-widget-id', widget.id);
                    break;
                }
            }
            decorationsIter.next();
        }
        
        if (matchedWidget) {
            const isHighlighted = widgetHighlightStates.get(matchedWidget.id) || false;
            if (isHighlighted) {
                htmlElement.classList.add('ddc_ink_widget-highlighted');
            } else {
                htmlElement.classList.remove('ddc_ink_widget-highlighted');
            }
        }
    }
}

export function drawingEmbedExtension(): Extension {
    return embedStateField;
}

export function registerDrawingEmbed(plugin: InkPlugin) {
    plugin.registerEditorExtension([
        drawingEmbedExtension(),
    ]);
}

interface embedLinkInfoNew {
    startPosition: number,
    endPosition: number,
    embeddedFile: TFile | null,
    embedSettings: any,
    partialEmbedFilepath: string,
}



function detectMarkdownEmbedLink(mdFile: TFile, previewLinkStartNode: SyntaxNodeRef, transaction: Transaction): {
    embedLinkInfo?: embedLinkInfoNew,
    alterFlow?: 'ignore-children' | 'continue-traversal'
} {
    const { plugin } = getGlobals();

    let nextNode: SyntaxNodeRef | null = null;

    // space                   
    // !                    formatting_formatting-image_image_image-marker
    // [                    formatting_formatting-image_image_image-alt-text_link
    // altText              image_image-alt-text_link
    // ]                    formatting_formatting-image_image_image-alt-text_link
    // (                    formatting_formatting-link-string_string_url
    // partialFilePath      string_url
    // )                    formatting_formatting-link-string_string_url
    // [
    // Edit Drawing
    // ]
    // (
    // urlAndSettings                  
    // )

    // console.log('previewLinkStartNode', previewLinkStartNode.name);
    // Check for "!"
    if (!previewLinkStartNode || !previewLinkStartNode.name.includes('formatting_formatting-image_image_image-marker')) {
        return {alterFlow: 'continue-traversal'};
    }
    // console.log(`---- Found "!" marker:`, `"${transaction.state.doc.sliceString(previewLinkStartNode.from, previewLinkStartNode.to)}"`);
    
    
    // Ensure there's a space before the embed
    const spaceBefore = transaction.state.doc.sliceString(previewLinkStartNode.from - 1, previewLinkStartNode.from);
    if(spaceBefore !== ' ') {
        return {alterFlow: 'continue-traversal'};
    }
        
    // Check for "[" or "[]"
    const transcriptStartNode = previewLinkStartNode.node.nextSibling;
    if(!transcriptStartNode || !transcriptStartNode.name.includes('formatting_formatting-image_image_image-alt-text_link')) {
        return {alterFlow: 'continue-traversal'};
    }
    // console.log(`---- Found transcript start:`, `"${transaction.state.doc.sliceString(transcriptStartNode.from, transcriptStartNode.to)}"`);

    // Get the next node, which could be alt text or could be "("
    nextNode = transcriptStartNode.node.nextSibling;
    if(!nextNode) {
        return {alterFlow: 'continue-traversal'};
    }
    
    // Containers for alt text nodes if they exist
    let transcriptTextNode: SyntaxNodeRef | null = null;
    let transcriptEndNode: SyntaxNodeRef | null = null;

    // If the start node was "[", then the next node must be alt text
    if(transcriptStartNode.to-transcriptStartNode.from === 1) {
        transcriptTextNode = nextNode;
        // console.log(`---- Found transcript text:`, `"${transaction.state.doc.sliceString(transcriptTextNode.from, transcriptTextNode.to)}"`);
        transcriptEndNode = transcriptTextNode.node.nextSibling;
        if(!transcriptEndNode || !transcriptEndNode.name.includes('formatting_formatting-image_image_image-alt-text_link')) {
            return {alterFlow: 'continue-traversal'};
        }
        // console.log(`---- Found transcript end:`, `"${transaction.state.doc.sliceString(transcriptEndNode.from, transcriptEndNode.to)}"`);
        nextNode = transcriptEndNode.node.nextSibling;
    }
    
    // Check for "("
    const previewUrlStartNode = nextNode;
    // Allows for quote_quote inbetween
    if(!previewUrlStartNode || (!previewUrlStartNode.name.includes('formatting_formatting-link-string') && !previewUrlStartNode.name.includes('string_url'))) {
        return {alterFlow: 'continue-traversal'};
    }
    // console.log(`---- Found preview URL start:`, `"${transaction.state.doc.sliceString(previewUrlStartNode.from, previewUrlStartNode.to)}"`);

    // Check for filepath section
    const previewFilepathNode = previewUrlStartNode.node.nextSibling;
    if(!previewFilepathNode || !previewFilepathNode.name.includes('string_url')) {
        return {alterFlow: 'continue-traversal'};
    }
    // console.log(`---- Found preview URL path:`, `"${transaction.state.doc.sliceString(previewFilepathNode.from, previewFilepathNode.to)}"`);

    // Check for ")"
    const previewUrlEndNode = previewFilepathNode.node.nextSibling;
    // Allows for quote_quote inbetween
    if(!previewUrlEndNode || (!previewUrlEndNode.name.includes('formatting_formatting-link-string') && !previewUrlEndNode.name.includes('string_url'))) {
        return {alterFlow: 'continue-traversal'};
    }
    // console.log(`---- Found preview URL end:`, `"${transaction.state.doc.sliceString(previewUrlEndNode.from, previewUrlEndNode.to)}"`);

    // Allows any amount of white space inbetween
    // Skip any number of nodes with name "quote_quote-1" (Blank spaces within a quote section)
    let quoteNode = previewUrlEndNode.node.nextSibling;
    while (quoteNode && quoteNode.name === "quote_quote-1") {
        quoteNode = quoteNode.node.nextSibling;
    }
    nextNode = quoteNode;

    // Now check for the settings section
    /////////////////////////////////////

    // Check for "[" or "[]"
    const editTextStartNode = nextNode;
    if(!editTextStartNode || !editTextStartNode.name.includes('formatting_formatting-link_link')) {
        // console.log(`ERROR! editTextStartNode`, editTextStartNode);
        if(editTextStartNode) {
            // console.log(`xxxx :`, `"${transaction.state.doc.sliceString(editTextStartNode.from, editTextStartNode.to)}"`);
        }
        return {alterFlow: 'continue-traversal'};
    }
    // console.log(`---- Found edit text start:`, `"${transaction.state.doc.sliceString(editTextStartNode.from, editTextStartNode.to)}"`);

    // Get the next node, which could be alt text or could be "("
    nextNode = editTextStartNode.node.nextSibling;
    if(!nextNode) {
        return {alterFlow: 'continue-traversal'};
    }
    
    // Containers for alt text nodes if they exist
    let editTextNode: SyntaxNodeRef | null = null;
    let editTextEndNode: SyntaxNodeRef | null = null;

    // If the start node was "[", then the next node must be alt text
    if(editTextStartNode.to-editTextStartNode.from === 1) {
        editTextNode = nextNode;
        const editText = transaction.state.doc.sliceString(editTextNode.from, editTextNode.to);
        // console.log(`---- Found edit text:`, `"${editText}"`);
        // Disambiguate: Require correct drawing label
        if (editText.trim() !== 'Edit Drawing') {
            return {alterFlow: 'continue-traversal'};
        }
        editTextEndNode = editTextNode.node.nextSibling;
        if(!editTextEndNode || !editTextEndNode.name.includes('formatting_formatting-link_link')) {
            if(editTextEndNode) {
                // console.log(`xxxx :`, `"${transaction.state.doc.sliceString(editTextEndNode.from, editTextEndNode.to)}"`);
            }
            return {alterFlow: 'continue-traversal'};
        }
        // console.log(`---- Found edit text end:`, `"${transaction.state.doc.sliceString(editTextEndNode.from, editTextEndNode.to)}"`);
        nextNode = editTextEndNode.node.nextSibling;
    }
    
    // Check for "("
    const settingsUrlStartNode = nextNode;
    // Allows for quote_quote inbetween
    if(!settingsUrlStartNode || !settingsUrlStartNode.name.includes('formatting_formatting-link-string') && !settingsUrlStartNode.name.includes('string_url')) {
        return {alterFlow: 'continue-traversal'};
    }
    // console.log(`---- Found settings URL start:`, `"${transaction.state.doc.sliceString(settingsUrlStartNode.from, settingsUrlStartNode.to)}"`);

    // Check for url and settings section
    const settingsUrlPathNode = settingsUrlStartNode.node.nextSibling;
    if(!settingsUrlPathNode || !settingsUrlPathNode.name.includes('string_url')) {
        // console.log(`ERROR! settingsUrlPathNode`, settingsUrlPathNode);
        if(settingsUrlPathNode) {
            // console.log(`xxxx :`, `"${transaction.state.doc.sliceString(settingsUrlPathNode.from, settingsUrlPathNode.to)}"`);
        }
        return {alterFlow: 'continue-traversal'};
    }
    // console.log(`---- Found settings URL path:`, `"${transaction.state.doc.sliceString(settingsUrlPathNode.from, settingsUrlPathNode.to)}"`);

    // Check for ")"
    const settingsUrlEndNode = settingsUrlPathNode.node.nextSibling;
    // Allows for quote_quote inbetween
    if(!settingsUrlEndNode || (!settingsUrlEndNode.name.includes('formatting_formatting-link-string') && !settingsUrlEndNode.name.includes('string_url'))) {
        // console.log(`ERROR! settingsUrlEndNode`, settingsUrlEndNode);
        if(settingsUrlEndNode) {
            // console.log(`xxxx :`, `"${transaction.state.doc.sliceString(settingsUrlEndNode.from, settingsUrlEndNode.to)}"`);
        }
        return {alterFlow: 'continue-traversal'};
    }
    // console.log(`---- Found settings URL end:`, `"${transaction.state.doc.sliceString(settingsUrlEndNode.from, settingsUrlEndNode.to)}"`);
    
    // It's definitely a markdown embed, let's now focus on the urlText to check it's an Ink embed.
    const previewPartialFilepath = transaction.state.doc.sliceString(previewFilepathNode.from+1, previewFilepathNode.to-1); // +&- to remove <> brackets
    const urlAndSettings = transaction.state.doc.sliceString(settingsUrlPathNode.from, settingsUrlPathNode.to);
    // Require query param to include type=InkDrawing (host agnostic)
    if (!urlAndSettings.includes('type=inkDrawing')) {
        return {alterFlow: 'continue-traversal'};
    }
    
    // Prepare the data needed for decoration
    const startOfReplacement = previewLinkStartNode.from;
    const endOfReplacement = settingsUrlEndNode.to;

    const {embedSettings} = parseSettingsFromUrl(urlAndSettings);

    // Log the complete detected embed structure
    // console.log(`---- Successfully detected complete embed structure:`);
    // console.log(`---- Preview URL:`, previewPartialFilepath);
    // console.log(`---- Edit Url:`, urlAndSettings);
    // console.log(`---- Settings:`, embedSettings);
    // console.log(`---- Full replacement range:`, transaction.state.doc.sliceString(startOfReplacement, endOfReplacement));

    // If altText exists, then it is the transcription
    // if(altTextNode) {
    //     embedSettings.transcription = transaction.state.doc.sliceString(altTextNode.from, altTextNode.to);
    // }

    const embeddedFile = plugin.app.metadataCache.getFirstLinkpathDest(normalizePath(previewPartialFilepath), mdFile.path)

    return {
        embedLinkInfo: {
            startPosition: startOfReplacement,
            endPosition: endOfReplacement,
            embeddedFile: embeddedFile,
            embedSettings: embedSettings,
            partialEmbedFilepath: previewPartialFilepath,
        },
    }

}




