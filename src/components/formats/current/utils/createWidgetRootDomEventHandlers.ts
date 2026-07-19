import { EditorView } from '@codemirror/view';

function eventTargetTouchesWidgetRoot(selector: string, rawTarget: EventTarget | null): boolean {
	if (!(rawTarget instanceof Element)) return false;
	return Boolean(rawTarget.closest(selector));
}

/**
 * Tells CodeMirror to ignore events originating within
 * elements matching the provided widgets root elements class selector.
 * Defaults to the Ink widget root selector.
 */
export function preventCodeMirrorHandlingWidgetsEvents(selector: string = '.ddc_ink_widget-root') {
    return EditorView.domEventHandlers({
        mousedown: (event) => {
            return eventTargetTouchesWidgetRoot(selector, event.target);
        },
        touchstart: (event) => {
            return eventTargetTouchesWidgetRoot(selector, event.target);
        },
        click: (event) => {
            return eventTargetTouchesWidgetRoot(selector, event.target);
        },
    });
}

