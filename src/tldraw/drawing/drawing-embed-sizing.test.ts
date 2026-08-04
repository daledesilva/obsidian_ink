import { describe, expect, test } from '@jest/globals';
import { DRAWING_INITIAL_WIDTH } from 'src/constants';
import {
  isFluidDrawingEmbedWidth,
  resolveDrawingEmbedWidth,
} from './drawing-embed-sizing';

describe('drawing embed sizing', () => {
  test.each([undefined, DRAWING_INITIAL_WIDTH])(
    'treats %s as a fluid default width',
    (savedWidth) => {
      expect(isFluidDrawingEmbedWidth(savedWidth)).toBe(true);
      expect(resolveDrawingEmbedWidth(savedWidth, 920)).toBe(920);
    },
  );

  test('preserves an explicit user-resized width', () => {
    expect(isFluidDrawingEmbedWidth(680)).toBe(false);
    expect(resolveDrawingEmbedWidth(680, 920)).toBe(680);
  });

  test('clamps an explicit width when the typing area becomes narrower', () => {
    expect(resolveDrawingEmbedWidth(900, 720)).toBe(720);
  });
});
