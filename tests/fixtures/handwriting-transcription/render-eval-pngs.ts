import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { createNodeWritingSvgCanvas } from '../../helpers/node-writing-svg-canvas';
import { listHandwritingTranscriptionFixtures } from './fixtures';
import { stripWritingSvgToVisualOnly } from '../../../src/logic/utils/strip-writing-svg-to-visual-only';
import {
	resolveWritingSvgPageTheme,
	writingSvgToPngBase64,
} from '../../../src/logic/utils/writing-svg-to-png-base64';

//////////
//////////

/**
 * Writes the same visual-only PNG payload the live eval sends, next to each fixture SVG.
 */
async function renderEvalPngs(): Promise<void> {
	const fixtures = listHandwritingTranscriptionFixtures();
	if (fixtures.length === 0) {
		throw new Error('No handwriting transcription fixtures found.');
	}

	for (const fixture of fixtures) {
		const svg = readFileSync(fixture.svgPath, 'utf8');
		const visualSvg = stripWritingSvgToVisualOnly(svg);
		const pageTheme = resolveWritingSvgPageTheme(visualSvg);
		const pngBase64 = await writingSvgToPngBase64(visualSvg, {
			createCanvas: createNodeWritingSvgCanvas,
		});
		if (!pngBase64) {
			throw new Error(`Rasterization returned empty PNG for ${fixture.id}`);
		}

		const pngPath = join(fixture.svgPath.replace(/\.svg$/i, '.png'));
		const pngBytes = Buffer.from(pngBase64, 'base64');
		writeFileSync(pngPath, Uint8Array.from(pngBytes));
		console.log(`${fixture.id}: theme=${pageTheme} ${pngBytes.length} bytes → ${pngPath}`);
	}
}

renderEvalPngs().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
