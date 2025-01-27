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
import { editorLivePreviewField, MarkdownView } from 'obsidian';
import * as React from "react";
import { createRoot } from "react-dom/client";
import { getGlobals } from 'src/stores/global-store';
import DrawingEmbed from 'src/tldraw/drawing/drawing-embed';
import { debug, error } from 'src/utils/log-to-console';
import {
    Provider as JotaiProvider
} from "jotai";
import DrawingEmbedNew from 'src/tldraw/drawing/drawing-embed-new';
import { InkFileData } from 'src/utils/page-file';
import { SyntaxNodeRef } from '@lezer/common';

/////////////////////
/////////////////////

import './drawing-embed-extension.scss';

/////////////////////

const mountedDecorationIds: string[] = [];

export class DrawingEmbedWidget extends WidgetType {
    id: string;
    partialPreviewFilepath: string;
    embedSettings: any;
    // mounted = false;

    constructor(partialPreviewFilepath: string, embedSettings: {}) {
        super();
        this.id = crypto.randomUUID(); // REVIEW: Is this available everyhere? // Also, what's it for?
        this.partialPreviewFilepath = partialPreviewFilepath;
        this.embedSettings = embedSettings;
    }

    toDOM(view: EditorView): HTMLElement {
        const { plugin } = getGlobals();

        const rootEl = document.createElement('div');
        const root = createRoot(rootEl);

        mountedDecorationIds.push(this.id);

        root.render(
            <JotaiProvider>
                <DrawingEmbedNew
                    partialPreviewFilepath={this.partialPreviewFilepath}
                    embedSettings={this.embedSettings}
                    remove={() => { }}
                />
            </JotaiProvider>
        );
        return rootEl;
    }
}


// Define a StateField to monitor the state of all decorations on the page
const embedStateField = StateField.define<DecorationSet>({

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
                const {embedLinkInfo, alterFlow} = detectMarkdownEmbedLink(syntaxNodeRef, transaction);
                
                if(alterFlow === 'ignore-children') return false;
                if(alterFlow === 'continue-traversal') return true;

                
                if (embedLinkInfo) {

                    // Require a blank line before and after the embed
                    // TODO: Could put this into the detectMarkdownEmbedLink function.
                    embedLinkInfo.startPosition -= 2;
                    embedLinkInfo.endPosition += 2;

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
                                widget: new DrawingEmbedWidget(embedLinkInfo.partialFilepath, embedLinkInfo.embedSettings),
                                isBlock: true,
                            })
                        );
                    }

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
            })
            
        ];
    },
})



export function drawingEmbedExtension(): Extension {
    return embedStateField;
}

interface embedLinkInfo {
    startPosition: number,
    endPosition: number,
    partialFilepath: string,
    embedSettings: any,
}



function detectMarkdownEmbedLink(linkStartNode: SyntaxNodeRef, transaction: Transaction): {
    embedLinkInfo?: embedLinkInfo,
    alterFlow?: 'ignore-children' | 'continue-traversal'
} {

    // \n                   
    // !                    formatting_formatting-image_image_image-marker
    // [                    formatting_formatting-image_image_image-alt-text_link
    // altText              image_image-alt-text_link
    // ]                    formatting_formatting-image_image_image-alt-text_link
    // (                    formatting_formatting-link-string_string_url
    // partialFilePath      string_url
    // )                    formatting_formatting-link-string_string_url
    // \n                   


    // Check for "!"
    if (!linkStartNode || linkStartNode.name !== 'formatting_formatting-image_image_image-marker') {
        return {alterFlow: 'continue-traversal'};
    }
    
    // Ensure there's 1 full blank line before the embed (two new line characters)
    const blankLineBefore = transaction.state.doc.sliceString(linkStartNode.from - 2, linkStartNode.from);
    if(blankLineBefore !== '\n\n') {
        return {alterFlow: 'continue-traversal'};
    }
        
    // Check for "[" or "[]"
    const altTextStartNode = linkStartNode.node.nextSibling;
    if(!altTextStartNode || altTextStartNode.name !== 'formatting_formatting-image_image_image-alt-text_link') {
        return {alterFlow: 'continue-traversal'};
    }

    // Get the next node, which could be alt text or could be "("
    let nextNode = altTextStartNode.node.nextSibling;
    if(!nextNode) {
        return {alterFlow: 'continue-traversal'};
    }
    
    // Containers for alt text nodes if they exist
    let altTextNode: SyntaxNodeRef | null = null;
    let altTextEndNode: SyntaxNodeRef | null = null;

    // If the start node was "[", then the next node must be alt text
    if(altTextStartNode.to-altTextStartNode.from === 1) {
        altTextNode = nextNode;
        altTextEndNode = altTextNode.node.nextSibling;
        if(!altTextEndNode || altTextEndNode.name !== 'formatting_formatting-image_image_image-alt-text_link') {
            return {alterFlow: 'continue-traversal'};
        }
        nextNode = altTextEndNode.node.nextSibling;
    }
    
    // Check for "("
    const urlStartNode = nextNode;
    if(!urlStartNode || urlStartNode.name !== 'formatting_formatting-link-string_string_url') {
        return {alterFlow: 'continue-traversal'};
    }

    // Check for filepath section
    const urlTextNode = urlStartNode.node.nextSibling;
    if(!urlTextNode || urlTextNode.name !== 'string_url') {
        return {alterFlow: 'continue-traversal'};
    }

    // Check for ")"
    const urlEndNode = urlTextNode.node.nextSibling;
    if(!urlEndNode || urlEndNode.name !== 'formatting_formatting-link-string_string_url') {
        return {alterFlow: 'continue-traversal'};
    }

    // Ensure there's 1 full blank line after the embed (two new line characters)
    const blankLineAfter = transaction.state.doc.sliceString(urlEndNode.to, urlEndNode.to + 2);
    if(blankLineAfter !== '\n\n') {
        return {alterFlow: 'continue-traversal'};
    }
    
    // It's definitely a markdown embed, let's not focus on the urlText to check it's an Ink embed.
    const urlText = transaction.state.doc.sliceString(urlTextNode.from, urlTextNode.to);
    
    // Check it's an InkDrawing embed
    if(!urlText.includes('| InkDrawing v')) {   // TODO: Put this in a constant
        return {alterFlow: 'continue-traversal'};
    }
    
    // Prepare the data needed for decoration
    const startOfReplacement = linkStartNode.from;
    const endOfReplacement = urlEndNode.to;
    const {partialFilepath, embedSettings} = parseDrawingUrlText( urlText );

    // If altText exists, then it is the transcription
    // if(altTextNode) {
    //     embedSettings.transcription = transaction.state.doc.sliceString(altTextNode.from, altTextNode.to);
    // }

    return {
        embedLinkInfo: {
            startPosition: startOfReplacement,
            endPosition: endOfReplacement,
            partialFilepath,
            embedSettings,
        },
    }

}

export interface EmbedSettings {
    version: number,
    embedDisplay: {
        width: number,
        aspectRatio: string,
    },
    viewBox: {
        x: number,
        y: number,
        width: number,
        height: number,
        // rotation: number,
    },
    transcription?: string,
}

function parseDrawingUrlText(urlText: string): {
    partialFilepath: string,
    embedSettings: EmbedSettings,
} {
    let partialFilepath: string | undefined;
    const embedSettings: EmbedSettings = {
        version: 0,
        embedDisplay: {
            width: 500,
            aspectRatio: '16/9',
        },
        viewBox: {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        }
    }
    try {
        const urlTextParts = urlText.split('|');
        partialFilepath = urlTextParts.shift()?.trim();
        if(!partialFilepath) {
            error(`There's an error in the filepath of the embed with this text: '${urlText}'`);
            throw new Error();
        }
        
        const format = urlTextParts.shift()?.trim();
        const displaySettings = urlTextParts.shift()?.trim().split(',');
        const viewSettings = urlTextParts.shift()?.trim().split(',');

        if(!format || !displaySettings || !viewSettings) {
            error(`There's an error in the settings after the filepath of the embed with this text: '${urlText}'`);
            throw new Error();
        }

        embedSettings.version =  Number.parseInt(format.split('v').pop() || '0');
        embedSettings.embedDisplay.width = Number.parseInt(displaySettings[0] || '500');
        embedSettings.embedDisplay.aspectRatio = displaySettings[1] || '16/9';
        embedSettings.viewBox.x = Number.parseInt(viewSettings[0] || '0');
        embedSettings.viewBox.y = Number.parseInt(viewSettings[1] || '0');
        embedSettings.viewBox.width = Number.parseInt(viewSettings[2] || '1920');
        embedSettings.viewBox.height = Number.parseInt(viewSettings[3] || '1080');

        debug(['embedSettings', embedSettings]);
        
    } catch(e) {
        throw new Error(`Error parsing Drawing embed, see above to problem solve. ${e}`);
    }

    return {
        partialFilepath,
        embedSettings,
    }
}

// function detectInternalEmbedLink(syntaxNodeRef: SyntaxNodeRef, transaction: Transaction): {
//     startPosition: number,
//     endPosition: number,
//     partialFilepath: string,
//     embedSettings: any,
// } | null {
    
//     // NOTE: This is the order expected in the syntax tree

//     // formatting-embed_formatting-link_formatting-link-start --> ![[
//     // hmd-embed_hmd-internal-link_link-has-alias --> Filename
//     // hmd-embed_hmd-internal-link_link-alias-pipe --> |
//     // hmd-embed_hmd-internal-link_link-alias --> Embed Type
//     // hmd-embed_hmd-internal-link_link-alias-pipe --> |
//     // hmd-embed_hmd-internal-link_link-alias --> Settings
//     // formatting-link_formatting-link-end --> ]]


//     if (syntaxNodeRef.name === 'formatting-embed_formatting-link_formatting-link-start') {
//         // debug(['Image link node', node.type.name]);

//         const filepathNode = syntaxNodeRef.node.nextSibling;
//         if (filepathNode && filepathNode.name === 'hmd-embed_hmd-internal-link_link-has-alias') {
//             // debug(['filepathNode', filepathNode.name]);

//             let firstPipeNode = filepathNode.nextSibling;
//             if (firstPipeNode && firstPipeNode.name === 'hmd-embed_hmd-internal-link_link-alias-pipe') {
//                 // debug(['firstPipeNode', firstPipeNode.name]);

//                 // Check if the link's Display Text is used for the embed type name
//                 const embedTypeAndVersionNode = firstPipeNode.node.nextSibling;
//                 if (embedTypeAndVersionNode) {
//                     // debug(['embedTypeAndVersionNode', embedTypeAndVersionNode.name]);

//                     const embedTypeStr = transaction.state.doc.sliceString(embedTypeAndVersionNode.from, embedTypeAndVersionNode.to);
//                     // Not trimmed because I want to keep as performent as possible.
//                     // So spaces will break it.
//                     if (embedTypeStr === 'InkDrawing') {

//                         const secondPipeNode = embedTypeAndVersionNode.node.nextSibling;
//                         if (secondPipeNode && secondPipeNode.name === 'hmd-embed_hmd-internal-link_link-alias-pipe') {
//                             // debug(['secondPipeNode', secondPipeNode.name]);

//                             const settingsNode = secondPipeNode.node.nextSibling;
//                             if (settingsNode) {
//                                 // debug(['settingsNode', settingsNode.name]);

//                                 const settingsStr = transaction.state.doc.sliceString(settingsNode.from, settingsNode.to);

//                                 const endOfLinkNode = settingsNode.node.nextSibling;
//                                 if (endOfLinkNode && endOfLinkNode.name === 'formatting-link_formatting-link-end') {
//                                     // debug(['endOfLinkNode', endOfLinkNode.name]);
//                                     // The link is properly closed, now we can add the decoration

//                                     const startOfLinkBrackets = filepathNode.from - 3;
//                                     const endOfLinkBrackets = endOfLinkNode.to;
//                                     const partialFilepath = transaction.state.doc.sliceString(filepathNode.from, filepathNode.to);
//                                     const displayName = JSON.parse(settingsStr);

//                                     return {
//                                         startPosition: startOfLinkBrackets,
//                                         endPosition: endOfLinkBrackets,
//                                         partialFilepath,
//                                         embedSettings: displayName,
//                                     }

//                                 }
//                             }
//                         }
//                     }
//                 }
//             }

//         }
//     }

//     return null;
// }


