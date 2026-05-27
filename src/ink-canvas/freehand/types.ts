import type { Vec2 } from 'perfect-freehand';

export type InkFreehandPoint = [x: number, y: number, pressure: number];

// Matches `perfect-freehand`'s `StrokePoint` type.
export interface InkStrokePoint {
	point: Vec2;
	pressure: number;
	distance: number;
	vector: Vec2;
	runningLength: number;
}

