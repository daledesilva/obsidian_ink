import { getGlobals } from 'src/stores/global-store';

function getTodayDateString(): string {
	const now = new Date();
	const yyyy = now.getFullYear();
	const mm = String(now.getMonth() + 1).padStart(2, '0');
	const dd = String(now.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

function getTimestamp(): string {
	const now = new Date();
	const hh = String(now.getHours()).padStart(2, '0');
	const min = String(now.getMinutes()).padStart(2, '0');
	const ss = String(now.getSeconds()).padStart(2, '0');
	const ms = String(now.getMilliseconds()).padStart(3, '0');
	return `${hh}:${min}:${ss}.${ms}`;
}

/**
 * Appends a timestamped line to `ink-debug_<YYYY-MM-DD>.md` in the vault root.
 * The file is created automatically if it doesn't exist.
 * Use this for temporary in-field debugging that needs to survive a session.
 * Does nothing if vault logging is disabled in plugin settings.
 */
export function logToVault(message: string): void {
	if (!getGlobals().plugin.settings.vaultLoggingEnabled) return;
	const filename = `ink-debug_${getTodayDateString()}.md`;
	const line = `[${getTimestamp()}] ${message}\n`;
	getGlobals().plugin.app.vault.adapter.append(filename, line);
}
