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

/////////////////////
/////////////////////

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
        root.render(
            // <JotaiProvider>
			// 	<DrawingEmbed
			// 		plugin = {this.plugin}
			// 		drawingFileRef = {this.fileRef}
			// 		pageData = {pageData}
			// 		saveSrcFile = {this.save}
			// 		setEmbedProps = {this.setEmbedProps}
			// 		remove = {this.embedCtrls.removeEmbed}
			// 		width = {this.embedData.width}
			// 		aspectRatio = {this.embedData.aspectRatio}
			// 	/>
			// </JotaiProvider>
            <p>
                {this.filepath}<br/>
                {JSON.stringify(this.embedSettings, null, 2)}
            </p>
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
        const {plugin} = getGlobals();

        

        // TODO: This doesn't work - need to get editor from plugin
        const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const activeEditor = activeView?.editor;
        if (!activeEditor) return oldState;

        if(activeView.currentMode.sourceMode) {
            return Decoration.none;
        }

        // NOTE: This is the order expected in the syntax tree
        // formatting-link_formatting-link-start
        // hmd-internal-link_link-has-alias --> Filename
        // hmd-internal-link_link-alias-pipe
        // hmd-internal-link_link-alias --> Embed Type
        // hmd-internal-link_link-alias-pipe
        // hmd-internal-link_link-alias --> Settings
        // formatting-link_formatting-link-end

        const builder = new RangeSetBuilder<Decoration>();

        syntaxTree(transaction.state).iterate({
            enter(node) {

                if (node.type.name === 'hmd-internal-link_link-has-alias') {
                    const filepathNode = node.node;

                    let firstPipeNode = node.node.nextSibling;
                    if(firstPipeNode && firstPipeNode.name === 'hmd-internal-link_link-alias-pipe') {
                        
                        // Check if the link's Display Text is used for the embed type name
                        const embedTypeAndVersionNode = firstPipeNode.node.nextSibling;
                        if(embedTypeAndVersionNode) {
                            const embedTypeStr = transaction.state.doc.sliceString(embedTypeAndVersionNode.from, embedTypeAndVersionNode.to);
                            // Not trimmed because I want to keep as performent as possible.
                            // So spaces will break it.
                            if(embedTypeStr === 'InkDrawing') {

                                const secondPipeNode = embedTypeAndVersionNode.node.nextSibling;
                                if(secondPipeNode && secondPipeNode.name === 'hmd-internal-link_link-alias-pipe') {
                                    
                                    const settingsNode = secondPipeNode.node.nextSibling;
                                    if(settingsNode) {
                                        const settingsStr = transaction.state.doc.sliceString(settingsNode.from, settingsNode.to);
                                        
                                        const endOfLinkNode = settingsNode.node.nextSibling;
                                        if(endOfLinkNode) {
                                            // The link is properly closed, now we can add the decoration
                                            
                                            const startOfLinkBrackets = filepathNode.from - 2;
                                            const endOfLinkBrackets = endOfLinkNode.to;
                                            const filepath = transaction.state.doc.sliceString(filepathNode.from, filepathNode.to);
                                            const embedSettings = JSON.parse(settingsStr);

                                            builder.add(
                                                startOfLinkBrackets,
                                                endOfLinkBrackets,
                                                Decoration.replace({
                                                    widget: new DrawingEmbedWidget(filepath, embedSettings),
                                                })
                                            );
                                        }
                                    }
                                }
                            }
                        }

                    }
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


