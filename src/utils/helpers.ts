
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
