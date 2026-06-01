import { buildDrawingEmbed, buildWritingEmbed } from 'src/components/formats/current/utils/build-embeds';
import { INK_EMBED_BASE_URL } from 'src/constants';
import {
  DEFAULT_EMBED_SETTINGS,
  buildNewDrawingEmbedSettings,
  formatEmbedAspectRatio,
  isWritingAlignedDrawingEmbed,
} from 'src/types/embed-settings';
import { WRITING_PAGE_WIDTH } from 'src/constants';

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
      expect(url.searchParams.get('version')).toBeNull();
      expect(url.searchParams.get('width')).toBe(String(s.embedDisplay.width));
      expect(url.searchParams.get('aspectRatio')).toBe(formatEmbedAspectRatio(s.embedDisplay.aspectRatio));
      expect(url.searchParams.get('viewBoxX')).toBe(String(s.viewBox.x));
      expect(url.searchParams.get('viewBoxY')).toBe(String(s.viewBox.y));
      expect(url.searchParams.get('viewBoxW')).toBe(String(s.viewBox.width));
      expect(url.searchParams.get('viewBoxH')).toBe(String(s.viewBox.height));
    });

    test('uses writing-aligned viewBox when writingAlignedViewBox is set', () => {
      const out = buildDrawingEmbed('Ink/Drawing/new.svg', { writingAlignedViewBox: true });
      const urlPart = out.match(/\[Edit Drawing\]\(([^)]+)\)/)?.[1] as string;
      const url = new URL(urlPart);
      const s = buildNewDrawingEmbedSettings();
      expect(url.searchParams.get('viewBoxW')).toBe(String(WRITING_PAGE_WIDTH));
      expect(url.searchParams.get('viewBoxH')).toBe(String(s.viewBox.height));
    });

    test('appends pendingPaste=true when option is set', () => {
      const out = buildDrawingEmbed('Ink/Drawing/test.svg', { pendingPaste: true });
      const urlPart = out.match(/\[Edit Drawing\]\(([^)]+)\)/)?.[1] as string;
      const url = new URL(urlPart);
      expect(url.searchParams.get('pendingPaste')).toBe('true');
    });

    test('does not include pendingPaste when option is not set', () => {
      const out = buildDrawingEmbed('Ink/Drawing/test.svg');
      expect(out).not.toContain('pendingPaste');
    });
  });

  describe('isWritingAlignedDrawingEmbed', () => {
    test('is true only when viewBox width matches writing page width', () => {
      expect(isWritingAlignedDrawingEmbed(buildNewDrawingEmbedSettings())).toBe(true);
      expect(isWritingAlignedDrawingEmbed(DEFAULT_EMBED_SETTINGS)).toBe(false);
    });
  });

  describe('buildWritingEmbed', () => {
    test('builds image embed and edit link without version param', () => {
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
      expect(url.searchParams.get('version')).toBeNull();
    });

    test('appends pendingPaste=true when option is set', () => {
      const out = buildWritingEmbed('Ink/Writing/test.svg', { pendingPaste: true });
      const urlPart = out.match(/\[Edit Writing\]\(([^)]+)\)/)?.[1] as string;
      const url = new URL(urlPart);
      expect(url.searchParams.get('pendingPaste')).toBe('true');
    });

    test('does not include pendingPaste when option is not set', () => {
      const out = buildWritingEmbed('Ink/Writing/test.svg');
      expect(out).not.toContain('pendingPaste');
    });
  });
});


