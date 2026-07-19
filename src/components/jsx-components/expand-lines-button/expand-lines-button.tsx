import "./expand-lines-button.scss";
import * as React from "react";
import { ChevronDownIcon } from "src/graphics/icons/chevron-down-icon";
import { TooltipButton } from "src/components/jsx-components/tooltip-button/tooltip-button";

//////////
//////////

interface ExpandLinesButtonProps {
    onExpandLines: () => void,
}

export const ExpandLinesButton: React.FC<ExpandLinesButtonProps> = (props) => {
    return <>
        <div className='ink_expand-lines-button'>
            <TooltipButton
                tooltip='Add more lines'
                onClick={props.onExpandLines}
            >
                <ChevronDownIcon />
            </TooltipButton>
        </div>
    </>;
};
