import { Platform } from 'obsidian';
import { verbose } from 'src/logic/utils/log-to-console';
import { logToVault } from 'src/logic/utils/log-to-vault';

const INK_LOG_PREFIX = '[Ink]';
const AGENT_DEBUG_RUN_ID = 'pre-fix';
const AGENT_DEBUG_ENDPOINT = 'http://127.0.0.1:7662/ingest/80d354ed-c82d-4bc7-8299-7af3de76375a';
const AGENT_DEBUG_SESSION_ID = 'd78e27';

/**
 * Candidate ports for eInk Bridge on loopback; order must match
 * `INK_BRIDGE_WEBSOCKET_PORTS` in eink-bridge `WebSocketServer.kt`.
 */
export const INK_BRIDGE_WEBSOCKET_PORTS = [
	8080, 37810, 37811, 37812, 37813, 37814, 37815, 37816, 37817, 37818,
] as const;

export const INK_BRIDGE_PROTOCOL_VERSION = 1;

/** @deprecated Use parallel probe URLs; kept for any external reference to primary port. */
export const BOOX_BRIDGE_WEBSOCKET_URL = `ws://127.0.0.1:${INK_BRIDGE_WEBSOCKET_PORTS[0]}/ws`;

function inkBridgeWebSocketUrls(): string[] {
	return INK_BRIDGE_WEBSOCKET_PORTS.map(
		(port) => `ws://127.0.0.1:${port}/ws`,
	);
}

/** One neutral line per failed connect attempt (companion not reachable). */
const MSG_BOOX_COMPANION_NOT_FOUND =
	"Attempted Boox Companion app connection but didn't find one.";

/** Chromium uses 1006 when the connection ends abnormally (e.g. refused, reset, blocked). */
const WS_CLOSE_ABNORMAL = 1006;

const MAX_PROBE_WAVES = 3;
const WAVE_HANDSHAKE_TIMEOUT_MS = 1200;
const INTER_WAVE_DELAY_MS = 500;

function logBooxCompanionNotFound(
	isLastAttempt: boolean,
	attempt: number,
	maxAttempts: number,
	closeCode?: number,
): void {
	const suffix = ` (${attempt}/${maxAttempts})`;
	const message = isLastAttempt
		? `${MSG_BOOX_COMPANION_NOT_FOUND}${suffix} Stopped retrying.`
		: `${MSG_BOOX_COMPANION_NOT_FOUND}${suffix}`;
	console.log(INK_LOG_PREFIX, message);
	if (isLastAttempt) {
		logToVault('Boox companion not found after ' + attempt + '/' + maxAttempts + ' attempts');
		if (closeCode === WS_CLOSE_ABNORMAL) {
			console.log(
				INK_LOG_PREFIX,
				'WebSocket closed before opening (1006): nothing accepted the connection — start eInk Bridge so its foreground service is running, then check Android logcat for "Ktor WebSocket" / "WebSocket" lines. The plugin probes loopback ports in order (see eink-bridge WebSocket docs) until it handshakes with eInk Bridge.',
			);
		} else if (Platform.isMobileApp || Platform.isMobile) {
			console.log(
				INK_LOG_PREFIX,
				'Boox tip: Keep eInk Bridge running (foreground service). Obsidian Ink connects on this tablet over loopback only; it tries several ports and verifies the companion with a short handshake.',
			);
		}
	}
}

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

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

/** Total WebSocket open tries before first successful open (per drawing-edit session). */
const MAX_INITIAL_CONNECT_ATTEMPTS = 3;
/** Open tries after an established connection drops unexpectedly; reset on each such disconnect. */
const MAX_AFTER_DISCONNECT_CONNECT_ATTEMPTS = 5;

export interface BooxConnectionSettings {
	booxConnectionEnabled: boolean;
}

type DrawingSessionEntry = {
	onStroke: (strokePoints: unknown) => void;
	onSocketOpen: () => void;
};

function delayMs(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

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
 * When the last drawing locks or unmounts, the socket is closed after close-drawing-area.
 */
export class BooxConnection {
	private ws: WebSocket | null = null;
	private disposed = false;
	private reconnectTimer: number | null = null;
	private reconnectAttempt = 0;
	private intentionalClose = false;
	private currentUrl: string | null = null;
	private inFlightConnect: Promise<void> | null = null;

	private readonly drawingSessions: DrawingSessionEntry[] = [];

	/** True after at least one successful WebSocket open with an active drawing session. */
	private hasEverOpenedSuccessfully = false;
	/** Counts failed opens this session before first successful open (1..MAX_INITIAL_CONNECT_ATTEMPTS). */
	private initialConnectAttemptNumber = 0;
	/** Counts failed opens in the current post-disconnect recovery wave. */
	private afterDisconnectConnectAttemptNumber = 0;

	constructor(private readonly getSettings: () => BooxConnectionSettings) {}

	onSettingsChanged(): void {
		this.clearReconnectTimer();
		this.intentionalClose = true;
		this.teardownWebSocket();
		this.intentionalClose = false;
		this.currentUrl = null;
		this.inFlightConnect = null;
		this.resetReconnectBudgetsForNewEditCycle();
	}

	private resetReconnectBudgetsForNewEditCycle(): void {
		this.hasEverOpenedSuccessfully = false;
		this.initialConnectAttemptNumber = 0;
		this.afterDisconnectConnectAttemptNumber = 0;
		this.reconnectAttempt = 0;
	}

	registerDrawingSession(entry: DrawingSessionEntry): () => void {
		const hadNoSessions = this.drawingSessions.length === 0;
		this.drawingSessions.push(entry);
		logToVault('Boox drawing session registered. Active: ' + this.drawingSessions.length);
		if (hadNoSessions) {
			this.resetReconnectBudgetsForNewEditCycle();
		}
		void this.ensureConnected().catch(() => {
			/* Outcome logged once in handleFailedOpenBeforeHandshake */
		});
		return () => {
			const index = this.drawingSessions.indexOf(entry);
			if (index >= 0) this.drawingSessions.splice(index, 1);
			logToVault('Boox drawing session unregistered. Active: ' + this.drawingSessions.length);
			if (this.drawingSessions.length === 0) {
				this.clearReconnectTimer();
				this.reconnectAttempt = 0;
				this.intentionalClose = true;
				this.teardownWebSocket();
				this.intentionalClose = false;
				this.currentUrl = null;
				this.inFlightConnect = null;
				this.resetReconnectBudgetsForNewEditCycle();
			}
		};
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer !== null) {
			window.clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private scheduleReconnect(): void {
		if (this.disposed) return;
		if (this.drawingSessions.length === 0) return;
		const { booxConnectionEnabled } = this.getSettings();
		if (!booxConnectionEnabled) {
			return;
		}

		const delay = Math.min(
			RECONNECT_MAX_MS,
			RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt),
		);
		const jitter = Math.floor(Math.random() * 500);
		this.reconnectAttempt++;

		this.clearReconnectTimer();
		this.reconnectTimer = window.setTimeout(() => {
			this.reconnectTimer = null;
			if (this.disposed || this.drawingSessions.length === 0) return;
			void this.ensureConnected().catch(() => {
				/* Outcome logged once in handleFailedOpenBeforeHandshake */
			});
		}, delay + jitter);
	}

	private handleFailedOpenBeforeHandshake(closeCode?: number): void {
		if (this.drawingSessions.length === 0) return;
		if (!this.hasEverOpenedSuccessfully) {
			this.initialConnectAttemptNumber += 1;
			const attempt = this.initialConnectAttemptNumber;
			const max = MAX_INITIAL_CONNECT_ATTEMPTS;
			const isLast = attempt >= max;
			logBooxCompanionNotFound(isLast, attempt, max, closeCode);
			if (isLast) return;
		} else {
			this.afterDisconnectConnectAttemptNumber += 1;
			const attempt = this.afterDisconnectConnectAttemptNumber;
			const max = MAX_AFTER_DISCONNECT_CONNECT_ATTEMPTS;
			const isLast = attempt >= max;
			logBooxCompanionNotFound(isLast, attempt, max, closeCode);
			if (isLast) return;
		}
		this.scheduleReconnect();
	}

	async ensureConnected(): Promise<void> {
		const { booxConnectionEnabled } = this.getSettings();
		if (this.disposed) {
			throw new Error('BooxConnection disposed');
		}
		if (!booxConnectionEnabled) {
			throw new Error('Boox companion app disabled');
		}

		if (this.ws?.readyState === WebSocket.OPEN) {
			return;
		}

		if (this.inFlightConnect) {
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
			void this.runParallelProbeWaves()
				.then(() => resolve())
				.catch((err: Error) => reject(err ?? new Error('WebSocket connection failed')));
		});
	}

	/**
	 * Opens 10 WebSockets in parallel per wave; first valid ink-bridge-pong wins.
	 * Up to MAX_PROBE_WAVES waves with INTER_WAVE_DELAY_MS between failures.
	 */
	private async runParallelProbeWaves(): Promise<void> {
		for (let waveIndex = 0; waveIndex < MAX_PROBE_WAVES; waveIndex++) {
			if (waveIndex > 0) {
				await delayMs(INTER_WAVE_DELAY_MS);
			}
			if (this.disposed || this.drawingSessions.length === 0) {
				throw new Error('BooxConnection: probe aborted');
			}

			const waveResult = await this.probeOneWaveParallel();

			if (waveResult.kind === 'success') {
				this.reconnectAttempt = 0;
				if (this.drawingSessions.length === 0) {
					verbose(
						'BooxConnection: handshake ok but no active drawing; closing',
					);
					this.intentionalClose = true;
					try {
						waveResult.socket.close();
					} catch {
						// ignore
					}
					this.intentionalClose = false;
					if (this.ws === waveResult.socket) {
						this.ws = null;
					}
					this.currentUrl = null;
					return;
				}
				verbose('BooxConnection: WebSocket open (handshake ok)');
				logToVault('Boox WebSocket open (handshake ok): ' + waveResult.url);
				this.hasEverOpenedSuccessfully = true;
				this.afterDisconnectConnectAttemptNumber = 0;
				this.attachProductionHandlers(waveResult.socket, waveResult.url);
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
		}

		this.handleFailedOpenBeforeHandshake(WS_CLOSE_ABNORMAL);
		throw new Error('WebSocket connection failed');
	}

	private attachProductionHandlers(socket: WebSocket, url: string): void {
		this.currentUrl = url;
		this.ws = socket;

		socket.onmessage = (event: MessageEvent) => {
			this.dispatchStrokeMessage(event);
		};

		socket.onerror = () => {};

		socket.onclose = (event: CloseEvent) => {
			const closeCode = event.code;
			const wasThisSocket = this.ws === socket;
			if (wasThisSocket) {
				this.ws = null;
			}

			if (this.disposed) return;
			if (this.intentionalClose) return;

			if (wasThisSocket && this.drawingSessions.length > 0) {
				this.reconnectAttempt = 0;
				this.afterDisconnectConnectAttemptNumber = 0;
				this.scheduleReconnect();
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

	private probeOneWaveParallel(): Promise<
		| { kind: 'success'; socket: WebSocket; url: string }
		| { kind: 'failed' }
	> {
		const urls = inkBridgeWebSocketUrls();
		return new Promise((resolve) => {
			let settled = false;
			let hasWinner = false;
			let intentionalProbeClose = false;
			const sockets: WebSocket[] = [];
			let closedWithoutWinner = 0;

			const closeAllProbeSockets = (): void => {
				intentionalProbeClose = true;
				for (const s of sockets) {
					try {
						s.close();
					} catch {
						// ignore
					}
				}
				intentionalProbeClose = false;
			};

			const settleFailure = (): void => {
				if (settled) return;
				settled = true;
				window.clearTimeout(waveTimeoutId);
				closeAllProbeSockets();
				resolve({ kind: 'failed' });
			};

			const settleSuccess = (socket: WebSocket, url: string): void => {
				if (settled) return;
				settled = true;
				hasWinner = true;
				window.clearTimeout(waveTimeoutId);
				intentionalProbeClose = true;
				for (const s of sockets) {
					if (s !== socket) {
						try {
							s.close();
						} catch {
							// ignore
						}
					}
				}
				intentionalProbeClose = false;
				resolve({ kind: 'success', socket, url });
			};

			const waveTimeoutId = window.setTimeout(() => {
				settleFailure();
			}, WAVE_HANDSHAKE_TIMEOUT_MS);

			const onProbeSocketClosed = (): void => {
				if (settled || hasWinner) return;
				closedWithoutWinner += 1;
				if (closedWithoutWinner >= urls.length) {
					settleFailure();
				}
			};

			for (const url of urls) {
				const socket = new WebSocket(url);
				sockets.push(socket);

				socket.onopen = () => {
					if (settled || hasWinner || this.disposed) {
						intentionalProbeClose = true;
						try {
							socket.close();
						} catch {
							// ignore
						}
						intentionalProbeClose = false;
						return;
					}
					if (this.drawingSessions.length === 0) {
						intentionalProbeClose = true;
						try {
							socket.close();
						} catch {
							// ignore
						}
						intentionalProbeClose = false;
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
						// onclose will count toward wave failure
					}
				};

				socket.onmessage = (event: MessageEvent) => {
					if (settled || hasWinner) return;
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
					if (this.disposed || this.drawingSessions.length === 0) {
						intentionalProbeClose = true;
						try {
							socket.close();
						} catch {
							// ignore
						}
						intentionalProbeClose = false;
						if (!settled) {
							settled = true;
							window.clearTimeout(waveTimeoutId);
							closeAllProbeSockets();
							resolve({ kind: 'failed' });
						}
						return;
					}
					settleSuccess(socket, url);
				};

				socket.onerror = () => {};

				socket.onclose = () => {
					if (intentionalProbeClose) return;
					onProbeSocketClosed();
				};
			}
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
				data: dimensions,
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
		this.clearReconnectTimer();
		this.drawingSessions.length = 0;
		this.intentionalClose = true;
		this.teardownWebSocket();
		this.intentionalClose = false;
		this.currentUrl = null;
		this.inFlightConnect = null;
		this.resetReconnectBudgetsForNewEditCycle();
	}
}
