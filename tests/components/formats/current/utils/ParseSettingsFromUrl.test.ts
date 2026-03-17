import { expect } from '@jest/globals';
import { parseSettingsFromUrl } from 'src/components/formats/current/utils/parse-settings-from-url';
import { DEFAULT_EMBED_SETTINGS } from 'src/types/embed-settings';


describe('parseSettingsFromUrl', () => {
  test('returns defaults and full URL when there is no query string', () => {
    const input = 'https://example.com/resource';
    const { infoUrl, embedSettings } = parseSettingsFromUrl(input);

    expect(infoUrl).toBe(input);
    expect(embedSettings).toEqual(DEFAULT_EMBED_SETTINGS);
  });

  test('parses all known params with correct numeric types', () => {
    const input = [
      'https://example.com/foo?',
      'version=2',
      'width=640',
      'aspectRatio=1.5',
      'viewBoxX=10',
      'viewBoxY=20',
      'viewBoxWidth=300',
      'viewBoxHeight=400',
    ].join('&');

    const { infoUrl, embedSettings } = parseSettingsFromUrl(input);

    expect(infoUrl).toBe('https://example.com/foo');

    const expected = {
      ...DEFAULT_EMBED_SETTINGS,
      version: 2,
      embedDisplay: {
        ...DEFAULT_EMBED_SETTINGS.embedDisplay,
        width: 640,
        aspectRatio: 1.5,
      },
      viewBox: {
        ...DEFAULT_EMBED_SETTINGS.viewBox,
        x: 10,
        y: 20,
        width: 300,
        height: 400,
      },
    };

    expect(embedSettings).toEqual(expected);
  });

  test('ignores unknown params and preserves defaults for unspecified fields', () => {
    const input = 'https://example.com/bar?width=250&unknown=foo';
    const { infoUrl, embedSettings } = parseSettingsFromUrl(input);

    expect(infoUrl).toBe('https://example.com/bar');

    const expected = {
      ...DEFAULT_EMBED_SETTINGS,
      embedDisplay: {
        ...DEFAULT_EMBED_SETTINGS.embedDisplay,
        width: 250,
      },
    };

    expect(embedSettings).toEqual(expected);
  });

  describe('isPendingPaste', () => {
    test('is false when pendingPaste param is absent', () => {
      const { isPendingPaste } = parseSettingsFromUrl('https://example.com/foo?type=inkWriting&version=1');
      expect(isPendingPaste).toBe(false);
    });

    test('is true when pendingPaste=true is present', () => {
      const { isPendingPaste } = parseSettingsFromUrl('https://example.com/foo?type=inkWriting&version=1&pendingPaste=true');
      expect(isPendingPaste).toBe(true);
    });

    test('is false when pendingPaste=false is present', () => {
      const { isPendingPaste } = parseSettingsFromUrl('https://example.com/foo?type=inkWriting&version=1&pendingPaste=false');
      expect(isPendingPaste).toBe(false);
    });
  });
});


