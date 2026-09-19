/** Base64url without padding for PKCE. */
function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	bytes.forEach((byte) => {
		binary += String.fromCharCode(byte);
	});
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export interface AlmostUsefulPkcePair {
	verifier: string;
	challenge: string;
}

/** Creates a PKCE verifier and S256 challenge for portal authorize. */
export async function createAlmostUsefulPkcePair(): Promise<AlmostUsefulPkcePair> {
	const randomBytes = crypto.getRandomValues(new Uint8Array(32));
	const verifier = bytesToBase64Url(randomBytes);
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	const challenge = bytesToBase64Url(new Uint8Array(digest));
	return { verifier, challenge };
}
