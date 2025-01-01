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
    // TODO: check production environment?
    print(chalk.blue.bold('Ink info:'), _data, _options);
}
export function warn(_data: any|any[], _options: LogOptions = {}) {
    // TODO: check production environment?
    print(chalk.yellow.bold('Ink warn:'), _data, _options);
}
export function error(_data: any|any[], _options: LogOptions = {}) {
    // TODO: check production environment?
    print(chalk.red.bold('Ink error:'), _data, _options);
}
export function debug(_data: any|any[], _options: LogOptions = {}) {
    // TODO: check production environment?
    print(chalk.green.bold('Ink debug:'), _data, _options);
}
export function http(_data: any|any[], _options: LogOptions = {}) {
    // TODO: check production environment?
    print(chalk.magenta.bold('Ink http:'), _data, _options);
}
export function verbose(_data: any|any[], _options: LogOptions = {}) {
    // TODO: check production environment?
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


