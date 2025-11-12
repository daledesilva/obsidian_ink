import { TLEditorSnapshot } from 'tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
import { InkFileData } from '../types/file-data';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const emptyDrawingSvgStr: string = require('src/defaults/empty-drawing-embed.svg');

////////
////////

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
}): InkFileData => {
  return buildFileData({
    tlEditorSnapshot: props.tlEditorSnapshot,
    svgString: props.svgString,
    transcript: props.transcript,
    fileType: "inkWriting",
  });
}

export const buildFileData = (props: {
  tlEditorSnapshot: TLEditorSnapshot,
  transcript?: string,
  svgString?: string,
  fileType: "inkDrawing" | "inkWriting",
}): InkFileData => {

  let pageData: InkFileData = {
    meta: {
      pluginVersion: PLUGIN_VERSION,
      tldrawVersion: TLDRAW_VERSION,
      fileType: props.fileType,
    },
    tldraw: props.tlEditorSnapshot,
    // 使用提供的svgString，如果为空则使用默认的SVG内容（避免使用空的SVG）
    svgString: props.svgString || '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>',
  };

  return pageData;
}


