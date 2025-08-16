import { TLEditorSnapshot } from '@tldraw/tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
import { InkFileData } from '../types/file-data';

export const buildWritingFileData = (props: {
  tlEditorSnapshot: TLEditorSnapshot,
  previewIsOutdated?: boolean,
  transcript?: string,
  previewUri?: string,
}): InkFileData => {
  return buildFileData(props);
}

export const buildDrawingFileData = (props: {
  tlEditorSnapshot: TLEditorSnapshot,
  previewIsOutdated?: boolean,
  previewUri?: string,
}): InkFileData => {
  return buildFileData(props);
}

const buildFileData = (props: {
  tlEditorSnapshot: TLEditorSnapshot,
  previewIsOutdated?: boolean,
  transcript?: string,
  previewUri?: string,
}): InkFileData => {
  const { tlEditorSnapshot, previewUri, previewIsOutdated = false } = props;

  let pageData: InkFileData = {
    meta: {
      pluginVersion: PLUGIN_VERSION,
      tldrawVersion: TLDRAW_VERSION,
    },
    tldraw: tlEditorSnapshot,
  };

  if (previewIsOutdated) pageData.meta.previewIsOutdated = previewIsOutdated;
  if (previewUri) pageData.previewUri = previewUri;

  return pageData;
};


