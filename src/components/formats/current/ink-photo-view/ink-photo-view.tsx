import './ink-photo-view.scss';
import * as React from 'react';

//////////
//////////

export interface InkPhotoViewProps {
	sourceImageUrl: string;
}

/**
 * Locked-embed pane that shows the original imported handwriting photo,
 * matching the height of the ink embed frame and auto-adjusting width by aspect ratio.
 */
export const InkPhotoView: React.FC<InkPhotoViewProps> = (props) => {
	return (
		<div className='ddc_ink_photo-view'>
			<img
				className='ddc_ink_photo-view__image'
				src={props.sourceImageUrl}
				alt='Handwriting source photo'
			/>
		</div>
	);
};
