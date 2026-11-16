import { ALMOSTUSEFUL_DEBUG_STORAGE_SUFFIX } from 'src/logic/almostuseful/almostuseful-constants';
import {
	rewriteAlmostUsefulPortalVerificationUri,
	resolveAlmostUsefulPortalOrigin,
} from 'src/logic/almostuseful/almostuseful-session';

//////////
//////////

const mockLocalStore = new Map<string, string>();
jest.mock('src/logic/utils/storage', () => ({
	__esModule: true,
	fetchLocally: (key: string) => mockLocalStore.get(key) ?? null,
	saveLocally: (key: string, value: string) => {
		mockLocalStore.set(key, value);
	},
	deleteLocally: (key: string) => {
		mockLocalStore.delete(key);
	},
	localStorageKey: (key: string) => `au_ink_${key}`,
}));

jest.mock('src/logic/utils/ink-build-mode', () => ({
	__esModule: true,
	isInkDevelopmentBuild: () => true,
}));

beforeEach(() => {
	mockLocalStore.clear();
});

describe('rewriteAlmostUsefulPortalVerificationUri', () => {
	it('rewrites the portal host to the Ink custom origin', () => {
		mockLocalStore.set(
			ALMOSTUSEFUL_DEBUG_STORAGE_SUFFIX,
			JSON.stringify({
				portalServerMode: 'custom',
				portalOrigin: 'http://localhost:3000',
				customPortalOrigin: 'http://localhost:3000',
			}),
		);
		expect(resolveAlmostUsefulPortalOrigin()).toBe('http://localhost:3000');
		expect(
			rewriteAlmostUsefulPortalVerificationUri(
				'https://account.almostuseful.xyz/oauth/device?client_id=ink&display_name=Ink',
			),
		).toBe('http://localhost:3000/oauth/device?client_id=ink&display_name=Ink');
	});
});
