import { almostUsefulDeviceLabel } from 'src/logic/almostuseful/almostuseful-device';

//////////
//////////

const platformState = {
	isMacOS: false,
	isWin: false,
	isLinux: false,
	isIosApp: false,
	isMobileApp: false,
	isDesktop: false,
};

jest.mock('obsidian', () => ({
	Platform: platformState,
}));

jest.mock('os', () => ({
	hostname: jest.fn(() => 'localhost'),
}));

import { hostname as mockedHostname } from 'os';

describe('almostUsefulDeviceLabel', () => {
	const originalNavigator = global.navigator;

	beforeEach(() => {
		platformState.isMacOS = false;
		platformState.isWin = false;
		platformState.isLinux = false;
		platformState.isIosApp = false;
		platformState.isMobileApp = false;
		platformState.isDesktop = false;
		(mockedHostname as jest.Mock).mockReturnValue('localhost');
	});

	afterEach(() => {
		Object.defineProperty(global, 'navigator', {
			configurable: true,
			value: originalNavigator,
		});
	});

	it('labels iPad desktop mode as iPad instead of Mac', () => {
		platformState.isMacOS = true;
		platformState.isDesktop = true;
		Object.defineProperty(global, 'navigator', {
			configurable: true,
			value: {
				userAgent:
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
				maxTouchPoints: 5,
			},
		});

		expect(almostUsefulDeviceLabel()).toBe('iPad');
	});

	it('uses desktop hostname when available', () => {
		(mockedHostname as jest.Mock).mockReturnValue('Dales-MacBook-Pro');
		platformState.isMacOS = true;
		platformState.isDesktop = true;
		Object.defineProperty(global, 'navigator', {
			configurable: true,
			value: {
				userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
				maxTouchPoints: 0,
			},
		});

		expect(almostUsefulDeviceLabel()).toBe('Dales-MacBook-Pro');
	});

	it('parses Boox model tokens from Android user agent', () => {
		platformState.isMobileApp = true;
		Object.defineProperty(global, 'navigator', {
			configurable: true,
			value: {
				userAgent:
					'Mozilla/5.0 (Linux; Android 11; BOOX Go 10.3 Build/RP1A) AppleWebKit/537.36 Mobile Safari/537.36',
				maxTouchPoints: 0,
			},
		});

		expect(almostUsefulDeviceLabel()).toBe('BOOX Go 10.3');
	});

	it('uses Android phone form factor when no model is present', () => {
		platformState.isMobileApp = true;
		Object.defineProperty(global, 'navigator', {
			configurable: true,
			value: {
				userAgent:
					'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36',
				maxTouchPoints: 0,
			},
		});

		expect(almostUsefulDeviceLabel()).toBe('Android phone');
	});
});
