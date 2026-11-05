// Zhang–Suen thinning compiled with AssemblyScript. Original implementation
// (not GPL). The worker loads skeleton.wasm; convert never thins in JS.

export function requiredBytes(width: i32, height: i32): i32 {
	const size = width * height;
	return size * 2;
}

/**
 * Thins a binary mask in linear memory. Bytes `[0, width*height)` are 0/1 ink.
 * Bytes `[width*height, 2*width*height)` are scratch flags.
 */
export function thinInPlace(width: i32, height: i32): void {
	const size = width * height;
	let changed = true;
	while (changed) {
		changed = false;
		if (markPass(width, height, size, 1)) changed = true;
		applyMarks(size);
		if (markPass(width, height, size, 2)) changed = true;
		applyMarks(size);
	}
}

function applyMarks(size: i32): void {
	for (let i: i32 = 0; i < size; i++) {
		if (load<u8>(size + i) == 1) {
			store<u8>(i, 0);
			store<u8>(size + i, 0);
		}
	}
}

function markPass(width: i32, height: i32, size: i32, pass: i32): bool {
	let marked = false;
	for (let y: i32 = 1; y < height - 1; y++) {
		for (let x: i32 = 1; x < width - 1; x++) {
			const i = y * width + x;
			if (load<u8>(i) == 0) continue;
			const p2 = load<u8>((y - 1) * width + x);
			const p3 = load<u8>((y - 1) * width + (x + 1));
			const p4 = load<u8>(y * width + (x + 1));
			const p5 = load<u8>((y + 1) * width + (x + 1));
			const p6 = load<u8>((y + 1) * width + x);
			const p7 = load<u8>((y + 1) * width + (x - 1));
			const p8 = load<u8>(y * width + (x - 1));
			const p9 = load<u8>((y - 1) * width + (x - 1));
			const B =
				u32(p2) + u32(p3) + u32(p4) + u32(p5) + u32(p6) + u32(p7) + u32(p8) + u32(p9);
			if (B < 2 || B > 6) continue;
			let A: i32 = 0;
			if (p2 == 0 && p3 == 1) A++;
			if (p3 == 0 && p4 == 1) A++;
			if (p4 == 0 && p5 == 1) A++;
			if (p5 == 0 && p6 == 1) A++;
			if (p6 == 0 && p7 == 1) A++;
			if (p7 == 0 && p8 == 1) A++;
			if (p8 == 0 && p9 == 1) A++;
			if (p9 == 0 && p2 == 1) A++;
			if (A != 1) continue;
			if (pass == 1) {
				if (p2 * p4 * p6 != 0) continue;
				if (p4 * p6 * p8 != 0) continue;
			} else {
				if (p2 * p4 * p8 != 0) continue;
				if (p2 * p6 * p8 != 0) continue;
			}
			store<u8>(size + i, 1);
			marked = true;
		}
	}
	return marked;
}
