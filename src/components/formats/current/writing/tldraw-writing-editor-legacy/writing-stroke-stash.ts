import { Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import { useRef } from 'react';
import { showStrokeLimitTips_maybe } from 'src/components/dom-components/stroke-limit-notice';
import InkPlugin from 'src/main';
import { verbose } from 'src/logic/utils/universal-dev-logging';
import { silentlyChangeStore } from 'src/components/formats/current/utils/tldraw-helpers';

function getCompleteShapes(editor: Editor) {
	const allShapes = editor.getCurrentPageShapes();
	const completeShapes: TLShape[] = [];
	for (let i = 0; i < allShapes.length; i++) {
		const shape = allShapes[i];
		if ('isComplete' in shape.props && shape.props.isComplete === true) {
			completeShapes.push(shape);
		}
	}

	completeShapes.sort((a, b) => a.y - b.y);

	return completeShapes;
}

/** Legacy tldraw writing only: hide strokes above writingStrokeLimit while editing. */
export const useStash = (plugin: InkPlugin) => {
	const stash = useRef<TLShape[]>([]);

	const stashStaleContent = (editor: Editor) => {
		const completeShapes = getCompleteShapes(editor);

		const staleShapeIds: TLShapeId[] = [];
		const staleShapes: TLShape[] = [];

		for (let i = 0; i <= completeShapes.length - plugin.settings.writingStrokeLimit; i++) {
			const record = completeShapes[i];
			if (record.type !== 'draw') return;

			staleShapeIds.push(record.id);
			staleShapes.push(record);
		}

		stash.current.push(...staleShapes);
		silentlyChangeStore(editor, () => {
			editor.store.remove(staleShapeIds);
		});

		try {
			if (staleShapeIds.length >= 5) showStrokeLimitTips_maybe(plugin);
		} catch (caught: unknown) {
			verbose(['Error from stashing stale content (when calling showStrokeLimitTips_maybe)', caught]);
		}
	};

	const unstashStaleContent = (editor: Editor) => {
		silentlyChangeStore(editor, () => {
			editor.store.put(stash.current);
		});
		stash.current.length = 0;
	};

	return { stashStaleContent, unstashStaleContent };
};
