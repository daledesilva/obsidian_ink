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
// While actively scrolling, throttle refreshes to this cadence (ms)
const ACTIVE_THROTTLE_MS = 180;
// Consider a viewport change a “big jump” when it moves beyond this many characters
const BIG_JUMP_CHARS = 5000;
// Parser time budget for big jumps / settle pass (ms)
const FAST_BUDGET_MS = 300;
// Max time to keep the active throttle running without viewport movement (ms)
const ACTIVE_THROTTLE_MAX_MS = 2000;

export function inkEmbedsExtension(): Extension {
	const InkEmbedsView = ViewPlugin.fromClass(class {
		private inFlight = false;
		private lastCoverageFrom: number | null = null;
		private lastCoverageTo: number | null = null;
		private cooldownUntil = 0;
		private loopWindowStart = 0;
		private loopCount = 0;
		private suppressedUntil = 0;
		// Viewport change tracking
		private viewportRevision = 0;
		private lastTickViewportRevision = 0;
		private lastTickScrollTop = 0;
		// Settle refresh support
		private settleTimer: number | undefined;
		private readonly settleMs = 280;
		private lastTargetFrom: number = 0;
		private lastTargetTo: number = 0;
		private readonly settleBudgetMs = 200;
		// Safety fallback: force refresh after N consecutive skips
		private skipStreak = 0;
		private readonly skipStreakLimit = 3;
		// Active scroll throttle
		private activeThrottleId: number | undefined;
		// Cooldown expiry timer (to refresh exactly when cooldown ends)
		private cooldownExpiryTimer: number | undefined;

		constructor(readonly view: EditorView) {}

		update(update: ViewUpdate) {
			const nowTs = Date.now();
			const suppressed = nowTs < this.suppressedUntil;

			// Only care about viewport changes and doc changes
			if (!update.viewportChanged && !update.docChanged) return;
			this.log('update', {
				viewportChanged: update.viewportChanged,
				docChanged: update.docChanged,
				scrollTop: this.view.scrollDOM.scrollTop,
				ranges: update.view.visibleRanges.length,
			});

			// Track viewport revision whenever it changes
			if (update.viewportChanged) {
				this.viewportRevision += 1;
			}

			// Map coverage through document changes (keeps window accurate)
			if (update.docChanged && this.lastCoverageFrom !== null && this.lastCoverageTo !== null) {
				this.lastCoverageFrom = update.changes.mapPos(this.lastCoverageFrom);
				this.lastCoverageTo = update.changes.mapPos(this.lastCoverageTo);
				this.log('coverageMapped', {
					lastCoverageFrom: this.lastCoverageFrom,
					lastCoverageTo: this.lastCoverageTo,
				});
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
			this.log('viewport', {
				targetFrom,
				targetTo,
				buffer: COVERAGE_BUFFER_CHARS,
			});

			// Start/maintain active scroll throttle during viewport changes
			if (!suppressed) {
				this.startActiveThrottle();
			}

			// If this is a big jump, force an immediate fast refresh
			const previousTo = this.lastCoverageTo ?? 0;
			const jumpSize = Math.abs(targetTo - previousTo);
			if (!suppressed && jumpSize > BIG_JUMP_CHARS && Date.now() >= this.cooldownUntil && !this.inFlight) {
				this.log('bigJump', { jumpSize, previousTo, targetTo });
				this.runFastRefresh(targetTo);
				this.inFlight = false; // runFastRefresh sets it back; explicit for clarity
				return;
			}

			// Cheap heuristic: if visible text has no likely markers, skip work
			const likely = this.visibleRangesLikelyContainEmbeds(update);
			this.log('heuristic', { likely });

			// Skip if inside previous coverage and only viewport changed within coverage
			if (!update.docChanged && this.lastCoverageFrom !== null && this.lastCoverageTo !== null) {
				if (targetFrom >= this.lastCoverageFrom && targetTo <= this.lastCoverageTo && Date.now() < this.cooldownUntil) {
					this.log('withinCoverageCooldown', {
						lastCoverageFrom: this.lastCoverageFrom,
						lastCoverageTo: this.lastCoverageTo,
						cooldownUntil: this.cooldownUntil,
						now: Date.now(),
					});
					// Schedule trailing settle refresh to catch moderate scrolls that remain within coverage
					this.scheduleSettleRefresh();
					this.scheduleCooldownExpiryRefresh();
					this.handleSkipAndFallback();
					this.inFlight = false;
					return;
				}
			}

			// Heuristic skip handling (with fallback)
			if (!likely) {
				this.log('heuristicSkip', {});
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
				this.log('refreshNow', { reason: 'ensureSyntaxTreeComplete' });
				this.refreshBoth();
				this.skipStreak = 0; // reset on actual refresh

				// Cooldown to prevent rapid cascades
				this.cooldownUntil = now + VIEW_COOLDOWN_MS;
				this.inFlight = false;
			});
		}

		private startActiveThrottle() {
			if (this.activeThrottleId !== undefined) return;
			this.log('activeThrottleStart', { ACTIVE_THROTTLE_MS });
			// Seed tick state from current viewport
			this.lastTickViewportRevision = this.viewportRevision;
			this.lastTickScrollTop = this.view.scrollDOM.scrollTop;
			const throttleStartedAt = Date.now();
			this.activeThrottleId = window.setInterval(() => {
				// Stop if viewport hasn't moved and scrollTop unchanged
				const currentScrollTop = this.view.scrollDOM.scrollTop;
				if (
					this.lastTickViewportRevision === this.viewportRevision &&
					currentScrollTop === this.lastTickScrollTop
				) {
					this.stopActiveThrottle();
					return;
				}
				// Stop if max runtime exceeded
				if (Date.now() - throttleStartedAt > ACTIVE_THROTTLE_MAX_MS) {
					this.stopActiveThrottle();
					return;
				}
				// Update last tick state
				this.lastTickViewportRevision = this.viewportRevision;
				this.lastTickScrollTop = currentScrollTop;

				if (this.inFlight) return;
				if (Date.now() < this.cooldownUntil) return;
				// Throttled refresh while actively scrolling
				this.inFlight = true;
				Promise.resolve(ensureSyntaxTree(this.view.state, this.lastTargetTo, FAST_BUDGET_MS)).finally(() => {
					this.log('activeThrottleTick', { lastTargetTo: this.lastTargetTo, FAST_BUDGET_MS });
					this.refreshBoth();
					this.cooldownUntil = Date.now() + VIEW_COOLDOWN_MS;
					this.skipStreak = 0;
					this.inFlight = false;
				});
			}, ACTIVE_THROTTLE_MS);
		}

		private stopActiveThrottle() {
			if (this.activeThrottleId !== undefined) {
				this.log('activeThrottleStop', {});
				window.clearInterval(this.activeThrottleId);
				this.activeThrottleId = undefined;
			}
		}

		private runFastRefresh(targetTo: number) {
			if (this.inFlight) return;
			this.inFlight = true;
			Promise.resolve(ensureSyntaxTree(this.view.state, targetTo, FAST_BUDGET_MS)).finally(() => {
				this.log('fastRefresh', { targetTo, FAST_BUDGET_MS });
				this.refreshBoth();
				this.cooldownUntil = Date.now() + VIEW_COOLDOWN_MS;
				this.skipStreak = 0;
				// Extend coverage using latest target window
				this.lastCoverageFrom = this.lastCoverageFrom === null ? this.lastTargetFrom : Math.min(this.lastCoverageFrom, this.lastTargetFrom);
				this.lastCoverageTo = this.lastCoverageTo === null ? targetTo : Math.max(this.lastCoverageTo, targetTo);
				this.log('coverageExtend', {
					lastCoverageFrom: this.lastCoverageFrom,
					lastCoverageTo: this.lastCoverageTo,
				});
				this.inFlight = false;
			});
		}

		private scheduleSettleRefresh() {
			if (this.settleTimer !== undefined) {
				window.clearTimeout(this.settleTimer);
			}
			this.settleTimer = window.setTimeout(() => this.runSettleRefresh(), this.settleMs);
		}

		private scheduleCooldownExpiryRefresh() {
			// Avoid multiple timers; only schedule if not already set
			const now = Date.now();
			if (this.cooldownExpiryTimer !== undefined) return;
			const delay = this.cooldownUntil - now;
			if (delay <= 0) {
				// Cooldown already expired; run immediately
				this.runFastRefresh(this.lastTargetTo);
				return;
			}
			this.cooldownExpiryTimer = window.setTimeout(() => {
				this.cooldownExpiryTimer = undefined;
				// Only run if not in-flight
				if (!this.inFlight) {
					this.log('cooldownExpiryRefresh', { targetTo: this.lastTargetTo });
					this.runFastRefresh(this.lastTargetTo);
				}
			}, delay);
			this.log('cooldownExpiryScheduled', { delay });
		}

		private runSettleRefresh() {
			this.settleTimer = undefined;
			if (this.inFlight) return;
			// Stop active throttle now that we’re settling
			this.stopActiveThrottle();
			this.inFlight = true;
			Promise.resolve(ensureSyntaxTree(this.view.state, this.lastTargetTo, this.settleBudgetMs)).finally(() => {
				this.log('settleRefresh', { lastTargetTo: this.lastTargetTo, settleBudgetMs: this.settleBudgetMs });
				this.refreshBoth();
				this.cooldownUntil = Date.now() + VIEW_COOLDOWN_MS;
				this.skipStreak = 0;
				// Extend coverage using latest settle target
				this.lastCoverageFrom = this.lastCoverageFrom === null ? this.lastTargetFrom : Math.min(this.lastCoverageFrom, this.lastTargetFrom);
				this.lastCoverageTo = this.lastCoverageTo === null ? this.lastTargetTo : Math.max(this.lastCoverageTo, this.lastTargetTo);
				this.log('coverageExtend', {
					lastCoverageFrom: this.lastCoverageFrom,
					lastCoverageTo: this.lastCoverageTo,
				});
				this.inFlight = false;
			});
		}

		private handleSkipAndFallback() {
			this.skipStreak += 1;
			if (this.skipStreak >= this.skipStreakLimit) {
				this.log('safetyFallback', { skipStreak: this.skipStreak });
				this.runFastRefresh(this.lastTargetTo);
				this.cooldownUntil = Date.now() + VIEW_COOLDOWN_MS;
				this.skipStreak = 0;
			}
		}

		private visibleRangesLikelyContainEmbeds(update: ViewUpdate): boolean {
			const doc = update.state.doc;
			for (const r of update.view.visibleRanges) {
				// Include a small local buffer around each range to catch boundary cases
				const scanFrom = Math.max(0, r.from - 64);
				const scanTo = Math.min(doc.length, r.to + 64);
				const snippet = doc.sliceString(scanFrom, Math.min(scanTo, scanFrom + 4000));
				// Guaranteed pattern per user: ![InkWriting] or ![InkDrawing]
				if (snippet.includes('![Ink')) {
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
			// Stop throttle if no longer scrolling (optional safety)
			refreshWritingEmbedsNow();
			refreshDrawingEmbedsNow();
		}

		private log(event: string, data: Record<string, unknown>) {
			// Keep logging explicit for diagnosis; caller controls log volume
			console.log(`[ink][embeds] ${event}`, data);
		}
	});

	return [InkEmbedsView];
}


