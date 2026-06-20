import { Menu, MenuItem } from 'obsidian';
import type { MenuOption } from './overflow-menu';

function isSeparator(option: MenuOption): option is { separator: true } {
	return 'separator' in option && option.separator === true;
}

function populateMenu(menu: Menu, options: MenuOption[]): void {
	options.forEach((option) => {
		if (isSeparator(option)) {
			menu.addSeparator();
			return;
		}
		menu.addItem((item: MenuItem) => {
			item
				.setTitle(option.text)
				.onClick(() => { void option.action(); });
			const menuItemDom = (item as MenuItem & { dom?: Element }).dom;
			if (option.destructive) {
				// Do not use setSection('danger') — Obsidian groups danger items at the top of the menu.
				menuItemDom?.addClass('ddc_ink_menu-destructive');
			} else if (option.warning) {
				menuItemDom?.addClass('mod-warning');
			}
		});
	});
}

export function buildMenuFromOptions(options: MenuOption[]): Menu {
	const menu = new Menu();
	populateMenu(menu, options);
	return menu;
}

export function showMenuOptionsAtMouseEvent(options: MenuOption[], evt: MouseEvent): Menu {
	const menu = buildMenuFromOptions(options);
	menu.showAtMouseEvent(evt);
	return menu;
}

export function showMenuOptionsAtPosition(
	options: MenuOption[],
	position: { x: number; y: number },
): Menu {
	const menu = buildMenuFromOptions(options);
	menu.showAtPosition({ x: position.x, y: position.y });
	return menu;
}
