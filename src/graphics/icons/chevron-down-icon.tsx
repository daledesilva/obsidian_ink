import * as React from "react";

/////
/////

// https://fonts.google.com/icons?selected=Material%20Symbols%20Rounded%3Aexpand_more%3AFILL%400%3Bwght%40400%3BGRAD%400%3Bopsz%4024

export const ChevronDownIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        height={24}
        viewBox="0 -960 960 960"
        width={24}
        {...props}
    >
        <path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z" />
    </svg>
);
