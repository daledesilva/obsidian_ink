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
		console.log('[InkDebug]', JSON.stringify({ ...entry, timestamp: Date.now() }));
	} catch {
		/* ignore */
	}
}

export function info(_data: any|any[], _options: LogOptions = {}) {
	print(chalk.blue.bold('Ink info:'), _data, _options);
}
export function warn(_data: any|any[], _options: LogOptions = {}) {
	print(chalk.yellow.bold('Ink warn:'), _data, _options);
}
export function error(_data: any|any[], _options: LogOptions = {}) {
	print(chalk.red.bold('Ink error:'), _data, _options);
}
export function debug(_data: any|any[], _options: LogOptions = {}) {
	print(chalk.green.bold('Ink debug:'), _data, _options);
}
export function http(_data: any|any[], _options: LogOptions = {}) {
	print(chalk.magenta.bold('Ink http:'), _data, _options);
}
export function verbose(_data: any|any[], _options: LogOptions = {}) {
	print(chalk.cyan.bold('Ink verbose:'), _data, _options);
}

function print(_label: string, _data: any|any[], _options: LogOptions = {}) {
	if(_data instanceof Array) {
		printArray(_label, _data, _options);
	} else if(_data instanceof Object) {
		printTimestampAndLabel(_label);
		printObj(_data, _options);
		printEmptyLine();
	} else {
		printStr(`${getTimestampAndLabel(_label)} ${_data}`);
	}
}

function printArray(_label: string, _data: any[], _options: LogOptions = {}) {
	let accString = '';

	if(_data[0] instanceof Object) {
		printTimestampAndLabel(_label);
	}
	for(let i=0; i<_data.length; i++) {

		if(_data[i] instanceof Object) {
			if(accString.length) {
				printStr(accString);
				accString = '';
			}
			printObj(_data[i], _options);

		} else {
			if(i===0) {
				accString = `${getTimestampAndLabel(_label)} ${_data[i]}`;
			} else {
				if(accString.length) {
					accString = `${accString} ${_data[i]}`;
				} else {
					accString = `${_label} ${_data[i]}`;
				}
			}

			if(i===_data.length-1) {
				printStr(accString);
			}
		}
	}
	if(_data[_data.length-1] instanceof Object) {
		printEmptyLine();
	}

}

function printStr(_str: string) {
	console.log(`${_str}`);
}

function printObj(_data: any, _options: LogOptions) {
	let data: any;
	if(_options.freeze) {
		data = JSON.parse(JSON.stringify(_data));
	} else {
		data = _data;
	}
	if(_options.stringify) {
		data = JSON.stringify(data, null, 2);
	}
	console.log(data);
}

function printTimestampAndLabel(_label: string) {
	console.log(getTimestampAndLabel(_label));
}

function printEmptyLine() {
	console.log('');
}

function getTimestampAndLabel(_label: string): string {
	return `${chalk.grey(getTimestamp())} ${_label}`;
}
