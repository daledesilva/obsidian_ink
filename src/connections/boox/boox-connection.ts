import { Platform } from 'obsidian';
import { verbose } from 'src/logic/utils/log-to-console';

const INK_LOG_PREFIX = '[Ink]';

/** Loopback URL for eInk Bridge on the same device as Obsidian (port and path must match Bridge). */
export const BOOX_BRIDGE_WEBSOCKET_URL = 'ws://127.0.0.1:8080/ws';

/** One neutral line per failed connect attempt (companion not reachable). */
const MSG_BOOX_COMPANION_NOT_FOUND =
	"Attempted Boox Companion app connection but didn't find one.";

/** Chromium uses 1006 when the connection ends abnormally (e.g. refused, reset, blocked). */
const WS_CLOSE_ABNORMAL = 1006;

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
		if (closeCode === WS_CLOSE_ABNORMAL) {
			console.log(
				INK_LOG_PREFIX,
				'WebSocket closed before opening (1006): nothing accepted the connection — start eInk Bridge so its foreground service is running, then check Android logcat for "Ktor WebSocket" / "WebSocket" lines. The plugin uses ws://127.0.0.1:8080/ws on this device only.',
			);
		} else if (Platform.isMobileApp || Platform.isMobile) {
			console.log(
				INK_LOG_PREFIX,
				'Boox tip: Keep eInk Bridge running (foreground service). Obsidian Ink connects only on this tablet at ws://127.0.0.1:8080/ws.',
			);
		}
	}
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
		if (hadNoSessions) {
			this.resetReconnectBudgetsForNewEditCycle();
		}
		void this.ensureConnected().catch(() => {
			/* Outcome logged once in connectOnce onclose */
		});
		return () => {
			const index = this.drawingSessions.indexOf(entry);
			if (index >= 0) this.drawingSessions.splice(index, 1);
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
				/* Outcome logged once in connectOnce onclose */
			});
		}, delay + jitter);
	}

	async ensureConnected(): Promise<void> {
		const { booxConnectionEnabled } = this.getSettings();
		if (this.disposed) {
			throw new Error('BooxConnection disposed');
		}
		if (!booxConnectionEnabled) {
			throw new Error('Boox companion app disabled');
		}

		const url = BOOX_BRIDGE_WEBSOCKET_URL;

		if (this.ws?.readyState === WebSocket.OPEN && this.currentUrl === url) {
			return;
		}

		if (this.inFlightConnect) {
			return this.inFlightConnect;
		}

		if (this.ws && this.currentUrl !== url) {
			this.intentionalClose = true;
			this.teardownWebSocket();
			this.intentionalClose = false;
		}

		if (this.ws?.readyState === WebSocket.OPEN) return;

		this.inFlightConnect = this.connectOnce(url).finally(() => {
			this.inFlightConnect = null;
		});

		return this.inFlightConnect;
	}

	private connectOnce(url: string): Promise<void> {
		this.currentUrl = url;

		return new Promise((resolve, reject) => {
			let settled = false;
			const socket = new WebSocket(url);
			this.ws = socket;

			const finish = (ok: boolean, err?: Error) => {
				if (settled) return;
				settled = true;
				if (ok) resolve();
				else reject(err ?? new Error('WebSocket connection failed'));
			};

			socket.onopen = () => {
				this.reconnectAttempt = 0;
				if (this.drawingSessions.length === 0) {
					verbose('BooxConnection: WebSocket open but no active drawing; closing');
					this.intentionalClose = true;
					try {
						socket.close();
					} catch {
						// ignore
					}
					this.intentionalClose = false;
					if (this.ws === socket) {
						this.ws = null;
					}
					finish(true);
					return;
				}
				verbose('BooxConnection: WebSocket open');
				this.hasEverOpenedSuccessfully = true;
				this.afterDisconnectConnectAttemptNumber = 0;
				this.sendInitMessage();
				for (const session of this.drawingSessions) {
					try {
						session.onSocketOpen();
					} catch (error) {
						verbose(['BooxConnection: onSocketOpen error', error]);
					}
				}
				finish(true);
			};

			socket.onmessage = (event) => {
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
			};

			// Chromium/Electron always prints "WebSocket connection to … failed" on failure;
			// that is not from this plugin and cannot be turned off while using WebSocket.
			socket.onerror = () => {};

			socket.onclose = (event: CloseEvent) => {
				const closeCode = event.code;
				const wasThisSocket = this.ws === socket;
				if (wasThisSocket) {
					this.ws = null;
				}

				if (!settled) {
					finish(false, new Error('WebSocket closed before open'));
					if (this.drawingSessions.length > 0) {
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
					return;
				}

				if (this.disposed) return;
				if (this.intentionalClose) return;

				if (wasThisSocket && this.drawingSessions.length > 0) {
					this.reconnectAttempt = 0;
					this.afterDisconnectConnectAttemptNumber = 0;
					this.scheduleReconnect();
				}
			};
		});
	}

	private sendInitMessage(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
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
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
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
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(
			JSON.stringify({
				action: 'update-drawing-area',
				data: dimensions,
			}),
		);
	}

	sendCloseDrawingArea(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(
			JSON.stringify({
				action: 'close-drawing-area',
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
