import {
	CREDIT_POOL_AXIS_CHART_HEIGHT,
	CREDIT_POOL_BAR_MIN_SEGMENT_PX,
	CREDIT_POOL_BAR_TOP_RADIUS,
	CREDIT_POOL_PLOT_HEIGHT,
	CREDIT_POOL_PLOT_PADDING_LEFT,
	CREDIT_POOL_PLOT_PADDING_TOP,
	CREDIT_POOL_STACK_MIN_SEGMENT_PX,
	buildCreditPoolXAxis,
	creditPoolBarLayoutForDayIndex,
	creditPoolBurndownLineXForDayIndex,
	creditPoolFlatBarPath,
	creditPoolTopRoundedBarPath,
	creditPoolYForValue,
	formatCreditPoolChartEdgeTick,
	formatCreditPoolPeriodDate,
	usageChartTodayKey,
} from 'src/logic/almostuseful/credit-pool-chart-layout';
import {
	layoutCreditPoolSingleBarWithMinimumHeight,
	layoutCreditPoolStackSegmentsWithMinimumHeight,
} from 'src/logic/almostuseful/credit-pool-bar-segment-layout';
import {
	bindCreditPoolChartTooltips,
	formatCreditPoolChartPercent,
	type CreditPoolChartTooltipTarget,
} from 'src/logic/almostuseful/credit-pool-chart-tooltip';
import type {
	AlmostUsefulBurndownPool,
	AlmostUsefulBurndownSeries,
	AlmostUsefulClientDailyUsagePoint,
} from 'src/logic/almostuseful/almostuseful-usage';

/////////
/////////

const INK_CLIENT_ID = 'ink';
const SVG_NS = 'http://www.w3.org/2000/svg';

interface DailyClientStackRow {
	date: string;
	otherCreditsUsed: number;
	highlightCreditsUsed: number;
	dailyTotal: number;
}

interface StackPaintSegment {
	key: string;
	path: string;
	className: string;
	tooltipHtml: string;
	hitX: number;
	hitY: number;
	hitWidth: number;
	hitHeight: number;
}

/** Renders burndown plus Ink-vs-other stacked spend as SVG. */
export function renderAlmostUsefulPoolUsageCharts(
	hostEl: HTMLElement,
	pool: AlmostUsefulBurndownPool,
	plotWidth: number,
	refreshButtonEl?: HTMLButtonElement,
): void {
	const series = pool.series;
	if (!series) return;

	const title = pool.title ?? 'AI Access';
	const titleRowEl = hostEl.createDiv({ cls: 'ddc_ink_almostuseful-pool-title-row' });
	titleRowEl.createDiv({ cls: 'ddc_ink_almostuseful-pool-title', text: title });
	if (refreshButtonEl) {
		titleRowEl.appendChild(refreshButtonEl);
	}

	const periodStartLabel = formatCreditPoolPeriodDate(series.periodStartDay);
	const periodEndLabel = formatCreditPoolPeriodDate(series.periodLastDay);
	hostEl.createEl('p', {
		cls: 'ddc_ink_almostuseful-muted',
		text: `Start of ${periodStartLabel} → End of ${periodEndLabel}`,
	});

	appendBurndownSvg(hostEl, series, plotWidth);
	appendClientUsageSvg(hostEl, series, pool.clientDailyUsage ?? [], plotWidth);
}

/** Paints remaining bars (uncapped) with a 2px visual floor and day hit rects. */
function appendBurndownSvg(
	hostEl: HTMLElement,
	series: AlmostUsefulBurndownSeries,
	plotWidth: number,
): void {
	const todayKey = usageChartTodayKey(series.chartTimeZone);
	let yAxisMax = series.creditsAllotted;
	for (const point of series.points) {
		if (point.creditsRemaining > yAxisMax) yAxisMax = point.creditsRemaining;
		if (point.idealRemaining > yAxisMax) yAxisMax = point.idealRemaining;
	}
	const plotHeight = CREDIT_POOL_PLOT_HEIGHT;
	const plotTop = CREDIT_POOL_PLOT_PADDING_TOP;
	const plotLeft = CREDIT_POOL_PLOT_PADDING_LEFT;
	const plotBottom = plotTop + plotHeight;
	const pointCount = series.points.length;
	const svgHeight = CREDIT_POOL_AXIS_CHART_HEIGHT;

	const svg = createSvg(plotWidth, svgHeight);
	appendBurndownGridLines(
		svg,
		series.creditsAllotted,
		yAxisMax,
		plotLeft,
		plotTop,
		plotWidth,
		plotHeight,
	);

	const tooltipTargets = new Map<SVGElement, CreditPoolChartTooltipTarget>();
	const idealPoints: string[] = [];

	series.points.forEach((point, index) => {
		const lineX = creditPoolBurndownLineXForDayIndex(index, pointCount, plotWidth, plotLeft);
		const idealY = creditPoolYForValue(point.idealRemaining, yAxisMax, plotTop, plotHeight);
		idealPoints.push(`${lineX},${idealY}`);

		if (point.date > todayKey) return;

		const barLayout = creditPoolBarLayoutForDayIndex(index, pointCount, plotWidth, plotLeft);
		// Paint remaining from the series; y-max expands if remaining exceeds allotment.
		const paintedRemaining = point.creditsRemaining;
		const naturalTop = creditPoolYForValue(paintedRemaining, yAxisMax, plotTop, plotHeight);
		const painted = layoutCreditPoolSingleBarWithMinimumHeight(
			naturalTop,
			plotBottom,
			paintedRemaining,
			CREDIT_POOL_BAR_MIN_SEGMENT_PX,
		);
		const path = creditPoolTopRoundedBarPath(
			barLayout.barX,
			painted.topPx,
			barLayout.barWidth,
			painted.heightPx,
			CREDIT_POOL_BAR_TOP_RADIUS,
		);
		if (path) {
			appendPath(svg, path, 'ddc_ink_almostuseful-chart-bar', `burndown:${point.date}`);
		}

		const percentOfPoolRemaining =
			series.creditsAllotted > 0 ? (point.creditsRemaining / series.creditsAllotted) * 100 : 0;
		const hit = appendHitRect(svg, {
			x: barLayout.barX,
			y: plotTop,
			width: barLayout.barWidth,
			height: plotHeight,
		});
		tooltipTargets.set(hit, {
			key: `burndown:${point.date}`,
			html: burndownTooltipHtml(point.date, percentOfPoolRemaining),
		});
	});

	if (idealPoints.length > 1) {
		const polyline = document.createElementNS(SVG_NS, 'polyline');
		polyline.setAttribute('class', 'ddc_ink_almostuseful-chart-ideal');
		polyline.setAttribute('points', idealPoints.join(' '));
		svg.appendChild(polyline);
	}

	appendXAxis(svg, series.points.map((point) => point.date), plotLeft, plotWidth, plotBottom);
	hostEl.appendChild(svg);
	bindCreditPoolChartTooltips({
		svg,
		resolveTarget: (element) => resolveTooltipTarget(element, tooltipTargets),
	});
}

/** Stacks this app under other-apps; the day's bar is clipped to one rounded silhouette. */
function appendClientUsageSvg(
	hostEl: HTMLElement,
	series: AlmostUsefulBurndownSeries,
	clientDailyUsage: AlmostUsefulClientDailyUsagePoint[],
	plotWidth: number,
): void {
	const todayKey = usageChartTodayKey(series.chartTimeZone);
	const dailyStacks = buildDailyClientStacks(clientDailyUsage, INK_CLIENT_ID, todayKey);
	if (dailyStacks.length === 0) return;

	hostEl.createEl('p', {
		cls: 'ddc_ink_almostuseful-muted ddc_ink_almostuseful-usage-heading',
		text: 'Usage distribution',
	});

	const plotHeight = CREDIT_POOL_PLOT_HEIGHT;
	const plotTop = CREDIT_POOL_PLOT_PADDING_TOP;
	const plotLeft = CREDIT_POOL_PLOT_PADDING_LEFT;
	const plotBottom = plotTop + plotHeight;
	const pointCount = series.points.length;
	const yAxisMax = clientDailyUsageYAxisMax(dailyStacks, plotHeight);
	const dateToIndex = new Map(series.points.map((point, index) => [point.date, index] as const));
	const svg = createSvg(plotWidth, CREDIT_POOL_AXIS_CHART_HEIGHT);
	appendGridLines(svg, yAxisMax, plotLeft, plotTop, plotWidth, plotHeight);

	const tooltipTargets = new Map<SVGElement, CreditPoolChartTooltipTarget>();
	const dayHits: { x: number; width: number; segments: StackPaintSegment[] }[] = [];

	for (const row of dailyStacks) {
		const pointIndex = dateToIndex.get(row.date);
		if (pointIndex === undefined) continue;

		const barLayout = creditPoolBarLayoutForDayIndex(pointIndex, pointCount, plotWidth, plotLeft);
		const layoutInputs: {
			key: string;
			value: number;
			topPx: number;
			bottomPx: number;
			className: string;
			tooltipHtml: string;
		}[] = [];

		if (row.highlightCreditsUsed > 0) {
			const highlightHeight = plotHeight * (row.highlightCreditsUsed / yAxisMax);
			layoutInputs.push({
				key: `${row.date}-ink`,
				value: row.highlightCreditsUsed,
				topPx: plotBottom - highlightHeight,
				bottomPx: plotBottom,
				className: 'ddc_ink_almostuseful-chart-ink',
				tooltipHtml: clientUsageTooltipHtml({
					clientLabel: 'Ink',
					percentOfDay: (row.highlightCreditsUsed / row.dailyTotal) * 100,
					percentOfPool: percentOfMonthlyPool(row.highlightCreditsUsed, series.creditsAllotted),
				}),
			});
		}

		if (row.otherCreditsUsed > 0) {
			const otherHeight = plotHeight * (row.otherCreditsUsed / yAxisMax);
			const otherBottom = plotBottom - plotHeight * (row.highlightCreditsUsed / yAxisMax);
			layoutInputs.push({
				key: `${row.date}-other`,
				value: row.otherCreditsUsed,
				topPx: otherBottom - otherHeight,
				bottomPx: otherBottom,
				className: 'ddc_ink_almostuseful-chart-other',
				tooltipHtml: clientUsageTooltipHtml({
					clientLabel: 'Other apps',
					percentOfDay: (row.otherCreditsUsed / row.dailyTotal) * 100,
					percentOfPool: percentOfMonthlyPool(row.otherCreditsUsed, series.creditsAllotted),
				}),
			});
		}

		const inflated = layoutCreditPoolStackSegmentsWithMinimumHeight(
			layoutInputs,
			CREDIT_POOL_STACK_MIN_SEGMENT_PX,
		);
		if (inflated.length === 0) continue;
		const inflatedByKey = new Map(inflated.map((segment) => [segment.key, segment]));
		const paintedSegments: StackPaintSegment[] = [];

		let stackTopPx = Number.POSITIVE_INFINITY;
		let stackBottomPx = Number.NEGATIVE_INFINITY;
		for (const layout of inflated) {
			stackTopPx = Math.min(stackTopPx, layout.topPx);
			stackBottomPx = Math.max(stackBottomPx, layout.topPx + layout.heightPx);
		}

		const stackGroup = appendStackGroup(svg, {
			dateKey: row.date,
			barX: barLayout.barX,
			stackTopPx,
			barWidth: barLayout.barWidth,
			stackHeightPx: stackBottomPx - stackTopPx,
		});

		for (const input of layoutInputs) {
			const layout = inflatedByKey.get(input.key);
			if (!layout || layout.heightPx <= 0) continue;
			const path = creditPoolFlatBarPath(
				barLayout.barX,
				layout.topPx,
				barLayout.barWidth,
				layout.heightPx,
			);
			if (!path) continue;
			appendPath(stackGroup, path, input.className, input.key);
			paintedSegments.push({
				key: input.key,
				path,
				className: input.className,
				tooltipHtml: input.tooltipHtml,
				hitX: barLayout.barX,
				hitY: layout.topPx,
				hitWidth: barLayout.barWidth,
				hitHeight: layout.heightPx,
			});
		}

		dayHits.push({
			x: barLayout.barX,
			width: barLayout.barWidth,
			segments: paintedSegments,
		});
	}

	for (const dayHit of dayHits) {
		const dayHitEl = appendHitRect(svg, {
			x: dayHit.x,
			y: plotTop,
			width: dayHit.width,
			height: plotHeight,
		});
		const fallback = dayHit.segments[dayHit.segments.length - 1];
		if (fallback) {
			tooltipTargets.set(dayHitEl, {
				key: `${fallback.key}:day`,
				html: fallback.tooltipHtml,
			});
		}
		for (const segment of dayHit.segments) {
			const segmentHit = appendHitRect(svg, {
				x: segment.hitX,
				y: segment.hitY,
				width: segment.hitWidth,
				height: Math.max(segment.hitHeight, CREDIT_POOL_STACK_MIN_SEGMENT_PX),
			});
			tooltipTargets.set(segmentHit, {
				key: segment.key,
				html: segment.tooltipHtml,
			});
		}
	}

	appendXAxis(svg, series.points.map((point) => point.date), plotLeft, plotWidth, plotBottom);
	hostEl.appendChild(svg);
	bindCreditPoolChartTooltips({
		svg,
		resolveTarget: (element) => resolveTooltipTarget(element, tooltipTargets),
	});

	const legend = hostEl.createDiv('ddc_ink_almostuseful-legend');
	appendLegendItem(legend, 'ddc_ink_almostuseful-chart-ink', 'Ink');
	appendLegendItem(legend, 'ddc_ink_almostuseful-chart-other', 'Other apps');
}

/** Groups spend into Ink vs every other client for the stacked chart. */
function buildDailyClientStacks(
	clientDailyUsage: AlmostUsefulClientDailyUsagePoint[],
	highlightClientId: string,
	todayKey: string,
): DailyClientStackRow[] {
	const stacksByDate = new Map<string, { otherCreditsUsed: number; highlightCreditsUsed: number }>();
	for (const point of clientDailyUsage) {
		if (point.date > todayKey) continue;
		if (point.creditsUsed <= 0) continue;
		const prior = stacksByDate.get(point.date) ?? {
			otherCreditsUsed: 0,
			highlightCreditsUsed: 0,
		};
		if (point.clientId === highlightClientId) {
			prior.highlightCreditsUsed += point.creditsUsed;
		} else {
			prior.otherCreditsUsed += point.creditsUsed;
		}
		stacksByDate.set(point.date, prior);
	}

	const rows: DailyClientStackRow[] = [];
	for (const [date, stack] of stacksByDate) {
		const dailyTotal = stack.otherCreditsUsed + stack.highlightCreditsUsed;
		if (dailyTotal <= 0) continue;
		rows.push({
			date,
			otherCreditsUsed: stack.otherCreditsUsed,
			highlightCreditsUsed: stack.highlightCreditsUsed,
			dailyTotal,
		});
	}
	return rows.sort((left, right) => left.date.localeCompare(right.date));
}

/**
 * Busiest-day × 1.08 plus extra data units so inflated stacks stay inside the plot.
 * Ink's canvas is 90px, so this headroom matters more than on the portal.
 */
function clientDailyUsageYAxisMax(rows: DailyClientStackRow[], plotHeight: number): number {
	let maxDailyTotal = 0;
	let busiestSegmentCount = 0;
	for (const row of rows) {
		if (row.dailyTotal <= maxDailyTotal) continue;
		maxDailyTotal = row.dailyTotal;
		busiestSegmentCount = 0;
		if (row.otherCreditsUsed > 0) busiestSegmentCount += 1;
		if (row.highlightCreditsUsed > 0) busiestSegmentCount += 1;
	}
	if (maxDailyTotal <= 0) return 1;
	const baseMax = maxDailyTotal * 1.08;
	const extraDataUnits = ((busiestSegmentCount * CREDIT_POOL_STACK_MIN_SEGMENT_PX) / plotHeight) * baseMax;
	return baseMax + extraDataUnits;
}

/** Share of the monthly allotment for a stacked segment (tooltip, not paint). */
function percentOfMonthlyPool(creditsUsed: number, creditsAllotted: number): number {
	if (creditsAllotted <= 0) return 0;
	return (creditsUsed / creditsAllotted) * 100;
}

/** Burndown tooltip: period date and remaining % of the monthly pool (uncapped). */
function burndownTooltipHtml(date: string, percentOfPoolRemaining: number): string {
	const title = formatCreditPoolChartEdgeTick(date);
	return [
		`<p class="ddc_ink_almostuseful-chart-tooltip-title">${escapeHtml(title)}</p>`,
		`<p class="ddc_ink_almostuseful-chart-tooltip-row">`,
		`<span class="ddc_ink_almostuseful-chart-tooltip-label">Credits remaining</span>`,
		`<span class="ddc_ink_almostuseful-chart-tooltip-value">${escapeHtml(formatCreditPoolChartPercent(percentOfPoolRemaining))}</span>`,
		`</p>`,
	].join('');
}

export interface ClientUsageTooltipHtmlProps {
	clientLabel: string;
	percentOfDay: number;
	percentOfPool: number;
}

/** Stacked tooltip: app label, share of that day's use, share of monthly credits. */
function clientUsageTooltipHtml(props: ClientUsageTooltipHtmlProps): string {
	return [
		`<p class="ddc_ink_almostuseful-chart-tooltip-title">${escapeHtml(props.clientLabel)}</p>`,
		`<p class="ddc_ink_almostuseful-chart-tooltip-row">`,
		`<span class="ddc_ink_almostuseful-chart-tooltip-label">% of day's use</span>`,
		`<span class="ddc_ink_almostuseful-chart-tooltip-value">${escapeHtml(formatCreditPoolChartPercent(props.percentOfDay))}</span>`,
		`</p>`,
		`<p class="ddc_ink_almostuseful-chart-tooltip-row">`,
		`<span class="ddc_ink_almostuseful-chart-tooltip-label">% of monthly credits</span>`,
		`<span class="ddc_ink_almostuseful-chart-tooltip-value">${escapeHtml(formatCreditPoolChartPercent(props.percentOfPool))}</span>`,
		`</p>`,
	].join('');
}

/** Resolves a pointer event node to the nearest hit-rect tooltip payload. */
function resolveTooltipTarget(
	element: Element | null,
	targets: Map<SVGElement, CreditPoolChartTooltipTarget>,
): CreditPoolChartTooltipTarget | null {
	let current: Element | null = element;
	while (current) {
		if (current instanceof SVGElement) {
			const target = targets.get(current);
			if (target) return target;
		}
		current = current.parentElement;
	}
	return null;
}

/** Escapes tooltip copy before inserting into tippy content HTML. */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Creates the credit-pool SVG canvas. */
function createSvg(width: number, height: number): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('class', 'ddc_ink_almostuseful-chart');
	svg.setAttribute('width', String(width));
	svg.setAttribute('height', String(height));
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
	return svg;
}

/** Draws allotment / mid grid lines (50% and 100% of allotment, even if y-max is higher). */
function appendBurndownGridLines(
	svg: SVGSVGElement,
	creditsAllotted: number,
	yAxisMax: number,
	plotLeft: number,
	plotTop: number,
	plotWidth: number,
	plotHeight: number,
): void {
	const yAxisMid = Math.round(creditsAllotted / 2);
	const gridYValues: number[] = [creditsAllotted];
	if (yAxisMid > 0 && yAxisMid < yAxisMax) gridYValues.unshift(yAxisMid);
	for (const value of gridYValues) {
		if (value <= 0 || value > yAxisMax) continue;
		const y = creditPoolYForValue(value, yAxisMax, plotTop, plotHeight);
		const line = document.createElementNS(SVG_NS, 'line');
		line.setAttribute('class', 'ddc_ink_almostuseful-chart-grid');
		line.setAttribute('x1', String(plotLeft));
		line.setAttribute('y1', String(y));
		line.setAttribute('x2', String(plotLeft + plotWidth));
		line.setAttribute('y2', String(y));
		svg.appendChild(line);
	}
}

/** Draws allotment / mid grid lines. */
function appendGridLines(
	svg: SVGSVGElement,
	yAxisMax: number,
	plotLeft: number,
	plotTop: number,
	plotWidth: number,
	plotHeight: number,
): void {
	const yAxisMid = Math.round(yAxisMax / 2);
	const gridYValues: number[] = [yAxisMax];
	if (yAxisMid > 0 && yAxisMid < yAxisMax) gridYValues.unshift(yAxisMid);
	for (const value of gridYValues) {
		const y = creditPoolYForValue(value, yAxisMax, plotTop, plotHeight);
		const line = document.createElementNS(SVG_NS, 'line');
		line.setAttribute('class', 'ddc_ink_almostuseful-chart-grid');
		line.setAttribute('x1', String(plotLeft));
		line.setAttribute('y1', String(y));
		line.setAttribute('x2', String(plotLeft + plotWidth));
		line.setAttribute('y2', String(y));
		svg.appendChild(line);
	}
}

/** Draws the in-chart x-axis ticks and edge labels. */
function appendXAxis(
	svg: SVGSVGElement,
	periodDates: string[],
	plotLeft: number,
	plotWidth: number,
	plotBottom: number,
): void {
	const xAxis = buildCreditPoolXAxis({
		periodDates,
		plotLeft,
		plotWidth,
		plotBottom,
	});
	const axis = document.createElementNS(SVG_NS, 'line');
	axis.setAttribute('class', 'ddc_ink_almostuseful-chart-axis');
	axis.setAttribute('x1', String(plotLeft));
	axis.setAttribute('y1', String(xAxis.baselineY));
	axis.setAttribute('x2', String(plotLeft + plotWidth));
	axis.setAttribute('y2', String(xAxis.baselineY));
	svg.appendChild(axis);
	for (const tickX of xAxis.tickXs) {
		const tick = document.createElementNS(SVG_NS, 'line');
		tick.setAttribute('class', 'ddc_ink_almostuseful-chart-axis');
		tick.setAttribute('x1', String(tickX));
		tick.setAttribute('y1', String(xAxis.baselineY));
		tick.setAttribute('x2', String(tickX));
		tick.setAttribute('y2', String(xAxis.baselineY + xAxis.tickHeight));
		svg.appendChild(tick);
	}
	for (const label of xAxis.edgeLabels) {
		const text = document.createElementNS(SVG_NS, 'text');
		text.setAttribute('class', 'ddc_ink_almostuseful-chart-axis-label');
		text.setAttribute('x', String(label.x));
		text.setAttribute('y', String(xAxis.labelY));
		text.setAttribute('text-anchor', label.labelAnchor);
		text.textContent = label.label;
		svg.appendChild(text);
	}
}

/** Appends a filled bar path tagged for tooltip highlight matching. */
function appendPath(
	parent: SVGElement,
	d: string,
	className: string,
	paintKey: string,
): void {
	const path = document.createElementNS(SVG_NS, 'path');
	path.setAttribute('d', d);
	path.setAttribute('class', className);
	path.setAttribute('data-credit-pool-key', paintKey);
	parent.appendChild(path);
}

/** Clips a day's stack to one top-rounded silhouette so the radius can cross segments. */
function appendStackGroup(
	svg: SVGSVGElement,
	props: {
		dateKey: string;
		barX: number;
		stackTopPx: number;
		barWidth: number;
		stackHeightPx: number;
	},
): SVGGElement {
	const clipId = `ddc_ink_almostuseful-stack-clip-${props.dateKey}`;
	const clipPath = document.createElementNS(SVG_NS, 'clipPath');
	clipPath.setAttribute('id', clipId);
	const clipShape = document.createElementNS(SVG_NS, 'path');
	clipShape.setAttribute(
		'd',
		creditPoolTopRoundedBarPath(
			props.barX,
			props.stackTopPx,
			props.barWidth,
			props.stackHeightPx,
			Math.min(
				CREDIT_POOL_BAR_TOP_RADIUS,
				props.barWidth / 2,
				Math.max(0, props.stackHeightPx - 0.01),
			),
		),
	);
	clipPath.appendChild(clipShape);
	svg.appendChild(clipPath);

	const group = document.createElementNS(SVG_NS, 'g');
	group.setAttribute('class', 'ddc_ink_almostuseful-chart-stack');
	group.setAttribute('clip-path', `url(#${clipId})`);
	svg.appendChild(group);
	return group;
}

export interface AppendHitRectProps {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Invisible full-height / per-segment hit target so 2px slivers stay tappable. */
function appendHitRect(svg: SVGSVGElement, props: AppendHitRectProps): SVGRectElement {
	const rect = document.createElementNS(SVG_NS, 'rect');
	rect.setAttribute('class', 'ddc_ink_almostuseful-chart-hit');
	rect.setAttribute('x', String(props.x));
	rect.setAttribute('y', String(props.y));
	rect.setAttribute('width', String(Math.max(props.width, 1)));
	rect.setAttribute('height', String(Math.max(props.height, 1)));
	rect.setAttribute('fill', 'transparent');
	svg.appendChild(rect);
	return rect;
}

/** Legend swatch + label for the stacked chart. */
function appendLegendItem(legend: HTMLElement, swatchClass: string, label: string): void {
	const item = legend.createDiv('ddc_ink_almostuseful-legend-item');
	item.createDiv({ cls: `ddc_ink_almostuseful-legend-swatch ${swatchClass}` });
	item.createSpan({ text: label });
}
