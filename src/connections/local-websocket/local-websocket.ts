import { verbose } from "src/logic/utils/log-to-console";

/////////////////
/////////////////

let ws: WebSocket | null = null;

/////////////////
interface connectWebSocketProps {
    onConnected: () => void;
    onError?: (error: Event) => void;
    onStrokePoints: (strokePoints: any) => void;
}

export function connectWebSocket(props: connectWebSocketProps) {
    try {
        verbose("Connecting to WebSocket...");
        // const ws = new WebSocket("ws://127.0.0.1:8080/ws"); // Connects but no messages
        // const ws = new WebSocket("ws://localhost:8080/ws"); // Connects but no messages
        // const ws = new WebSocket("http://localhost:8080/ws"); // Connects but no messages
        ws = new WebSocket("ws://192.168.50.186:8080/ws"); // Connects and first message is received but then no more
        // ws = new WebSocket("http://192.168.50.186:8080/ws"); // Connects and first message is received but then no more
    
        ws.onopen = () => {
            if(!ws) return;
            verbose("Connected to WebSocket!"); 
            sendInitMessage();
            props.onConnected();
        };
    
        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            verbose(["Message from server:", message]);
            props.onStrokePoints(message.data);
        };

        ws.onerror = (error) => {
            verbose(["WebSocket error:", error]);
            if (props.onError) props.onError(error);
        };
    } catch (error) {
        verbose("Error connecting to WebSocket:", error);
    }
}


function sendInitMessage() {
    if(!ws) return;

    ws.send(JSON.stringify({
        action: "init",
        data: "Obsidian connected!",
    }));
};

export function sendNewDrawingArea(dimensions: {x: number, y: number, canvasWidth: number, canvasHeight: number, appWidth: number, appHeight: number}) {
    if(!ws) return;
    
    verbose("Sending new drawing area to WebSocket!");
    ws.send(JSON.stringify({
        action: "new-drawing-area",
        data: dimensions,
    }));
};

export function sendUpdateDrawingArea(dimensions: {x: number, y: number, width: number, height: number}) {
    if(!ws) return;
    
    verbose("Sending update drawing area to WebSocket!");
    ws.send(JSON.stringify({
        action: "update-drawing-area",
        data: dimensions,
    }));
};

export function sendCloseDrawingArea() {
    if(!ws) return;
    
    verbose("Sending close drawing area to WebSocket!");
    ws.send(JSON.stringify({
        action: "close-drawing-area",
    }));
};