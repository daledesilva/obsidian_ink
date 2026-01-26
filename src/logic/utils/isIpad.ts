

export function isIpad() {
    const userAgent = navigator.userAgent.toLowerCase();
    if(userAgent.includes('ipad')) {
        return true;
    }
    if(userAgent.includes('mac') && navigator.maxTouchPoints > 2) {
        return true;
    }
    return false;
}