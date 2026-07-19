const createDivResult = {
  setText: () => {},
  style: {},
  addEventListener: () => {},
  setAttr: () => {},
  hide: () => {},
  createDiv: () => createDivResult,
  createEl: () => ({ addEventListener: () => {}, setAttr: () => {}, setText: () => {} }),
};

module.exports = {
  Platform: {
    isMacOS: true,
    isIosApp: false,
  },
  Menu: class {},
  Notice: class {},
  TextFileView: class {
    constructor(leaf) {
      this.leaf = leaf;
      this.file = null;
      // Minimal containerEl used by some views during `setViewData`.
      this.containerEl = {
        children: [],
        appendChild: () => {},
      };
    }
    getViewType() {
      return '';
    }
    setViewData() {}
    clear() {}
  },
  Modal: class {
    constructor() {
      this.titleEl = { setText: () => {} };
      this.contentEl = {
        empty: () => {},
        createEl: () => ({ addEventListener: () => {}, setAttr: () => {}, setText: () => {} }),
        createDiv: () => createDivResult,
        addClass: () => {},
      };
    }
    open() {}
    close() {}
  },
  TFile: class {},
  Vault: class {},
  MarkdownRenderChild: class {
    constructor(containerEl) {
      this.containerEl = containerEl;
    }
    load() {}
    unload() {}
  },
  normalizePath: (path) => path.replace(/\\/g, '/'),
  Setting: class {
    constructor() {}
    setName() { return this; }
    setDesc() { return this; }
    setClass() { return this; }
    addText(cb) { cb({ setValue: () => this, setPlaceholder: () => this, inputEl: { addEventListener: () => {} } }); return this; }
    addToggle(cb) { cb({ setValue: () => this, onChange: () => this }); return this; }
    addButton(cb) { cb({ setButtonText: () => this, setClass: () => this, setWarning: () => this, setCta: () => this, onClick: () => this }); return this; }
  },
};


