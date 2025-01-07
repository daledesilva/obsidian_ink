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
import { debug } from 'src/utils/log-to-console';
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
        const rootEl = document.createElement('div');
        const root = createRoot(rootEl);

        const { plugin } = getGlobals();

        debug(['DrawingEmbedWidget RUNNING!']);

        root.render(
            <JotaiProvider>
                <DrawingEmbedNew
                    filepath={this.filepath}
                    embedSettings={this.embedSettings}
                    remove={() => { }}
                />
            </JotaiProvider>
            // <p>
            //     {this.filepath}<br/>
            //     {JSON.stringify(this.embedSettings, null, 2)}
            // </p>
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



        // TODO: This doesn't work - need to get editor from plugin
        const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const activeEditor = activeView?.editor;
        if (!activeEditor) return oldState;

        if (activeView.currentMode.sourceMode) {
            return Decoration.none;
        }

        // NOTE: This is the order expected in the syntax tree

        // formatting-embed_formatting-link_formatting-link-start --> ![[
        // hmd-embed_hmd-internal-link_link-has-alias --> Filename
        // hmd-embed_hmd-internal-link_link-alias-pipe --> |
        // hmd-embed_hmd-internal-link_link-alias --> Embed Type
        // hmd-embed_hmd-internal-link_link-alias-pipe --> |
        // hmd-embed_hmd-internal-link_link-alias --> Settings
        // formatting-link_formatting-link-end --> ]]

        const builder = new RangeSetBuilder<Decoration>();

        syntaxTree(transaction.state).iterate({
            enter(syntaxNodeRef) {
                // const embedLinkInfo = detectInternalEmbedLink(syntaxNodeRef, transaction);
                // const embedLinkInfo = detectEncapsulatedInternalEmbedLink(syntaxNodeRef, transaction);
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










function detectInternalEmbedLink(syntaxNodeRef: SyntaxNodeRef, transaction: Transaction): {
    startPosition: number,
    endPosition: number,
    partialFilepath: string,
    embedSettings: any,
} | null {
    // ![[
    if (syntaxNodeRef.name === 'formatting-embed_formatting-link_formatting-link-start') {
        // debug(['Image link node', node.type.name]);

        const filepathNode = syntaxNodeRef.node.nextSibling;
        if (filepathNode && filepathNode.name === 'hmd-embed_hmd-internal-link_link-has-alias') {
            // debug(['filepathNode', filepathNode.name]);

            let firstPipeNode = filepathNode.nextSibling;
            if (firstPipeNode && firstPipeNode.name === 'hmd-embed_hmd-internal-link_link-alias-pipe') {
                // debug(['firstPipeNode', firstPipeNode.name]);

                // Check if the link's Display Text is used for the embed type name
                const embedTypeAndVersionNode = firstPipeNode.node.nextSibling;
                if (embedTypeAndVersionNode) {
                    // debug(['embedTypeAndVersionNode', embedTypeAndVersionNode.name]);

                    const embedTypeStr = transaction.state.doc.sliceString(embedTypeAndVersionNode.from, embedTypeAndVersionNode.to);
                    // Not trimmed because I want to keep as performent as possible.
                    // So spaces will break it.
                    if (embedTypeStr === 'InkDrawing') {

                        const secondPipeNode = embedTypeAndVersionNode.node.nextSibling;
                        if (secondPipeNode && secondPipeNode.name === 'hmd-embed_hmd-internal-link_link-alias-pipe') {
                            // debug(['secondPipeNode', secondPipeNode.name]);

                            const settingsNode = secondPipeNode.node.nextSibling;
                            if (settingsNode) {
                                // debug(['settingsNode', settingsNode.name]);

                                const settingsStr = transaction.state.doc.sliceString(settingsNode.from, settingsNode.to);

                                const endOfLinkNode = settingsNode.node.nextSibling;
                                if (endOfLinkNode && endOfLinkNode.name === 'formatting-link_formatting-link-end') {
                                    // debug(['endOfLinkNode', endOfLinkNode.name]);
                                    // The link is properly closed, now we can add the decoration

                                    const startOfLinkBrackets = filepathNode.from - 3;
                                    const endOfLinkBrackets = endOfLinkNode.to;
                                    const partialFilepath = transaction.state.doc.sliceString(filepathNode.from, filepathNode.to);
                                    const displayName = JSON.parse(settingsStr);

                                    return {
                                        startPosition: startOfLinkBrackets,
                                        endPosition: endOfLinkBrackets,
                                        partialFilepath,
                                        embedSettings: displayName,
                                    }

                                }
                            }
                        }
                    }
                }
            }

        }
    }

    return null;
}




// NOTE: Actually, this approach doesn't work because codemirror only returns the markdown. You can't parse the result.
/**
 * This is designed to run after Obsidian's image decorations run.
 * Instead of detecting the markdown nodes, it looks for the html image tag nodes.
 * @param syntaxNodeRef
 * @param transaction 
 * @returns 
 */
function detectProcessedImageTag(syntaxNodeRef: SyntaxNodeRef, transaction: Transaction): {
    startPosition: number,
    endPosition: number,
    partialFilepath: string,
    embedSettings: any,
} | null {
    debug(['Node name:', syntaxNodeRef.type.name]);

    return null;
}




/**
 * This is designed to run after Obsidian's image decorations run.
 * Instead of detecting the markdown nodes, it looks for the html image tag nodes.
 * @param syntaxNodeRef
 * @param transaction 
 * @returns 
 */
function detectEncapsulatedInternalEmbedLink(syntaxNodeRef: SyntaxNodeRef, transaction: Transaction): {
    startPosition: number,
    endPosition: number,
    partialFilepath: string,
    embedSettings: any,
} | null {
    debug(['Node name:', syntaxNodeRef.name]);

    // If not chance of an Ink section start, exit and let syntax tree continue iterating into children
    if (syntaxNodeRef.name !== 'formatting-embed_formatting-link_formatting-link-start') return null;
    return null;

    debug(['syntaxNodeRef', syntaxNodeRef]);



    // ![[
    // if (syntaxNodeRef.name === 'formatting-embed_formatting-link_formatting-link-start') {
    //     // debug(['Image link node', node.type.name]);

    //     const filepathNode = syntaxNodeRef.node.nextSibling;
    //     if (filepathNode && filepathNode.name === 'hmd-embed_hmd-internal-link_link-has-alias') {
    //         // debug(['filepathNode', filepathNode.name]);

    //         let firstPipeNode = filepathNode.nextSibling;
    //         if(firstPipeNode && firstPipeNode.name === 'hmd-embed_hmd-internal-link_link-alias-pipe') {
    //             // debug(['firstPipeNode', firstPipeNode.name]);

    //             // Check if the link's Display Text is used for the embed type name
    //             const embedTypeAndVersionNode = firstPipeNode.node.nextSibling;
    //             if(embedTypeAndVersionNode) {
    //                 // debug(['embedTypeAndVersionNode', embedTypeAndVersionNode.name]);

    //                 const embedTypeStr = transaction.state.doc.sliceString(embedTypeAndVersionNode.from, embedTypeAndVersionNode.to);
    //                 // Not trimmed because I want to keep as performent as possible.
    //                 // So spaces will break it.
    //                 if(embedTypeStr === 'InkDrawing') {

    //                     const secondPipeNode = embedTypeAndVersionNode.node.nextSibling;
    //                     if(secondPipeNode && secondPipeNode.name === 'hmd-embed_hmd-internal-link_link-alias-pipe') {
    //                         // debug(['secondPipeNode', secondPipeNode.name]);

    //                         const settingsNode = secondPipeNode.node.nextSibling;
    //                         if(settingsNode) {
    //                             // debug(['settingsNode', settingsNode.name]);

    //                             const settingsStr = transaction.state.doc.sliceString(settingsNode.from, settingsNode.to);

    //                             const endOfLinkNode = settingsNode.node.nextSibling;
    //                             if(endOfLinkNode && endOfLinkNode.name === 'formatting-link_formatting-link-end') {
    //                                 // debug(['endOfLinkNode', endOfLinkNode.name]);
    //                                 // The link is properly closed, now we can add the decoration

    //                                 const startOfLinkBrackets = filepathNode.from - 3;
    //                                 const endOfLinkBrackets = endOfLinkNode.to;
    //                                 const partialFilepath = transaction.state.doc.sliceString(filepathNode.from, filepathNode.to);
    //                                 const displayName = JSON.parse(settingsStr);

    //                                 return {
    //                                     startPosition: startOfLinkBrackets,
    //                                     endPosition: endOfLinkBrackets,
    //                                     partialFilepath,
    //                                     embedSettings: displayName,
    //                                 }

    //                             }
    //                         }
    //                     }
    //                 }
    //             }
    //         }

    // }
    // }

    return null;
}



interface embedLinkInfo {
    startPosition: number,
    endPosition: number,
    partialFilepath: string,
    embedSettings: any,
}


/**
 * This is designed to run after Obsidian's image decorations run.
 * Instead of detecting the markdown nodes, it looks for the html image tag nodes.
 * @param syntaxNodeRef
 * @param transaction 
 * @returns 
 */
function detectMarkdownEmbedLink(syntaxNodeRef: SyntaxNodeRef, transaction: Transaction): {
    embedLinkInfo?: embedLinkInfo,
    alterFlow?: 'ignore-children' | 'continue-traversal'
} {

    // If not chance of an Ink section start, exit and let syntax tree continue iterating into children
    if (syntaxNodeRef.name !== 'formatting_formatting-image_image_image-marker') return {alterFlow: 'continue-traversal'};
    // return null;

    debug(['Node name:', syntaxNodeRef.name]);
    const startOfLinkBrackets = syntaxNodeRef.from - 3;
    const endOfLinkBrackets = syntaxNodeRef.to;
    const partialFilepath = transaction.state.doc.sliceString(syntaxNodeRef.from, syntaxNodeRef.to);
    const displayName = JSON.parse(`{"anthing":"hello"}`);

    return {
        embedLinkInfo: {
            startPosition: startOfLinkBrackets,
            endPosition: endOfLinkBrackets,
            partialFilepath,
            embedSettings: displayName,
        },
    }
    // debug(['syntaxNodeRef', syntaxNodeRef]);



    // ![[
    // if (syntaxNodeRef.name === 'formatting-embed_formatting-link_formatting-link-start') {
    //     // debug(['Image link node', node.type.name]);

    //     const filepathNode = syntaxNodeRef.node.nextSibling;
    //     if (filepathNode && filepathNode.name === 'hmd-embed_hmd-internal-link_link-has-alias') {
    //         // debug(['filepathNode', filepathNode.name]);

    //         let firstPipeNode = filepathNode.nextSibling;
    //         if(firstPipeNode && firstPipeNode.name === 'hmd-embed_hmd-internal-link_link-alias-pipe') {
    //             // debug(['firstPipeNode', firstPipeNode.name]);

    //             // Check if the link's Display Text is used for the embed type name
    //             const embedTypeAndVersionNode = firstPipeNode.node.nextSibling;
    //             if(embedTypeAndVersionNode) {
    //                 // debug(['embedTypeAndVersionNode', embedTypeAndVersionNode.name]);

    //                 const embedTypeStr = transaction.state.doc.sliceString(embedTypeAndVersionNode.from, embedTypeAndVersionNode.to);
    //                 // Not trimmed because I want to keep as performent as possible.
    //                 // So spaces will break it.
    //                 if(embedTypeStr === 'InkDrawing') {

    //                     const secondPipeNode = embedTypeAndVersionNode.node.nextSibling;
    //                     if(secondPipeNode && secondPipeNode.name === 'hmd-embed_hmd-internal-link_link-alias-pipe') {
    //                         // debug(['secondPipeNode', secondPipeNode.name]);

    //                         const settingsNode = secondPipeNode.node.nextSibling;
    //                         if(settingsNode) {
    //                             // debug(['settingsNode', settingsNode.name]);

    //                             const settingsStr = transaction.state.doc.sliceString(settingsNode.from, settingsNode.to);

    //                             const endOfLinkNode = settingsNode.node.nextSibling;
    //                             if(endOfLinkNode && endOfLinkNode.name === 'formatting-link_formatting-link-end') {
    //                                 // debug(['endOfLinkNode', endOfLinkNode.name]);
    //                                 // The link is properly closed, now we can add the decoration

    //                                 const startOfLinkBrackets = filepathNode.from - 3;
    //                                 const endOfLinkBrackets = endOfLinkNode.to;
    //                                 const partialFilepath = transaction.state.doc.sliceString(filepathNode.from, filepathNode.to);
    //                                 const displayName = JSON.parse(settingsStr);

    //                                 return {
    //                                     startPosition: startOfLinkBrackets,
    //                                     endPosition: endOfLinkBrackets,
    //                                     partialFilepath,
    //                                     embedSettings: displayName,
    //                                 }

    //                             }
    //                         }
    //                     }
    //                 }
    //             }
    //         }

    // }
    // }

    return null;
}
