import { TLEditorSnapshot } from '@tldraw/tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
import { InkFileData } from '../types/file-data';
import type { InkCanvasSnapshot } from 'src/ink-canvas/types';
import emptyDrawingSvgStr from 'src/defaults/empty-drawing-embed.svg';

////////
////////

export const buildInkCanvasDrawingFileData = (props: {
  inkCanvasSnapshot: InkCanvasSnapshot,
  svgString: string,
}): InkFileData => {
  return {
    meta: {
      pluginVersion: PLUGIN_VERSION,
      tldrawVersion: '',
      fileType: 'inkDrawing',
      format: 'ink-canvas',
    },
    tldraw: {} as TLEditorSnapshot,
    inkCanvas: props.inkCanvasSnapshot,
    svgString: props.svgString,
  };
}

export const buildInkCanvasWritingFileData = (props: {
  inkCanvasSnapshot: InkCanvasSnapshot,
  svgString: string,
}): InkFileData => {
  return {
    meta: {
      pluginVersion: PLUGIN_VERSION,
      tldrawVersion: '',
      fileType: 'inkWriting',
      format: 'ink-canvas',
    },
    tldraw: {} as TLEditorSnapshot,
    inkCanvas: props.inkCanvasSnapshot,
    svgString: props.svgString,
  };
}

export const buildDrawingFileData = (props: {
  tlEditorSnapshot: TLEditorSnapshot,
  svgString?: string,
}): InkFileData => {
  return buildFileData({
    tlEditorSnapshot: props.tlEditorSnapshot,
    svgString: props.svgString,
    fileType: "inkDrawing",
  });
}

export const buildWritingFileData = (props: {
  tlEditorSnapshot: TLEditorSnapshot,
  transcript?: string,
  svgString?: string,
  writingLineHeight?: number,
}): InkFileData => {
  return buildFileData({
    tlEditorSnapshot: props.tlEditorSnapshot,
    svgString: props.svgString,
    transcript: props.transcript,
    fileType: "inkWriting",
    writingLineHeight: props.writingLineHeight,
  });
}

export const buildFileData = (props: {
  tlEditorSnapshot: TLEditorSnapshot,
  transcript?: string,
  svgString?: string,
  fileType: "inkDrawing" | "inkWriting",
  writingLineHeight?: number,
}): InkFileData => {

  let pageData: InkFileData = {
    meta: {
      pluginVersion: PLUGIN_VERSION,
      tldrawVersion: TLDRAW_VERSION,
      fileType: props.fileType,
      writingLineHeight: props.writingLineHeight,
    },
    tldraw: props.tlEditorSnapshot,
    // Always set svgString to either provided svg or default empty svg
    svgString: props.svgString || emptyDrawingSvgStr,
  };

  return pageData;
}


