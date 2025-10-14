import { MarkdownRenderChild, TFile } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Provider as JotaiProvider } from 'jotai';
import { WritingEmbed_v1 } from '../writing-embed-editor/writing-embed';
import { applyCommonAncestorStyling } from 'src/logic/utils/embed';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { buildFileStr_v1 } from '../../utils/buildFileStr';
import { InkFileData_v1 } from '../../types/file-data';

interface WritingEmbedWidgetData {
    filepath: string;
}

interface WritingEmbedWidgetCtrl {
    removeEmbed: () => void;
}

export class WritingEmbedWidget extends MarkdownRenderChild {
    private plugin: any;
    private embedData: WritingEmbedWidgetData;
    private embedCtrls: WritingEmbedWidgetCtrl;
    private fileRef: TFile | null = null;
    private root: Root | null = null;
    private el: HTMLElement;

    constructor(el: HTMLElement, plugin: any, embedData: WritingEmbedWidgetData, embedCtrls: WritingEmbedWidgetCtrl) {
        super(el);
        this.el = el;
        this.plugin = plugin;
        this.embedData = embedData;
        this.embedCtrls = embedCtrls;
    }

    async onload() {
        const v = this.plugin.app.vault;
        this.fileRef = v.getAbstractFileByPath(this.embedData.filepath) as TFile;
        
        if( !this.fileRef || !(this.fileRef instanceof TFile) ) {
            this.el.createEl('p').textContent = 'Ink writing file not found: ' + this.embedData.filepath;
            return;
        }

        const pageDataStr = await v.read(this.fileRef);
        let pageData: InkFileData_v1 | null = null;
        try {
            pageData = JSON.parse(pageDataStr) as InkFileData_v1;
        } catch (e) {
            pageData = extractInkJsonFromSvg(pageDataStr) as unknown as InkFileData_v1;
        }
        if (!pageData) {
            this.el.createEl('p').textContent = 'Ink writing file invalid.';
            return;
        }

        if(!this.root) this.root = createRoot(this.el);
        this.root.render(
            <JotaiProvider>
                <WritingEmbed_v1
                    plugin = {this.plugin}
                    writingFileRef = {this.fileRef}
                    pageData = {pageData}
                    save = {this.save}
                    remove = {this.embedCtrls.removeEmbed}
                />
            </JotaiProvider>
        );

        applyCommonAncestorStyling(this.el)
    }

    async onunload() {
        this.root?.unmount();
    }

    // Helper functions
    ///////////////////

    save = async (pageData: InkFileData_v1) => {
        
        if(!this.fileRef) return;
        const pageDataStr = buildFileStr_v1(pageData);
        await this.plugin.app.vault.modify(this.fileRef, pageDataStr);
    }
}