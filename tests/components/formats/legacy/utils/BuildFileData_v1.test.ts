import { buildWritingFileData_v1, buildDrawingFileData_v1 } from 'src/components/formats/v1-code-blocks/utils/build-file-data';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';

const sampleSnapshot = {
  document: { id: 'doc:1', name: 'Doc' },
  pages: {},
  pageStates: {},
  instances: {},
  assets: {},
} as any;

describe('v1 build-file-data', () => {
  test('buildWritingFileData_v1 sets metadata and optional fields', () => {
    const out = buildWritingFileData_v1({
      tlEditorSnapshot: sampleSnapshot,
      previewIsOutdated: true,
      previewUri: 'vault://preview.svg',
      transcript: 'ignored by builder',
    });

    expect(out.meta.pluginVersion).toBe(PLUGIN_VERSION);
    expect(out.meta.tldrawVersion).toBe(TLDRAW_VERSION);
    expect(out.meta.previewIsOutdated).toBe(true);
    expect(out.tldraw).toBe(sampleSnapshot);
    expect(out.previewUri).toBe('vault://preview.svg');
  });

  test('buildDrawingFileData_v1 includes metadata and handles absence of optionals', () => {
    const out = buildDrawingFileData_v1({ tlEditorSnapshot: sampleSnapshot });
    expect(out.meta.pluginVersion).toBe(PLUGIN_VERSION);
    expect(out.meta.tldrawVersion).toBe(TLDRAW_VERSION);
    expect(out.meta.previewIsOutdated).toBeUndefined();
    expect(out.previewUri).toBeUndefined();
    expect(out.tldraw).toBe(sampleSnapshot);
  });
});


