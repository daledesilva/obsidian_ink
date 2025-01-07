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
import { MarkdownView } from 'obsidian';
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

export class EmptyWidget extends WidgetType {
    toDOM(view: EditorView): HTMLElement {
        const el = document.createElement('span');
        el.textContent = '';
        return el;
    }
}

export class DrawingEmbedWidget extends WidgetType {
    filepath: string;
    embedSettings: any;

    constructor(filepath: string, embedSettings: {}) {
        super();
        this.filepath = filepath;
        this.embedSettings = embedSettings;
    }

    toDOM(view: EditorView): HTMLElement {
        const { plugin } = getGlobals();

        const rootEl = document.createElement('div');
        const root = createRoot(rootEl);

        root.render(
            <JotaiProvider>
                <DrawingEmbedNew
                    filepath={this.filepath}
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

    update(oldState: DecorationSet, transaction: Transaction): DecorationSet {
        const { plugin } = getGlobals();

        // TODO: This isn't correct.
        const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const activeEditor = activeView?.editor;
        if (!activeEditor) return oldState;

        if (activeView.currentMode.sourceMode) {
            return Decoration.none;
        }

        const builder = new RangeSetBuilder<Decoration>();

        syntaxTree(transaction.state).iterate({
            enter(syntaxNodeRef) {
                const {embedLinkInfo, alterFlow} = detectMarkdownEmbedLink(syntaxNodeRef, transaction);
                
                if(alterFlow === 'ignore-children') return false;
                if(alterFlow === 'continue-traversal') return true;

                if (embedLinkInfo) {
                    builder.add(
                        embedLinkInfo.startPosition,
                        embedLinkInfo.endPosition,
                        Decoration.replace({
                            widget: new DrawingEmbedWidget(embedLinkInfo.partialFilepath, embedLinkInfo.embedSettings),
                        })
                    );

                    // Add Ink embed just above
                    // builder.add(
                    //     embedLinkInfo.startPosition-1,
                    //     embedLinkInfo.startPosition-1,
                    //     Decoration.widget({
                    //         widget: new DrawingEmbedWidget(embedLinkInfo.partialFilepath, embedLinkInfo.embedSettings),
                    //     })
                    // );
                    // // Add empty widget to actual line (This removes the code);
                    // builder.add(
                    //     embedLinkInfo.startPosition,
                    //     embedLinkInfo.endPosition,
                    //     Decoration.replace({
                    //         widget: new EmptyWidget(),
                    //     })
                    // );
                }

            }
        })

        return builder.finish();
    },

    // Tell the editor to use these decorations (ie. provide them from this statefield)
    provide(stateField: StateField<DecorationSet>): Extension {
        return EditorView.decorations.from(stateField);
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

    // !                    formatting_formatting-image_image_image-marker
    // [                    formatting_formatting-image_image_image-alt-text_link
    // altText              image_image-alt-text_link
    // ]                    formatting_formatting-image_image_image-alt-text_link
    // (                    formatting_formatting-link-string_string_url
    // partialFilePath      string_url
    // )                    formatting_formatting-link-string_string_url

    // Check for "!"
    if (!linkStartNode || linkStartNode.name !== 'formatting_formatting-image_image_image-marker') {
        return {alterFlow: 'continue-traversal'};
    }
        
    // Check for "["
    const altTextStartNode = linkStartNode.node.nextSibling;
    if(!altTextStartNode || altTextStartNode.name !== 'formatting_formatting-image_image_image-alt-text_link') {
        return {alterFlow: 'continue-traversal'};
    }

    // Check for potential "InkDrawing"
    const altTextNode = altTextStartNode.node.nextSibling;
    if(!altTextNode || altTextNode.name !== 'image_image-alt-text_link') {
        return {alterFlow: 'continue-traversal'};
    }

    // Check for "]"
    const altTextEndNode = altTextNode.node.nextSibling;
    if(!altTextEndNode || altTextEndNode.name !== 'formatting_formatting-image_image_image-alt-text_link') {
        return {alterFlow: 'continue-traversal'};
    }

    // Check for "("
    const urlStartNode = altTextEndNode.node.nextSibling;
    if(!urlStartNode || urlStartNode.name !== 'formatting_formatting-link-string_string_url') {
        return {alterFlow: 'continue-traversal'};
    }

    // Check for partialFilepath
    const urlTextNode = urlStartNode.node.nextSibling;
    if(!urlTextNode || urlTextNode.name !== 'string_url') {
        return {alterFlow: 'continue-traversal'};
    }

    // Check for ")"
    const urlEndNode = urlTextNode.node.nextSibling;
    if(!urlEndNode || urlEndNode.name !== 'formatting_formatting-link-string_string_url') {
        return {alterFlow: 'continue-traversal'};
    }
    
    // It made it all the way, so it's a valid markdown embed
    
    const altText = transaction.state.doc.sliceString(altTextNode.from, altTextNode.to).trim();

    // It's not an InkDrawing, so ignore these nodes without decorating
    if(altText !== 'InkDrawing') {
        return {alterFlow: 'continue-traversal'};
    }
    
    // It's an InkDrawing, so prepare the data needed for decoration
    // NOTE: -1 enables it to superced the auto-hiding of markdown line caused by the default Obsidian decoration
    const startOfReplacement = linkStartNode.from-1;
    const endOfReplacement = urlEndNode.to;
    const {partialFilepath, embedSettings} = parseDrawingUrlText( transaction.state.doc.sliceString(urlTextNode.from, urlTextNode.to) );

    return {
        embedLinkInfo: {
            startPosition: startOfReplacement,
            endPosition: endOfReplacement,
            partialFilepath,
            embedSettings,
        },
    }

}

interface embedSettings {
    version: number,
    embedDisplay: {
        width: number,
        aspectRatio: string,
    },
    canvasView: {
        x: number,
        y: number,
        width: number,
        height: number,
        // rotation: number,
    }
}

function parseDrawingUrlText(urlText: string): {
    partialFilepath: string,
    embedSettings: any,
} {
    let partialFilepath: string | undefined;
    const embedSettings: embedSettings = {
        version: 0,
        embedDisplay: {
            width: 500,
            aspectRatio: '16/9',
        },
        canvasView: {
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
        
        const versioning = urlTextParts.shift()?.trim();
        const displaySettings = urlTextParts.shift()?.trim().split(',');
        const viewSettings = urlTextParts.shift()?.trim().split(',');

        if(!versioning || !displaySettings || !viewSettings) {
            error(`There's an error in the settings after the filepath of the embed with this text: '${urlText}'`);
            throw new Error();
        }

        embedSettings.version =  Number.parseInt(versioning?.substring(1) || '1');
        embedSettings.embedDisplay.width = Number.parseInt(displaySettings[0] || '500');
        embedSettings.embedDisplay.aspectRatio = displaySettings[1] || '16/9';
        embedSettings.canvasView.x = Number.parseInt(viewSettings[0] || '0');
        embedSettings.canvasView.y = Number.parseInt(viewSettings[1] || '0');
        embedSettings.canvasView.width = Number.parseInt(viewSettings[2] || '1920');
        embedSettings.canvasView.height = Number.parseInt(viewSettings[3] || '1080');

        
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


