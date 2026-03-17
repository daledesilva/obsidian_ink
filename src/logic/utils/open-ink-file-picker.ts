import { MarkdownView, Notice, normalizePath, TFile } from "obsidian";
import InkPlugin from "src/main";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { SvgFilePickerModal } from "src/components/dom-components/modals/svg-picker-modal/svg-picker-modal";
import { fetchRecentFilePaths, recordRecentFileSelection } from "src/logic/utils/storage";
import { findNotesContainingFileEmbed } from "src/logic/utils/convert-file-embeds";
import { verbose } from "src/logic/utils/log-to-console";

////////
////////

export type SectionedFiles = {
    recent: TFile[];
    onCurrentPage: TFile[];
    other: TFile[];
};

const EMBED_PATH_REGEX = /!\[(InkWriting|InkDrawing)\]\(<([^>]+)>\)/g;
const RECENT_MAX = 10;

function extractEmbedPathsFromNote(
    content: string,
    fileType: 'inkWriting' | 'inkDrawing'
): string[] {
    const altText = fileType === 'inkWriting' ? 'InkWriting' : 'InkDrawing';
    const paths: string[] = [];
    let match: RegExpExecArray | null;
    EMBED_PATH_REGEX.lastIndex = 0;
    while ((match = EMBED_PATH_REGEX.exec(content)) !== null) {
        if (match[1] === altText) paths.push(match[2].trim());
    }
    return paths;
}

function resolvePathToCanonical(
    vault: { getAbstractFileByPath: (path: string) => unknown },
    metadataCache: { getFirstLinkpathDest: (linkpath: string, sourcePath: string) => TFile | null },
    linkpath: string,
    sourcePath: string
): string | null {
    const normalized = normalizePath(linkpath);
    const resolved = metadataCache.getFirstLinkpathDest(normalized, sourcePath);
    if (resolved instanceof TFile) return resolved.path;
    const byPath = vault.getAbstractFileByPath(normalized);
    if (byPath instanceof TFile) return byPath.path;
    return null;
}

async function getNoteForOnCurrentPage(
    plugin: InkPlugin,
    fileType: 'inkWriting' | 'inkDrawing',
    sourceFile: TFile | null
): Promise<TFile | null> {
    if (!sourceFile) return null;
    if (sourceFile.extension === "md") return sourceFile;
    if (sourceFile.extension === "svg") {
        const notes = await findNotesContainingFileEmbed(
            plugin.app.vault,
            sourceFile.path,
            fileType
        );
        return notes[0] ?? null;
    }
    return null;
}

async function buildSectionedFiles(
    plugin: InkPlugin,
    validFiles: TFile[],
    fileType: 'inkWriting' | 'inkDrawing',
    sourceFile: TFile | null,
    noteContent: string | null
): Promise<SectionedFiles> {
    const validByPath = new Map<string, TFile>();
    for (const file of validFiles) {
        validByPath.set(file.path, file);
    }

    const recentPaths = fetchRecentFilePaths(fileType).slice(0, RECENT_MAX);
    const recent: TFile[] = [];
    const recentPathsSeen = new Set<string>();
    for (const path of recentPaths) {
        const file = validByPath.get(path);
        if (file && !recentPathsSeen.has(path)) {
            recent.push(file);
            recentPathsSeen.add(path);
        }
    }

    const onPagePathsSeen = new Set<string>();
    const onCurrentPage: TFile[] = [];
    const noteFile = await getNoteForOnCurrentPage(plugin, fileType, sourceFile);

    verbose(["[On Current Page] getNoteForOnCurrentPage", {
        noteFile: noteFile?.path ?? null,
        sourceWasSvg: sourceFile?.extension === "svg",
    }]);

    if (noteFile) {
        const content = noteContent ?? (await plugin.app.vault.cachedRead(noteFile));

        verbose(["[On Current Page] content", {
            contentLength: content.length,
            containsInkDrawing: content.includes("InkDrawing"),
            containsInkWriting: content.includes("InkWriting"),
        }]);

        const rawPaths = extractEmbedPathsFromNote(content, fileType);

        verbose(["[On Current Page] extractEmbedPathsFromNote", {
            rawPaths,
            count: rawPaths.length,
        }]);

        for (const linkpath of rawPaths) {
            const canonical = resolvePathToCanonical(
                plugin.app.vault,
                plugin.app.metadataCache,
                linkpath,
                noteFile.path
            );
            const inValidByPath = canonical !== null && validByPath.has(canonical);
            const inRecentPathsSeen = canonical !== null && recentPathsSeen.has(canonical);

            verbose(["[On Current Page] resolvePath", {
                linkpath,
                canonical,
                inValidByPath,
                inRecentPathsSeen,
            }]);

            if (canonical && inValidByPath && !onPagePathsSeen.has(canonical)) {
                const file = validByPath.get(canonical)!;
                onCurrentPage.push(file);
                onPagePathsSeen.add(canonical);
            }
        }
    }

    verbose(["[On Current Page] result", { onCurrentPageCount: onCurrentPage.length }]);

    const shownPaths = new Set([...recentPathsSeen, ...onPagePathsSeen]);
    const other: TFile[] = validFiles.filter(file => !shownPaths.has(file.path));

    return { recent, onCurrentPage, other };
}

export type OpenInkFilePickerOptions = {
    sourceFile?: TFile | null;
    /** When provided, used for On current page parsing instead of reading from vault (avoids stale cache for unsaved edits). */
    noteContent?: string;
};

export async function openInkFilePicker(
    plugin: InkPlugin,
    fileType: 'inkWriting' | 'inkDrawing',
    title: string,
    onChoose: (file: TFile) => void,
    options?: OpenInkFilePickerOptions
): Promise<void> {
    const allFiles = plugin.app.vault.getFiles();
    const svgFiles = allFiles.filter(file => file.extension === 'svg');
    const validFiles: TFile[] = [];

    for (let i = 0; i < svgFiles.length; i++) {
        const file = svgFiles[i];
        try {
            const svgString = await plugin.app.vault.read(file);
            if (!svgString || !svgString.trim().startsWith('<svg')) continue;
            const inkFileData = extractInkJsonFromSvg(svgString);
            if (!inkFileData) continue;
            if (inkFileData.meta.fileType === fileType) validFiles.push(file);
        } catch (_) {
            // ignore invalid/unreadable files
        }
    }

    const fileTypeLabel = fileType === 'inkWriting' ? 'writing' : 'drawing';
    if (validFiles.length === 0) {
        new Notice(`No ${fileTypeLabel} SVGs found`);
        return;
    }

    const effectiveSource =
        options?.sourceFile ??
        plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file ??
        plugin.app.workspace.getActiveFile();

    const noteContent = options?.noteContent ?? null;

    verbose(["[On Current Page] effectiveSource", {
        effectiveSource: effectiveSource?.path ?? null,
        hasNoteContent: noteContent !== null,
    }]);

    const sections = await buildSectionedFiles(
        plugin,
        validFiles,
        fileType,
        effectiveSource ?? null,
        noteContent
    );

    const wrappedOnChoose = (file: TFile) => {
        recordRecentFileSelection(fileType, file.path);
        onChoose(file);
    };

    new SvgFilePickerModal(plugin.app, {
        title,
        sections,
        fileType,
        onChoose: wrappedOnChoose,
    }).open();
}
