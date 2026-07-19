import { useEffect, useState } from 'react';
import { getFingerDrawingEnabled, subscribeDeviceSettingsChanged } from './device-settings';

export function useFingerDrawingEnabled(): boolean {
	const [isEnabled, setIsEnabled] = useState<boolean>(() => getFingerDrawingEnabled());

	useEffect(() => {
		setIsEnabled(getFingerDrawingEnabled());
		return subscribeDeviceSettingsChanged(() => {
			setIsEnabled(getFingerDrawingEnabled());
		});
	}, []);

	return isEnabled;
}
