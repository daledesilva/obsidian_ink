import { createTLStore } from "@tldraw/tldraw";
import HandwritePlugin from "src/main";
import { buildPageFile } from "src/utils/page-file";
import defaultSnapshot from "src/defaults/default-handwriting-tldraw-store";




const createNewHandwrittenNote = async (plugin: HandwritePlugin) => {
    const date = new Date();
    let minutes = date.getMinutes().toString();
    let hours = date.getHours();
    let suffix = 'am';

    if(hours>12) {
        hours = hours-12;
        suffix = 'pm';
    }
    if(minutes.length<2) minutes = '0' + minutes;

    let filename = date.getFullYear() + '.' + date.getMonth() + '.' + date.getDate() + ' - ' + hours + '.' + minutes + suffix;
    const fileContents = buildPageFile(defaultSnapshot);

    const pathAndBasename = 'Handwriting/' + filename;
    let version = 1;
    let pathAndVersionedBasename = pathAndBasename;

    while( await plugin.app.vault.adapter.exists(`${pathAndVersionedBasename}.writing`) ) {
        version ++;
		pathAndVersionedBasename = pathAndBasename + ' (' + version + ')';
    }	

    plugin.app.vault.create(pathAndVersionedBasename + '.writing', fileContents);
}


export default createNewHandwrittenNote;