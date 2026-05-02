import "./expand-lines-button.scss";
import * as React from "react";
import { ChevronDownIcon } from "src/graphics/icons/chevron-down-icon";

//////////
//////////

interface ExpandLinesButtonProps {
    onExpandLines: () => void,
}

export const ExpandLinesButton: React.FC<ExpandLinesButtonProps> = (props) => {
    return <>
        <div className='ink_expand-lines-button'>
            <button
                onPointerDown={props.onExpandLines}
            >
                <ChevronDownIcon />
            </button>
        </div>
    </>;
};
