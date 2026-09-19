import { requestUrl } from 'obsidian';

/////////
/////////

/** JSON POST/GET via Obsidian requestUrl (works on mobile). */
export async function almostUsefulRequestJson(params: {
	url: string;
	method: 'GET' | 'POST';
	accessToken?: string;
	body?: unknown;
}): Promise<{ status: number; json: unknown }> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	if (params.accessToken) {
		headers.Authorization = `Bearer ${params.accessToken}`;
	}
	let body: string | undefined;
	if (params.body !== undefined) {
		body = JSON.stringify(params.body);
	}
	const response = await requestUrl({
		url: params.url,
		method: params.method,
		headers,
		body,
		throw: false,
	});
	let json: unknown = null;
	try {
		json = JSON.parse(response.text);
	} catch {
		json = null;
	}
	return { status: response.status, json };
}
