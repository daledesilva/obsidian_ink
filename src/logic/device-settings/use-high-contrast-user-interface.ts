import { useEffect, useState } from 'react';
import { getHighContrastUserInterface, subscribeDeviceSettingsChanged } from './device-settings';

/** Subscribes to device-local high-contrast Ink user interface styling. */
export function useHighContrastUserInterface(): boolean {
	const [isEnabled, setIsEnabled] = useState<boolean>(() => getHighContrastUserInterface());

	useEffect(() => {
		setIsEnabled(getHighContrastUserInterface());
		return subscribeDeviceSettingsChanged(() => {
			setIsEnabled(getHighContrastUserInterface());
		});
	}, []);

	return isEnabled;
}
