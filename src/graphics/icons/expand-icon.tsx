import * as React from "react";

/////
/////

// https://fonts.google.com/icons?selected=Material%20Symbols%20Rounded%3Aopen_in_full%3AFILL%400%3Bwght%40400%3BGRAD%400%3Bopsz%4024

export const ExpandIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        height={24}
        viewBox="0 -960 960 960"
        width={24}
        {...props}
    >
        <path d="M200-200v-240h80v160h160v80H200Zm480-320v-160H520v-80h240v240h-80Z" />
    </svg>
);
