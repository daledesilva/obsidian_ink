import { verbose } from "src/utils/log-to-console";

/////////////////
/////////////////

let ws: WebSocket | null = null;

/////////////////
interface connectWebSocketProps {
    onConnected: () => void;
    onStrokePoints: (strokePoints: any) => void;
}

export function connectWebSocket(props: connectWebSocketProps) {
    try {
        verbose("Connecting to WebSocket...");
        // const ws = new WebSocket("ws://127.0.0.1:8080/ws");
        ws = new WebSocket("http://192.168.50.186:8080/ws");
    
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

export function sendDimensions(dimensions: {x: number, y: number, width: number, height: number}) {
    if(!ws) return;
    
    verbose("Sending dimensions to WebSocket!");
    ws.send(JSON.stringify({
        action: "new-input-window",
        data: dimensions,
    }));
};