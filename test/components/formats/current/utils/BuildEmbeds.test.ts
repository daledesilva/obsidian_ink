import { buildDrawingEmbed, buildWritingEmbed } from 'src/components/formats/current/utils/build-embeds';
import { INK_EMBED_BASE_URL } from 'src/constants';
import { DEFAULT_EMBED_SETTINGS } from 'src/types/embed-settings';

describe('build-embeds', () => {
  describe('buildDrawingEmbed', () => {
    test('builds image embed and edit link with default params', () => {
      const filepath = 'Ink/Drawing/test.svg';
      const out = buildDrawingEmbed(filepath);

      expect(out.startsWith('\n')).toBe(true);
      expect(out.endsWith('\n')).toBe(true);
      expect(out).toContain(`![InkDrawing](<${filepath}>)`);

      const urlPart = out.match(/\[(?:Edit Drawing)\]\(([^)]+)\)/)?.[1];
      expect(urlPart).toBeTruthy();
      const url = new URL(urlPart as string);
      const expectedOrigin = new URL(INK_EMBED_BASE_URL).origin;
      expect(url.origin).toBe(expectedOrigin);
      expect(url.searchParams.get('type')).toBe('inkDrawing');

      const s = DEFAULT_EMBED_SETTINGS;
      expect(url.searchParams.get('version')).toBe(String(s.version));
      expect(url.searchParams.get('width')).toBe(String(s.embedDisplay.width));
      expect(url.searchParams.get('aspectRatio')).toBe(String(s.embedDisplay.aspectRatio));
      expect(url.searchParams.get('viewBoxX')).toBe(String(s.viewBox.x));
      expect(url.searchParams.get('viewBoxY')).toBe(String(s.viewBox.y));
      expect(url.searchParams.get('viewBoxWidth')).toBe(String(s.viewBox.width));
      expect(url.searchParams.get('viewBoxHeight')).toBe(String(s.viewBox.height));
    });
  });

  describe('buildWritingEmbed', () => {
    test('builds image embed and edit link with version param', () => {
      const filepath = 'Ink/Writing/test.svg';
      const out = buildWritingEmbed(filepath);

      expect(out.startsWith('\n')).toBe(true);
      expect(out.endsWith('\n')).toBe(true);
      expect(out).toContain(`![InkWriting](<${filepath}>)`);

      const urlPart = out.match(/\[(?:Edit Writing)\]\(([^)]+)\)/)?.[1];
      expect(urlPart).toBeTruthy();
      const url = new URL(urlPart as string);
      const expectedOrigin = new URL(INK_EMBED_BASE_URL).origin;
      expect(url.origin).toBe(expectedOrigin);
      expect(url.searchParams.get('type')).toBe('inkWriting');
      expect(url.searchParams.get('version')).toBe(String(DEFAULT_EMBED_SETTINGS.version));
    });
  });
});


