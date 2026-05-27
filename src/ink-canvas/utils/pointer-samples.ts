/**
 * Expands a pointer event into individual samples (coalesced intermediate moves).
 * Browsers often merge many stylus samples into one `pointermove` per frame;
 * {@link PointerEvent.getCoalescedEvents} exposes those intermediates.
 *
 * Falls back to `[e]` when coalescing is unavailable or returns nothing (synthetic events, older WebKit).
 */
export function getPointerSamples(e: PointerEvent): PointerEvent[] {
	if (typeof e.getCoalescedEvents !== 'function') return [e];
	const coalesced = e.getCoalescedEvents();
	if (!coalesced?.length) return [e];

	// Some WebKit builds report non-monotonic coalesced order; sort by timeStamp when ambiguous.
	let samples: PointerEvent[] =
		coalesced.length > 1
			? [...coalesced].sort((a, b) => a.timeStamp - b.timeStamp)
			: [...coalesced];

	const tail = samples[samples.length - 1];
	const dx = e.clientX - tail.clientX;
	const dy = e.clientY - tail.clientY;
	// Main event is not part of the coalesced list; append if its position differs from the last sample.
	const screenDistSq = dx * dx + dy * dy;
	if (screenDistSq > 0.01) {
		samples = [...samples, e];
	}

	return samples;
}
