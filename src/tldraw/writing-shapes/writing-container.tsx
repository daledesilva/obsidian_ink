import { Rectangle2d, SVGContainer, TLBaseShape, TLOnResizeHandler, TLOnTranslateHandler, resizeBox } from '@tldraw/tldraw';
import { ShapeUtil } from '@tldraw/tldraw';
import * as React from 'react';

//////////
//////////

type HandwritingContainer = TLBaseShape<'handwriting-container', { x: number, y: number, w: number, h: number }>

export const PAGE_WIDTH = 2000;
export const LINE_HEIGHT = 150;
export const MIN_PAGE_HEIGHT = LINE_HEIGHT * 1.5;

export default class HandwritingContainerUtil extends ShapeUtil<HandwritingContainer> {
	static override type = 'handwriting-container' as const

	getDefaultProps(): HandwritingContainer['props'] {
		return {
			x: 0,
			y: 0,
			w: PAGE_WIDTH,
			h: MIN_PAGE_HEIGHT,
		}
	}

	getGeometry(shape: HandwritingContainer) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: false,	// Controls whether you can select the shape by clicking the inside (Not whether it's visibly filled)
		})
	}

	// Don't let arrows lor lines bind one of their ends to it
	override canBind = (shape: HandwritingContainer) => false

	// Prevent rotating the container
	override hideRotateHandle = (shape: HandwritingContainer) => true
	
	// Prevent moving the container
	onTranslate: TLOnTranslateHandler<HandwritingContainer> = (initShape, newShape) => {
		return initShape;
	}
	
		// Prevent resizing horizontally
	onResize: TLOnResizeHandler<HandwritingContainer> = (shape, info) => {
		return resizeBox(shape, info, {
			minWidth: PAGE_WIDTH,
			maxWidth: PAGE_WIDTH,
			minHeight: MIN_PAGE_HEIGHT,
			maxHeight: 50000
		});
	}

	component(shape: HandwritingContainer) {
		const numberOfLines = Math.floor(shape.props.h / LINE_HEIGHT);
		const margin = 0.05 * shape.props.w;
		// this.hideRotateHandle(shape);
		this.isAspectRatioLocked(shape);

		const lines = Array.from({ length: numberOfLines }, (_, index) => (
		<line
				key = {index}
				x1 = {margin}
				y1 = {(index+1) * LINE_HEIGHT}
				x2 = {shape.props.w - margin}
				y2 = {(index+1) * LINE_HEIGHT}
				stroke = {'rgba(127.5, 127.5, 127.5, 0.6)'}
				strokeWidth = '1px'
			/>
		));
		return <SVGContainer>
			<rect
				width = {shape.props.w}
				height = {shape.props.h}
				rx = {20}
				ry = {20}
				stroke = 'rgba(127.5, 127.5, 127.5, 0.2)'
				strokeWidth = '1px'
				fill = 'rgba(127.5, 127.5, 127.5, 0.02)'
			/>
			{lines}
		</SVGContainer>
	}

	indicator(shape: HandwritingContainer) {
		return <>
			<rect
				width = {shape.props.w}
				height = {shape.props.h}
				rx = {20}
				ry = {20}
			/>
		</>
	}

}