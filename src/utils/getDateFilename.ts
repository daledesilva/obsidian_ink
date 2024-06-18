
export function getDateFilename() {
    const date = new Date();
    let monthStr = (date.getMonth()+1).toString();
    let dateStr = date.getDate().toString();
    let hours = date.getHours();
    let minutesStr = date.getMinutes().toString();
    let suffix = hours < 12 ? 'am' : 'pm';

    if (minutesStr.length < 2) minutesStr = '0' + minutesStr;
    let filename = date.getFullYear() + '.' + monthStr + '.' + dateStr + ' - ' + hours + '.' + minutesStr + suffix;
    return filename;
}
