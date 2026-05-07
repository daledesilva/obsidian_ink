import { Platform } from 'obsidian';
import { verbose } from 'src/logic/utils/log-to-console';
import { logToVault } from 'src/logic/utils/log-to-vault';

const INK_LOG_PREFIX = '[Ink]';
const AGENT_DEBUG_RUN_ID = 'invisible-strokes-v1';
const AGENT_DEBUG_ENDPOINT = 'http://127.0.0.1:7662/ingest/80d354ed-c82d-4bc7-8299-7af3de76375a';
const AGENT_DEBUG_SESSION_ID = 'd78e27';

/** Port for eInk Bridge on loopback. */
export const INK_BRIDGE_WEBSOCKET_PORT = 8080;

export const INK_BRIDGE_PROTOCOL_VERSION = 1;

export const BOOX_BRIDGE_WEBSOCKET_URL = `ws://127.0.0.1:${INK_BRIDGE_WEBSOCKET_PORT}/ws`;

/** One neutral line when probe waves fail to find the companion. */
const MSG_BOOX_COMPANION_NOT_FOUND =
	"Attempted Boox Companion app connection but didn't find one.";

const PROBE_TIMEOUT_MS = 2000;

function agentBridgeLog(
	hypothesisId: string,
	location: string,
	message: string,
	data: Record<string, unknown>,
): void {
	const payload = {
		sessionId: AGENT_DEBUG_SESSION_ID,
		runId: AGENT_DEBUG_RUN_ID,
		hypothesisId,
		location,
		message,
		data,
		timestamp: Date.now(),
	};
	console.log('[InkBridgeDebug]', message, data);
	// #region agent log
	fetch(AGENT_DEBUG_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': AGENT_DEBUG_SESSION_ID }, body: JSON.stringify(payload) }).catch(() => {});
	// #endregion
}

function webSocketReadyStateName(ws: WebSocket | null): string {
	if (!ws) return 'none';
	if (ws.readyState === WebSocket.CONNECTING) return 'CONNECTING';
	if (ws.readyState === WebSocket.OPEN) return 'OPEN';
	if (ws.readyState === WebSocket.CLOSING) return 'CLOSING';
	if (ws.readyState === WebSocket.CLOSED) return 'CLOSED';
	return `unknown:${ws.readyState}`;
}

/**
 * How long the WebSocket stays alive after the last drawing session unregisters.
 * Covers a lock → unlock cycle so the existing connection is reused.
 */
const IDLE_GRACE_PERIOD_MS = 5_000;

export interface BooxConnectionSettings {
	booxConnectionEnabled: boolean;
}

type DrawingSessionEntry = {
	onStrokeStart?: (strokeStart: unknown) => void;
	onStroke: (strokePoints: unknown) => void;
	onDrawingAreaReady?: (drawingAreaReady: unknown) => void;
	onSocketOpen: () => void;
	/** Called when another session has just unregistered but this session is still active.
	 *  The session should re-send new-drawing-area so the Bridge overlay is updated to
	 *  this session's bounds instead of the departed session's. */
	onReactivate?: () => void;
};

function isValidInkBridgePongData(data: unknown): boolean {
	if (typeof data !== 'object' || data === null) return false;
	const record = data as Record<string, unknown>;
	return (
		record.bridgeId === 'eink-bridge' &&
		record.protocolVersion === INK_BRIDGE_PROTOCOL_VERSION
	);
}

/**
 * WebSocket is only open while at least one drawing editor is active (unlocked).
 * When the last drawing locks or unmounts, the socket stays open for a grace period
 * so that a quick unlock reuses the existing connection without re-probing.
 */
export class BooxConnection {
	private ws: WebSocket | null = null;
	private disposed = false;
	private intentionalClose = false;
	private currentUrl: string | null = null;
	private inFlightConnect: Promise<void> | null = null;

	private readonly drawingSessions: DrawingSessionEntry[] = [];

	/** Timer that tears down the idle WebSocket after the grace period expires. */
	private idleGraceTimer: number | null = null;

	constructor(private readonly getSettings: () => BooxConnectionSettings) {}

	onSettingsChanged(): void {
		this.clearIdleGraceTimer();
		this.intentionalClose = true;
		this.teardownWebSocket();
		this.intentionalClose = false;
		this.currentUrl = null;
		this.inFlightConnect = null;
	}

	registerDrawingSession(entry: DrawingSessionEntry): { unregister: () => void; activate: () => void } {
		this.clearIdleGraceTimer();
		this.drawingSessions.push(entry);
		logToVault('Boox drawing session registered. Active: ' + this.drawingSessions.length);
		agentBridgeLog('CONN', 'boox-connection.ts:registerDrawingSession', 'Drawing session registered', {
			activeSessions: this.drawingSessions.length,
			disposed: this.disposed,
			booxConnectionEnabled: this.getSettings().booxConnectionEnabled,
			wsState: webSocketReadyStateName(this.ws),
			currentUrl: this.currentUrl,
			hasInFlightConnect: !!this.inFlightConnect,
		});
		void this.ensureConnected().then(() => {
			// If the socket was already open (reused during the grace period),
			// onSocketOpen won't have fired via probePort, so notify this session now.
			if (this.ws?.readyState === WebSocket.OPEN && this.drawingSessions.includes(entry)) {
				try {
					entry.onSocketOpen();
				} catch (error) {
					verbose(['BooxConnection: late onSocketOpen error', error]);
				}
			}
		}).catch((err) => {
			agentBridgeLog('CONN', 'boox-connection.ts:registerDrawingSession', 'ensureConnected rejected after register', {
				error: String(err),
				activeSessions: this.drawingSessions.length,
			});
		});
		const unregister = () => {
			const index = this.drawingSessions.indexOf(entry);
			if (index >= 0) this.drawingSessions.splice(index, 1);
			logToVault('Boox drawing session unregistered. Active: ' + this.drawingSessions.length);
			agentBridgeLog('CONN', 'boox-connection.ts:unregisterDrawingSession', 'Drawing session unregistered', {
				activeSessions: this.drawingSessions.length,
				wsState: webSocketReadyStateName(this.ws),
				currentUrl: this.currentUrl,
				willStartGracePeriod: this.drawingSessions.length === 0,
			});
			if (this.drawingSessions.length === 0) {
				// Only close the Bridge overlay when the last session unregisters.
				// If other sessions are still active (e.g. a view opening while an embed
				// is still closing), their overlay must not be killed.
				this.sendCloseDrawingArea();
				this.startIdleGracePeriod();
			} else {
				// Another session is still active. Tell it to re-announce its drawing
				// area so the Bridge overlay moves to its bounds (e.g. back to the embed
				// after the view closes).
				const remaining = this.drawingSessions[this.drawingSessions.length - 1];
				remaining.onReactivate?.();
			}
		};
		const activate = () => {
			const idx = this.drawingSessions.indexOf(entry);
			if (idx >= 0 && idx < this.drawingSessions.length - 1) {
				this.drawingSessions.splice(idx, 1);
				this.drawingSessions.push(entry);
			}
		};
		return { unregister, activate };
	}

	/** Returns true if a grace timer was active and cancelled. */
	private clearIdleGraceTimer(): boolean {
		if (this.idleGraceTimer !== null) {
			window.clearTimeout(this.idleGraceTimer);
			this.idleGraceTimer = null;
			return true;
		}
		return false;
	}

	/** Starts a timer that tears down the WebSocket after the grace period. */
	private startIdleGracePeriod(): void {
		this.clearIdleGraceTimer();
		agentBridgeLog('CONN', 'boox-connection.ts:startIdleGracePeriod', 'Starting idle grace period', {
			gracePeriodMs: IDLE_GRACE_PERIOD_MS,
			wsState: webSocketReadyStateName(this.ws),
			currentUrl: this.currentUrl,
		});
		this.idleGraceTimer = window.setTimeout(() => {
			this.idleGraceTimer = null;
			if (this.drawingSessions.length > 0) return;
			agentBridgeLog('CONN', 'boox-connection.ts:startIdleGracePeriod', 'Grace period expired, tearing down idle WebSocket', {
				wsState: webSocketReadyStateName(this.ws),
				currentUrl: this.currentUrl,
			});
			this.intentionalClose = true;
			this.teardownWebSocket();
			this.intentionalClose = false;
			this.currentUrl = null;
			this.inFlightConnect = null;
		}, IDLE_GRACE_PERIOD_MS);
	}

	async ensureConnected(): Promise<void> {
		const { booxConnectionEnabled } = this.getSettings();
		agentBridgeLog('CONN', 'boox-connection.ts:ensureConnected', 'ensureConnected called', {
			disposed: this.disposed,
			booxConnectionEnabled,
			wsState: webSocketReadyStateName(this.ws),
			hasInFlightConnect: !!this.inFlightConnect,
			activeSessions: this.drawingSessions.length,
		});
		if (this.disposed) {
			throw new Error('BooxConnection disposed');
		}
		if (!booxConnectionEnabled) {
			throw new Error('Boox companion app disabled');
		}

		if (this.ws?.readyState === WebSocket.OPEN) {
			agentBridgeLog('CONN', 'boox-connection.ts:ensureConnected', 'Already open, returning', {});
			return;
		}

		if (this.inFlightConnect) {
			agentBridgeLog('CONN', 'boox-connection.ts:ensureConnected', 'In-flight connect exists, returning existing promise', {});
			return this.inFlightConnect;
		}

		if (this.ws) {
			this.intentionalClose = true;
			this.teardownWebSocket();
			this.intentionalClose = false;
		}

		this.inFlightConnect = this.connectOnce().finally(() => {
			this.inFlightConnect = null;
		});

		return this.inFlightConnect;
	}

	private connectOnce(): Promise<void> {
		return new Promise((resolve, reject) => {
			void this.probePort()
				.then(() => resolve())
				.catch((err: Error) => reject(err ?? new Error('WebSocket connection failed')));
		});
	}

	/**
	 * Attempts a single WebSocket connection to the known Bridge port.
	 */
	private async probePort(): Promise<void> {
		const url = BOOX_BRIDGE_WEBSOCKET_URL;

		agentBridgeLog('CONN', 'boox-connection.ts:probePort', 'Starting probe', {
			url,
			activeSessions: this.drawingSessions.length,
			disposed: this.disposed,
		});

		const result = await this.probeSinglePort(url);

		if (result.kind === 'success') {
			agentBridgeLog('CONN', 'boox-connection.ts:probePort', 'Probe SUCCESS', {
				url: result.url,
				activeSessions: this.drawingSessions.length,
			});

			if (this.drawingSessions.length === 0) {
				verbose(
					'BooxConnection: handshake ok but no active drawing; closing',
				);
				this.intentionalClose = true;
				try {
					result.socket.close();
				} catch {
					// ignore
				}
				this.intentionalClose = false;
				if (this.ws === result.socket) {
					this.ws = null;
				}
				this.currentUrl = null;
				return;
			}
			verbose('BooxConnection: WebSocket open (handshake ok)');
			logToVault('Boox WebSocket open (handshake ok): ' + result.url);
			this.attachProductionHandlers(result.socket, result.url);
			this.sendInitMessage();
			for (const session of this.drawingSessions) {
				try {
					session.onSocketOpen();
				} catch (error) {
					verbose(['BooxConnection: onSocketOpen error', error]);
				}
			}
			return;
		}

		agentBridgeLog('CONN', 'boox-connection.ts:probePort', 'Probe failed', {
			activeSessions: this.drawingSessions.length,
		});
		console.log(INK_LOG_PREFIX, MSG_BOOX_COMPANION_NOT_FOUND);
		logToVault('Boox companion not found on port ' + INK_BRIDGE_WEBSOCKET_PORT);
		if (Platform.isMobileApp || Platform.isMobile) {
			console.log(
				INK_LOG_PREFIX,
				'Boox tip: Keep eInk Bridge running (foreground service). Obsidian Ink connects on this tablet over loopback only.',
			);
		}
		throw new Error('WebSocket connection failed');
	}

	private attachProductionHandlers(socket: WebSocket, url: string): void {
		this.currentUrl = url;
		this.ws = socket;

		socket.onmessage = (event: MessageEvent) => {
			this.dispatchStrokeMessage(event);
		};

		socket.onerror = () => {};

		socket.onclose = () => {
			const wasThisSocket = this.ws === socket;
			if (wasThisSocket) {
				this.ws = null;
			}
		};
	}

	private dispatchStrokeMessage(event: MessageEvent): void {
		let parsed: unknown;
		try {
			parsed = JSON.parse(String(event.data));
		} catch {
			verbose('BooxConnection: invalid JSON message');
			return;
		}
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			!('data' in parsed)
		) {
			return;
		}
		const action = (parsed as { action?: string }).action;
		const rawTool = ((parsed as { data?: { tool?: string } }).data)?.tool ?? '(none)';
		logToVault(`dispatchStroke action:${action} tool:${rawTool}`);
		if (action === 'stroke-start') {
			const last = this.drawingSessions[this.drawingSessions.length - 1];
			if (last) {
				try {
					last.onStrokeStart?.((parsed as { data: unknown }).data);
				} catch (error) {
					verbose(['BooxConnection: onStrokeStart error', error]);
				}
			}
			return;
		}
		if (action === 'drawing-area-ready') {
			const last = this.drawingSessions[this.drawingSessions.length - 1];
			if (last) {
				try {
					last.onDrawingAreaReady?.((parsed as { data: unknown }).data);
				} catch (error) {
					verbose(['BooxConnection: onDrawingAreaReady error', error]);
				}
			}
			return;
		}
		if (action !== 'new-stroke') {
			return;
		}
		const last = this.drawingSessions[this.drawingSessions.length - 1];
		if (last) {
			try {
				last.onStroke((parsed as { data: unknown }).data);
			} catch (error) {
				verbose(['BooxConnection: onStroke error', error]);
			}
		}
	}

	/**
	 * Opens ONE WebSocket and waits up to PROBE_TIMEOUT_MS for
	 * open → ink-bridge-ping → ink-bridge-pong handshake.
	 */
	private probeSinglePort(url: string): Promise<
		| { kind: 'success'; socket: WebSocket; url: string }
		| { kind: 'failed' }
	> {
		const probeStart = Date.now();
		return new Promise((resolve) => {
			let settled = false;

			const settle = (result: { kind: 'success'; socket: WebSocket; url: string } | { kind: 'failed' }): void => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timeoutId);
				if (result.kind === 'failed') {
					try { socket.close(); } catch { /* ignore */ }
				}
				resolve(result);
			};

			const timeoutId = window.setTimeout(() => {
				agentBridgeLog('PROBE', 'boox-connection.ts:probeSinglePort', 'Probe timeout', {
					url,
					elapsedMs: Date.now() - probeStart,
					readyState: webSocketReadyStateName(socket),
				});
				settle({ kind: 'failed' });
			}, PROBE_TIMEOUT_MS);

			const socket = new WebSocket(url);

			socket.onopen = () => {
				agentBridgeLog('PROBE', 'boox-connection.ts:probeSinglePort', 'Socket opened', {
					url,
					elapsedMs: Date.now() - probeStart,
				});
				if (settled || this.disposed || this.drawingSessions.length === 0) {
					settle({ kind: 'failed' });
					return;
				}
				try {
					socket.send(
						JSON.stringify({
							action: 'ink-bridge-ping',
							data: {
								protocolVersion: INK_BRIDGE_PROTOCOL_VERSION,
							},
						}),
					);
				} catch {
					settle({ kind: 'failed' });
				}
			};

			socket.onmessage = (event: MessageEvent) => {
				if (settled) return;
				let parsed: unknown;
				try {
					parsed = JSON.parse(String(event.data));
				} catch {
					return;
				}
				if (typeof parsed !== 'object' || parsed === null) return;
				const action = (parsed as { action?: string }).action;
				const data = (parsed as { data?: unknown }).data;
				if (action !== 'ink-bridge-pong' || !isValidInkBridgePongData(data)) {
					return;
				}
				agentBridgeLog('PROBE', 'boox-connection.ts:probeSinglePort', 'Handshake success', {
					url,
					elapsedMs: Date.now() - probeStart,
				});
				if (this.disposed || this.drawingSessions.length === 0) {
					settle({ kind: 'failed' });
					return;
				}
				settle({ kind: 'success', socket, url });
			};

			socket.onerror = () => {
				agentBridgeLog('PROBE', 'boox-connection.ts:probeSinglePort', 'Socket error', {
					url,
					elapsedMs: Date.now() - probeStart,
					readyState: webSocketReadyStateName(socket),
				});
			};

			socket.onclose = () => {
				agentBridgeLog('PROBE', 'boox-connection.ts:probeSinglePort', 'Socket closed', {
					url,
					elapsedMs: Date.now() - probeStart,
				});
				settle({ kind: 'failed' });
			};
		});
	}

	private sendInitMessage(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			agentBridgeLog('A', 'boox-connection.ts:sendInitMessage', 'Dropped init send because socket is not open', {
				readyState: webSocketReadyStateName(this.ws),
				sessionCount: this.drawingSessions.length,
				currentUrl: this.currentUrl,
			});
			return;
		}
		agentBridgeLog('A', 'boox-connection.ts:sendInitMessage', 'Sending init message', {
			readyState: webSocketReadyStateName(this.ws),
			sessionCount: this.drawingSessions.length,
			currentUrl: this.currentUrl,
		});
		this.ws.send(
			JSON.stringify({
				action: 'init',
				data: 'Obsidian connected!',
			}),
		);
	}

	sendNewDrawingArea(dimensions: {
		x: number;
		y: number;
		canvasWidth: number;
		canvasHeight: number;
		appWidth: number;
		appHeight: number;
	}): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			agentBridgeLog('A', 'boox-connection.ts:sendNewDrawingArea', 'Dropped new-drawing-area because socket is not open', {
				readyState: webSocketReadyStateName(this.ws),
				sessionCount: this.drawingSessions.length,
				currentUrl: this.currentUrl,
				dimensions,
			});
			return;
		}
		agentBridgeLog('A,B,C', 'boox-connection.ts:sendNewDrawingArea', 'Sending new-drawing-area', {
			readyState: webSocketReadyStateName(this.ws),
			sessionCount: this.drawingSessions.length,
			currentUrl: this.currentUrl,
			dimensions,
		});
		this.ws.send(
			JSON.stringify({
				action: 'new-drawing-area',
				data: dimensions,
			}),
		);
	}

	sendUpdateDrawingArea(dimensions: {
		x: number;
		y: number;
		canvasWidth: number;
		canvasHeight: number;
		appWidth: number;
		appHeight: number;
		immediate?: boolean;
	}): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			agentBridgeLog('A', 'boox-connection.ts:sendUpdateDrawingArea', 'Dropped update-drawing-area because socket is not open', {
				readyState: webSocketReadyStateName(this.ws),
				sessionCount: this.drawingSessions.length,
				currentUrl: this.currentUrl,
				dimensions,
			});
			return;
		}
		agentBridgeLog('B,C', 'boox-connection.ts:sendUpdateDrawingArea', 'Sending update-drawing-area', {
			readyState: webSocketReadyStateName(this.ws),
			sessionCount: this.drawingSessions.length,
			currentUrl: this.currentUrl,
			dimensions,
		});
		this.ws.send(
			JSON.stringify({
				action: 'update-drawing-area',
				data: {
					x: dimensions.x,
					y: dimensions.y,
					canvasWidth: dimensions.canvasWidth,
					canvasHeight: dimensions.canvasHeight,
					appWidth: dimensions.appWidth,
					appHeight: dimensions.appHeight,
					immediate: dimensions.immediate ?? false,
				},
			}),
		);
	}

	sendCloseDrawingArea(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			agentBridgeLog('A,C', 'boox-connection.ts:sendCloseDrawingArea', 'Dropped close-drawing-area because socket is not open', {
				readyState: webSocketReadyStateName(this.ws),
				sessionCount: this.drawingSessions.length,
				currentUrl: this.currentUrl,
			});
			return;
		}
		agentBridgeLog('A,C', 'boox-connection.ts:sendCloseDrawingArea', 'Sending close-drawing-area', {
			readyState: webSocketReadyStateName(this.ws),
			sessionCount: this.drawingSessions.length,
			currentUrl: this.currentUrl,
		});
		this.ws.send(
			JSON.stringify({
				action: 'close-drawing-area',
			}),
		);
	}

	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	sendUpdateTool(tool: 'draw' | 'eraser', strokeSizeDevicePx?: number): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			agentBridgeLog('A,E', 'boox-connection.ts:sendUpdateTool', 'Dropped update-tool because socket is not open', {
				readyState: webSocketReadyStateName(this.ws),
				sessionCount: this.drawingSessions.length,
				currentUrl: this.currentUrl,
				tool,
				strokeSizeDevicePx,
			});
			return;
		}
		const data: Record<string, unknown> = { tool };
		if (strokeSizeDevicePx !== undefined) data.strokeSize = strokeSizeDevicePx;
		agentBridgeLog('A,E', 'boox-connection.ts:sendUpdateTool', 'Sending update-tool', {
			readyState: webSocketReadyStateName(this.ws),
			sessionCount: this.drawingSessions.length,
			currentUrl: this.currentUrl,
			tool,
			strokeSizeDevicePx,
		});
		this.ws.send(
			JSON.stringify({
				action: 'update-tool',
				data,
			}),
		);
	}

	sendStrokeRendered(strokeId: number): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(
			JSON.stringify({
				action: 'stroke-rendered',
				data: { strokeId },
			}),
		);
	}

	private teardownWebSocket(): void {
		if (this.ws) {
			try {
				this.ws.close();
			} catch {
				// ignore
			}
			this.ws = null;
		}
	}

	dispose(): void {
		this.disposed = true;
		this.clearIdleGraceTimer();
		this.drawingSessions.length = 0;
		this.intentionalClose = true;
		this.teardownWebSocket();
		this.intentionalClose = false;
		this.currentUrl = null;
		this.inFlightConnect = null;
	}
}
