import { join } from 'path';

//////////
//////////

const fixturesDir = join(__dirname);

/**
 * Handwriting and drawing SVGs built by stacking strokes from the smaller fixtures
 * until the prepared visual payload exceeds the portal media cap.
 * Not registered as live-eval samples.
 */
export const OVERSIZED_TRANSCRIPTION_FIXTURES = {
	writing: join(fixturesDir, 'oversized - stacked writing.svg'),
	drawing: join(fixturesDir, 'oversized - stacked drawing.svg'),
} as const;
