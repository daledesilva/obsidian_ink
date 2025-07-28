import { PLUGIN_KEY } from "src/constants";

/////////
/////////

export const saveLocally = (key: string, value: string | boolean) => {
    if(typeof value === 'boolean') {
        value = value.toString();
    }
    localStorage.setItem(`${PLUGIN_KEY}_${key}`, value);
}

export const fetchLocally = (key: string) => {
    let value: null | string | boolean = localStorage.getItem(`${PLUGIN_KEY}_${key}`);
    if(value === null) return null;
    if(value === 'true') value = true;
    if(value === 'false') value = false;
    return value;
}

export const deleteLocally = (key: string) => {
    localStorage.removeItem(`${PLUGIN_KEY}_${key}`);
}

export const activateNextEmbed = () => {
    saveLocally('activateNextEmbed', true);
}

export const embedShouldActivateImmediately = () => {
    const result = fetchLocally('activateNextEmbed');
    deleteLocally('activateNextEmbed');
    return result;
}