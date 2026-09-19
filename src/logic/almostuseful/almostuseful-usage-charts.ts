import { ALMOSTUSEFUL_CLIENT_DISPLAY_NAME, ALMOSTUSEFUL_CLIENT_ID } from 'src/logic/almostuseful/almostuseful-constants';
import type {
	AlmostUsefulBurndownPool,
	AlmostUsefulBurndownSeries,
	AlmostUsefulClientDailyUsagePoint,
} from 'src/logic/almostuseful/almostuseful-usage';
import {
	CREDIT_POOL_AXIS_CHART_HEIGHT,
	CREDIT_POOL_BAR_TOP_RADIUS,
	CREDIT_POOL_PLOT_HEIGHT,
	CREDIT_POOL_PLOT_PADDING_LEFT,
	CREDIT_POOL_PLOT_PADDING_RIGHT,
	CREDIT_POOL_PLOT_PADDING_TOP,
	buildCreditPoolXAxis,
	creditPoolBarLayoutForDayIndex,
	creditPoolBurndownLineXForDayIndex,
	creditPoolFlatBarPath,
	creditPoolTopRoundedBarPath,
	creditPoolYForValue,
	usageChartTodayKey,
	type CreditPoolXAxisGeometry,
} from 'src/logic/almostuseful/credit-pool-chart-layout';

/////////
/////////

const SVG_NS = 'http://www.w3.org/2000/svg';

interface DailyClientStackRow {
	date: string;
	otherCreditsUsed: number;
	highlightCreditsUsed: number;
	dailyTotal: number;
}

/** Renders one pool's remaining figure, burndown, and usage distribution (Post information, not Post styling). */
export function renderAlmostUsefulPoolUsageCharts(
	hostEl: HTMLElement,
	pool: AlmostUsefulBurndownPool,
	plotWidth: number,
): void {
	const series = pool.series;
	const points = series?.points ?? [];
	if (!series || points.length === 0) return;

	const todayKey = usageChartTodayKey(series.chartTimeZone || 'UTC');

	hostEl.createEl('p', {
		cls: 'ddc_ink_almostuseful-pool-title',
		text: pool.title || 'Credit usage',
	});

	appendBurndownSvg(hostEl, series, todayKey, plotWidth);

	const dailyStacks = buildDailyClientStacks(
		pool.clientDailyUsage,
		ALMOSTUSEFUL_CLIENT_ID,
		todayKey,
	);
	if (dailyStacks.length === 0) return;

	hostEl.createEl('p', {
		cls: 'ddc_ink_almostuseful-muted ddc_ink_almostuseful-usage-heading',
		text: 'Usage distribution',
	});
	appendUsageDistributionSvg(hostEl, series, dailyStacks, plotWidth);
	appendUsageLegend(hostEl);
}

function appendBurndownSvg(
	hostEl: HTMLElement,
	series: AlmostUsefulBurndownSeries,
	todayKey: string,
	plotWidth: number,
): void {
	const plotHeight = CREDIT_POOL_PLOT_HEIGHT;
	const plotTop = CREDIT_POOL_PLOT_PADDING_TOP;
	const plotLeft = CREDIT_POOL_PLOT_PADDING_LEFT;
	const plotBottom = plotTop + plotHeight;
	const yAxisMax = series.creditsAllotted;
	const pointCount = series.points.length;
	const svgEl = createChartSvg(plotWidth, 'Credit remaining this period');

	appendGridLines(svgEl, yAxisMax, plotLeft, plotWidth, plotTop, plotHeight);

	series.points.forEach((point, index) => {
		if (point.date > todayKey) return;
		const barLayout = creditPoolBarLayoutForDayIndex(index, pointCount, plotWidth, plotLeft);
		const barTop = creditPoolYForValue(point.creditsRemaining, yAxisMax, plotTop, plotHeight);
		const barHeight = plotBottom - barTop;
		const path = creditPoolTopRoundedBarPath(
			barLayout.barX,
			barTop,
			barLayout.barWidth,
			barHeight,
			CREDIT_POOL_BAR_TOP_RADIUS,
		);
		if (path) {
			appendPath(svgEl, path, 'ddc_ink_almostuseful-chart-bar');
		}
	});

	const idealPoints = series.points.map((point, index) => {
		const lineX = creditPoolBurndownLineXForDayIndex(index, pointCount, plotWidth, plotLeft);
		const idealY = creditPoolYForValue(point.idealRemaining, yAxisMax, plotTop, plotHeight);
		return `${lineX},${idealY}`;
	});
	if (idealPoints.length > 1) {
		const polyline = document.createElementNS(SVG_NS, 'polyline');
		polyline.setAttribute('points', idealPoints.join(' '));
		polyline.setAttribute('fill', 'none');
		polyline.setAttribute('class', 'ddc_ink_almostuseful-chart-ideal');
		svgEl.appendChild(polyline);
	}

	appendXAxis(
		svgEl,
		buildCreditPoolXAxis({
			periodDates: series.points.map((point) => point.date),
			plotLeft,
			plotWidth,
			plotBottom,
		}),
		plotLeft,
		plotWidth,
	);
	hostEl.appendChild(svgEl);
}

function appendUsageDistributionSvg(
	hostEl: HTMLElement,
	series: AlmostUsefulBurndownSeries,
	dailyStacks: DailyClientStackRow[],
	plotWidth: number,
): void {
	const plotHeight = CREDIT_POOL_PLOT_HEIGHT;
	const plotTop = CREDIT_POOL_PLOT_PADDING_TOP;
	const plotLeft = CREDIT_POOL_PLOT_PADDING_LEFT;
	const plotBottom = plotTop + plotHeight;
	const pointCount = series.points.length;
	const yAxisMax = clientDailyUsageYAxisMax(dailyStacks);
	const dateToIndex = new Map(series.points.map((point, index) => [point.date, index] as const));
	const svgEl = createChartSvg(plotWidth, 'Usage distribution');

	appendGridLines(svgEl, yAxisMax, plotLeft, plotWidth, plotTop, plotHeight);

	for (const row of dailyStacks) {
		const dayIndex = dateToIndex.get(row.date);
		if (dayIndex === undefined) continue;
		const barLayout = creditPoolBarLayoutForDayIndex(dayIndex, pointCount, plotWidth, plotLeft);
		const otherHeight = (row.otherCreditsUsed / yAxisMax) * plotHeight;
		const highlightHeight = (row.highlightCreditsUsed / yAxisMax) * plotHeight;
		const totalBarHeight = otherHeight + highlightHeight;

		if (row.otherCreditsUsed > 0) {
			const otherTop = plotBottom - otherHeight;
			const otherPath =
				row.highlightCreditsUsed > 0
					? creditPoolFlatBarPath(barLayout.barX, otherTop, barLayout.barWidth, otherHeight)
					: creditPoolTopRoundedBarPath(
							barLayout.barX,
							otherTop,
							barLayout.barWidth,
							otherHeight,
							CREDIT_POOL_BAR_TOP_RADIUS,
						);
			if (otherPath) {
				appendPath(svgEl, otherPath, 'ddc_ink_almostuseful-chart-other');
			}
		}

		if (row.highlightCreditsUsed > 0) {
			const highlightTop = plotBottom - totalBarHeight;
			const highlightPath = creditPoolTopRoundedBarPath(
				barLayout.barX,
				highlightTop,
				barLayout.barWidth,
				highlightHeight,
				CREDIT_POOL_BAR_TOP_RADIUS,
			);
			if (highlightPath) {
				appendPath(svgEl, highlightPath, 'ddc_ink_almostuseful-chart-ink');
			}
		}
	}

	appendXAxis(
		svgEl,
		buildCreditPoolXAxis({
			periodDates: series.points.map((point) => point.date),
			plotLeft,
			plotWidth,
			plotBottom,
		}),
		plotLeft,
		plotWidth,
	);
	hostEl.appendChild(svgEl);
}

function appendUsageLegend(hostEl: HTMLElement): void {
	const legendEl = hostEl.createDiv('ddc_ink_almostuseful-legend');
	appendLegendItem(legendEl, 'ddc_ink_almostuseful-chart-ink', ALMOSTUSEFUL_CLIENT_DISPLAY_NAME);
	appendLegendItem(legendEl, 'ddc_ink_almostuseful-chart-other', 'Other apps');
}

function appendLegendItem(legendEl: HTMLElement, swatchClass: string, label: string): void {
	const itemEl = legendEl.createDiv('ddc_ink_almostuseful-legend-item');
	itemEl.createDiv(`ddc_ink_almostuseful-legend-swatch ${swatchClass}`);
	itemEl.createSpan({ text: label, cls: 'ddc_ink_almostuseful-muted' });
}

function buildDailyClientStacks(
	clientDailyUsage: AlmostUsefulClientDailyUsagePoint[] | undefined,
	highlightClientId: string,
	todayKey: string,
): DailyClientStackRow[] {
	// Match Project Post: this app vs everyone else. Portal stacks every client_id.
	const stacksByDate = new Map<string, { otherCreditsUsed: number; highlightCreditsUsed: number }>();

	for (const point of clientDailyUsage ?? []) {
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

function clientDailyUsageYAxisMax(rows: DailyClientStackRow[]): number {
	let maxDailyTotal = 0;
	for (const row of rows) {
		if (row.dailyTotal > maxDailyTotal) maxDailyTotal = row.dailyTotal;
	}
	if (maxDailyTotal <= 0) return 1;
	return maxDailyTotal * 1.08;
}

function createChartSvg(plotWidth: number, ariaLabel: string): SVGSVGElement {
	const svgEl = document.createElementNS(SVG_NS, 'svg');
	const width = plotWidth + CREDIT_POOL_PLOT_PADDING_LEFT + CREDIT_POOL_PLOT_PADDING_RIGHT;
	svgEl.setAttribute('class', 'ddc_ink_almostuseful-chart');
	svgEl.setAttribute('viewBox', `0 0 ${width} ${CREDIT_POOL_AXIS_CHART_HEIGHT}`);
	svgEl.setAttribute('width', '100%');
	svgEl.setAttribute('role', 'img');
	svgEl.setAttribute('aria-label', ariaLabel);
	return svgEl;
}

function appendGridLines(
	svgEl: SVGSVGElement,
	yAxisMax: number,
	plotLeft: number,
	plotWidth: number,
	plotTop: number,
	plotHeight: number,
): void {
	const yAxisMid = Math.round(yAxisMax / 2);
	const gridYValues: number[] = [yAxisMax];
	if (yAxisMid > 0 && yAxisMid < yAxisMax) gridYValues.unshift(yAxisMid);
	for (const value of gridYValues) {
		const y = creditPoolYForValue(value, yAxisMax, plotTop, plotHeight);
		const line = document.createElementNS(SVG_NS, 'line');
		line.setAttribute('x1', String(plotLeft));
		line.setAttribute('y1', String(y));
		line.setAttribute('x2', String(plotLeft + plotWidth));
		line.setAttribute('y2', String(y));
		line.setAttribute('class', 'ddc_ink_almostuseful-chart-grid');
		svgEl.appendChild(line);
	}
}

function appendXAxis(
	svgEl: SVGSVGElement,
	xAxis: CreditPoolXAxisGeometry,
	plotLeft: number,
	plotWidth: number,
): void {
	const baseline = document.createElementNS(SVG_NS, 'line');
	baseline.setAttribute('x1', String(plotLeft));
	baseline.setAttribute('y1', String(xAxis.baselineY));
	baseline.setAttribute('x2', String(plotLeft + plotWidth));
	baseline.setAttribute('y2', String(xAxis.baselineY));
	baseline.setAttribute('class', 'ddc_ink_almostuseful-chart-axis');
	svgEl.appendChild(baseline);

	for (const tickX of xAxis.tickXs) {
		const tick = document.createElementNS(SVG_NS, 'line');
		tick.setAttribute('x1', String(tickX));
		tick.setAttribute('y1', String(xAxis.baselineY));
		tick.setAttribute('x2', String(tickX));
		tick.setAttribute('y2', String(xAxis.baselineY + xAxis.tickHeight));
		tick.setAttribute('class', 'ddc_ink_almostuseful-chart-axis');
		svgEl.appendChild(tick);
	}

	for (const edgeLabel of xAxis.edgeLabels) {
		const text = document.createElementNS(SVG_NS, 'text');
		text.setAttribute('x', String(edgeLabel.x));
		text.setAttribute('y', String(xAxis.labelY));
		text.setAttribute('text-anchor', edgeLabel.labelAnchor);
		text.setAttribute('class', 'ddc_ink_almostuseful-chart-axis-label');
		text.textContent = edgeLabel.label;
		svgEl.appendChild(text);
	}
}

function appendPath(svgEl: SVGSVGElement, pathD: string, className: string): void {
	const path = document.createElementNS(SVG_NS, 'path');
	path.setAttribute('d', pathD);
	path.setAttribute('class', className);
	svgEl.appendChild(path);
}
