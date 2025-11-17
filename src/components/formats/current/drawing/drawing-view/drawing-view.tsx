import { TextFileView, TFile, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import InkPlugin from "src/main";
import { rememberDrawingFile } from "src/logic/utils/rememberDrawingFile";
import { buildFileStr } from "../../utils/buildFileStr";
import { extractInkJsonFromSvg, autoConvertRegularSvgToInk } from "src/logic/utils/extractInkJsonFromSvg";
import { TldrawDrawingEditorWrapper } from "../tldraw-drawing-editor/tldraw-drawing-editor";
import { InkFileData } from "../../types/file-data";
import { DrawingEditorControls } from "../drawing-embed/drawing-embed";
import { parseSvgToShapes } from "../../utils/importSvgToTldraw";

////////
////////

export const DRAWING_VIEW_TYPE = "ink_drawing-view";

function getExtendedOptions(plugin: InkPlugin, fileRef: TFile, closeEditor: () => void) {
    return [
        {
            text: 'Copy drawing',
            action: async () => {
                await rememberDrawingFile(fileRef);
            }
        },
        {
            text: 'Close',
            action: closeEditor
        },
    ]
}

////////

export function registerDrawingView (plugin: InkPlugin) {
    // 检查是否已经注册了ink_drawing-view视图类型
    try {
        plugin.registerView(
            DRAWING_VIEW_TYPE,
            (leaf) => new DrawingView(leaf, plugin)
        );

        // Intercept .svg opens and switch to drawing view when metadata indicates a drawing file
        plugin.registerEvent(
            plugin.app.workspace.on('file-open', async (file) => {
                try {
                    if (!file || file.extension !== 'svg') return;

                    // Avoid re-entrancy if we're already in the drawing view
                    const activeLeaf = plugin.app.workspace.activeLeaf;
                    if (!activeLeaf) return;
                    const currentViewType = (activeLeaf as any).view?.getViewType?.();
                    
                    // 如果已经在drawing view中，不需要处理
                    if (currentViewType === DRAWING_VIEW_TYPE) return;
                    
                    // 读取SVG文件内容
                    const svgString = await plugin.app.vault.read(file);
                    if (!svgString) return;
                    
                    // 检查SVG是否包含tldraw元数据，并且确认是drawing文件而不是writing文件
                    const inkFileData = extractInkJsonFromSvg(svgString);
                    
                    // 只有当文件包含tldraw元数据且不是writing文件时，才切换到drawing view
                    if (inkFileData) {
                        // 如果是writing文件，不处理
                        if (inkFileData.meta.fileType === "inkWriting") {
                            return;
                        }
                        // 如果是drawing文件，切换到drawing view
                        if (inkFileData.meta.fileType === "inkDrawing") {
                            await activeLeaf.setViewState({
                                type: DRAWING_VIEW_TYPE,
                                state: { file: file.path },
                                active: true,
                            });
                            return;
                        }
                    }
                    
                    // 对于没有完整元数据的旧文件，检查是否包含tldraw字符串但不包含inkWriting
                    const hasTldrawMetadata = svgString.includes('tldraw');
                    const hasInkWriting = svgString.includes('inkWriting');
                    
                    if (hasTldrawMetadata && !hasInkWriting) {
                        await activeLeaf.setViewState({
                            type: DRAWING_VIEW_TYPE,
                            state: { file: file.path },
                            active: true,
                        });
                    }
                } catch (error) {
            // Fail silently; fall back to default SVG handling
        }
            })
        );
    } catch (error) {
        // 如果已经注册过，忽略"existing view type"错误
        if (error && typeof error === 'object' && 'message' in error && 
            typeof error.message === 'string' && error.message.includes('existing view type')) {
            // View type is already registered
        } else {
            // 重新抛出其他错误
            throw error;
        }
    }
}

export class DrawingView extends TextFileView {
    root: null | Root;
    plugin: InkPlugin;
    inkFileData: InkFileData;
    hostEl: HTMLElement | null;
    editorControls: DrawingEditorControls | null = null;
    tlEditor: any = null; // 新增：保存编辑器实例引用
    pendingSvgImport: {
        svgContent: string;
        shapes: any[];
        imageData: Record<string, any>;
    } | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: InkPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.hostEl = null;
    }

    getViewType(): string {
        return DRAWING_VIEW_TYPE;
    }

    getDisplayText = () => {
        return this.file?.basename || "Handdrawn note";
    }
    
    /**
     * 创建默认的InkFileData结构
     */
    private createDefaultInkFileData(svgString?: string): InkFileData {
        return {
            meta: {
                fileType: "inkDrawing" as const,
                pluginVersion: "",
                tldrawVersion: ""
            },
            tldraw: {
                document: {
                    store: {
                        "document:document": {
                            "gridSize": 10,
                            "name": "",
                            "meta": {},
                            "id": "document:document",
                            "typeName": "document"
                        },
                        "page:page1": {
                            "meta": {},
                            "id": "page:page1",
                            "name": "Handwritten Note",
                            "index": "a1",
                            "typeName": "page"
                        }
                    } as any,
                    schema: {
                        schemaVersion: 2,
                        sequences: {
                            "com.tldraw.store": 4,
                            "com.tldraw.asset": 1,
                            "com.tldraw.camera": 1,
                            "com.tldraw.document": 2,
                            "com.tldraw.instance": 25,
                            "com.tldraw.instance_page_state": 5,
                            "com.tldraw.page": 1,
                            "com.tldraw.instance_presence": 5,
                            "com.tldraw.pointer": 1,
                            "com.tldraw.shape": 4,
                            "com.tldraw.asset.bookmark": 2,
                            "com.tldraw.asset.image": 5,
                            "com.tldraw.asset.video": 5,
                            "com.tldraw.shape.group": 0,
                            "com.tldraw.shape.text": 2,
                            "com.tldraw.shape.bookmark": 2,
                            "com.tldraw.shape.draw": 2,
                            "com.tldraw.shape.geo": 9,
                            "com.tldraw.shape.note": 7,
                            "com.tldraw.shape.line": 5,
                            "com.tldraw.shape.frame": 0,
                            "com.tldraw.shape.arrow": 5,
                            "com.tldraw.shape.highlight": 1,
                            "com.tldraw.shape.embed": 4,
                            "com.tldraw.shape.image": 4,
                            "com.tldraw.shape.video": 2
                        }
                    }
                },
                session: {
                    version: 0,
                    currentPageId: "page:page1" as any,
                    exportBackground: true,
                    isFocusMode: false,
                    isDebugMode: false,
                    isToolLocked: false,
                    isGridMode: false,
                    pageStates: [
                        {
                            pageId: "page:page1" as any,
                            camera: {
                                x: 0,
                                y: 0,
                                z: 0.3
                            },
                            selectedShapeIds: [],
                            focusedGroupId: null
                        }
                    ]
                }
            },
            svgString: svgString || ""
        };
    }
    
    setViewData = (fileContents: string, clear: boolean) => {
        if(!this.file) return;
        
        // 对于SVG文件，检查是否包含tldraw元数据
        if (this.file.extension.toLowerCase() === 'svg') {
            const hasTldrawMetadata = fileContents.includes('tldraw') || fileContents.includes('ink');
            
            if (!hasTldrawMetadata) {
                // 常规SVG文件：直接调用importSvgToTldraw导入
                try {
                    // 解析SVG内容获取形状和图像数据
                    const { shapes, imageData } = parseSvgToShapes(fileContents);
                    
                    // 创建基本的InkFileData结构，包含完整的schema定义
                    this.inkFileData = this.createDefaultInkFileData(fileContents);
                    
                    // 保存SVG内容，以便在编辑器创建后自动导入
                    this.pendingSvgImport = {
                        svgContent: fileContents,
                        shapes: shapes,
                        imageData: imageData
                    };
                    
                } catch (error) {
                    // 如果导入失败，使用安全的默认快照结构
                    this.inkFileData = this.createDefaultInkFileData(fileContents);
                }
            } else {
                // 包含tldraw元数据的SVG文件：使用原有的解析逻辑
                try {
                    // 使用autoConvertRegularSvgToInk解析SVG内容
                    const parsedData = autoConvertRegularSvgToInk(fileContents);
                    
                    if (parsedData.meta.fileType === "inkDrawing") {
                        this.inkFileData = parsedData;
                    } else {
                        // 如果不是inkDrawing类型，创建一个基本的InkFileData结构
                        this.inkFileData = this.createDefaultInkFileData(fileContents);
                    }
                } catch (error) {
                    // 如果解析失败，使用安全的默认快照结构
                    this.inkFileData = this.createDefaultInkFileData(fileContents);
                }
            }
        } else {
            // 对于非SVG文件，解析JSON数据
            this.inkFileData = JSON.parse(fileContents) as InkFileData;
        }

        // 确保快照数据有效
        if (!this.inkFileData || !this.inkFileData.tldraw) {
            return;
        }

        const viewContent = this.containerEl.children[1] as HTMLElement;
        viewContent.setAttr('style', 'padding: 0;');
		
        if(this.root) this.clear();

        const host = viewContent.ownerDocument.createElement('div');
        host.className = 'ink-drawing-view-host';
        host.style.height = '100%';
        viewContent.appendChild(host);
        this.hostEl = host;

        this.root = createRoot(host);
		const closeEditor = async () => {
            if (this.editorControls) {
                await this.editorControls.saveAndHalt();
            }
            this.leaf.detach();
        };
        
        // 传递完整的快照数据给编辑器
        this.root.render(
            <TldrawDrawingEditorWrapper
                fileRef = {this.file}
                embedded = {false}
                onReady = {this.handleEditorReady.bind(this)}
                onEditorReady = {this.handleEditorInstanceReady.bind(this)} // 传递编辑器实例回调
                onEditorInstanceReady = {this.handleEditorInstanceReady.bind(this)} // 新增：传递编辑器实例准备好的回调
                drawingFile = {this.file}
                save = {this.saveFile}
                extendedMenu = {getExtendedOptions(this.plugin, this.file, closeEditor)}
                saveControlsReference = {this.registerEditorControls}
                closeEditor = {closeEditor}
                tlEditorSnapshot={this.inkFileData?.tldraw}
                plugin={this.plugin}
            />
        );
    }

    // 新增：处理编辑器实例准备就绪的回调
    handleEditorInstanceReady = (editor: any): void => {
        this.tlEditor = editor;
        
        // 如果有待处理的SVG导入，立即执行导入
        if (this.pendingSvgImport) {
            this.importPendingSvg();
        }
    }

    // 新增：导入待处理的SVG文件
    async importPendingSvg(): Promise<void> {
        if (!this.pendingSvgImport || !this.tlEditor) {
            return;
        }

        try {
            const { importSvgToTldraw } = await import('../../utils/importSvgToTldraw');
            const { shapes, imageData } = this.pendingSvgImport;
            const offsetX = 100;
            const offsetY = 100;
            
            importSvgToTldraw(this.tlEditor, shapes, imageData, offsetX, offsetY);
            
            // 强制编辑器更新视图
            if (this.tlEditor.store && typeof this.tlEditor.store.listen === 'function') {
                this.tlEditor.store.listen(() => {});
            }
            
            if (typeof this.tlEditor.updateInstanceState === 'function') {
                this.tlEditor.updateInstanceState({});
            }
            
        } catch (error) {
            // Fail silently
        } finally {
            this.pendingSvgImport = null;
        }
    }



    /**
     * 加载嵌入的SVG文件 - 基于嵌入文件路径直接加载
     */
    private async loadEmbeddedSvg(svgPath: string): Promise<void> {
        if (!this.tlEditor) {
            return;
        }
        
        try {
            // 从文件系统读取SVG内容
            const svgFile = this.plugin.app.vault.getAbstractFileByPath(svgPath);
            if (!svgFile || !(svgFile instanceof TFile)) {
                return;
            }
            
            const svgContent = await this.plugin.app.vault.read(svgFile);
            if (!svgContent) {
                return;
            }
            
            // 解析SVG内容
            const { shapes, imageData } = parseSvgToShapes(svgContent);
            
            // 导入到编辑器
            await this.importSvgToEditor(shapes, imageData, svgPath);
            
        } catch (error) {
            // Fail silently
        }
    }



    /**
     * 将SVG数据导入到编辑器
     */
    private async importSvgToEditor(shapes: any[], imageData: Record<string, any>, svgPath: string): Promise<void> {
        if (!this.tlEditor) {
            return;
        }

        try {
            // 动态导入importSvgToTldraw函数
            const { importSvgToTldraw } = await import(
                '../../utils/importSvgToTldraw'
            );
            
            // 调用导入函数
            await importSvgToTldraw(this.tlEditor, shapes, imageData);
            
        } catch (error) {
            // Fail silently
        }
    }



    async handleEditorReady(): Promise<void> {
        // 如果编辑器实例已经准备好，直接处理导入
        if (this.tlEditor && this.pendingSvgImport) {
            this.importPendingSvg();
        }
    }

    saveFile = (inkFileData: InkFileData) => {
        this.inkFileData = inkFileData;
        this.save(false);
    }
    
    getViewData = (): string => {
        // 使用修复后的SVG生成函数，确保包含XML声明、DOCTYPE声明和正确的xlink:href
        // 注意：由于Obsidian API限制，这里不能使用异步函数，所以我们需要同步生成SVG
        
        // 直接使用inkFileData中的SVG内容，buildFileStr函数会正确处理svgString字段
        return buildFileStr(this.inkFileData);
    }

    clear = (): void => {
        this.editorControls = null;
        try {
            if(this.root) this.root.unmount();
        } catch (_) {}
        this.root = null;
        if(this.hostEl && this.hostEl.isConnected) {
            try { this.hostEl.remove(); } catch (_) {}
        }
        this.hostEl = null;
    }

    registerEditorControls = (controls: DrawingEditorControls) => {
        this.editorControls = controls;
    }

    async onClose(): Promise<void> {
        if (this.root && this.editorControls) {
            await this.editorControls.saveAndHalt();
        }
        
        this.clear();
        return await super.onClose();
    }
}