import { ensureSyntaxTree } from '@codemirror/language';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { MarkdownView } from 'obsidian';
import { getGlobals } from 'src/stores/global-store';
import { refreshWritingEmbedsNow } from '../writing/writing-embed-extension/writing-embed-extension';
import { refreshDrawingEmbedsNow } from '../drawing/drawing-embed-extension/drawing-embed-extension';

/**
 * InkEmbedsExtension
 * - Efficiently refreshes embed decorations only when needed
 * - Triggers on viewport/doc changes (no polling)
 * - Ensures syntax tree for visible ranges (with small buffer)
 * - Maintains a simple coverage window to avoid redundant rebuilds
 * - Uses cooldown and loop-breaker to prevent cascades
 * - Keeps format-specific detection/widgets intact via refresh*Now() hooks
 */

// Tunable knobs
// Max time (ms) to allow the CM6 parser to build/extend the syntax tree up to the end of the visible range (+ buffer).
// Larger values reduce “tree not ready” cases but can cost responsiveness on very large docs.
const ENSURE_TREE_BUDGET_MS = 120;
// Extra characters before/after the visible viewport to include when deciding whether a rebuild is needed.
// Avoids thrashing when the user scrubs/scrolls near the edge of the viewport.
const COVERAGE_BUFFER_CHARS = 1000;
// Cooldown (ms) after a rebuild to avoid immediate re-entrance due to layout/viewport churn.
const VIEW_COOLDOWN_MS = 300;
// Sliding window (ms) used by the loop breaker to detect excessive refreshes.
const LOOP_WINDOW_MS = 1000;
// Max number of refreshes allowed within LOOP_WINDOW_MS before we temporarily suppress further refreshes.
const LOOP_MAX = 3;

export function inkEmbedsExtension(): Extension {
	const InkEmbedsView = ViewPlugin.fromClass(class {
		private inFlight = false;
		private lastCoverageFrom: number | null = null;
		private lastCoverageTo: number | null = null;
		private cooldownUntil = 0;
		private loopWindowStart = 0;
		private loopCount = 0;
		private suppressedUntil = 0;
		// Settle refresh support
		private settleTimer: number | undefined;
		private readonly settleMs = 280;
		private lastTargetFrom: number = 0;
		private lastTargetTo: number = 0;
		private readonly settleBudgetMs = 200;
		// Safety fallback: force refresh after N consecutive skips
		private skipStreak = 0;
		private readonly skipStreakLimit = 3;

		constructor(readonly view: EditorView) {}

		update(update: ViewUpdate) {
			const nowTs = Date.now();
			if (nowTs < this.suppressedUntil) return;

			// Only care about viewport changes and doc changes
			if (!update.viewportChanged && !update.docChanged) return;

			// Map coverage through document changes (keeps window accurate)
			if (update.docChanged && this.lastCoverageFrom !== null && this.lastCoverageTo !== null) {
				this.lastCoverageFrom = update.changes.mapPos(this.lastCoverageFrom);
				this.lastCoverageTo = update.changes.mapPos(this.lastCoverageTo);
			}

			if (this.inFlight) return;
			this.inFlight = true;

			// Compute coverage target (visible + buffer)
			const ranges = update.view.visibleRanges;
			let targetFrom = ranges.length ? ranges[0].from : 0;
			let targetTo = ranges.length ? ranges[ranges.length - 1].to : update.view.state.doc.length;
			targetFrom = Math.max(0, targetFrom - COVERAGE_BUFFER_CHARS);
			targetTo = Math.min(update.view.state.doc.length, targetTo + COVERAGE_BUFFER_CHARS);
			this.lastTargetFrom = targetFrom;
			this.lastTargetTo = targetTo;

			// Cheap heuristic: if visible text has no likely markers, skip work
			const likely = this.visibleRangesLikelyContainEmbeds(update);

			// Skip if inside previous coverage and only viewport changed within coverage
			if (!update.docChanged && this.lastCoverageFrom !== null && this.lastCoverageTo !== null) {
				if (targetFrom >= this.lastCoverageFrom && targetTo <= this.lastCoverageTo && Date.now() < this.cooldownUntil) {
					// Schedule trailing settle refresh to catch moderate scrolls that remain within coverage
					this.scheduleSettleRefresh();
					this.handleSkipAndFallback();
					this.inFlight = false;
					return;
				}
			}

			// Heuristic skip handling (with fallback)
			if (!likely) {
				this.scheduleSettleRefresh();
				this.handleSkipAndFallback();
				this.inFlight = false;
				return;
			}

			// Ensure syntax tree near end of range
			Promise.resolve(ensureSyntaxTree(update.state, targetTo, ENSURE_TREE_BUDGET_MS)).finally(() => {
				this.lastCoverageFrom = this.lastCoverageFrom === null ? targetFrom : Math.min(this.lastCoverageFrom, targetFrom);
				this.lastCoverageTo = this.lastCoverageTo === null ? targetTo : Math.max(this.lastCoverageTo, targetTo);

				// Loop breaker
				const now = Date.now();
				if (now - this.loopWindowStart > LOOP_WINDOW_MS) {
					this.loopWindowStart = now;
					this.loopCount = 0;
				}
				this.loopCount += 1;
				if (this.loopCount > LOOP_MAX) {
					this.suppressedUntil = now + 1500; // brief suppression
					this.inFlight = false;
					return;
				}

				// Trigger both format refreshes (their StateFields will rebuild)
				this.refreshBoth();
				this.skipStreak = 0; // reset on actual refresh

				// Cooldown to prevent rapid cascades
				this.cooldownUntil = now + VIEW_COOLDOWN_MS;
				this.inFlight = false;
			});
		}

		private scheduleSettleRefresh() {
			if (this.settleTimer !== undefined) {
				window.clearTimeout(this.settleTimer);
			}
			this.settleTimer = window.setTimeout(() => this.runSettleRefresh(), this.settleMs);
		}

		private runSettleRefresh() {
			this.settleTimer = undefined;
			if (this.inFlight) return;
			this.inFlight = true;
			Promise.resolve(ensureSyntaxTree(this.view.state, this.lastTargetTo, this.settleBudgetMs)).finally(() => {
				this.refreshBoth();
				this.cooldownUntil = Date.now() + VIEW_COOLDOWN_MS;
				this.skipStreak = 0;
				this.inFlight = false;
			});
		}

		private handleSkipAndFallback() {
			this.skipStreak += 1;
			if (this.skipStreak >= this.skipStreakLimit) {
				this.refreshBoth();
				this.cooldownUntil = Date.now() + VIEW_COOLDOWN_MS;
				this.skipStreak = 0;
			}
		}

		private visibleRangesLikelyContainEmbeds(update: ViewUpdate): boolean {
			const doc = update.state.doc;
			for (const r of update.view.visibleRanges) {
				const from = r.from;
				const to = r.to;
				const snippet = doc.sliceString(from, Math.min(to, from + 2000));
				// relaxed quick marker check
				if (snippet.includes('![')) {
					return true;
				}
			}
			return false;
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


