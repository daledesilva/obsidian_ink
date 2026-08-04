export interface DrawingCamera {
  x: number;
  y: number;
  z?: number;
  zoom?: number;
}

export interface DrawingViewport {
  height: number;
  width: number;
}

export function getCenteredZoomCamera(
  camera: DrawingCamera,
  targetZoom: number,
  viewport: DrawingViewport,
): DrawingCamera {
  const currentZoom = camera.zoom ?? camera.z ?? 1;
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  const worldCenterX = camera.x + centerX / currentZoom;
  const worldCenterY = camera.y + centerY / currentZoom;
  const nextCamera = {
    ...camera,
    x: worldCenterX - centerX / targetZoom,
    y: worldCenterY - centerY / targetZoom,
  };

  if ('zoom' in camera) {
    nextCamera.zoom = targetZoom;
  } else {
    nextCamera.z = targetZoom;
  }

  return nextCamera;
}
