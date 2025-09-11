import { EditorView } from '@codemirror/view';

/**
 * Tells CodeMirror to ignore events originating within
 * elements matching the provided widgets root elements class selector.
 * Defaults to the Ink widget root selector.
 */
export function preventCodeMirrorHandlingWidgetsEvents(selector: string = '.ddc_ink_widget-root') {
    return EditorView.domEventHandlers({
        mousedown: (event) => {
            const target = event.target as Element | null;
            if (target && (target as any).closest && (target as any).closest(selector)) return true;
            return false;
        },
        touchstart: (event) => {
            const target = event.target as Element | null;
            if (target && (target as any).closest && (target as any).closest(selector)) return true;
            return false;
        },
        click: (event) => {
            const target = event.target as Element | null;
            if (target && (target as any).closest && (target as any).closest(selector)) return true;
            return false;
        },
    });
}


