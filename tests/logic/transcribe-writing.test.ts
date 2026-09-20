import { describe, expect, test } from '@jest/globals';
import { transcribeWriting } from 'src/logic/transcribe-writing';

describe('transcribeWriting', () => {
	test('returns stub transcript string', async () => {
		await expect(transcribeWriting()).resolves.toBe('transcribed');
	});
});
