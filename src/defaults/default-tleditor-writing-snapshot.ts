import { SerializedStore, TLEditorSnapshot, TLPageId, TLRecord } from "@tldraw/tldraw";
import { WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from "src/constants";

/////
/////

export const defaultTLEditorWritingSnapshot: TLEditorSnapshot = {
    "document": {
        "store": {
            "document:document": {
                "gridSize": 10,
                "name": "",
                "meta": {},
                "id": "document:document",
                "typeName": "document"
            },
            "page:3qj9EtNgqSCW_6knX2K9_": {
                "meta": {},
                "id": "page:3qj9EtNgqSCW_6knX2K9_",
                "name": "Handwritten Note",
                "index": "a1",
                "typeName": "page"
            },
            "shape:writing-lines": {
                "x": 0,
                "y": 0,
                "rotation": 0,
                "isLocked": true,
                "opacity": 1,
                "meta": {},
                "type": "writing-lines",
                "parentId": "page:3qj9EtNgqSCW_6knX2K9_",
                "index": "a1",
                "props": {
                    "x": 0,
                    "y": 0,
                    "w": WRITING_PAGE_WIDTH,
                    "h": WRITING_MIN_PAGE_HEIGHT
                },
                "id": "shape:writing-lines",
                "typeName": "shape"
            },
            "shape:writing-container": {
                "x": 0,
                "y": 0,
                "rotation": 0,
                "isLocked": true,
                "opacity": 1,
                "meta": {},
                "type": "writing-container",
                "parentId": "page:3qj9EtNgqSCW_6knX2K9_",
                "index": "a1",
                "props": {
                    "x": 0,
                    "y": 0,
                    "w": WRITING_PAGE_WIDTH,
                    "h": WRITING_MIN_PAGE_HEIGHT
                },
                "id": "shape:writing-container",
                "typeName": "shape"
            },
		} as SerializedStore<TLRecord>,
        "schema": {
            "schemaVersion": 1,
            "storeVersion": 4,
            "recordVersions": {
                "asset": {
                    "version": 1,
                    "subTypeKey": "type",
                    "subTypeVersions": {
                        "image": 2,
                        "video": 2,
                        "bookmark": 0
                    }
                },
                "camera": {
                    "version": 1
                },
                "document": {
                    "version": 2
                },
                "instance": {
                    "version": 21
                },
                "instance_page_state": {
                    "version": 5
                },
                "page": {
                    "version": 1
                },
                "shape": {
                    "version": 3,
                    "subTypeKey": "type",
                    "subTypeVersions": {
                        "group": 0,
                        "text": 1,
                        "bookmark": 1,
                        "draw": 1,
                        "geo": 7,
                        "note": 4,
                        "line": 1,
                        "frame": 0,
                        "arrow": 1,
                        "highlight": 0,
                        "embed": 4,
                        "image": 2,
                        "video": 1,
                        "writing-container": 0
                    }
                },
                "instance_presence": {
                    "version": 5
                },
                "pointer": {
                    "version": 1
                }
            }
        }
    },
    "session": {
        "version": 0,
        "currentPageId": "page:writingPage1" as TLPageId,
        "exportBackground": true,
        "isFocusMode": false,
        "isDebugMode": true,
        "isToolLocked": false,
        "isGridMode": false,
        "pageStates": [
            {
                "pageId": "page:writingPage1" as TLPageId,
                "camera": {
                    "x": 0,
                    "y": 100,
                    "z": 0.376
                },
                "selectedShapeIds": [],
                "focusedGroupId": null
            }
        ]
    }
}