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

	// Remove /
	let newArr = str.split('/');
	let newStr = newArr.join();

	// Remove \
	newArr = newStr.split('\\');
	newStr = newArr.join();

	// Remove :
	newArr = newStr.split(':');
	newStr = newArr.join();

	return newStr;
}