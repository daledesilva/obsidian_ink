import { getHighContrastUserInterface } from './device-settings';

/** Body class when {@link getHighContrastUserInterface} is true (global Ink high-contrast chrome). */
export const INK_HIGH_CONTRAST_USER_INTERFACE_BODY_CLASS = 'ddc_ink_style-for-grayscale-screen';

/** Syncs the high-contrast body class from device settings (call on load and after each change). */
export function applyHighContrastUserInterfaceBodyClass(): void {
	const shouldApply = getHighContrastUserInterface();
	document.body.classList.toggle(INK_HIGH_CONTRAST_USER_INTERFACE_BODY_CLASS, shouldApply);
}

/** Removes the high-contrast body class on plugin unload. */
export function releaseHighContrastUserInterfaceBodyClassOnPluginUnload(): void {
	document.body.classList.remove(INK_HIGH_CONTRAST_USER_INTERFACE_BODY_CLASS);
}
