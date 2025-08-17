import { TLEditorSnapshot } from '@tldraw/tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
import { InkFileData } from '../types/file-data';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const emptyDrawingSvgStr: string = require('src/defaults/empty-drawing-embed.svg');

export const buildDrawingFileData = (props: {
  tlEditorSnapshot: TLEditorSnapshot,
  previewIsOutdated?: boolean,
  svgString?: string,
}): InkFileData => {
  const { tlEditorSnapshot, previewIsOutdated, svgString } = props;
  return buildFileData({
    tlEditorSnapshot,
    previewIsOutdated,
    svgString,
    fileType: 'drawing',
  });
}

export const buildWritingFileData = (props: {
  tlEditorSnapshot: TLEditorSnapshot,
  previewIsOutdated?: boolean,
  transcript?: string,
  svgString?: string,
}): InkFileData => {
  const { tlEditorSnapshot, previewIsOutdated, svgString, transcript } = props;
  return buildFileData({
    tlEditorSnapshot,
    previewIsOutdated,
    svgString,
    transcript,
    fileType: 'writing'
  });
}

export const buildFileData = (props: {
  tlEditorSnapshot: TLEditorSnapshot,
  previewIsOutdated?: boolean,
  transcript?: string,
  svgString?: string,
  fileType: 'writing' | 'drawing',
}): InkFileData => {
  const { tlEditorSnapshot, svgString, previewIsOutdated = false, fileType } = props;

  let pageData: InkFileData = {
    meta: {
      pluginVersion: PLUGIN_VERSION,
      tldrawVersion: TLDRAW_VERSION,
      fileType,
    },
    tldraw: tlEditorSnapshot,
    // Always set svgString to either provided svg or default empty svg
    svgString: svgString || emptyDrawingSvgStr,
  };

  if (previewIsOutdated) pageData.meta.previewIsOutdated = previewIsOutdated;

  return pageData;
}


