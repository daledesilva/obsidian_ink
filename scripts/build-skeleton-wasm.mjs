import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repoRoot, 'src', 'logic', 'photo-trace', 'generated');
const outFile = path.join(outDir, 'skeleton.wasm');
const source = path.join(repoRoot, 'src', 'logic', 'photo-trace', 'assembly', 'skeleton.ts');

mkdirSync(outDir, { recursive: true });
execSync(
	`npx asc ${JSON.stringify(source)} --outFile ${JSON.stringify(outFile)} --runtime stub -Ospeed --noAssert`,
	{ cwd: repoRoot, stdio: 'inherit' },
);
