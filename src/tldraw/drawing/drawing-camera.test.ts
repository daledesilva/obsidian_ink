import { describe, expect, test } from '@jest/globals';
import { getCenteredZoomCamera } from './drawing-camera';

describe('getCenteredZoomCamera', () => {
  test.each([
    { camera: { x: 10, y: -20, z: 1 }, targetZoom: 2 },
    { camera: { x: -300, y: 120, zoom: 0.5 }, targetZoom: 1.75 },
  ])('keeps the viewport center on the same world point', ({ camera, targetZoom }) => {
    const viewport = { height: 600, width: 1000 };
    const currentZoom = camera.zoom ?? camera.z ?? 1;
    const worldCenterBefore = {
      x: camera.x + viewport.width / 2 / currentZoom,
      y: camera.y + viewport.height / 2 / currentZoom,
    };

    const nextCamera = getCenteredZoomCamera(camera, targetZoom, viewport);
    const nextZoom = nextCamera.zoom ?? nextCamera.z ?? 1;
    const worldCenterAfter = {
      x: nextCamera.x + viewport.width / 2 / nextZoom,
      y: nextCamera.y + viewport.height / 2 / nextZoom,
    };

    expect(worldCenterAfter.x).toBeCloseTo(worldCenterBefore.x);
    expect(worldCenterAfter.y).toBeCloseTo(worldCenterBefore.y);
    expect(nextZoom).toBe(targetZoom);
  });
});
