import { Rectangle2d, SVGContainer, SvgExportContext, TLBaseShape, TLOnResizeHandler, TLOnTranslateHandler, TLShapeUtilCanBindOpts, resizeBox } from '@tldraw/tldraw';
import { ShapeUtil } from '@tldraw/tldraw';
import * as React from 'react';
import { WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';

//////////
//////////

export type WritingContainer_v1 = TLBaseShape<'writing-container', { w: number, h: number }>


export class WritingContainerUtil_v1 extends ShapeUtil<WritingContainer_v1> {
	static override type = 'writing-container' as const

	getDefaultProps(): WritingContainer_v1['props'] {
		return {
			w: WRITING_PAGE_WIDTH,
			h: WRITING_MIN_PAGE_HEIGHT,
		}
	}

	getGeometry(shape: WritingContainer_v1) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: false,	// Controls whether you can select the shape by clicking the inside (Not whether it's visibly filled)
		})
	}

	component(shape: WritingContainer_v1) {
		return <SVGContainer>
			{this.createSvg(shape)}
		</SVGContainer>
	}
	
	indicator(shape: WritingContainer_v1) {
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
	override canBind = (opts: TLShapeUtilCanBindOpts<WritingContainer_v1>) => false

	// Prevent rotating the container
	override hideRotateHandle = (shape: WritingContainer_v1) => true
	
	// Prevent moving the container
	onTranslate: TLOnTranslateHandler<WritingContainer_v1> = (initShape, newShape) => {
		return initShape;
	}
	
	// Prevent resizing horizontally
	onResize: TLOnResizeHandler<WritingContainer_v1> = (shape, info) => {
		return resizeBox(shape, info, {
			minWidth: WRITING_PAGE_WIDTH,
			maxWidth: WRITING_PAGE_WIDTH,
			minHeight: WRITING_MIN_PAGE_HEIGHT,
			maxHeight: 50000
		});
	}
	
	toSvg(shape: WritingContainer_v1, ctx: SvgExportContext): React.JSX.Element {
		return this.createSvg(shape);
	}

	// Custom functions
	//////////////

	createSvg(shape: WritingContainer_v1) {
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