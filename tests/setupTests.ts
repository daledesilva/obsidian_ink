import '@testing-library/jest-dom';

if (typeof globalThis.structuredClone === 'undefined') {
	globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
}

// Obsidian adds Node.instanceOf for cross-window instanceof checks; jsdom does not.
// Polyfill so unit tests exercise the same call path as the plugin in Obsidian.
if (typeof (Node.prototype as { instanceOf?: unknown }).instanceOf !== 'function') {
	Object.defineProperty(Node.prototype, 'instanceOf', {
		configurable: true,
		writable: true,
		value: function instanceOf(this: Node, type: new (...args: never[]) => unknown): boolean {
			return this instanceof type;
		},
	});
}

// Obsidian globals for popout-safe DOM access; jsdom only provides `document` / `window`.
if (typeof (globalThis as { activeDocument?: Document }).activeDocument === 'undefined') {
	Object.defineProperty(globalThis, 'activeDocument', {
		configurable: true,
		get: () => document,
	});
}
if (typeof (globalThis as { activeWindow?: Window }).activeWindow === 'undefined') {
	Object.defineProperty(globalThis, 'activeWindow', {
		configurable: true,
		get: () => window,
	});
}

// Minimal mock for Obsidian types used in components
class TFile {}
(global as any).TFile = TFile;

// Minimal global window.matchMedia mock used by some libs
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// IntersectionObserver mock
class MockIntersectionObserver {
  callback: any;
  constructor(callback: any) {
    this.callback = callback;
  }
  observe = (target: Element) => {
    this.callback([{ isIntersecting: true, target }]);
  };
  unobserve = () => {};
  disconnect = () => {};
}
(window as any).IntersectionObserver = MockIntersectionObserver as any;

// Mock react-inlinesvg to a simple pass-through that calls onLoad immediately
jest.mock('react-inlinesvg', () => {
  return function InlineSVG() { return null; };
});

// Mock tldraw heavy module with light stubs
jest.mock('@tldraw/tldraw', () => {
  const dummyEditor = {
    store: { listen: () => () => {} },
    updateInstanceState: () => {},
    setCameraOptions: () => {},
    setCamera: () => {},
    getInstanceState: () => ({ isGridMode: false }),
    getCamera: () => ({ x: 0, y: 0, z: 1 }),
    getViewportScreenBounds: () => ({ w: 100, h: 100 }),
  };
  function TldrawEditor(props: any) {
    setTimeout(() => props.onMount && props.onMount(dummyEditor), 0);
    return null;
  }
  class ShapeUtil {}
  return {
    __esModule: true,
    TldrawEditor,
    Editor: function Editor() {},
    ShapeUtil,
    getSnapshot: () => ({}),
    defaultTools: [],
    defaultShapeTools: [],
    defaultShapeUtils: [],
    TldrawScribble: () => null,
    TldrawShapeIndicators: () => null,
    TldrawSelectionForeground: () => null,
    TldrawSelectionBackground: () => null,
    TldrawHandles: () => null,
  };
});

// Mock helpers that rely on app/DOM specifics
jest.mock('src/components/formats/current/utils/tldraw-helpers', () => ({
  __esModule: true,
  adaptTldrawToObsidianThemeMode: () => {},
  focusChildTldrawEditor: () => {},
  getActivityType: () => 'none',
  getDrawingSvg: async () => ({ svg: '<svg />' }),
  initDrawingCamera: () => {},
  prepareDrawingSnapshot: (s: any) => ({}),
  preventTldrawCanvasesCausingObsidianGestures: () => {},
  Activity: { PointerMoved: 'pm' },
  // Writing helpers
  WritingCameraLimits: {} as any,
  getWritingContainerBounds: () => ({ w: 100, h: 100 }),
  getWritingSvg: async () => ({ svg: '<svg />' }),
  initWritingCamera: () => {},
  initWritingCameraLimits: () => ({}),
  prepareWritingSnapshot: (s: any) => ({}),
  resizeWritingTemplateInvitingly: () => {},
  restrictWritingCamera: () => {},
  updateWritingStoreIfNeeded: () => {},
}));

jest.mock('src/components/formats/v1-code-blocks/utils/tldraw-helpers', () => ({
  __esModule: true,
  adaptTldrawToObsidianThemeMode: () => {},
  focusChildTldrawEditor: () => {},
  getActivityType: () => 'none',
  getDrawingSvg: async () => ({ svg: '<svg />' }),
  initDrawingCamera: () => {},
  prepareDrawingSnapshot: (s: any) => ({}),
  preventTldrawCanvasesCausingObsidianGestures: () => {},
  Activity: { PointerMoved: 'pm' },
  // Writing helpers
  WritingCameraLimits: {} as any,
  getWritingContainerBounds: () => ({ w: 100, h: 100 }),
  getWritingSvg: async () => ({ svg: '<svg />' }),
  initWritingCamera: () => {},
  initWritingCameraLimits: () => ({}),
  prepareWritingSnapshot: (s: any) => ({}),
  resizeWritingTemplateInvitingly: () => {},
  restrictWritingCamera: () => {},
  updateWritingStoreIfNeeded: () => {},
  useStash: () => ({ stashStaleContent: () => {}, unstashStaleContent: () => {} }),
}));

// Mock functions that read vault contents
jest.mock('src/components/formats/current/utils/getInkFileData', () => ({
  __esModule: true,
  getInkFileData: async () => ({ previewUri: 'data:image/png;base64,AAAA' }),
}));

jest.mock('src/components/formats/v1-code-blocks/utils/getInkFileData', () => ({
  __esModule: true,
  getInkFileData: async () => ({ previewUri: 'data:image/png;base64,AAAA' }),
}));

// Mock global-store's getGlobals used in v2 previews
jest.mock('src/stores/global-store', () => ({
  __esModule: true,
  getGlobals: () => ({
    plugin: {
      settings: {
        drawingFrameWhenLocked: true,
        drawingBackgroundWhenLocked: true,
        drawingGridEnabledByDefault: true,
        writingLinesWhenLocked: true,
        writingBackgroundWhenLocked: true,
      },
      app: {
        vault: {
          getResourcePath: () => 'data:image/svg+xml,%3Csvg/%3E',
          on: jest.fn(() => jest.fn()),
          offref: jest.fn(),
        },
        workspace: {
          on: jest.fn(() => () => {}),
          off: jest.fn(),
          activeLeaf: null,
          getMostRecentLeaf: jest.fn(() => null),
        },
      },
    },
  }),
}));

// Avoid auto-activating embeds by default; stub local device-settings storage reads
jest.mock('src/logic/utils/storage', () => ({
  __esModule: true,
  embedShouldActivateImmediately: () => false,
  fetchLocally: () => null,
  saveLocally: () => {},
  deleteLocally: () => {},
  localStorageKey: (key: string) => `au_ink_${key}`,
}));


