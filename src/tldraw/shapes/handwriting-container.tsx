import { Rectangle2d, SVGContainer, TLBaseShape, TLOnResizeHandler, resizeBox } from '@tldraw/tldraw';
import { HTMLContainer, ShapeUtil } from '@tldraw/tldraw';
import * as React from 'react';


//////////
//////////


type HandwritingContainer = TLBaseShape<'handwriting-container', { w: number; h: number }>


export default class HandwritingContainerUtil extends ShapeUtil<HandwritingContainer> {
	static override type = 'handwriting-container' as const

	getDefaultProps(): HandwritingContainer['props'] {

		// canEdit: false,
		// canBind: false,
		// hideRotateHandle: true,

		return {
			w: 100,
			h: 100,
		}
	}

	getGeometry(shape: HandwritingContainer) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,	// Controls whether you can select the shape by clicking the inside (Not whether it's visibly filled)
		})
	}

	component(shape: HandwritingContainer) {
		return <SVGContainer>
			<rect
				width = {shape.props.w}
				height = {shape.props.h}
				rx = {20}
				ry = {20}
				style = {{
					stroke: 'rgba(127.5, 127.5, 127.5, 1)',
					fill: 'rgba(127.5, 127.5, 127.5, 0.01)',
				}}
			/>
		</SVGContainer>
		
		// return <HTMLContainer>Hello</HTMLContainer>
	}

	indicator(shape: HandwritingContainer) {
		return <>
			<rect
				// width = {shape.props.w}
				// height = {shape.props.h}
				width = {shape.props.w}
				height = {shape.props.h}
				rx = {20}
				ry = {20}
			/>
		</>
	}

	override onResize: TLOnResizeHandler<HandwritingContainer> = (shape, info) => {
		return resizeBox(shape, info)
	}

	onResizeEnd = (initial: HandwritingContainer, current: HandwritingContainer) => {
		console.log('initial', initial);
		console.log('current', current);

		// editor.updateShapes<MyShapeWithMeta>([
		// 	{
		// 		id: myGeoShape.id,
		// 		type: 'geo',
		// 		meta: {
		// 			createdBy: 'Steve',
		// 		},
		// 	},
		// ])
		// current.props.w;
	}
}