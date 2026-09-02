import { EditorView } from '@codemirror/view';

function eventTargetTouchesWidgetRoot(selector: string, rawTarget: EventTarget | null): boolean {
	if (!(rawTarget instanceof Element)) return false;
	return Boolean(rawTarget.closest(selector));
}

function shouldCodeMirrorIgnoreWidgetEvent(selector: string, event: Event): boolean {
	return eventTargetTouchesWidgetRoot(selector, event.target);
}

/**
 * Tells CodeMirror to ignore events originating within
 * elements matching the provided widgets root elements class selector.
 * Defaults to the Ink widget root selector.
 *
 * Pointer events are included so Apple Pencil contact inside an embed does not
 * move the note cursor or refocus `.cm-content` (see docs/apple-pencil-scribble.md).
 */
export function preventCodeMirrorHandlingWidgetsEvents(selector: string = '.ddc_ink_widget-root') {
	return EditorView.domEventHandlers({
		mousedown: (event) => shouldCodeMirrorIgnoreWidgetEvent(selector, event),
		touchstart: (event) => shouldCodeMirrorIgnoreWidgetEvent(selector, event),
		click: (event) => shouldCodeMirrorIgnoreWidgetEvent(selector, event),
		pointerdown: (event) => shouldCodeMirrorIgnoreWidgetEvent(selector, event),
		pointerup: (event) => shouldCodeMirrorIgnoreWidgetEvent(selector, event),
		pointercancel: (event) => shouldCodeMirrorIgnoreWidgetEvent(selector, event),
	});
}

