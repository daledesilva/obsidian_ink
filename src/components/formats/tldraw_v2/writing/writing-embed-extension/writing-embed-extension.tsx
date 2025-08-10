import { syntaxTree } from '@codemirror/language';
import { Extension, RangeSetBuilder, StateField, Transaction } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { editorLivePreviewField, MarkdownView, normalizePath, TFile } from 'obsidian';
import InkPlugin from 'src/main';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { getGlobals } from 'src/stores/global-store';
import { Provider as JotaiProvider } from 'jotai';
import { WritingEmbed } from '../writing-embed/writing-embed';
import { InkFileData } from 'src/logic/utils/page-file';
import { SyntaxNodeRef } from '@lezer/common';
import { DEFAULT_EMBED_SETTINGS, EmbedSettings } from 'src/types/embed-settings';
import { buildFileStr } from 'src/logic/utils/buildFileStr';

// Parity with drawing v2, but simplified (no width/aspect updates for writing embeds)

export class WritingEmbedWidget_v2 extends WidgetType {
    id: string;
    mdFile: TFile;
    embeddedFile: TFile | null;
    partialEmbedFilepath: string;

    constructor(mdFile: TFile, embeddedFile: TFile | null, partialEmbedFilepath: string) {
        super();
        this.mdFile = mdFile;
        this.id = crypto.randomUUID();
        this.embeddedFile = embeddedFile;
        this.partialEmbedFilepath = partialEmbedFilepath;
    }

    toDOM(view: EditorView): HTMLElement {
        const rootEl = document.createElement('div');
        const root = createRoot(rootEl);

        const { plugin } = getGlobals();

        root.render(
            <JotaiProvider>
                <WritingEmbed
                    plugin={plugin}
                    writingFileRef={this.embeddedFile as TFile}
                    save={this.save}
                    remove={() => {
                        this.removeEmbed(view);
                    }}
                />
            </JotaiProvider>
        );
        return rootEl;
    }

    // Helper functions
    ///////////////////

    save = async (pageData: InkFileData) => {
        if (!this.embeddedFile) return;
        const plugin = getGlobals().plugin;
        const pageDataStr = buildFileStr(pageData);
        await plugin.app.vault.modify(this.embeddedFile, pageDataStr);
    };

    private removeEmbed(view: EditorView) {
        // Find this widget's decoration range and remove it
        const decorations = view.state.field(embedStateFieldWriting_v2, false);
        if (!decorations) return;
        const it = decorations.iter();
        while (it.value) {
            const widget = it.value.spec?.widget as WritingEmbedWidget_v2 | undefined;
            if (widget && widget.id === this.id) {
                const tr = view.state.update({ changes: { from: it.from, to: it.to, insert: '' } });
                view.dispatch(tr);
                return;
            }
            it.next();
        }
    }
}

// State field to manage decorations
const embedStateFieldWriting_v2: StateField<DecorationSet> = StateField.define<DecorationSet>({
    create(): DecorationSet {
        return Decoration.none;
    },
    update(prevEmbeds: DecorationSet, transaction: Transaction): DecorationSet {
        const { plugin } = getGlobals();

        const firstRun = prevEmbeds.size === 0;
        if (!firstRun && transaction.changes.empty) {
            return prevEmbeds;
        }

        const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const activeEditor = activeView?.editor;
        if (!activeEditor) return prevEmbeds;

        // @ts-expect-error, not typed
        const cmEditorView = activeEditor.cm as EditorView;
        const isLivePreview = cmEditorView.state.field(editorLivePreviewField);
        if (!isLivePreview) return Decoration.none;

        const builder = new RangeSetBuilder<Decoration>();

        syntaxTree(transaction.state).iterate({
            enter(syntaxNodeRef) {
                const mdFile = activeView.file;
                if (!mdFile) return true;

                const { embedLinkInfo, alterFlow } = detectMarkdownEmbedLinkWriting(mdFile, syntaxNodeRef, transaction);
                if (!embedLinkInfo) return true;
                if (alterFlow === 'ignore-children') return false;
                if (alterFlow === 'continue-traversal') return true;

                // Collapse whitespace before and consume newline after
                embedLinkInfo.startPosition -= 2;
                embedLinkInfo.endPosition += 1;

                let decorationAlreadyExists = false;
                const oldDecoration = prevEmbeds.iter();
                while (oldDecoration.value) {
                    const oldDecFrom = transaction.changes.mapPos(oldDecoration.from);
                    const oldDecTo = transaction.changes.mapPos(oldDecoration.to);
                    decorationAlreadyExists = oldDecFrom === embedLinkInfo.startPosition && oldDecTo === embedLinkInfo.endPosition;
                    if (decorationAlreadyExists) break;
                    oldDecoration.next();
                }

                if (decorationAlreadyExists && oldDecoration.value) {
                    builder.add(embedLinkInfo.startPosition, embedLinkInfo.endPosition, oldDecoration.value);
                } else {
                    builder.add(
                        embedLinkInfo.startPosition,
                        embedLinkInfo.endPosition,
                        Decoration.replace({
                            widget: new WritingEmbedWidget_v2(mdFile, embedLinkInfo.embeddedFile, embedLinkInfo.partialEmbedFilepath),
                            isBlock: true,
                        })
                    );
                }

                return true;
            },
        });

        return builder.finish();
    },
    provide(stateField) {
        return [
            EditorView.decorations.from(stateField),
            EditorView.atomicRanges.of((view: EditorView) => {
                const decorations = view.state.field(embedStateFieldWriting_v2, false);
                return decorations || Decoration.none;
            }),
        ];
    },
});

export function writingEmbedExtension_v2(): Extension {
    return embedStateFieldWriting_v2;
}

export function registerWritingEmbed_v2(plugin: InkPlugin) {
    plugin.registerEditorExtension([
        writingEmbedExtension_v2(),
    ]);
}

interface EmbedLinkInfoWriting_v2 {
    startPosition: number;
    endPosition: number;
    embeddedFile: TFile | null;
    partialEmbedFilepath: string;
}

function detectMarkdownEmbedLinkWriting(
    mdFile: TFile,
    previewLinkStartNode: SyntaxNodeRef,
    transaction: Transaction
): { embedLinkInfo?: EmbedLinkInfoWriting_v2; alterFlow?: 'ignore-children' | 'continue-traversal' } {
    const { plugin } = getGlobals();

    let nextNode: SyntaxNodeRef | null = null;

    // Expect pattern:
    // space ! [alt] ( <filepath> ) [Edit Writing] ( ink?settings )

    if (!previewLinkStartNode || !previewLinkStartNode.name.includes('formatting_formatting-image_image_image-marker')) {
        return { alterFlow: 'continue-traversal' };
    }

    const spaceBefore = transaction.state.doc.sliceString(previewLinkStartNode.from - 1, previewLinkStartNode.from);
    if (spaceBefore !== ' ') return { alterFlow: 'continue-traversal' };

    const transcriptStartNode = previewLinkStartNode.node.nextSibling;
    if (!transcriptStartNode || !transcriptStartNode.name.includes('formatting_formatting-image_image_image-alt-text_link')) {
        return { alterFlow: 'continue-traversal' };
    }

    nextNode = transcriptStartNode.node.nextSibling;
    if (!nextNode) return { alterFlow: 'continue-traversal' };

    if (transcriptStartNode.to - transcriptStartNode.from === 1) {
        const transcriptTextNode = nextNode;
        const transcriptEndNode = transcriptTextNode.node.nextSibling;
        if (!transcriptEndNode || !transcriptEndNode.name.includes('formatting_formatting-image_image_image-alt-text_link')) {
            return { alterFlow: 'continue-traversal' };
        }
        nextNode = transcriptEndNode.node.nextSibling;
    }

    const previewUrlStartNode = nextNode;
    if (!previewUrlStartNode || (!previewUrlStartNode.name.includes('formatting_formatting-link-string') && !previewUrlStartNode.name.includes('string_url'))) {
        return { alterFlow: 'continue-traversal' };
    }

    const previewFilepathNode = previewUrlStartNode.node.nextSibling;
    if (!previewFilepathNode || !previewFilepathNode.name.includes('string_url')) {
        return { alterFlow: 'continue-traversal' };
    }

    const previewUrlEndNode = previewFilepathNode.node.nextSibling;
    if (!previewUrlEndNode || (!previewUrlEndNode.name.includes('formatting_formatting-link-string') && !previewUrlEndNode.name.includes('string_url'))) {
        return { alterFlow: 'continue-traversal' };
    }

    let quoteNode = previewUrlEndNode.node.nextSibling;
    while (quoteNode && quoteNode.name === 'quote_quote-1') {
        quoteNode = quoteNode.node.nextSibling;
    }
    nextNode = quoteNode;

    const editTextStartNode = nextNode;
    if (!editTextStartNode || !editTextStartNode.name.includes('formatting_formatting-link_link')) {
        return { alterFlow: 'continue-traversal' };
    }

    nextNode = editTextStartNode.node.nextSibling;
    if (!nextNode) return { alterFlow: 'continue-traversal' };

  if (editTextStartNode.to - editTextStartNode.from === 1) {
    const editTextNode = nextNode;
    const editText = transaction.state.doc.sliceString(editTextNode.from, editTextNode.to);
    // Disambiguate: Require correct writing label
    if (editText.trim() !== 'Edit Writing') {
      return { alterFlow: 'continue-traversal' };
    }
    const editTextEndNode = editTextNode.node.nextSibling;
    if (!editTextEndNode || !editTextEndNode.name.includes('formatting_formatting-link_link')) {
      return { alterFlow: 'continue-traversal' };
    }
        nextNode = editTextEndNode.node.nextSibling;
    }

    const settingsUrlStartNode = nextNode;
    if (!settingsUrlStartNode || (!settingsUrlStartNode.name.includes('formatting_formatting-link-string') && !settingsUrlStartNode.name.includes('string_url'))) {
        return { alterFlow: 'continue-traversal' };
    }

  const settingsUrlPathNode = settingsUrlStartNode.node.nextSibling;
    if (!settingsUrlPathNode || !settingsUrlPathNode.name.includes('string_url')) {
        return { alterFlow: 'continue-traversal' };
    }

  // Require query param to include type=InkWriting (host agnostic)
  const urlAndSettings = transaction.state.doc.sliceString(settingsUrlPathNode.from, settingsUrlPathNode.to);
  if (!urlAndSettings.includes('type=InkWriting')) {
    return { alterFlow: 'continue-traversal' };
  }

  const settingsUrlEndNode = settingsUrlPathNode.node.nextSibling;
    if (!settingsUrlEndNode || (!settingsUrlEndNode.name.includes('formatting_formatting-link-string') && !settingsUrlEndNode.name.includes('string_url'))) {
        return { alterFlow: 'continue-traversal' };
    }

    const previewPartialFilepath = transaction.state.doc.sliceString(previewFilepathNode.from + 1, previewFilepathNode.to - 1);
    const startOfReplacement = previewLinkStartNode.from;
    const endOfReplacement = settingsUrlEndNode.to;

    const embeddedFile = plugin.app.metadataCache.getFirstLinkpathDest(normalizePath(previewPartialFilepath), mdFile.path);

    return {
        embedLinkInfo: {
            startPosition: startOfReplacement,
            endPosition: endOfReplacement,
            embeddedFile: embeddedFile,
            partialEmbedFilepath: previewPartialFilepath,
        },
    };
}


