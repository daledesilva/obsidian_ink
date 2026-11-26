import { apiVersion, Notice, Setting } from 'obsidian';
import type InkPlugin from 'src/main';
import { inputDiagnostics } from 'src/ink-canvas/input-diagnostics';
import {
	HANDWRITING_PRESETS,
	patchHandwritingExperiments,
	readHandwritingExperiments,
	type HandwritingExperiments,
} from 'src/logic/device-settings/handwriting-experiments';
import { getDenseEraserDetectionEnabled, getEraserTrailEnabled, readDeviceSettings, setDenseEraserDetectionEnabled, setEraserTrailEnabled, setStrokeInputTreatAs } from 'src/logic/device-settings/device-settings';

const PRESET_LABELS: Record<keyof typeof HANDWRITING_PRESETS, string> = {
	appleNotes: 'Apple Notes',
	balanced: 'Balanced',
	excalidraw: 'Excalidraw',
	deprecated: 'Deprecated',
};

export function insertHandwritingDiagnosticsSettings(containerEl: HTMLElement, plugin: InkPlugin): void {
	const section = containerEl.createDiv();
	const render = () => {
		section.empty();
		const settings = readHandwritingExperiments();
		new Setting(section).setName('Advanced handwriting settings (iPad + Apple Pencil)').setHeading()
			.setDesc('Presets tuned for iPad + Apple Pencil. Saved on this device. Web-canvas overrides also apply on other devices when enabled. Changes apply to the next stroke without reloading.');

		const activePreset = Object.entries(HANDWRITING_PRESETS)
			.find(([, preset]) => Object.keys(preset).every((key) => settings[key as keyof HandwritingExperiments] === preset[key as keyof HandwritingExperiments]));
		const presetName = activePreset ? PRESET_LABELS[activePreset[0] as keyof typeof HANDWRITING_PRESETS]
			: settings.enabled ? 'Custom' : 'Off';
		const applyPreset = (key: keyof typeof HANDWRITING_PRESETS) => {
			patchHandwritingExperiments({ ...HANDWRITING_PRESETS[key] });
			setStrokeInputTreatAs('inkWriting', 'pen');
			setStrokeInputTreatAs('inkDrawing', 'pen');
			render();
			new Notice(`${PRESET_LABELS[key]} preset applied. Changes start with the next stroke.`);
		};
		const presetSetting = new Setting(section).setName('Handwriting preset')
			.setClass('ddc_ink_button-set')
			.setDesc(`Current: ${presetName}. Balanced is the default, between Apple Notes and Excalidraw. Apple Notes is a feel preset. Deprecated restores Ink's original handwriting pipeline for comparison. All presets select Pen mode.`);
		for (const key of ['appleNotes', 'balanced', 'excalidraw', 'deprecated'] as const) {
			presetSetting.addButton((button) => button.setButtonText(PRESET_LABELS[key]).onClick(() => applyPreset(key)));
		}

		const toggle = (key: keyof Pick<HandwritingExperiments, 'enabled' | 'fixedWidth' | 'pressureEnabled' | 'pressureProcessing' | 'positionStabilization' | 'mergePoints' | 'overrideSmoothing'>, name: string, desc: string) => {
			new Setting(section).setName(name).setDesc(desc).addToggle((control) => {
				control.setValue(settings[key]).onChange((value) => patchHandwritingExperiments({ [key]: value }));
			});
		};
		const slider = (key: 'fixedWidthSize' | 'streamline' | 'smoothing' | 'thinning', name: string, desc: string, min: number, max: number, step: number) => {
			new Setting(section).setName(name).setDesc(desc).addSlider((control) => {
				control.setLimits(min, max, step).setValue(settings[key]).setDynamicTooltip()
					.onChange((value) => patchHandwritingExperiments({ [key]: value }));
			});
		};
		toggle('enabled', 'Enable advanced handwriting settings', 'Apply the handwriting options below. Input recording works independently.');
		toggle('fixedWidth', 'Fixed stroke width', 'Use the diameter below and disable real and simulated pressure width variation.');
		slider('fixedWidthSize', 'Fixed width diameter', 'Canvas units; active when fixed stroke width is enabled.', 0.5, 20, 0.5);
		toggle('pressureEnabled', 'Use pressure for width', 'Off sets thinning to zero and disables simulated pressure, while keeping the ordinary brush size. Fixed width takes precedence.');
		toggle('pressureProcessing', 'Process pen pressure', 'Off uses browser pressure without gain, start floor, EMA, slew limiting or maximum-pressure merging. The existing low-pressure hover rejection still applies. Use Pen input mode to isolate real pressure from mouse simulation.');
		toggle('positionStabilization', 'Bounded position stabilization', 'Experimental pen-only jitter filter. It adapts to speed and stays within 0.6 screen pixels of each input position.');
		slider('thinning', 'Pressure width variation', 'Lower values make width changes gentler; zero gives uniform width. The Balanced preset uses 0.48.', 0, 1, 0.01);
		toggle('mergePoints', 'Merge nearby input points', 'Off retains each accepted sample, including the lift sample. Low-pressure rejection and perfect-freehand processing still apply.');
		toggle('overrideSmoothing', 'Override smoothing parameters', 'Use the absolute values below instead of the pen/mouse preset and its zoom adjustment.');
		slider('streamline', 'Trajectory streamline', '0 follows sampled positions closely; higher values pull the trajectory toward a smoother path.', 0, 1, 0.01);
		slider('smoothing', 'Outline smoothing', 'Controls outline point spacing in perfect-freehand; distinct from trajectory streamline.', 0, 1, 0.01);
		new Setting(section).setName('Restore handwriting defaults').setDesc('Restore the Balanced preset and Pen input mode.')
			.addButton((button) => button.setButtonText('Reset').onClick(() => applyPreset('balanced')));

		let label = '';
		new Setting(section).setName('Recording label').setDesc('For example: iPad Pro 10.5 / Pencil 1 / iPadOS / Obsidian version / baseline. Included in the next recording. The browser cannot reliably identify the Pencil generation.')
			.addText((text) => text.setPlaceholder('Device, versions, test condition').onChange((value) => { label = value; }));
		const status = new Setting(section).setName('Input recording').setDesc(inputDiagnostics.status());
		const refreshStatus = () => status.setDesc(inputDiagnostics.status());
		status.addButton((button) => button.setButtonText('Start new').onClick(() => {
			const ownerWindow = section.ownerDocument.defaultView!;
			inputDiagnostics.start({
				label, pluginVersion: plugin.manifest.version, obsidianApiVersion: apiVersion,
				diagnosticsBuild: 'handwriting-presets-v5',
				userAgent: ownerWindow.navigator.userAgent,
				maxTouchPoints: ownerWindow.navigator.maxTouchPoints, devicePixelRatio: ownerWindow.devicePixelRatio,
				viewport: { width: ownerWindow.innerWidth, height: ownerWindow.innerHeight },
				pointerEventSupported: 'PointerEvent' in ownerWindow,
				coalescedInputUsedByEngine: false,
				experiments: readHandwritingExperiments(),
				inputPreferences: readDeviceSettings().strokeInputTreatAs,
				lastDetectedInput: readDeviceSettings().lastDetectedStrokeInput,
			});
			refreshStatus();
			new Notice('Ink input recording started. Draw a short sample, then return here to stop and export.');
		}));
		status.addButton((button) => button.setButtonText('Stop').onClick(() => { inputDiagnostics.stop(); refreshStatus(); }));
		new Setting(section).setName('Export input recording')
			.setDesc('Exports raw blocker/canvas events, available coalesced samples, and stroke points before and after pointerup. Memory is bounded; reaching the limit stops recording. JSON is saved to the vault and may sync with it. Recording is cleared when the plugin unloads.')
			.addButton((button) => button.setButtonText('Export JSON').onClick(async () => {
				inputDiagnostics.stop('export');
				refreshStatus();
				const json = inputDiagnostics.exportJson();
				if (!json) { new Notice('Start an input recording first.'); return; }
				try {
					const path = `ink-input-diagnostics-${Date.now()}.json`;
					await plugin.app.vault.create(path, json);
					new Notice(`Ink diagnostics exported: ${path}`);
				} catch {
					new Notice('Export failed. The recording remains in memory; try again.');
				}
			}))
			.addButton((button) => button.setButtonText('Clear').onClick(() => { inputDiagnostics.clear(); refreshStatus(); }));

		new Setting(section).setName('Eraser settings').setHeading();
		new Setting(section).setName('Show eraser trail')
			.setDesc('Show the eraser footprint and fading trail. Turn off on e-ink screens to avoid extra visual updates. Saved on this device; applies immediately. Erasing range and hit detection stay the same.')
			.addToggle((control) => control.setValue(getEraserTrailEnabled()).onChange(setEraserTrailEnabled));
		new Setting(section).setName('Dense eraser detection')
			.setDesc('Detect small strokes more reliably across the eraser area and drag path. Off restores the original sparse sampling for less processing. Independent of the eraser trail. Saved on this device; applies to the next erase gesture.')
			.addToggle((control) => control.setValue(getDenseEraserDetectionEnabled()).onChange(setDenseEraserDetectionEnabled));
	};
	render();
}
