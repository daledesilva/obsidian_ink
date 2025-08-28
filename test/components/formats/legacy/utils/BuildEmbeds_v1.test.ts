import { buildDrawingEmbed_v1, buildWritingEmbed_v1 } from 'src/components/formats/v1-code-blocks/utils/build-embeds';
import { DRAW_EMBED_KEY, WRITE_EMBED_KEY, DRAWING_INITIAL_WIDTH, DRAWING_INITIAL_ASPECT_RATIO, PLUGIN_VERSION } from 'src/constants';

describe('v1 build-embeds', () => {
  describe('buildDrawingEmbed_v1', () => {
    test('creates code block with drawing key and default sizing', () => {
      const filepath = 'Ink/Drawing/test.svg';
      const out = buildDrawingEmbed_v1(filepath);

      expect(out.startsWith('\n```' + DRAW_EMBED_KEY)).toBe(true);
      expect(out.endsWith('\n')).toBe(true);

      const match = out.match(new RegExp("```" + DRAW_EMBED_KEY + "\\n([\\s\\S]*?)\\n```"));
      expect(match).toBeTruthy();
      const jsonBlock = match?.[1] as string;
      const parsed = JSON.parse(jsonBlock);

      expect(parsed).toMatchObject({
        versionAtEmbed: PLUGIN_VERSION,
        filepath,
        width: DRAWING_INITIAL_WIDTH,
        aspectRatio: DRAWING_INITIAL_ASPECT_RATIO,
      });
    });
  });

  describe('buildWritingEmbed_v1', () => {
    test('creates code block with writing key and basic payload', () => {
      const filepath = 'Ink/Writing/test.svg';
      const out = buildWritingEmbed_v1(filepath);

      expect(out.startsWith('\n```' + WRITE_EMBED_KEY)).toBe(true);
      expect(out.endsWith('\n')).toBe(true);

      const match = out.match(new RegExp("```" + WRITE_EMBED_KEY + "\\n([\\s\\S]*?)\\n```"));
      expect(match).toBeTruthy();
      const jsonBlock = match?.[1] as string;
      const parsed = JSON.parse(jsonBlock);

      expect(parsed).toMatchObject({
        versionAtEmbed: PLUGIN_VERSION,
        filepath,
      });
    });
  });
});


