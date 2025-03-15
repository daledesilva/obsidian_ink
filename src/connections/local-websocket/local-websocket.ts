import { verbose } from "src/utils/log-to-console";

/////////////////
/////////////////

interface connectBooxWebSocketProps {
    onStrokePoints: (strokePoints: any) => void;
}

export function connectBooxWebSocket(props: connectBooxWebSocketProps) {
    try {
        verbose("Connecting to WebSocket...");
        // const ws = new WebSocket("ws://127.0.0.1:8080/ws");
        const ws = new WebSocket("http://192.168.50.186:8080/ws");
    
        ws.onopen = () => {
            verbose("Connected to WebSocket!");
            ws.send("Hello from Ink in Obsidian!");
        };
    
        ws.onmessage = (event) => {
            const srcPoints = JSON.parse(event.data);
            verbose(["Message from server:", srcPoints]);
            const convertedPoints = srcPoints.map((point: any) => ({
                x: point.x,
                y: point.y,
                z: 0.5,
            }));
            verbose(["Converted points:", convertedPoints]);
            props.onStrokePoints(convertedPoints);
        };
    } catch (error) {
        verbose("Error connecting to WebSocket:", error);
    }
}


