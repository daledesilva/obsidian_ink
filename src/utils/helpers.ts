import { Editor, setUserPreferences } from "@tldraw/tldraw";

export function preventTldrawCanvasesCausingObsidianGestures() {
    const tlCanvas = document.getElementsByClassName('tl-canvas')[0] as HTMLDivElement;
    tlCanvas.addEventListener('touchmove', (e: Event) => {
        e.stopPropagation();
    })

    // NOTE: This might be a more appropriate method than above, but I don't know how to get a reference to the event object to stop propogation
    // editor.addListener('event', (e: TLEventInfo) => {
    // 	// if(e instanceof TLPointerEventInfo)
    // 	const str = `type: ${e.type}, name: ${e.name}, isPen: ${e?.isPen}`;
    // 	console.log(e);
    // 	setOutputLog(str);
    // });
}


export function initWritingCamera(editor: Editor, topMarginPx: number = 0) {
    let canvasWidth = editor.getContainer().innerWidth
    let containerMargin = 0;
    let containerWidth = 2000;
    let visibleWidth = containerWidth + 2 * containerMargin;
    const zoom = canvasWidth / visibleWidth;

    // REVIEW: These are currently hard coded to a specific page position
    let x = containerMargin;
    let y = topMarginPx;//containerMargin * 2;  // Pushes canvas down an arbitrary amount to prevent the "exit pen mode" button getting in the way

    // editor.zoomToFit()
    editor.setCamera({
        x: x,
        y: y,
        z: zoom
    })
}


export function initDrawingCamera(editor: Editor) {
    editor.zoomToFit()
}

export function adaptTldrawToObsidianThemeMode() {
    const isDarkMode = document.body.classList.contains('theme-dark');
    if (isDarkMode) {
        setUserPreferences({
            id: 'dummy-id',
            isDarkMode: true
        })
    } else {
        setUserPreferences({
            id: 'dummy-id',
            isDarkMode: false
        })
    }
}


export function removeExtensionAndDotFromFilepath(filepath: string) {
    const dotIndex = filepath.lastIndexOf(".");

    const aDotExists = dotIndex !== -1;
    const lastDotNotInPath = filepath.lastIndexOf("/") < dotIndex;
    if (aDotExists && lastDotNotInPath) {
        return filepath.substring(0, dotIndex);
    } else {
        return filepath;
    }
}