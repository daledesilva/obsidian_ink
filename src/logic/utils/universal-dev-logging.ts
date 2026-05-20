/**
 * Development logging: coloured console output for the Obsidian devtools / host console.
 * No network or external ingest — use `adb logcat` on Android/Boox when you need device logs.
 */
import chalk from "chalk";

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
	print(chalk.blue.bold('Ink info:'), _data, _options);
}
export function warn(_data: unknown, _options: LogOptions = {}) {
	print(chalk.yellow.bold('Ink warn:'), _data, _options);
}
export function error(_data: unknown, _options: LogOptions = {}) {
	print(chalk.red.bold('Ink error:'), _data, _options);
}
export function debug(_data: unknown, _options: LogOptions = {}) {
	print(chalk.green.bold('Ink debug:'), _data, _options);
}
export function http(_data: unknown, _options: LogOptions = {}) {
	print(chalk.magenta.bold('Ink http:'), _data, _options);
}
export function verbose(_data: unknown, _options: LogOptions = {}) {
	print(chalk.cyan.bold('Ink verbose:'), _data, _options);
}

function print(_label: string, _data: unknown, _options: LogOptions = {}) {
	if (Array.isArray(_data)) {
		printArray(_label, _data, _options);
	} else if (_data !== null && typeof _data === 'object') {
		printTimestampAndLabel(_label);
		printObj(_data, _options);
		printEmptyLine();
	} else {
		printStr(`${getTimestampAndLabel(_label)} ${stringifyForLogFragment(_data)}`);
	}
}

function printArray(_label: string, _data: unknown[], _options: LogOptions = {}) {
	let accString = '';

	if (_data.length > 0 && _data[0] !== null && typeof _data[0] === 'object') {
		printTimestampAndLabel(_label);
	}
	for(let i=0; i<_data.length; i++) {

		if(_data[i] !== null && typeof _data[i] === 'object') {
			if(accString.length) {
				printStr(accString);
				accString = '';
			}
			printObj(_data[i], _options);

		} else {
			if(i===0) {
				accString = `${getTimestampAndLabel(_label)} ${stringifyForLogFragment(_data[i])}`;
			} else {
				if(accString.length) {
					accString = `${accString} ${stringifyForLogFragment(_data[i])}`;
				} else {
					accString = `${_label} ${stringifyForLogFragment(_data[i])}`;
				}
			}

			if(i===_data.length-1) {
				printStr(accString);
			}
		}
	}
	if(_data[_data.length-1] !== null && typeof _data[_data.length - 1] === 'object') {
		printEmptyLine();
	}

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

function printTimestampAndLabel(_label: string) {
	console.debug(getTimestampAndLabel(_label));
}

function printEmptyLine() {
	console.debug('');
}

function getTimestampAndLabel(_label: string): string {
	return `${chalk.grey(getTimestamp())} ${_label}`;
}
