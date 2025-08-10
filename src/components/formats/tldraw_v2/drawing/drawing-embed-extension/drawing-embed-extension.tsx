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
import { DrawingEmbed_v2 } from 'src/components/formats/tldraw_v2/drawing/drawing-embed/drawing-embed';
import { InkFileData } from 'src/logic/utils/page-file';
import { SyntaxNodeRef } from '@lezer/common';
import { DEFAULT_EMBED_SETTINGS, EmbedSettings } from 'src/types/embed-settings';
import './drawing-embed-extension.scss';
import { buildFileStr } from 'src/logic/utils/buildFileStr';

/////////////////////
/////////////////////

const mountedDecorationIds: string[] = [];

export class DrawingEmbedWidget_v2 extends WidgetType {
    id: string;
    mdFile: TFile;
    embeddedFile: TFile | null;
    embedSettings: any;
    partialEmbedFilepath: string;
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
        const root = createRoot(rootEl);

        mountedDecorationIds.push(this.id);

        root.render(
            <JotaiProvider>
                <DrawingEmbed_v2
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

	// Helper functions
	///////////////////

	save = async (pageData: InkFileData) => {
		if(!this.embeddedFile) return;
		const plugin = getGlobals().plugin;
		const pageDataStr = buildFileStr(pageData);
		await plugin.app.vault.modify(this.embeddedFile, pageDataStr);
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
        const decorations = view.state.field(embedStateFieldNew, false);
        if (!decorations) return;
        const it = decorations.iter();
        while (it.value) {
            const widget = it.value.spec?.widget as DrawingEmbedWidget_v2 | undefined;
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
        const decorations = view.state.field(embedStateFieldNew, false);
        if (!decorations) return;
        const it = decorations.iter();
        while (it.value) {
            const widget = it.value.spec?.widget as DrawingEmbedWidget_v2 | undefined;
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
const embedStateFieldNew = StateField.define<DecorationSet>({

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

                const {embedLinkInfo, alterFlow} = detectMarkdownEmbedLinkNew(mdFile, syntaxNodeRef, transaction);
                
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
                            widget: new DrawingEmbedWidget_v2(mdFile, embedLinkInfo.embeddedFile, embedLinkInfo.embedSettings, embedLinkInfo.partialEmbedFilepath),
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
                const decorations = view.state.field(embedStateFieldNew, false);
                return decorations || Decoration.none;
            })
            
        ];
    },
})



export function drawingEmbedExtension_v2(): Extension {
    console.log(`---- drawingEmbedExtension_v2`);
    return embedStateFieldNew;
}

export function registerDrawingEmbed_v2(plugin: InkPlugin) {
    plugin.registerEditorExtension([
        drawingEmbedExtension_v2(),
    ]);
}

interface embedLinkInfoNew {
    startPosition: number,
    endPosition: number,
    embeddedFile: TFile | null,
    embedSettings: any,
    partialEmbedFilepath: string,
}



function detectMarkdownEmbedLinkNew(mdFile: TFile, previewLinkStartNode: SyntaxNodeRef, transaction: Transaction): {
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

    console.log('previewLinkStartNode', previewLinkStartNode.name);
    // Check for "!"
    if (!previewLinkStartNode || !previewLinkStartNode.name.includes('formatting_formatting-image_image_image-marker')) {
        return {alterFlow: 'continue-traversal'};
    }
    console.log(`---- Found "!" marker:`, `"${transaction.state.doc.sliceString(previewLinkStartNode.from, previewLinkStartNode.to)}"`);
    
    
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
    console.log(`---- Found transcript start:`, `"${transaction.state.doc.sliceString(transcriptStartNode.from, transcriptStartNode.to)}"`);

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
        console.log(`---- Found transcript text:`, `"${transaction.state.doc.sliceString(transcriptTextNode.from, transcriptTextNode.to)}"`);
        transcriptEndNode = transcriptTextNode.node.nextSibling;
        if(!transcriptEndNode || !transcriptEndNode.name.includes('formatting_formatting-image_image_image-alt-text_link')) {
            return {alterFlow: 'continue-traversal'};
        }
        console.log(`---- Found transcript end:`, `"${transaction.state.doc.sliceString(transcriptEndNode.from, transcriptEndNode.to)}"`);
        nextNode = transcriptEndNode.node.nextSibling;
    }
    
    // Check for "("
    const previewUrlStartNode = nextNode;
    // Allows for quote_quote inbetween
    if(!previewUrlStartNode || (!previewUrlStartNode.name.includes('formatting_formatting-link-string') && !previewUrlStartNode.name.includes('string_url'))) {
        return {alterFlow: 'continue-traversal'};
    }
    console.log(`---- Found preview URL start:`, `"${transaction.state.doc.sliceString(previewUrlStartNode.from, previewUrlStartNode.to)}"`);

    // Check for filepath section
    const previewFilepathNode = previewUrlStartNode.node.nextSibling;
    if(!previewFilepathNode || !previewFilepathNode.name.includes('string_url')) {
        return {alterFlow: 'continue-traversal'};
    }
    console.log(`---- Found preview URL path:`, `"${transaction.state.doc.sliceString(previewFilepathNode.from, previewFilepathNode.to)}"`);

    // Check for ")"
    const previewUrlEndNode = previewFilepathNode.node.nextSibling;
    // Allows for quote_quote inbetween
    if(!previewUrlEndNode || (!previewUrlEndNode.name.includes('formatting_formatting-link-string') && !previewUrlEndNode.name.includes('string_url'))) {
        return {alterFlow: 'continue-traversal'};
    }
    console.log(`---- Found preview URL end:`, `"${transaction.state.doc.sliceString(previewUrlEndNode.from, previewUrlEndNode.to)}"`);

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
        console.log(`ERROR! editTextStartNode`, editTextStartNode);
        if(editTextStartNode) {
            console.log(`xxxx :`, `"${transaction.state.doc.sliceString(editTextStartNode.from, editTextStartNode.to)}"`);
        }
        return {alterFlow: 'continue-traversal'};
    }
    console.log(`---- Found edit text start:`, `"${transaction.state.doc.sliceString(editTextStartNode.from, editTextStartNode.to)}"`);

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
        console.log(`---- Found edit text:`, `"${editText}"`);
        // Disambiguate: Require correct drawing label
        if (editText.trim() !== 'Edit Drawing') {
            return {alterFlow: 'continue-traversal'};
        }
        editTextEndNode = editTextNode.node.nextSibling;
        if(!editTextEndNode || !editTextEndNode.name.includes('formatting_formatting-link_link')) {
            if(editTextEndNode) {
                console.log(`xxxx :`, `"${transaction.state.doc.sliceString(editTextEndNode.from, editTextEndNode.to)}"`);
            }
            return {alterFlow: 'continue-traversal'};
        }
        console.log(`---- Found edit text end:`, `"${transaction.state.doc.sliceString(editTextEndNode.from, editTextEndNode.to)}"`);
        nextNode = editTextEndNode.node.nextSibling;
    }
    
    // Check for "("
    const settingsUrlStartNode = nextNode;
    // Allows for quote_quote inbetween
    if(!settingsUrlStartNode || !settingsUrlStartNode.name.includes('formatting_formatting-link-string') && !settingsUrlStartNode.name.includes('string_url')) {
        return {alterFlow: 'continue-traversal'};
    }
    console.log(`---- Found settings URL start:`, `"${transaction.state.doc.sliceString(settingsUrlStartNode.from, settingsUrlStartNode.to)}"`);

    // Check for url and settings section
    const settingsUrlPathNode = settingsUrlStartNode.node.nextSibling;
    if(!settingsUrlPathNode || !settingsUrlPathNode.name.includes('string_url')) {
        console.log(`ERROR! settingsUrlPathNode`, settingsUrlPathNode);
        if(settingsUrlPathNode) {
            console.log(`xxxx :`, `"${transaction.state.doc.sliceString(settingsUrlPathNode.from, settingsUrlPathNode.to)}"`);
        }
        return {alterFlow: 'continue-traversal'};
    }
    console.log(`---- Found settings URL path:`, `"${transaction.state.doc.sliceString(settingsUrlPathNode.from, settingsUrlPathNode.to)}"`);

    // Check for ")"
    const settingsUrlEndNode = settingsUrlPathNode.node.nextSibling;
    // Allows for quote_quote inbetween
    if(!settingsUrlEndNode || (!settingsUrlEndNode.name.includes('formatting_formatting-link-string') && !settingsUrlEndNode.name.includes('string_url'))) {
        console.log(`ERROR! settingsUrlEndNode`, settingsUrlEndNode);
        if(settingsUrlEndNode) {
            console.log(`xxxx :`, `"${transaction.state.doc.sliceString(settingsUrlEndNode.from, settingsUrlEndNode.to)}"`);
        }
        return {alterFlow: 'continue-traversal'};
    }
    console.log(`---- Found settings URL end:`, `"${transaction.state.doc.sliceString(settingsUrlEndNode.from, settingsUrlEndNode.to)}"`);
    
    // It's definitely a markdown embed, let's now focus on the urlText to check it's an Ink embed.
    const previewPartialFilepath = transaction.state.doc.sliceString(previewFilepathNode.from+1, previewFilepathNode.to-1); // +&- to remove <> brackets
    const urlAndSettings = transaction.state.doc.sliceString(settingsUrlPathNode.from, settingsUrlPathNode.to);
    // Require query param to include type=InkDrawing (host agnostic)
    if (!urlAndSettings.includes('type=InkDrawing')) {
        return {alterFlow: 'continue-traversal'};
    }
    
    // Prepare the data needed for decoration
    const startOfReplacement = previewLinkStartNode.from;
    const endOfReplacement = settingsUrlEndNode.to;

    const {embedSettings} = parseSettingsFromUrl(urlAndSettings);

    // Log the complete detected embed structure
    console.log(`---- Successfully detected complete embed structure:`);
    console.log(`---- Preview URL:`, previewPartialFilepath);
    console.log(`---- Edit Url:`, urlAndSettings);
    console.log(`---- Settings:`, embedSettings);
    console.log(`---- Full replacement range:`, transaction.state.doc.sliceString(startOfReplacement, endOfReplacement));

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



function parseSettingsFromUrl(urlAndEmbedSettings: string): { infoUrl: string, embedSettings: EmbedSettings } {
    
    let infoUrl = urlAndEmbedSettings;
    let embedSettings: EmbedSettings = JSON.parse(JSON.stringify(DEFAULT_EMBED_SETTINGS));

    const questionMarkIndex = urlAndEmbedSettings.indexOf('?');
    if (questionMarkIndex !== -1) {
        infoUrl = urlAndEmbedSettings.substring(0, questionMarkIndex);
        const embedSettingsStr = urlAndEmbedSettings.substring(questionMarkIndex + 1);
        
        // Parse URL parameters into a flat object first
        const urlParams = embedSettingsStr.split('&').reduce((acc, pair) => {
            const [key, value] = pair.split('=');
            if (key && value) {
                acc[key] = decodeURIComponent(value);
            }
            return acc;
        }, {} as Record<string, string>);

        // Apply parsed values to embedSettings with proper type conversion
        if (urlParams.version) {
            embedSettings.version = parseInt(urlParams.version, 10);
        }
        if (urlParams.width) {
            embedSettings.embedDisplay.width = parseFloat(urlParams.width);
        }
        if (urlParams.aspectRatio) {
            embedSettings.embedDisplay.aspectRatio = parseFloat(urlParams.aspectRatio);
        }
        if (urlParams.viewBoxX) {
            embedSettings.viewBox.x = parseFloat(urlParams.viewBoxX);
        }
        if (urlParams.viewBoxY) {
            embedSettings.viewBox.y = parseFloat(urlParams.viewBoxY);
        }
        if (urlParams.viewBoxWidth) {
            embedSettings.viewBox.width = parseFloat(urlParams.viewBoxWidth);
        }
        if (urlParams.viewBoxHeight) {
            embedSettings.viewBox.height = parseFloat(urlParams.viewBoxHeight);
        }
    }
    return { infoUrl, embedSettings };
}
