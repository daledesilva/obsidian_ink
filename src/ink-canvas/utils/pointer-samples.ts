/**
 * Expands a pointer event into individual samples (coalesced intermediate moves).
 * Browsers often merge many stylus samples into one `pointermove` per frame;
 * {@link PointerEvent.getCoalescedEvents} exposes those intermediates.
 *
 * Falls back to `[e]` when coalescing is unavailable or returns nothing (synthetic events, older WebKit).
 */

/**
 * When false (current default), only the dispatched event is used — one sample per `pointermove`.
 * iPad QA originally tied raw coalesced expansion to ragged outlines; the underlying artifact was
 * later root-caused as a radius-slew / outline self-intersection issue and fixed via
 * {@link PEN_PRESSURE_SLEW_PER_SIZE}. Coalesced can be re-enabled and re-QA'd now that radius
 * change is bounded per distance (denser samples just mean gentler radius steps).
 */
export const USE_COALESCED_POINTER_SAMPLES = false;

export function getPointerSamples(e: PointerEvent): PointerEvent[] {
	if (!USE_COALESCED_POINTER_SAMPLES) return [e];
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
