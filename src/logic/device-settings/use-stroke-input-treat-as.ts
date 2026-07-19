import { useEffect, useState } from 'react';
import type { StrokeInputEditorKind, StrokeInputTreatAs } from './device-settings-types';
import { getStrokeInputTreatAs, subscribeDeviceSettingsChanged } from './device-settings';

export function useStrokeInputTreatAs(editorKind: StrokeInputEditorKind): StrokeInputTreatAs {
	const [value, setValue] = useState<StrokeInputTreatAs>(() => getStrokeInputTreatAs(editorKind));

	useEffect(() => {
		setValue(getStrokeInputTreatAs(editorKind));
		return subscribeDeviceSettingsChanged(() => {
			setValue(getStrokeInputTreatAs(editorKind));
		});
	}, [editorKind]);

	return value;
}
