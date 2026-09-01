import { useEffect, useState } from 'react';
import {
	getStylusSideButtonTemporaryEraseEnabled,
	subscribeDeviceSettingsChanged,
} from './device-settings';

export function useStylusSideButtonTemporaryEraseEnabled(): boolean {
	const [isEnabled, setIsEnabled] = useState<boolean>(() =>
		getStylusSideButtonTemporaryEraseEnabled(),
	);

	useEffect(() => {
		setIsEnabled(getStylusSideButtonTemporaryEraseEnabled());
		return subscribeDeviceSettingsChanged(() => {
			setIsEnabled(getStylusSideButtonTemporaryEraseEnabled());
		});
	}, []);

	return isEnabled;
}
