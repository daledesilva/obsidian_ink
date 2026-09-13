/**
 * Development logging: coloured console output for the Obsidian DevTools console.
 * No network or external ingest — use `adb logcat` on Android/Boox when you need device logs.
 * Chromium styles via `%c`, not ANSI (chalk) — the plugin runs in Electron, not a TTY.
 */

type InkLogChannel = 'info' | 'warn' | 'error' | 'debug' | 'http' | 'verbose';

const CHANNEL_LABEL: Record<InkLogChannel, string> = {
	info: 'Ink info:',
	warn: 'Ink warn:',
	error: 'Ink error:',
	debug: 'Ink debug:',
	http: 'Ink http:',
	verbose: 'Ink verbose:',
};

const CHANNEL_STYLE: Record<InkLogChannel, string> = {
	info: 'color: #3b82f6; font-weight: bold',
	warn: 'color: #ca8a04; font-weight: bold',
	error: 'color: #dc2626; font-weight: bold',
	debug: 'color: #16a34a; font-weight: bold',
	http: 'color: #c026d3; font-weight: bold',
	verbose: 'color: #0891b2; font-weight: bold',
};

const TIMESTAMP_STYLE = 'color: #9ca3af';
const MESSAGE_STYLE = 'color: inherit; font-weight: normal';

function getTimestamp() {
	const now = new Date();
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');
	const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
	return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

interface LogOptions {
	freeze?: boolean;
	stringify?: boolean;
}

/** One JSON line to the console for structured debugging (no HTTP). */
export function inkDebugLog(entry: {
	hypothesisId: string;
	location: string;
	message: string;
	data?: Record<string, unknown>;
	runId?: string;
}): void {
	try {
		console.debug('[InkDebug]', JSON.stringify({ ...entry, timestamp: Date.now() }));
	} catch {
		/* ignore */
	}
}

// For Cursor Debug NDJSON ingest (preferred on iPad / mobile + agent sessions), use
// postCursorDebugIngest from src/logic/utils/cursor-debug-ingest.ts — see docs/debugging-on-ipad.md.

function stringifyForLogFragment(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') {
		return `${value}`;
	}
	if (typeof value === 'bigint') {
		return `${value.toString()}n`;
	}
	if (typeof value === 'symbol') {
		const description = value.description;
		return description !== undefined ? `Symbol(${description})` : 'Symbol()';
	}
	if (typeof value === 'function') {
		const nameProp = Reflect.get(value, 'name');
		const functionName = typeof nameProp === 'string' ? nameProp : '';
		return functionName.length > 0 ? `[Function: ${functionName}]` : '[Function: anonymous]';
	}
	if (value === undefined) return 'undefined';
	if (value === null) return 'null';
	try {
		return JSON.stringify(value);
	} catch {
		return '[unavailable]';
	}
}

export function info(_data: unknown, _options: LogOptions = {}) {
	print('info', _data, _options);
}
export function warn(_data: unknown, _options: LogOptions = {}) {
	print('warn', _data, _options);
}
export function error(_data: unknown, _options: LogOptions = {}) {
	print('error', _data, _options);
}
export function debug(_data: unknown, _options: LogOptions = {}) {
	print('debug', _data, _options);
}
export function http(_data: unknown, _options: LogOptions = {}) {
	print('http', _data, _options);
}
export function verbose(_data: unknown, _options: LogOptions = {}) {
	print('verbose', _data, _options);
}

function print(channel: InkLogChannel, _data: unknown, _options: LogOptions = {}) {
	if (Array.isArray(_data)) {
		printArray(channel, _data, _options);
	} else if (_data !== null && typeof _data === 'object') {
		printTimestampAndLabel(channel);
		printObj(_data, _options);
		printEmptyLine();
	} else {
		debugWithPrefix(channel, stringifyForLogFragment(_data));
	}
}

function printArray(channel: InkLogChannel, _data: unknown[], _options: LogOptions = {}) {
	let accString = '';
	let accIncludesPrefix = false;

	if (_data.length > 0 && _data[0] !== null && typeof _data[0] === 'object') {
		printTimestampAndLabel(channel);
	}
	for(let i=0; i<_data.length; i++) {

		if(_data[i] !== null && typeof _data[i] === 'object') {
			if(accString.length) {
				if (accIncludesPrefix) {
					debugWithPrefix(channel, accString);
				} else {
					printStr(accString);
				}
				accString = '';
				accIncludesPrefix = false;
			}
			printObj(_data[i], _options);

		} else {
			if(i===0) {
				accString = stringifyForLogFragment(_data[i]);
				accIncludesPrefix = true;
			} else {
				if(accString.length) {
					accString = `${accString} ${stringifyForLogFragment(_data[i])}`;
				} else {
					accString = stringifyForLogFragment(_data[i]);
					accIncludesPrefix = true;
				}
			}

			if(i===_data.length-1) {
				if (accIncludesPrefix) {
					debugWithPrefix(channel, accString);
				} else {
					printStr(accString);
				}
			}
		}
	}
	if(_data[_data.length-1] !== null && typeof _data[_data.length - 1] === 'object') {
		printEmptyLine();
	}

}

/** Chromium DevTools: timestamp (grey) + channel label (color) + optional message. */
function debugWithPrefix(channel: InkLogChannel, rest?: string) {
	const timestamp = getTimestamp();
	const label = CHANNEL_LABEL[channel];
	if (rest === undefined || rest.length === 0) {
		console.debug('%c%s %c%s', TIMESTAMP_STYLE, timestamp, CHANNEL_STYLE[channel], label);
		return;
	}
	console.debug(
		'%c%s %c%s %c%s',
		TIMESTAMP_STYLE,
		timestamp,
		CHANNEL_STYLE[channel],
		label,
		MESSAGE_STYLE,
		rest,
	);
}

function printStr(_str: string) {
	console.debug(`${_str}`);
}

function printObj(_data: unknown, _options: LogOptions) {
	let data: unknown;
	if(_options.freeze) {
		data = JSON.parse(JSON.stringify(_data));
	} else {
		data = _data;
	}
	if(_options.stringify) {
		data = JSON.stringify(data, null, 2);
	}
	console.debug(data);
}

function printTimestampAndLabel(channel: InkLogChannel) {
	debugWithPrefix(channel);
}

function printEmptyLine() {
	console.debug('');
}
