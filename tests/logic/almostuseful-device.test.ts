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
	hostname: jest.fn(() => 'Dales-MacBook-Pro.local'),
}));

jest.mock('child_process', () => ({
	execFileSync: jest.fn(() => {
		throw new Error('hardware probe unavailable');
	}),
}));

import { execFileSync } from 'child_process';
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
		(mockedHostname as jest.Mock).mockReturnValue('Dales-MacBook-Pro.local');
		(execFileSync as jest.Mock).mockImplementation(() => {
			throw new Error('hardware probe unavailable');
		});
	});

	afterEach(() => {
		Object.defineProperty(global, 'navigator', {
			configurable: true,
			value: originalNavigator,
		});
	});

	it('labels iPad desktop mode as iPad instead of a Mac product line', () => {
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

	it('uses the Mac product line and ignores the Bonjour hostname', () => {
		(execFileSync as jest.Mock).mockImplementation((file: string) => {
			if (String(file).endsWith('sysctl')) return 'MacBookAir10,1\n';
			throw new Error('profiler not needed');
		});
		platformState.isMacOS = true;
		platformState.isDesktop = true;
		Object.defineProperty(global, 'navigator', {
			configurable: true,
			value: {
				userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
				maxTouchPoints: 0,
			},
		});

		expect(almostUsefulDeviceLabel()).toBe('MacBook Air');
		expect(mockedHostname).not.toHaveBeenCalled();
	});

	it('reads Apple silicon model names from system_profiler', () => {
		(execFileSync as jest.Mock).mockImplementation((file: string) => {
			if (String(file).endsWith('sysctl')) return 'Mac15,3\n';
			return '      Model Name: MacBook Pro (14-inch, 2023)\n';
		});
		platformState.isMacOS = true;
		platformState.isDesktop = true;
		Object.defineProperty(global, 'navigator', {
			configurable: true,
			value: {
				userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
				maxTouchPoints: 0,
			},
		});

		expect(almostUsefulDeviceLabel()).toBe('MacBook Pro');
	});

	it('uses Unlabelled Device when a Mac model cannot be read', () => {
		platformState.isMacOS = true;
		platformState.isDesktop = true;
		Object.defineProperty(global, 'navigator', {
			configurable: true,
			value: {
				userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
				maxTouchPoints: 0,
			},
		});

		expect(almostUsefulDeviceLabel()).toBe('Unlabelled Device');
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
