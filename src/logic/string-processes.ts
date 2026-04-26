export const singleOrPlural = (count: number, singleVersion: string, pluralVersion?: string) => {
	if(count == 1 || count == -1) {
		return singleVersion;
	} else {
		if(pluralVersion) {
			// custom plural version passed in
			return pluralVersion;
		} else {
			// just add an s
			return `${singleVersion}s`;
		}
	}
}

export function filenameSanitize(str: string) {
	let newStr = str;

	newStr = newStr.replace(/\.{2,}/g, '');
	newStr = newStr.replace(/[\x00-\x1f\x7f]/g, '');
	newStr = newStr.replace(/[\\/:*?"<>|]/g, '');
	newStr = newStr.replace(/^\.+/, '');
	newStr = newStr.replace(/\s+/g, ' ').trim();
	newStr = newStr.replace(/[^a-zA-Z0-9 _.-]/g, '');

	return newStr;
}