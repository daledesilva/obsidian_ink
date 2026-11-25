import { almostUsefulDeviceLabel } from 'src/logic/almostuseful/almostuseful-device';

//////////
//////////

const platformState = {
	isMacOS: false,
	isWin: false,
	isLinux: false,
	isIosApp: false,
	isAndroidApp: false,
	isMobileApp: false,
	isPhone: false,
	isTablet: false,
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
		platformState.isAndroidApp = false;
		platformState.isMobileApp = false;
		platformState.isPhone = false;
		platformState.isTablet = false;
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

	it('labels iPad when running the iOS app on a tablet', async () => {
		platformState.isIosApp = true;
		platformState.isTablet = true;
		platformState.isMacOS = true;

		expect(await almostUsefulDeviceLabel()).toBe('iPad');
	});

	it('labels iPhone when running the iOS app on a phone', async () => {
		platformState.isIosApp = true;
		platformState.isPhone = true;
		platformState.isMacOS = true;

		expect(await almostUsefulDeviceLabel()).toBe('iPhone');
	});

	it('uses the Mac product line and ignores the Bonjour hostname', async () => {
		(execFileSync as jest.Mock).mockImplementation((file: string) => {
			if (String(file).endsWith('sysctl')) return 'MacBookAir10,1\n';
			throw new Error('profiler not needed');
		});
		platformState.isMacOS = true;
		platformState.isDesktop = true;

		expect(await almostUsefulDeviceLabel()).toBe('MacBook Air');
		expect(mockedHostname).not.toHaveBeenCalled();
	});

	it('reads Apple silicon model names from system_profiler', async () => {
		(execFileSync as jest.Mock).mockImplementation((file: string) => {
			if (String(file).endsWith('sysctl')) return 'Mac15,3\n';
			return '      Model Name: MacBook Pro (14-inch, 2023)\n';
		});
		platformState.isMacOS = true;
		platformState.isDesktop = true;

		expect(await almostUsefulDeviceLabel()).toBe('MacBook Pro');
	});

	it('uses Unlabelled Device when a Mac model cannot be read', async () => {
		platformState.isMacOS = true;
		platformState.isDesktop = true;

		expect(await almostUsefulDeviceLabel()).toBe('Unlabelled Device');
	});

	it('reads Android model names from User-Agent Client Hints', async () => {
		platformState.isAndroidApp = true;
		platformState.isMobileApp = true;
		platformState.isTablet = true;
		Object.defineProperty(global, 'navigator', {
			configurable: true,
			value: {
				userAgentData: {
					getHighEntropyValues: jest.fn(async () => ({ model: 'BOOX Go 10.3' })),
				},
			},
		});

		expect(await almostUsefulDeviceLabel()).toBe('BOOX Go 10.3');
	});

	it('falls back to Android phone when Client Hints model is unavailable', async () => {
		platformState.isAndroidApp = true;
		platformState.isMobileApp = true;
		platformState.isPhone = true;
		Object.defineProperty(global, 'navigator', {
			configurable: true,
			value: {},
		});

		expect(await almostUsefulDeviceLabel()).toBe('Android phone');
	});

	it('falls back to Android tablet when Client Hints model is empty', async () => {
		platformState.isAndroidApp = true;
		platformState.isMobileApp = true;
		platformState.isTablet = true;
		Object.defineProperty(global, 'navigator', {
			configurable: true,
			value: {
				userAgentData: {
					getHighEntropyValues: jest.fn(async () => ({ model: '' })),
				},
			},
		});

		expect(await almostUsefulDeviceLabel()).toBe('Android tablet');
	});
});
