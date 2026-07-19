import { useEffect, useState } from 'react';
import { getBooxConnectionEnabled, subscribeDeviceSettingsChanged } from './device-settings';

export function useBooxConnectionEnabled(): boolean {
	const [isEnabled, setIsEnabled] = useState<boolean>(() => getBooxConnectionEnabled());

	useEffect(() => {
		setIsEnabled(getBooxConnectionEnabled());
		return subscribeDeviceSettingsChanged(() => {
			setIsEnabled(getBooxConnectionEnabled());
		});
	}, []);

	return isEnabled;
}
