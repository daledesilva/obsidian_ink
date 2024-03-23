import { PLUGIN_KEY } from "src/constants";

/////////
/////////

export const saveLocally = (key: string, value: string) => {
    localStorage.setItem(`${PLUGIN_KEY}_${key}`, value);
}

export const fetchLocally = (key: string) => {
    return localStorage.getItem(`${PLUGIN_KEY}_${key}`);
}