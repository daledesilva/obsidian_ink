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
import * as React from "react";
import { createRoot } from "react-dom/client";
import { getGlobals } from 'src/stores/global-store';
import DrawingEmbed from 'src/tldraw_v1/drawing/drawing-embed-editor/drawing-embed';
import { debug, error } from 'src/utils/log-to-console';
import {
    Provider as JotaiProvider
} from "jotai";
import DrawingEmbedNew from 'src/tldraw_v2/drawing/drawing-embed-editor/drawing-embed';
import { InkFileData } from 'src/utils/page-file';
import { SyntaxNodeRef } from '@lezer/common';
import { DEFAULT_EMBED_SETTINGS, EmbedSettings } from 'src/types/embed-settings';

/////////////////////
/////////////////////

import './drawing-embed-extension.scss';

/////////////////////

const mountedDecorationIds: string[] = [];

export class DrawingEmbedWidgetNew extends WidgetType {
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
                <DrawingEmbedNew
                    mdFile={this.mdFile}
                    embeddedFile={this.embeddedFile}
                    embedSettings={this.embedSettings}
                    remove={() => { }}
                    partialEmbedFilepath={this.partialEmbedFilepath}
                />
            </JotaiProvider>
        );
        return rootEl;
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
                            widget: new DrawingEmbedWidgetNew(mdFile, embedLinkInfo.embeddedFile, embedLinkInfo.embedSettings, embedLinkInfo.partialEmbedFilepath),
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



export function drawingEmbedExtensionNew(): Extension {
    console.log(`---- drawingEmbedExtensionNew`);
    return embedStateFieldNew;
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
        console.log(`---- Found edit text:`, `"${transaction.state.doc.sliceString(editTextNode.from, editTextNode.to)}"`);
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



function parseSettingsFromUrl(urlAndSettings: string): { infoUrl: string, embedSettings: EmbedSettings } {
    
    let infoUrl = urlAndSettings;
    let embedSettings: EmbedSettings = JSON.parse(JSON.stringify(DEFAULT_EMBED_SETTINGS));

    const questionMarkIndex = urlAndSettings.indexOf('?');
    if (questionMarkIndex !== -1) {
        infoUrl = urlAndSettings.substring(0, questionMarkIndex);
        const settingsString = urlAndSettings.substring(questionMarkIndex + 1);
        const settingsObj = settingsString.split('&').reduce((acc, pair) => {
            const [key, value] = pair.split('=');
            if (key) acc[key] = value;
            return acc;
        }, {} as Record<string, string>);

        // Populate embedSettings with values from settingsObj where present
        if (settingsObj.version) {
            embedSettings.version = parseInt(settingsObj.version, 10);
        }
        if (settingsObj.width) {
            embedSettings.embedDisplay.width = parseInt(settingsObj.width, 10);
        }
        if (settingsObj.aspectRatio) {
            embedSettings.embedDisplay.aspectRatio = Number.parseFloat(settingsObj.aspectRatio);
        }
        if (settingsObj.viewBoxX) {
            embedSettings.viewBox.x = parseInt(settingsObj.viewBoxX, 10);
        }
        if (settingsObj.viewBoxY) {
            embedSettings.viewBox.y = parseInt(settingsObj.viewBoxY, 10);
        }
        if (settingsObj.viewBoxWidth) {
            embedSettings.viewBox.width = parseInt(settingsObj.viewBoxWidth, 10);
        }
        if (settingsObj.viewBoxHeight) {
            embedSettings.viewBox.height = parseInt(settingsObj.viewBoxHeight, 10);
        }
    }
    return { infoUrl, embedSettings };
}
