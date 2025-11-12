import { SerializedStore, TLEditorSnapshot, TLPageId, TLRecord } from 'tldraw';

////////////////////
////////////////////

export const DEFAULT_TLEDITOR_DRAWING_SNAPSHOT: TLEditorSnapshot = {
    "document": {
		"store": {
			"document:document": {
				"gridSize": 10,
				"name": "",
				"meta": {},
				"id": "document:document",
				"typeName": "document"
			},
			"page:page1": {
			"meta": {},
			"id": "page:page1",
			"name": "Handwritten Note",
			"index": "a1",
			"typeName": "page"
		},
		} as SerializedStore<TLRecord>,
		"schema": {
			"schemaVersion": 2,
			"sequences": {
				"com.tldraw.store": 4,
				"com.tldraw.asset": 1,
				"com.tldraw.camera": 1,
				"com.tldraw.document": 2,
				"com.tldraw.instance": 25,
				"com.tldraw.instance_page_state": 5,
				"com.tldraw.page": 1,
				"com.tldraw.instance_presence": 5,
				"com.tldraw.pointer": 1,
				"com.tldraw.shape": 4,
				"com.tldraw.asset.bookmark": 2,
				"com.tldraw.asset.image": 5,
				"com.tldraw.asset.video": 5,
				"com.tldraw.shape.group": 0,
				"com.tldraw.shape.text": 2,
				"com.tldraw.shape.bookmark": 2,
				"com.tldraw.shape.draw": 2,
				"com.tldraw.shape.geo": 9,
				"com.tldraw.shape.note": 7,
				"com.tldraw.shape.line": 5,
				"com.tldraw.shape.frame": 0,
				"com.tldraw.shape.arrow": 5,
				"com.tldraw.shape.highlight": 1,
				"com.tldraw.shape.embed": 4,
				"com.tldraw.shape.image": 4,
				"com.tldraw.shape.video": 2
			}
		}
	},
	"session": {
		"version": 0,
		"currentPageId": "page:page1" as TLPageId,
		"exportBackground": true,
		"isFocusMode": false,
		"isDebugMode": true,
		"isToolLocked": false,
		"isGridMode": true,
		"pageStates": [
			{
				"pageId": "page:page1" as TLPageId,
				"camera": {
					"x": 0,
					"y": 0,
					"z": 0.3, // Doesn't seem to have an effect here. SO applied in post as well.
				},
				"selectedShapeIds": [],
				"focusedGroupId": null
			}
		]
	}
}