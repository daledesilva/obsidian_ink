import { Rectangle2d, SVGContainer, TLBaseShape, TLOnResizeHandler, TLOnTranslateHandler, resizeBox } from '@tldraw/tldraw';
import { HTMLContainer, ShapeUtil } from '@tldraw/tldraw';
import * as React from 'react';


//////////
//////////


type PlaceholderDraw = TLBaseShape<'placeholder-draw', { x: number, y: number, w: number }>

export const PAGE_WIDTH = 2000;
export const LINE_HEIGHT = 150;
export const NEW_LINE_REVEAL_HEIGHT = LINE_HEIGHT * 1.5;


export default class PlaceholderDrawUtil extends ShapeUtil<PlaceholderDraw> {
	static override type = 'placeholder-draw' as const

	getDefaultProps(): PlaceholderDraw['props'] {
		return {
			x: 0,
			y: 0,
			w: 0,
		}
	}

	getGeometry(shape: PlaceholderDraw) {
		return new Rectangle2d({
			width: shape.props.w,
			height: 10,
			isFilled: true,
		})
	}

	// Don't let arrows lor lines bind one of their ends to it
	override canBind = (shape: PlaceholderDraw) => false

	// Prevent rotating
	override hideRotateHandle = (shape: PlaceholderDraw) => true
	
	// Prevent moving
	onTranslate: TLOnTranslateHandler<PlaceholderDraw> = (initShape, newShape) => {
		return initShape;
	}
	
	// Prevent resizing horizontally
	// onResize: TLOnResizeHandler<PlaceholderDraw> = (shape, info) => {
	// 	return resizeBox(shape, info, {
	// 		minWidth: PAGE_WIDTH,
	// 		maxWidth: PAGE_WIDTH,
	// 		minHeight: NEW_LINE_REVEAL_HEIGHT,
	// 		maxHeight: 50000
	// 	});
	// }

	component(shape: PlaceholderDraw) {

		return <></>
		// <SVGContainer>
			{/* <rect
				width = {100 || shape.props.w}
				height = {10}
				rx = {10}
				ry = {10}
				stroke = 'rgba(127.5, 127.5, 127.5, 0.2)'
				strokeWidth = '1px'
				fill = 'rgba(127.5, 127.5, 127.5, 0.1)'
			/> */}
		// </SVGContainer>
	}

	indicator(shape: PlaceholderDraw) {
		return <>
			<rect
				width = {100 || shape.props.w}
				height = {10}
				rx = {10}
				ry = {10}
			/>
		</>
	}

}