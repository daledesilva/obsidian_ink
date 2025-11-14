import { ensureSyntaxTree } from '@codemirror/language';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Extension, StateEffect } from '@codemirror/state';
import { MarkdownView } from 'obsidian';
import { getGlobals } from 'src/stores/global-store';
import { refreshWritingEmbedsNow } from '../writing/writing-embed-extension/writing-embed-extension';
import { refreshDrawingEmbedsNow } from '../drawing/drawing-embed-extension/drawing-embed-extension';

// Effect (placeholder in case we want to carry data later)
const refreshEmbedsEffect = StateEffect.define<void>();

export function inkEmbedsExtension(): Extension {
	const InkEmbedsView = ViewPlugin.fromClass(class {
		private inFlight = false;
		private lastCoverageFrom: number | null = null;
		private lastCoverageTo: number | null = null;
		private cooldownUntil = 0;
		private readonly cooldownMs = 300;
		private loopWindowStart = 0;
		private loopCount = 0;
		private readonly loopWindowMs = 1000;
		private readonly loopMax = 3;
		private suppressedUntil = 0;
		private readonly buffer = 2000;

		constructor(readonly view: EditorView) {}

		update(update: ViewUpdate) {
			const nowTs = Date.now();
			if (nowTs < this.suppressedUntil) return;

			// Only care about viewport changes and doc changes
			if (!update.viewportChanged && !update.docChanged) return;

			if (this.inFlight) return;
			this.inFlight = true;

			// Compute coverage target (visible + buffer)
			const ranges = update.view.visibleRanges;
			let targetFrom = ranges.length ? ranges[0].from : 0;
			let targetTo = ranges.length ? ranges[ranges.length - 1].to : update.view.state.doc.length;
			targetFrom = Math.max(0, targetFrom - this.buffer);
			targetTo = Math.min(update.view.state.doc.length, targetTo + this.buffer);

			// Skip if inside previous coverage and only viewport changed within coverage
			if (!update.docChanged && this.lastCoverageFrom !== null && this.lastCoverageTo !== null) {
				if (targetFrom >= this.lastCoverageFrom && targetTo <= this.lastCoverageTo && Date.now() < this.cooldownUntil) {
					this.inFlight = false;
					return;
				}
			}

			// Ensure syntax tree near end of range
			Promise.resolve(ensureSyntaxTree(update.state, targetTo, 120)).finally(() => {
				this.lastCoverageFrom = this.lastCoverageFrom === null ? targetFrom : Math.min(this.lastCoverageFrom, targetFrom);
				this.lastCoverageTo = this.lastCoverageTo === null ? targetTo : Math.max(this.lastCoverageTo, targetTo);

				// Loop breaker
				const now = Date.now();
				if (now - this.loopWindowStart > this.loopWindowMs) {
					this.loopWindowStart = now;
					this.loopCount = 0;
				}
				this.loopCount += 1;
				if (this.loopCount > this.loopMax) {
					this.suppressedUntil = now + 1500;
					this.inFlight = false;
					return;
				}

				// Trigger both format refreshes (their StateFields will rebuild)
                console.log('[ink] refreshing ink embeds');
				this.refreshBoth();

				// Cooldown to prevent rapid cascades
				this.cooldownUntil = now + this.cooldownMs;
				this.inFlight = false;
			});
		}

		private refreshBoth() {
			// Only if a markdown view is present
			const { plugin } = getGlobals();
			const mv = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!mv) return;
			refreshWritingEmbedsNow();
			refreshDrawingEmbedsNow();
		}
	});

	return [InkEmbedsView];
}


