import chalk from "chalk";
// import * as chalk from 'chalk';

/////////////

// Troubleshooting
// If this error is returned in the console upon running...
// ` TypeError: Cannot read properties of undefined (reading 'userAgentData') `
// It is because some of chalks features are not compatible in the environment you're trying to run it in.
// Downgrade to Chalk version 4 with this:
// npm uninstall chalk
// npm install chalk@4
// And use...
// import * as chalk from 'chalk';

/////////////
/////////////

// Network ingest configuration
let networkIngestUrl: string | null = null;
let networkSessionId: string | null = null;
let networkRunId: string | null = null;

/**
 * Enable network log forwarding. When configured, every log call (info, warn,
 * error, debug, http, verbose) also POSTs a structured JSON payload to the
 * ingest server. This is essential on Android/Boox where console.log output is
 * not reliably forwarded to adb logcat.
 *
 * Call once at module scope (e.g. top of the main editor file). When not
 * called, all functions simply console.log as usual — zero behaviour change.
 */
export function configureNetworkIngest(port: number, sessionId: string, runId: string): void {
    networkIngestUrl = `http://127.0.0.1:${port}/ingest/${sessionId}`;
    networkSessionId = sessionId;
    networkRunId = runId;
}

function postToIngest(level: string, message: string, data?: Record<string, unknown>): void {
    if (!networkIngestUrl || !networkSessionId || !networkRunId) return;
    const payload = {
        sessionId: networkSessionId,
        runId: networkRunId,
        level,
        message,
        data: data ?? {},
        timestamp: Date.now(),
    };
    fetch(networkIngestUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Debug-Session-Id': networkSessionId,
        },
        body: JSON.stringify(payload),
    }).catch(() => {});
}


function getTimestamp() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

interface LogOptions {
    freeze?: boolean, // Freeze an object before logging, otherwise changes afterward will be reflected in earlier logs
    stringify?: boolean, // Stringify an object and pretty print it
}

export function info(_data: any|any[], _options: LogOptions = {}) {
    print(chalk.blue.bold('Ink info:'), _data, _options);
    forwardToIngest('info', _data);
}
export function warn(_data: any|any[], _options: LogOptions = {}) {
    print(chalk.yellow.bold('Ink warn:'), _data, _options);
    forwardToIngest('warn', _data);
}
export function error(_data: any|any[], _options: LogOptions = {}) {
    print(chalk.red.bold('Ink error:'), _data, _options);
    forwardToIngest('error', _data);
}
export function debug(_data: any|any[], _options: LogOptions = {}) {
    if(process.env.NODE_ENV === 'production') return;
    print(chalk.green.bold('Ink debug:'), _data, _options);
    forwardToIngest('debug', _data);
}
export function http(_data: any|any[], _options: LogOptions = {}) {
    if(process.env.NODE_ENV === 'production') return;
    print(chalk.magenta.bold('Ink http:'), _data, _options);
    forwardToIngest('http', _data);
}
export function verbose(_data: any|any[], _options: LogOptions = {}) {
    if(process.env.NODE_ENV === 'production') return;
    print(chalk.cyan.bold('Ink verbose:'), _data, _options);
    forwardToIngest('verbose', _data);
}

function forwardToIngest(level: string, _data: any|any[]): void {
    if (!networkIngestUrl) return;
    if (_data instanceof Array) {
        const message = _data.filter(d => typeof d === 'string').join(' ');
        const dataObj = _data.find(d => d instanceof Object && !(d instanceof Array));
        postToIngest(level, message || level, dataObj);
    } else if (_data instanceof Object) {
        postToIngest(level, level, _data);
    } else {
        postToIngest(level, String(_data));
    }
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

    // If an object is first, print a timestamp and label on line before it
    if(_data[0] instanceof Object) {
        printTimestampAndLabel(_label);
    }
    for(let i=0; i<_data.length; i++) {

        if(_data[i] instanceof Object) {
            // Print accumulated strings so far and reset
            if(accString.length) {
                printStr(accString);
                accString = '';
            }
            // Print object on next line
            printObj(_data[i], _options);

        } else {
            // Collect strings to print on the same line
            if(i===0) {
                accString = `${getTimestampAndLabel(_label)} ${_data[i]}`;
            } else {
                if(accString.length) {
                    // It's already started accumulating, so just add the next item
                    accString = `${accString} ${_data[i]}`;
                } else {
                    // It's after an object, so just don't reshow timestamp
                    accString = `${_label} ${_data[i]}`;
                }
            }

            // If there's no more data, print the accumulated string
            if(i===_data.length-1) {
                printStr(accString);
            }
        }
    }
    // If an object was last, put an empty line after it
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


