import InkPlugin from "src/main";
import { buildPageFile } from "src/utils/page-file";
import defaultSnapshot from "src/defaults/default-tldraw-drawing-store";
import { DRAW_FILE_EXT, FOLDER_NAME } from "src/constants";




const createNewDrawingFile = async (plugin: InkPlugin) => {
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

    const pathAndBasename = FOLDER_NAME + '/' + filename;
    let version = 1;
    let pathAndVersionedBasename = pathAndBasename;

    while( await plugin.app.vault.adapter.exists(`${pathAndVersionedBasename}.${DRAW_FILE_EXT}`) ) {
        version ++;
		pathAndVersionedBasename = pathAndBasename + ' (' + version + ')';
    }	

    const noteRef = await plugin.app.vault.create(pathAndVersionedBasename + `.${DRAW_FILE_EXT}`, fileContents);
    return noteRef;
}


export default createNewDrawingFile;