import { buildFileStr_v1 } from 'src/components/formats/v1-code-blocks/utils/buildFileStr';

describe('v1 buildFileStr', () => {
  test('returns pretty-printed JSON string', () => {
    const data = {
      meta: { pluginVersion: '0.0.0', tldrawVersion: '2.1.0' },
      tldraw: { document: { id: 'doc:1' } },
      previewUri: 'vault://preview.svg'
    } as any;

    const out = buildFileStr_v1(data);
    expect(typeof out).toBe('string');
    // Should contain newlines and tabs due to pretty-printing
    expect(out).toContain('\n');
    expect(out).toContain('\t');

    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      meta: { pluginVersion: '0.0.0', tldrawVersion: '2.1.0' },
      tldraw: { document: { id: 'doc:1' } },
      previewUri: 'vault://preview.svg'
    });
  });
});


