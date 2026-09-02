import { Extension } from '@codemirror/state';

/**
 * InkEmbedsExtension
 *
 * Previously refreshed writing/drawing decorations on every down-scroll so embeds
 * below the fold would appear. That refresh mid-scroll collapsed scrollHeight when
 * tall writing widgets virtualized, causing scroll jumps on up-scroll.
 * Initial decoration build + doc changes + explicit forceRebuild cover embed creation.
 */
export function inkEmbedsExtension(): Extension {
	return [];
}
