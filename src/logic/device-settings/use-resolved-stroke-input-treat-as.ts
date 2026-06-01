import { useEffect, useState } from 'react';
import type { ResolvedStrokeInputTreatAs, StrokeInputEditorKind } from './device-settings-types';
import {
	getLastDetectedStrokeInput,
	getStrokeInputTreatAs,
	resolveStrokeInputTreatAs,
	subscribeDeviceSettingsChanged,
} from './device-settings';

export function useResolvedStrokeInputTreatAs(
	editorKind: StrokeInputEditorKind,
): ResolvedStrokeInputTreatAs {
	const [value, setValue] = useState<ResolvedStrokeInputTreatAs>(() =>
		resolveStrokeInputTreatAs(
			getStrokeInputTreatAs(editorKind),
			getLastDetectedStrokeInput(),
		),
	);

	useEffect(() => {
		const refresh = (): void => {
			setValue(
				resolveStrokeInputTreatAs(
					getStrokeInputTreatAs(editorKind),
					getLastDetectedStrokeInput(),
				),
			);
		};
		refresh();
		return subscribeDeviceSettingsChanged(refresh);
	}, [editorKind]);

	return value;
}
