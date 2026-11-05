declare module '*.wasm' {
	const wasmBytes: Uint8Array;
	export default wasmBytes;
}
