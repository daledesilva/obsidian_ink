import { buildDrawingFileData, buildWritingFileData, buildFileData } from 'src/components/formats/current/utils/build-file-data';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';

const sampleSnapshot = {
  document: {
    id: 'doc:1',
    name: 'Doc',
  },
  pages: {},
  pageStates: {},
  instances: {},
  assets: {},
} as any; // Keep loose: we only assert pass-through behavior

describe('build-file-data utilities', () => {
  test('buildDrawingFileData sets drawing metadata and default svg fallback', () => {
    const out = buildDrawingFileData({ tlEditorSnapshot: sampleSnapshot });
    expect(out.meta.pluginVersion).toBe(PLUGIN_VERSION);
    expect(out.meta.tldrawVersion).toBe(TLDRAW_VERSION);
    expect(out.meta.fileType).toBe('inkDrawing');
    expect(out.tldraw).toBe(sampleSnapshot);
    expect(typeof out.svgString).toBe('string');
    expect(out.svgString.length).toBeGreaterThan(0);
  });

  test('buildDrawingFileData uses provided svg string when given', () => {
    const svg = '<svg>test</svg>';
    const out = buildDrawingFileData({ tlEditorSnapshot: sampleSnapshot, svgString: svg });
    expect(out.svgString).toBe(svg);
  });

  test('buildWritingFileData sets writing metadata and default svg fallback', () => {
    const out = buildWritingFileData({ tlEditorSnapshot: sampleSnapshot });
    expect(out.meta.pluginVersion).toBe(PLUGIN_VERSION);
    expect(out.meta.tldrawVersion).toBe(TLDRAW_VERSION);
    expect(out.meta.fileType).toBe('inkWriting');
    expect(out.tldraw).toBe(sampleSnapshot);
    expect(typeof out.svgString).toBe('string');
    expect(out.svgString.length).toBeGreaterThan(0);
  });

  test('buildFileData passes through fileType and svgString', () => {
    const svg = '<svg>foo</svg>';
    const out = buildFileData({ tlEditorSnapshot: sampleSnapshot, svgString: svg, fileType: 'inkDrawing' });
    expect(out.meta.fileType).toBe('inkDrawing');
    expect(out.svgString).toBe(svg);
  });
});


