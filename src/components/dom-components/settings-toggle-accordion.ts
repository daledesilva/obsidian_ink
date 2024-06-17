


export function addSettingsToggleAccordion(containerEl: HTMLElement, value: boolean, onChange: Function): HTMLDetailsElement {
    const accordion = containerEl.createEl('details', {cls: 'warning'});
	accordion.addEventListener('change', () => onChange);
    return accordion;
}