import { useEffect, useState } from 'react';
import { getDoubleTapToggleEraserEnabled, subscribeDeviceSettingsChanged } from './device-settings';

export function useDoubleTapToggleEraserEnabled(): boolean {
	const [isEnabled, setIsEnabled] = useState<boolean>(() => getDoubleTapToggleEraserEnabled());

	useEffect(() => {
		setIsEnabled(getDoubleTapToggleEraserEnabled());
		return subscribeDeviceSettingsChanged(() => {
			setIsEnabled(getDoubleTapToggleEraserEnabled());
		});
	}, []);

	return isEnabled;
}
