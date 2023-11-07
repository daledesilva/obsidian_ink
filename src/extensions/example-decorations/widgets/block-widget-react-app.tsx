import * as React from "react";
import { useState, useEffect } from "react";
import { Editor, TLGeoShape, TLShapePartial, Tldraw, createShapeId } from '@tldraw/tldraw'
import '@tldraw/tldraw/tldraw.css'

// Import scss file so that compiler adds it.
// This is instead of injecting it using EditorView.baseTheme
// This allow syou to write scss in an external file and have it refresh during dev better.
import './block-widget.scss';


export const BlockWidgetReactApp = () => {
  	const [title, setTitle] = useState('React Based Block Widget');


	const handleMount = (editor: Editor) => {

    
		// // Create a shape id
		const id = createShapeId('hello')

		// // Create a shape
		editor.createShapes<TLGeoShape>([
			{
				id,
				type: 'geo',
				x: 128 + Math.random() * 500,
				y: 128 + Math.random() * 500,
				props: {
					geo: 'rectangle',
					w: 100,
					h: 100,
					dash: 'draw',
					color: 'blue',
					size: 'm',
				},
			},
		])

		// // Get the created shape
		const shape = editor.getShape<TLGeoShape>(id)!

		const shapeUpdate: TLShapePartial<TLGeoShape> = {
			id,
			type: 'geo',
			props: {
				w: shape.props.h * 2,
				text: 'hello world!',
			},
		}

		// Update the shape
		editor.updateShapes([shapeUpdate])

		// Zoom the camera to fit both shapes
		editor.zoomToFit()


		editor.updateInstanceState({
			// isReadonly: true,
			// canMoveCamera: false,
			// isToolLocked: true,
		
			// isDebugMode: false,
			isGridMode: true,
		})
	}



	return <>
		<div
			className = 'block-widget external-styling'
			style = {{
			// position: 'fixed',
			// inset: 0
			height: '500px'
		}}>
			<Tldraw
				// hideUi = {true}
				onMount = {handleMount}
			/>
		</div>
	</>;
};



// Steps for react:
// npm install react react-dom
// npm install --save-dev @types/react @types/react-dom
// Add to tsconfig.json
// {
//   "compilerOptions": {
//     "jsx": "react"
//   }
// }