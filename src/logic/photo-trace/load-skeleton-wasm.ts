//////////
//////////

export type ZhangSuenThinFn = (binary: Uint8Array, width: number, height: number) => Uint8Array;

interface SkeletonWasmExports {
	memory: WebAssembly.Memory;
	requiredBytes(width: number, height: number): number;
	thinInPlace(width: number, height: number): void;
}

/**
 * Instantiates skeleton.wasm bytes and returns an in-place Zhang–Suen that copies
 * the mask through WASM linear memory.
 */
export async function instantiateZhangSuenWasm(wasmBytes: ArrayBuffer): Promise<ZhangSuenThinFn> {
	const { instance } = await WebAssembly.instantiate(wasmBytes, {});
	const wasm = instance.exports as unknown as SkeletonWasmExports;
	if (!wasm.memory || typeof wasm.thinInPlace !== 'function') {
		throw new Error('skeleton.wasm is missing thinning exports');
	}
	return (binary, width, height) => {
		const required = Number(wasm.requiredBytes(width, height));
		ensureWasmMemory(wasm.memory, required);
		const heap = new Uint8Array(wasm.memory.buffer);
		heap.set(binary, 0);
		heap.fill(0, binary.length, required);
		wasm.thinInPlace(width, height);
		return new Uint8Array(wasm.memory.buffer.slice(0, binary.length));
	};
}

function ensureWasmMemory(memory: WebAssembly.Memory, requiredBytes: number): void {
	const pageSize = 65536;
	const neededPages = Math.ceil(requiredBytes / pageSize);
	const havePages = Math.floor(memory.buffer.byteLength / pageSize);
	if (neededPages > havePages) {
		memory.grow(neededPages - havePages);
	}
}
