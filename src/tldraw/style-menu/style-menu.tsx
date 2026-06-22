import "./style-menu.scss";
import * as React from "react";
import { Editor, DefaultColorStyle, DefaultSizeStyle } from "@tldraw/tldraw";
import classNames from "classnames";

//////////
//////////

export const STROKE_COLORS = [
	{ name: 'Black', value: 'black', lightColor: '#1d1d1d', darkColor: '#f2f2f2' },
	{ name: 'Gray', value: 'grey', lightColor: '#9fa8b2', darkColor: '#9398b0' },
	{ name: 'Light Violet', value: 'light-violet', lightColor: '#e085f4', darkColor: '#e599f7' },
	{ name: 'Violet', value: 'violet', lightColor: '#ae3ec9', darkColor: '#ae3ec9' },
	{ name: 'Blue', value: 'blue', lightColor: '#4465e9', darkColor: '#4f72fc' },
	{ name: 'Light Blue', value: 'light-blue', lightColor: '#4ba1f1', darkColor: '#4dabf7' },
	{ name: 'Yellow', value: 'yellow', lightColor: '#f1ac4b', darkColor: '#ffc034' },
	{ name: 'Orange', value: 'orange', lightColor: '#e16919', darkColor: '#f76707' },
	{ name: 'Green', value: 'green', lightColor: '#099268', darkColor: '#099268' },
	{ name: 'Light Green', value: 'light-green', lightColor: '#4cb05e', darkColor: '#40c057' },
	{ name: 'Light Red', value: 'light-red', lightColor: '#f87777', darkColor: '#ff8787' },
	{ name: 'Red', value: 'red', lightColor: '#e03131', darkColor: '#e03131' },
	{ name: 'White', value: 'white', lightColor: '#FFFFFF', darkColor: '#f3f3f3' },
];

export const STROKE_SIZES = [
	{ name: 'XS', value: 's', size: 1 },
	{ name: 'S', value: 's', size: 2 },
	{ name: 'M', value: 'm', size: 3 },
	{ name: 'L', value: 'l', size: 4 },
	{ name: 'XL', value: 'xl', size: 5 },
	{ name: '2XL', value: 'xl', size: 6 },
	{ name: '3XL', value: 'xl', size: 7 },
	{ name: '4XL', value: 'xl', size: 8 },
	{ name: '5XL', value: 'xl', size: 9 },
	{ name: '6XL', value: 'xl', size: 10 },
];

interface StyleMenuProps {
    getTlEditor: () => Editor | undefined,
    onStoreChange: (elEditor: Editor) => void,
}

export const StyleMenu = React.forwardRef<HTMLDivElement, StyleMenuProps>((props, ref) => {

	const [currentColor, setCurrentColor] = React.useState<string>(STROKE_COLORS[0].value);
	const [currentSize, setCurrentSize] = React.useState<number>(STROKE_SIZES[2].size); // Default to medium
	const [showColorPicker, setShowColorPicker] = React.useState<boolean>(false);
	const [showSizePicker, setShowSizePicker] = React.useState<boolean>(false);

    ///////////

	// Helper function to get the display color based on current theme
	function getDisplayColor(colorValue: string): string {
		const isDarkMode = document.body.classList.contains('theme-dark');
		const colorObj = STROKE_COLORS.find(c => c.value === colorValue);
		if (!colorObj) return '#000000';
		return isDarkMode ? colorObj.darkColor : colorObj.lightColor;
	}

    function selectColor(color: string) {
		const editor = props.getTlEditor();
		if (!editor) return;

		// Set the color for next shapes to be drawn
		editor.setStyleForNextShapes(DefaultColorStyle, color);
		setCurrentColor(color);
		setShowColorPicker(false);
	}

	function selectSize(size: number) {
		const editor = props.getTlEditor();
		if (!editor) return;

		// Set the stroke size for next shapes to be drawn
		// tldraw uses 's', 'm', 'l', 'xl' for sizes, we'll map our sizes to these
		let sizeValue: 's' | 'm' | 'l' | 'xl';
		if (size <= 2) sizeValue = 's';
		else if (size <= 4) sizeValue = 'm';
		else if (size <= 7) sizeValue = 'l';
		else sizeValue = 'xl';

		editor.setStyleForNextShapes(DefaultSizeStyle, sizeValue);
		setCurrentSize(size);
		setShowSizePicker(false);
	}

    ///////////
    ///////////

    return <>
        <div
            ref = {ref}
            className = {classNames([
                'ink_menu-bar',
                'ink_menu-bar_floating'
            ])}
        >
            <div className='ink_style-menu'>
				{/* Color picker button */}
				<div className='ink_style-menu-item'>
					<button
						onPointerDown={() => setShowColorPicker(!showColorPicker)}
						className='ink_color-button'
						title='Pen color'
					>
						<div
							className='ink_color-indicator'
							style={{ backgroundColor: getDisplayColor(currentColor) }}
						/>
					</button>
					{showColorPicker && (
						<div className='ink_style-picker ink_color-picker'>
							{STROKE_COLORS.map((color) => (
								<button
									key={color.value}
									className={classNames([
										'ink_color-option',
										currentColor === color.value && 'ink_active'
									])}
									style={{ backgroundColor: getDisplayColor(color.value) }}
									onPointerDown={() => selectColor(color.value)}
									title={color.name}
								/>
							))}
						</div>
					)}
				</div>

				{/* Stroke size picker button */}
				<div className='ink_style-menu-item'>
					<button
						onPointerDown={() => setShowSizePicker(!showSizePicker)}
						className='ink_size-button'
						title='Stroke width'
					>
						<div className='ink_size-indicator'>
							<div
								className='ink_size-line'
								style={{ height: `${currentSize * 0.15}em` }}
							/>
						</div>
					</button>
					{showSizePicker && (
						<div className='ink_style-picker ink_size-picker'>
							{STROKE_SIZES.map((size) => (
								<button
									key={size.size}
									className={classNames([
										'ink_size-option',
										currentSize === size.size && 'ink_active'
									])}
									onPointerDown={() => selectSize(size.size)}
									title={`${size.name} - ${size.size}`}
								>
									<div
										className='ink_size-preview'
										style={{ height: `${size.size * 0.1}em` }}
									/>
								</button>
							))}
						</div>
					)}
				</div>
			</div>
        </div>
    </>;

});

export default StyleMenu;
