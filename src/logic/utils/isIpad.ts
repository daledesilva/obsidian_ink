import { Platform } from 'obsidian';

/**
 * iPad-class device in Obsidian (large-screen iOS app). Used for welcome copy
 * about Apple Pencil scribble. Prefer Platform over navigator-based sniffing.
 */

// REVIEW: Risky AI change. Monitor this.
export function isIpad(): boolean {
	return Platform.isIosApp && Platform.isTablet;
}


// Old function before AI changed it:
// export function isIpad() {
//     const userAgent = navigator.userAgent.toLowerCase();
//     if(userAgent.includes('ipad')) {
//         return true;
//     }
//     if(userAgent.includes('mac') && navigator.maxTouchPoints > 2) {
//         return true;
//     }
//     return false;
// }