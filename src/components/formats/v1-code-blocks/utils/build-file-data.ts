import { TLEditorSnapshot } from 'tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
import { InkFileData_v1 } from '../types/file-data';

export const buildWritingFileData_v1 = (props: {
  tlEditorSnapshot: TLEditorSnapshot,
  previewIsOutdated?: boolean,
  transcript?: string,
  previewUri?: string,
}): InkFileData_v1 => {
  return buildFileData_v1(props);
}

export const buildDrawingFileData_v1 = (props: {
  tlEditorSnapshot: TLEditorSnapshot,
  previewIsOutdated?: boolean,
  previewUri?: string,
}): InkFileData_v1 => {
  return buildFileData_v1(props);
}

const buildFileData_v1 = (props: {
  tlEditorSnapshot: TLEditorSnapshot,
  previewIsOutdated?: boolean,
  transcript?: string,
  previewUri?: string,
}): InkFileData_v1 => {
  const { tlEditorSnapshot, previewUri, previewIsOutdated = false } = props;

  let pageData: InkFileData_v1 = {
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


