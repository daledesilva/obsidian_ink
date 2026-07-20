import { Rectangle2d, SVGContainer, SvgExportContext, TLBaseShape, TLOnResizeHandler, TLOnTranslateHandler, TLShapeUtilCanBindOpts, resizeBox } from '@tldraw/tldraw';
import { ShapeUtil } from '@tldraw/tldraw';
import * as React from 'react';
import { WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';

//////////
//////////

export type WritingContainer = TLBaseShape<'writing-container', { w: number, h: number }>


export class WritingContainerUtil extends ShapeUtil<WritingContainer> {
	static override type = 'writing-container' as const

	getDefaultProps(): WritingContainer['props'] {
		return {
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

	component(shape: WritingContainer) {
		return <SVGContainer>
			{this.createSvg(shape)}
		</SVGContainer>
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

	// Playing with unlocking and locking automatically
	// onBeforeUpdate = (shapePrior: WritingContainer, shapeAfter: WritingContainer) => {
	// 	return {
	// 		...shapePrior,
	// 		isLocked: false,
	// 	}
	// }

	// Don't let arrows or lines bind one of their ends to it
	override canBind = (opts: TLShapeUtilCanBindOpts<WritingContainer>) => false

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
				opacity = {0}
				// Not styled as it's used just for spacing
			/>
		</>
	}

}