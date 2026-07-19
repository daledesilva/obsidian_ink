import { Rectangle2d, SVGContainer, SvgExportContext, TLBaseShape, TLOnResizeHandler, TLOnTranslateHandler, TLShapeUtilCanBindOpts, resizeBox } from '@tldraw/tldraw';
import { ShapeUtil } from '@tldraw/tldraw';
import * as React from 'react';
import { WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';

//////////
//////////

export type WritingLines_v1 = TLBaseShape<'writing-lines', { x: number, y: number, w: number, h: number }>

export class WritingLinesUtil_v1 extends ShapeUtil<WritingLines_v1> {
	static override type = 'writing-lines' as const

	getDefaultProps(): WritingLines_v1['props'] {
		return {
			x: 0,
			y: 0,
			w: WRITING_PAGE_WIDTH,
			h: WRITING_MIN_PAGE_HEIGHT,
		}
	}

	getGeometry(shape: WritingLines_v1) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: false,	// Controls whether you can select the shape by clicking the inside (Not whether it's visibly filled)
		})
	}

	// Don't let arrows lor lines bind one of their ends to it
	override canBind = (opts: TLShapeUtilCanBindOpts<WritingLines_v1>) => false

	// Prevent rotating the container
	override hideRotateHandle = (shape: WritingLines_v1) => true
	
	// Prevent moving the container
	onTranslate: TLOnTranslateHandler<WritingLines_v1> = (initShape, newShape) => {
		return initShape;
	}
	
	// Prevent resizing horizontally
	onResize: TLOnResizeHandler<WritingLines_v1> = (shape, info) => {
		return resizeBox(shape, info, {
			minWidth: WRITING_PAGE_WIDTH,
			maxWidth: WRITING_PAGE_WIDTH,
			minHeight: WRITING_MIN_PAGE_HEIGHT,
			maxHeight: 50000
		});
	}

	indicator(shape: WritingLines_v1) {
		return <>
			<rect
				width = {shape.props.w}
				height = {shape.props.h}
				rx = {20}
				ry = {20}
			/>
		</>
	}

	component(shape: WritingLines_v1) {
		return <SVGContainer>
			{this.createSvg(shape)}
		</SVGContainer>
	}

	toSvg(shape: WritingLines_v1, ctx: SvgExportContext): React.JSX.Element {
		return this.createSvg(shape);
	}

	// Custom functions
	//////////////

	createSvg(shape: WritingLines_v1): React.JSX.Element {
		const numberOfLines = Math.floor(shape.props.h / WRITING_LINE_HEIGHT);
		const margin = 0.05 * shape.props.w;
		this.isAspectRatioLocked(shape);

		const lines = Array.from({ length: numberOfLines }, (_, index) => (
		<line
				key = {index}
				x1 = {margin}
				y1 = {(index+1) * WRITING_LINE_HEIGHT}
				x2 = {shape.props.w - margin}
				y2 = {(index+1) * WRITING_LINE_HEIGHT}
				// NOTE: Styling is done through CSS
			/>
		));

		return <>
			{lines}
		</>
	}

	

}