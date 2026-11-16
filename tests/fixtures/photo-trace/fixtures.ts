import { join } from 'path';

//////////
//////////

/**
 * Phone photos of handwritten pages used by photo-trace unit tests.
 * Each file is the page in a real scene: held, on a desk, ruled, shadowed, or sideways.
 * They are plain JPEGs with no EXIF or GPS, because this repo is public.
 */
export const PHOTO_TRACE_FIXTURE_IDS = [
	'white-page-1',
	'white-page-2',
	'lined-page',
	'lined-rotated-shadowed-page',
	'brown-shadowed-page',
] as const;

export type PhotoTraceFixtureId = (typeof PHOTO_TRACE_FIXTURE_IDS)[number];

export interface PhotoTraceFixture {
	id: PhotoTraceFixtureId;
	fileName: string;
	filePath: string;
	/** Sheet shape in the photo, after the page is straightened. */
	pageOrientation: 'portrait' | 'landscape';
	/** A shadow crosses the writing, so both sides of the sheet must still trace. */
	hasCrossingShadow: boolean;
}

const PHOTO_TRACE_FIXTURE_SPECS: Omit<PhotoTraceFixture, 'filePath'>[] = [
	{
		id: 'white-page-1',
		fileName: 'white-page-1.jpg',
		pageOrientation: 'portrait',
		hasCrossingShadow: false,
	},
	{
		id: 'white-page-2',
		fileName: 'white-page-2.jpg',
		pageOrientation: 'portrait',
		hasCrossingShadow: false,
	},
	{
		id: 'lined-page',
		fileName: 'lined-page.jpg',
		pageOrientation: 'portrait',
		hasCrossingShadow: false,
	},
	{
		id: 'lined-rotated-shadowed-page',
		fileName: 'lined-rotated-shadowed-page.jpg',
		pageOrientation: 'landscape',
		hasCrossingShadow: true,
	},
	{
		id: 'brown-shadowed-page',
		fileName: 'brown-shadowed-page.jpg',
		pageOrientation: 'portrait',
		hasCrossingShadow: true,
	},
];

const fixturesDir = join(__dirname);

/** Every photo-trace fixture, with its JPEG path next to this module. */
export function listPhotoTraceFixtures(): PhotoTraceFixture[] {
	return PHOTO_TRACE_FIXTURE_SPECS.map((spec) => ({
		...spec,
		filePath: join(fixturesDir, spec.fileName),
	}));
}

/** One fixture by id. */
export function getPhotoTraceFixture(id: PhotoTraceFixtureId): PhotoTraceFixture {
	const fixture = listPhotoTraceFixtures().find((candidate) => candidate.id === id);
	if (!fixture) throw new Error(`Missing photo-trace fixture ${id}`);
	return fixture;
}
