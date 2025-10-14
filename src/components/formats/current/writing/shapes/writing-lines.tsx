import * as React from 'react';
import { ShapeUtil, TLBaseShape, Rectangle2d, TLShapeUtilCanBindOpts, resizeBox } from 'tldraw';

// 为缺失的类型添加临时定义
type TLOnTranslateHandler<T extends TLBaseShape<any, any>> = (initShape: T, newShape: T) => T;
type TLOnResizeHandler<T extends TLBaseShape<any, any>> = (shape: T, info: any) => T;
interface SVGContainerProps { children: React.ReactNode }
const SVGContainer: React.FC<SVGContainerProps> = ({ children }) => <div>{children}</div>;
// 使用any来避免SvgExportContext类型不兼容问题
interface SvgExportContext { [key: string]: any }

// 直接定义常量，避免导入问题
const WRITING_LINE_HEIGHT = 150;
const WRITING_MIN_PAGE_HEIGHT = WRITING_LINE_HEIGHT * 1.5;
const WRITING_PAGE_WIDTH = 2000;

//////////
//////////

export type WritingLines = TLBaseShape<'writing-lines', { x: number, y: number, w: number, h: number }>

export class WritingLinesUtil extends ShapeUtil<WritingLines> {
	static type = 'writing-lines' as const

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
	canBind = (opts: TLShapeUtilCanBindOpts<WritingLines>) => false

	// Prevent rotating the container
	hideRotateHandle = (shape: WritingLines) => true
	
	// Prevent moving the container
	onTranslate: TLOnTranslateHandler<WritingLines> = (initShape, newShape) => {
		return initShape;
	}
	
	// Prevent resizing horizontally
	onResize: TLOnResizeHandler<WritingLines> = (shape, info) => {
		return resizeBox(shape, info, {
			minWidth: WRITING_PAGE_WIDTH,
			maxWidth: WRITING_PAGE_WIDTH,
			minHeight: WRITING_MIN_PAGE_HEIGHT,
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
		const numberOfLines = Math.floor(shape.props.h / WRITING_LINE_HEIGHT);
		const margin = 0.05 * shape.props.w;

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