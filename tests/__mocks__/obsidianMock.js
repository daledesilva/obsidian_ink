module.exports = {
  Menu: class {},
  Notice: class {},
  Modal: class {
    constructor() { this.titleEl = { setText: () => {} }; this.contentEl = { empty: () => {}, createEl: () => ({ addEventListener: () => {}, hide: () => {} }), createDiv: () => ({ createDiv: () => ({ setText: () => {}, style: {} }), createEl: () => ({ addEventListener: () => {} }), hide: () => {}, setText: () => {} }), addClass: () => {} }; }
    open() {}
    close() {}
  },
  TFile: class {},
  Vault: class {},
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


