import { Rectangle2d, SVGContainer, SvgExportContext, TLBaseShape, TLShapeUtilCanBindOpts, resizeBox } from 'tldraw';
import { ShapeUtil } from 'tldraw';
import * as React from 'react';
import { WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';

//////////
//////////

export type WritingLines_v1 = TLBaseShape<'writing-lines', { x: number, y: number, w: number, h: number }>


export class WritingLinesUtil_v1 extends ShapeUtil<WritingLines_v1> {
	static type = 'writing-lines' as const

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
			x: shape.props.x,
			y: shape.props.y,
			width: shape.props.w,
			height: shape.props.h,
			isFilled: false,	// Controls whether you can select the shape by clicking the inside (Not whether it's visibly filled)
		})
	}

	component(shape: WritingLines_v1) {
		return <SVGContainer>
			{this.createSvg(shape)}
		</SVGContainer>
	}
	
	indicator(shape: WritingLines_v1) {
		return <>
			<rect
				x = {shape.props.x}
				y = {shape.props.y}
				width = {shape.props.w}
				height = {shape.props.h}
				rx = {20}
				ry = {20}
			/>
		</>
	}

	// Don't let arrows or lines bind one of their ends to it
	canBind = (opts: TLShapeUtilCanBindOpts<WritingLines_v1>) => false

	// Prevent rotating the container
	hideRotateHandle = (shape: WritingLines_v1) => true
	
	// Prevent moving the container
	onTranslate = (shape: WritingLines_v1, delta: { x: number, y: number }) => {
		return shape;
	}
	
	// Prevent resizing horizontally
	onResize = (shape: WritingLines_v1, info: any) => {
		return resizeBox(shape, info, {
			minWidth: WRITING_PAGE_WIDTH,
			maxWidth: WRITING_PAGE_WIDTH,
			minHeight: WRITING_MIN_PAGE_HEIGHT,
			maxHeight: 50000
		});
	}
	
	toSvg(shape: WritingLines_v1, ctx: SvgExportContext): React.JSX.Element {
		return this.createSvg(shape);
	}

	// Custom functions
	//////////////

	createSvg(shape: WritingLines_v1) {

		// Create a grid of lines
		const lines = [];
		const lineCount = Math.floor(shape.props.h / WRITING_LINE_HEIGHT);

		for (let i = 0; i < lineCount; i++) {
			const y = i * WRITING_LINE_HEIGHT;
			lines.push(
				<line
					key = {i}
					x1 = {0}
					y1 = {y}
					x2 = {shape.props.w}
					y2 = {y}
					stroke = "#E5E7EB"
					strokeWidth = "1"
				/>
			);
		}

		return <>
			<g transform={`translate(${shape.props.x}, ${shape.props.y})`}>
				{lines}
			</g>
		</>
	}

}