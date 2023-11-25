const defaultHandwritingTldrawStore = {
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
            "name": "Page 1",
            "index": "a1",
            "typeName": "page"
        },
        "page:page2": {
            "meta": {},
            "id": "page:page2",
            "name": "Page",
            "index": "a3",
            "typeName": "page"
        },
        "asset:imageAssetA": {
            "type": "image",
            "props": {
                "w": 1200,
                "h": 800,
                "name": "",
                "isAnimated": false,
                "mimeType": "png",
                "src": ""
            },
            "meta": {},
            "id": "asset:imageAssetA",
            "typeName": "asset"
        }
    },
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
                    "video": 1
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
}

export default defaultHandwritingTldrawStore;