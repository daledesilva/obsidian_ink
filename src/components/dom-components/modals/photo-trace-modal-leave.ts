import { setPhotoTraceButtonBusy } from './photo-trace-chevron-button';

//////////
//////////

/**
 * Closes a photo dialog only once the next one can open immediately.
 *
 * Closing first left the note showing for as long as the next photo took to decode.
 * When `prepare` returns void, that work is already done, so this closes in the click
 * turn and the caller opens the next dialog before the browser paints the gap.
 * When `prepare` returns a promise, the clicked button spins and this dialog stays
 * up until the promise finishes, then the same handoff runs.
 */
export async function leavePhotoTraceModal(
	buttonEl: HTMLElement,
	prepare: () => void | Promise<void>,
	isStillOpen: () => boolean,
	finish: () => void,
): Promise<void> {
	const pending = prepare();
	if (pending instanceof Promise) {
		setPhotoTraceButtonBusy(buttonEl, true);
		try {
			await pending;
		} catch {
			// A failed prepare leaves the dialog where it was so the click can be tried again.
			if (isStillOpen()) setPhotoTraceButtonBusy(buttonEl, false);
			return;
		}
	}
	// The title-bar close can cancel the batch while a decode is still running.
	if (!isStillOpen()) return;
	finish();
}
