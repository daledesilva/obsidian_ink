import "./style-menu.scss";
import { InkCanvasEditor } from 'src/ink-canvas/types';
import * as React from 'react';
import classNames from 'classnames';
import { TooltipButton } from 'src/components/jsx-components/tooltip-button/tooltip-button';
import { getEditor } from "src/logic/undo-redo/ink-editor-registry";


export const STROKE_COLORS = [
    // Neutrals
    { name: 'White', value: '#FFFFFF', darkColor: '#f3f3f3' },
    { name: 'Gray', value: '#9fa8b2', darkColor: '#9398b0' },
    { name: 'Black', value: '#1d1d1d', darkColor: '#1d1d1d' },

    // Reds
    { name: 'Red', value: '#e03131', darkColor: '#e03131' },
    { name: 'Light Red', value: '#f87777', darkColor: '#ff8787' },

    // Orange & Yellow
    { name: 'Orange', value: '#e16919', darkColor: '#f76707' },
    { name: 'Yellow', value: '#f1ac4b', darkColor: '#ffc034' },

    // Greens
    { name: 'Green', value: '#099268', darkColor: '#099268' },
    { name: 'Light Green', value: '#4cb05e', darkColor: '#40c057' },

    // Blues
    { name: 'Blue', value: '#4465e9', darkColor: '#4f72fc' },
    { name: 'Light Blue', value: '#4ba1f1', darkColor: '#4dabf7' },

    // Violets
    { name: 'Violet', value: '#ae3ec9', darkColor: '#ae3ec9' },
    { name: 'Light Violet', value: '#e085f4', darkColor: '#e599f7' },
];

export const STROKE_SIZES = [
	{ name: 'XS', size: 2 },
	{ name: 'S', size: 4 },
	{ name: 'M', size: 6 },
	{ name: 'L', size: 8 },
	{ name: 'XL', size: 10 },
	{ name: '2XL', size: 12 },
	{ name: '3XL', size: 14 },
	{ name: '4XL', size: 16 },
	{ name: '5XL', size: 18 },
	{ name: '6XL', size: 20 },
];

// Define Dash options
export const STROKE_DASHES = [
    { name: 'Solid', value: 'solid', preview: '—' },
    { name: 'Dashed', value: 'dashed', preview: '- -' },
    { name: 'Dotted', value: 'dotted' , preview: '•••'},
];

interface StyleMenuProps {
    getEditor: () => InkCanvasEditor | undefined;
    onStoreChange: () => void;
}


export const StyleMenu = React.forwardRef<HTMLDivElement, StyleMenuProps>((props, ref) => {

    const [showColorPicker, setShowColorPicker] = React.useState<boolean>(false);
    const [showSizePicker, setShowSizePicker] = React.useState<boolean>(false);
    const [showDashPicker, setShowDashPicker] = React.useState<boolean>(false);
    const [isDrawTool, setisDrawTool] = React.useState<boolean>(true);

    const [currentColor, setCurrentColor] = React.useState<string>(STROKE_COLORS[0].value);
    const [currentSize, setCurrentSize] = React.useState<number>(STROKE_SIZES[3].size);
    const [currentDash, setCurrentDash] = React.useState<string>(STROKE_DASHES[0].value);


    React.useEffect(() => {
        const editor = props.getEditor();
        if (!editor) return;

        setisDrawTool(editor.getCurrentTool() === "draw");

        const unsubscribe = editor.subscribeToolChange((inkTool) => {
            setisDrawTool(inkTool === "draw");
        });

        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            } 
        };
    }, [props]);

    function selectColor(color: string) {
        const editor = props.getEditor();
		if (!editor) return;

        editor.setStrokeStyle({color: color});

		setCurrentColor(color);
		setShowColorPicker(false);
	}

    function selectSize(size: number) {
        const editor = props.getEditor();
		if (!editor) return;

        editor.setStrokeStyle({size: size});

		setCurrentSize(size);
		setShowSizePicker(false);
	}

    function selectDash(dash: any) {
        const editor = props.getEditor();
		if (!editor) return;

        editor.setStrokeStyle({dash: dash});

		setCurrentDash(dash);
		setShowDashPicker(false);
	}

    return <>
        <div
            ref = {ref}
            className = {classNames([
                'ink_menu-bar',
                'ink_menu-bar_floating'
            ])}
        >
            <div className={classNames([
                'ink_style-menu',
                isDrawTool ? 'ink_visible' : 'ink_hidden'
                ])}
            >
				{/* Color picker button */}
		    	<div className='ink_style-menu-item'>
		    		<TooltipButton
		    			tooltip='Color-Picker'
                        className='ink_size-button'
		    		    onClick={() => {
                            setShowSizePicker(false);
                            setShowDashPicker(false);
                            setShowColorPicker(!showColorPicker);
                        }}
    				>
    					<div
    						className='ink_color-indicator'
    						style={{ backgroundColor: currentColor }}
    					/>
					</TooltipButton>
                    {showColorPicker && (
						<div className='ink_style-picker ink_color-picker'>
							{STROKE_COLORS.map((color) => (
								<TooltipButton
									key={color.name}
									className={classNames([
										'ink_color-option',
                                        currentColor === color.value && 'ink_active'
									])}
									style={{ backgroundColor: color.value }}
									onClick={() => selectColor(color.value)}
									tooltip={color.name}
								/>
							))}
						</div>
					)}
				</div>
                    
                {/* Stroke size picker button */}
				<div className='ink_style-menu-item'>
					<TooltipButton
						tooltip='Stroke-Size'
					    onClick={() => {
                            setShowColorPicker(false);
                            setShowDashPicker(false);
                            setShowSizePicker(!showSizePicker);
                        }}
                        className='ink_size-button'
					>
						<div className='ink_size-indicator'>
							<div
								className='ink_size-line'
								style={{ height: `${currentSize * 0.05}em` }}
							/>
						</div>
					</TooltipButton>
                    {showSizePicker && (
						<div className='ink_style-picker ink_size-picker'>
							{STROKE_SIZES.map((size) => (
								<TooltipButton
									key={size.size}
									className={classNames([
										'ink_size-option',
										currentSize === size.size && 'ink_active'
									])}
									onClick={() => selectSize(size.size)}
									tooltip={`${size.name} - ${size.size}`}
								>
									<div
										className='ink_size-line'
										style={{ height: `${size.size * 0.05}em` }}
									/>
								</TooltipButton>
							))}
						</div>
					)}
				</div>
                {/* Dash style picker button */}
				<div className='ink_style-menu-item'>
					<TooltipButton
						tooltip='Line-Style'
					    onClick={() => {
                            setShowColorPicker(false);
                            setShowSizePicker(false);
                            setShowDashPicker(!showDashPicker);
                           }}
                           className='ink_dash-button'
					>
				        <div className='ink_dash-indicator'>
							{currentDash === 'solid' ? '—' : currentDash === 'dashed' ? '- -' : '•••'}
						</div>
					</TooltipButton>
                    {showDashPicker && (
						<div className='ink_style-picker ink_dash-picker'>
							{STROKE_DASHES.map((dash) => (
								<TooltipButton
									key={dash.value}
									className={classNames([
										'ink_dash-option',
										currentDash === dash.value && 'ink_active'
									])}
									onClick={() => selectDash(dash.value)}
									tooltip={dash.name}
								>
									<div className='ink_dash-indicator'>
										{dash.preview}
									</div>
								</TooltipButton>
							))}
						</div>
					)}
				</div>
			</div>
        </div>
    </>;
});