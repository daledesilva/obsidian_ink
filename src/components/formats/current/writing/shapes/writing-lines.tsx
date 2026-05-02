import { Rectangle2d, SVGContainer, SvgExportContext, TLBaseShape, TLOnResizeHandler, TLOnTranslateHandler, TLShapeUtilCanBindOpts, resizeBox } from '@tldraw/tldraw';
import { ShapeUtil } from '@tldraw/tldraw';
import * as React from 'react';
import { WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import { getLineHeightFromEditor } from 'src/components/formats/current/utils/tldraw-helpers';
import { info } from 'src/logic/utils/log-to-console';

//////////
//////////

export type WritingLines = TLBaseShape<'writing-lines', { x: number, y: number, w: number, h: number }>

export class WritingLinesUtil extends ShapeUtil<WritingLines> {
	static override type = 'writing-lines' as const

	getDefaultProps(): WritingLines['props'] {
		return {
			x: 0,
			y: 0,
			w: WRITING_PAGE_WIDTH,
			h: WRITING_MIN_PAGE_HEIGHT,
		}
	}

	getGeometry(shape: WritingLines) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: false,	// Controls whether you can select the shape by clicking the inside (Not whether it's visibly filled)
		})
	}

	// Don't let arrows lor lines bind one of their ends to it
	override canBind = (opts: TLShapeUtilCanBindOpts<WritingLines>) => false

	// Prevent rotating the container
	override hideRotateHandle = (shape: WritingLines) => true
	
	// Prevent moving the container
	onTranslate: TLOnTranslateHandler<WritingLines> = (initShape, newShape) => {
		return initShape;
	}
	
	// Prevent resizing horizontally
	onResize: TLOnResizeHandler<WritingLines> = (shape, info) => {
		const lineHeight = getLineHeightFromEditor(this.editor);
		const minPageHeight = lineHeight * 2.5;
		return resizeBox(shape, info, {
			minWidth: WRITING_PAGE_WIDTH,
			maxWidth: WRITING_PAGE_WIDTH,
			minHeight: minPageHeight,
			maxHeight: 50000
		});
	}

	indicator(shape: WritingLines) {
		return <>
			<rect
				width = {shape.props.w}
				height = {shape.props.h}
				rx = {20}
				ry = {20}
			/>
		</>
	}

	component(shape: WritingLines) {
		const lineHeight = getLineHeightFromEditor(this.editor);
		const numberOfLines = Math.floor(shape.props.h / lineHeight);
		info(['WritingLinesUtil.component RENDER', {
			shapeH: shape.props.h,
			shapeW: shape.props.w,
			lineHeight,
			numberOfLines,
			shapeId: shape.id,
		}]);
		return <SVGContainer>
			{this.createSvg(shape)}
		</SVGContainer>
	}

	toSvg(shape: WritingLines, ctx: SvgExportContext): React.JSX.Element {
		return this.createSvg(shape);
	}

	// Custom functions
	//////////////

	createSvg(shape: WritingLines): React.JSX.Element {
		const lineHeight = getLineHeightFromEditor(this.editor);
		const numberOfLines = Math.floor(shape.props.h / lineHeight);
		const margin = 0.05 * shape.props.w;
		this.isAspectRatioLocked(shape);

		const lines = Array.from({ length: numberOfLines }, (_, index) => (
		<line
				key = {index}
				x1 = {margin}
				y1 = {(index+1) * lineHeight}
				x2 = {shape.props.w - margin}
				y2 = {(index+1) * lineHeight}
				// NOTE: Styling is done through CSS
			/>
		));

		return <>
			{lines}
		</>
	}

	

}