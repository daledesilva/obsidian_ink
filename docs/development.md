## Development

### Testing

This repository has three test modes:

1. **Unit and component tests (Jest)** — Fast, mocked tests for components and utilities.
2. **End-to-end tests (WebdriverIO)** — Automated E2E tests against a real Obsidian instance using [wdio-obsidian-service](https://github.com/jesse-r-s-hines/wdio-obsidian-service).
3. **Manual QA** — The [qa-test-vault](../qa-test-vault/README.md) with generated notes for visual regression testing.

#### Unit and component tests (Jest)

Jest runs with a browser-like environment (jsdom) and React Testing Library for React component tests.

#### What’s installed and why

- @testing-library/react: Render React components and query the DOM in tests (ergonomic, user-focused API).
- @testing-library/jest-dom: Extra DOM matchers for Jest (e.g., `toBeInTheDocument`, `toHaveAttribute`).
- jest-environment-jsdom: Provides a DOM for component tests (since Jest 28 it’s not bundled by default).
- @babel/preset-react: Transforms JSX/TSX so Jest can execute component tests.

#### How Jest is configured

See `jest.config.ts`:

- testEnvironment: `jest-environment-jsdom` so React components can render under a DOM.
- transform: `babel-jest` handles `.ts`, `.tsx`, `.js`, `.jsx` using the top-level `babel.config.js`.
- Babel presets: `@babel/preset-env`, `@babel/preset-typescript`, `@babel/preset-react`.
- moduleNameMapper:
  - Styles (`.scss`, `.css`) → `tests/__mocks__/styleMock.js` (no-ops in Node).
  - SVGs → `tests/__mocks__/fileMock.js`.
  - Absolute imports (`^src/(.*)$`) → `<rootDir>/src/$1`.
  - Plugin/main and host modules:
    - `^src/main$` → `tests/__mocks__/mainMock.js` (prevents loading the real plugin runtime).
    - `^obsidian$` → `tests/__mocks__/obsidianMock.js` (stubs Obsidian types like `Menu`, `Notice`).
- setupFilesAfterEnv: `tests/setupTests.ts` centralizes global mocks.
- transformIgnorePatterns: transpiles modern ESM packages like `chalk` used by logging utilities.

#### Global mocks and helpers

In `tests/setupTests.ts`:

- DOM shims: `window.matchMedia` and `IntersectionObserver` so components relying on these APIs don’t crash.
- `react-inlinesvg` is mocked to a no-op component (previews render consistently in Node).
- `@tldraw/tldraw` is lightly mocked:
  - Exposes a `TldrawEditor` that immediately calls `onMount` with a minimal `Editor` stub.
  - Provides `ShapeUtil` and placeholders for `defaultTools`, `defaultShapeUtils`, etc., so shape utils/classes can import without failing.
- `src/logic/utils/tldraw-helpers` is mocked to no-op functions (camera, snapshot, etc.).
- `src/logic/utils/getInkFileData` returns a tiny `{ previewUri: 'data:image/png;base64,AAAA' }` by default.
- `src/stores/global-store.getGlobals()` returns a minimal `plugin` with settings and a vault stub (used by v2 preview components).
- `src/logic/utils/storage.embedShouldActivateImmediately()` returns `false` to keep embeds from auto-activating in tests.

These mocks ensure tests focus on component structure/logic without pulling in heavy runtime dependencies (Obsidian, real tldraw, filesystem).

#### How to run tests

- **Unit tests** (Jest, with coverage):

```bash
npm test
# or
npm run test:unit
```

Coverage output appears under the `coverage/` directory.

- **E2E tests** (WebdriverIO + Obsidian):

```bash
npm run test:e2e
```

This builds the plugin, regenerates the qa-test-vault, and runs E2E specs against Obsidian. The first run downloads Obsidian into `.obsidian-cache/`. Requires Node.js and a supported OS (Windows, macOS, Linux).

#### Writing new tests

General guidelines:

- Prefer React Testing Library for rendering and queries:

```ts
import { render, screen } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import Component from 'src/components/...';

test('renders component', () => {
  render(
    <JotaiProvider>
      <Component {...props} />
    </JotaiProvider>
  );
  expect(screen.getByText('...')).toBeInTheDocument();
});
```

- Wrap components that use Jotai atoms with `JotaiProvider`.
- For components expecting Obsidian types like `TFile`, pass a simple stub: `{ path: 'path/to/file', vault: { read: jest.fn() } }`.
- v1 preview components often fetch `previewUri` via `getInkFileData` (already mocked). Assertions can target visible container classes (e.g., `.ddc_ink_*` root nodes) or callouts.
- v2 preview components may call `getGlobals()`. The mock returns a minimal `plugin` object and vault for `getResourcePath`, so you can pass a `TFile` stub.
- If you trigger state updates (e.g., clicking to switch modes), consider wrapping in React Testing Library’s `act(async () => { ... })` or use `await` for effects to settle.
- If you add components that import additional asset types, map them in `moduleNameMapper` (e.g., fonts, images) to a simple mock file.

Folder conventions:

- Existing tests live under `tests/...` and `src/.../*.test.ts`. Follow the current pattern:
  - Component tests: `tests/components/.../*.test.tsx` mirroring the component path
  - Utility tests: colocated in `src/logic/utils/*.test.ts`

What to assert:

- Aim for behavior and user-visible output rather than implementation details.
- For preview components, asserting the presence of preview containers and basic props is sufficient.
- For editor wrappers, asserting that the wrapper renders without crashing and mounts the editor is sufficient given the heavy runtime is mocked.

Adding new mocks:

- If a new dependency fails in Node (e.g., a new browser API or library), add a light mock to `tests/setupTests.ts`.
- If you need to bypass a new host module (e.g., a different Obsidian entry), add a `moduleNameMapper` entry to redirect it to a mock file under `tests/__mocks__/`.

Troubleshooting:

- Syntax errors in `.tsx` tests usually mean Babel isn’t transforming JSX/TSX — ensure `@babel/preset-react` is installed and present in `babel.config.js`.
- Errors complaining about missing DOM APIs (e.g., `matchMedia`, `IntersectionObserver`) — add or extend shims in `tests/setupTests.ts`.
- ESM packages failing with “Cannot use import statement outside a module” — add them to `transformIgnorePatterns` or mock them.


