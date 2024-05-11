import { Rectangle2d, SVGContainer, SvgExportContext, TLBaseShape, TLOnResizeHandler, TLOnTranslateHandler, resizeBox } from '@tldraw/tldraw';
import { ShapeUtil } from '@tldraw/tldraw';
import * as React from 'react';
import { WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';

//////////
//////////

type WritingContainer = TLBaseShape<'handwriting-container', { x: number, y: number, w: number, h: number }>

export class WritingContainerUtil extends ShapeUtil<WritingContainer> {
	static override type = 'handwriting-container' as const

	getDefaultProps(): WritingContainer['props'] {
		return {
			x: 0,
			y: 0,
			w: WRITING_PAGE_WIDTH,
			h: WRITING_MIN_PAGE_HEIGHT,
		}
	}

	getGeometry(shape: WritingContainer) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: false,	// Controls whether you can select the shape by clicking the inside (Not whether it's visibly filled)
		})
	}

	// Don't let arrows lor lines bind one of their ends to it
	override canBind = (shape: WritingContainer) => false

	// Prevent rotating the container
	override hideRotateHandle = (shape: WritingContainer) => true
	
	// Prevent moving the container
	onTranslate: TLOnTranslateHandler<WritingContainer> = (initShape, newShape) => {
		return initShape;
	}
	
		// Prevent resizing horizontally
	onResize: TLOnResizeHandler<WritingContainer> = (shape, info) => {
		return resizeBox(shape, info, {
			minWidth: WRITING_PAGE_WIDTH,
			maxWidth: WRITING_PAGE_WIDTH,
			minHeight: WRITING_MIN_PAGE_HEIGHT,
			maxHeight: 50000
		});
	}

	indicator(shape: WritingContainer) {
		return <>
			<rect
				width = {shape.props.w}
				height = {shape.props.h}
				rx = {20}
				ry = {20}
			/>
		</>
	}

	component(shape: WritingContainer) {
		return <SVGContainer>
			{this.createSvg(shape)}
		</SVGContainer>
	}
	
	toSvg(shape: WritingContainer, ctx: SvgExportContext): React.JSX.Element {
		return this.createSvg(shape);
	}

	// Custom functions
	//////////////

	createSvg(shape: WritingContainer) {
		this.isAspectRatioLocked(shape);

		return <>
			<rect
				width = {shape.props.w}
				height = {shape.props.h}
				rx = {20}
				ry = {20}
				stroke = 'rgba(127.5, 127.5, 127.5, 0.2)'
				strokeWidth = '1px'
				fill = 'rgba(127.5, 127.5, 127.5, 0.02)'
			/>
		</>
	}

}