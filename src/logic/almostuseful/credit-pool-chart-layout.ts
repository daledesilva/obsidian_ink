/**
 * Shared plot geometry for burndown and usage-distribution charts.
 * Copied from Project Post so Ink conveys the same day slots, ideal line, and axis ticks.
 */

export const CREDIT_POOL_PLOT_HEIGHT = 90;
export const CREDIT_POOL_BAR_TOP_RADIUS = 6;
export const CREDIT_POOL_BAR_BANDWIDTH_RATIO = 0.92;
/** Visual-only floor so tiny remaining/spend still paints on the 90px plot. */
export const CREDIT_POOL_BAR_MIN_SEGMENT_PX = 2;
/** Usage-distribution stacks use a taller floor so thin slices stay tappable and readable. */
export const CREDIT_POOL_STACK_MIN_SEGMENT_PX = CREDIT_POOL_BAR_MIN_SEGMENT_PX * 2;

export const CREDIT_POOL_PLOT_PADDING_LEFT = 0;
export const CREDIT_POOL_PLOT_PADDING_RIGHT = 0;
export const CREDIT_POOL_PLOT_PADDING_TOP = 4;
export const CREDIT_POOL_PLOT_PADDING_BOTTOM = 4;

export const CREDIT_POOL_X_AXIS_TICK_HEIGHT = 2.25;
export const CREDIT_POOL_AXIS_STROKE_WIDTH = 1;
export const CREDIT_POOL_X_AXIS_LABEL_AREA = 16;

export const CREDIT_POOL_AXIS_CHART_HEIGHT =
	CREDIT_POOL_PLOT_PADDING_TOP +
	CREDIT_POOL_PLOT_HEIGHT +
	CREDIT_POOL_X_AXIS_TICK_HEIGHT +
	CREDIT_POOL_X_AXIS_LABEL_AREA +
	CREDIT_POOL_PLOT_PADDING_BOTTOM;

/** First/last period edge tick — e.g. `Wed 16 Sep` (portal / Post parity). */
export function formatCreditPoolChartEdgeTick(dayKey: string): string {
	const [yearText, monthText, dayText] = dayKey.split('-');
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const date = new Date(Date.UTC(year, month - 1, day));
	const dayOfMonth = date.getUTCDate();
	const weekday = date.toLocaleDateString('en-AU', {
		weekday: 'short',
		timeZone: 'UTC',
	});
	const monthLabel = date.toLocaleDateString('en-AU', {
		month: 'short',
		timeZone: 'UTC',
	});
	return `${weekday} ${dayOfMonth} ${monthLabel}`;
}

/** Period subtitle above charts — e.g. `27 Aug` (weekday stays on x-axis edge ticks). */
export function formatCreditPoolPeriodDate(isoDate: string): string {
	const date = new Date(`${isoDate}T00:00:00.000Z`);
	const dayOfMonth = date.getUTCDate();
	const month = date.toLocaleDateString('en-AU', {
		month: 'short',
		timeZone: 'UTC',
	});
	return `${dayOfMonth} ${month}`;
}

export function creditPoolDaySegmentWidth(pointCount: number, plotWidth: number): number {
	if (pointCount <= 0) return plotWidth;
	return plotWidth / pointCount;
}

export interface CreditPoolBarLayout {
	barX: number;
	barWidth: number;
	centerX: number;
}

export function creditPoolBarLayoutForDayIndex(
	index: number,
	pointCount: number,
	plotWidth: number,
	plotLeft: number,
): CreditPoolBarLayout {
	const segmentWidth = creditPoolDaySegmentWidth(pointCount, plotWidth);
	const barWidth = segmentWidth * CREDIT_POOL_BAR_BANDWIDTH_RATIO;
	const centerX = plotLeft + (index + 0.5) * segmentWidth;
	return {
		barX: centerX - barWidth / 2,
		barWidth,
		centerX,
	};
}

export function creditPoolBurndownLineXForDayIndex(
	index: number,
	pointCount: number,
	plotWidth: number,
	plotLeft: number,
): number {
	if (pointCount <= 1) return plotLeft + plotWidth / 2;
	return plotLeft + (index / (pointCount - 1)) * plotWidth;
}

export function creditPoolYForValue(
	value: number,
	yAxisMax: number,
	plotTop: number,
	plotHeight: number,
): number {
	if (yAxisMax <= 0) return plotTop + plotHeight;
	const ratio = value / yAxisMax;
	return plotTop + plotHeight * (1 - ratio);
}

export function creditPoolTopRoundedBarPath(
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
): string {
	if (height <= 0 || width <= 0) return '';
	const r = Math.min(radius, width / 2, height);
	if (height <= r) {
		return `M ${x} ${y + height} L ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} Z`;
	}
	return [
		`M ${x} ${y + height}`,
		`L ${x} ${y + r}`,
		`Q ${x} ${y} ${x + r} ${y}`,
		`L ${x + width - r} ${y}`,
		`Q ${x + width} ${y} ${x + width} ${y + r}`,
		`L ${x + width} ${y + height}`,
		'Z',
	].join(' ');
}

export function creditPoolFlatBarPath(x: number, y: number, width: number, height: number): string {
	if (height <= 0 || width <= 0) return '';
	return `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`;
}

export interface CreditPoolXAxisEdgeLabel {
	x: number;
	label: string;
	labelAnchor: 'start' | 'end';
}

export interface CreditPoolXAxisGeometry {
	baselineY: number;
	tickHeight: number;
	labelY: number;
	tickXs: number[];
	edgeLabels: CreditPoolXAxisEdgeLabel[];
}

export function creditPoolXGapTickPositions(
	pointCount: number,
	plotWidth: number,
	plotLeft: number,
): number[] {
	if (pointCount <= 0) return [];
	const segmentWidth = creditPoolDaySegmentWidth(pointCount, plotWidth);
	const tickXs: number[] = [];
	const plotRight = plotLeft + pointCount * segmentWidth;
	const endTickInset = CREDIT_POOL_AXIS_STROKE_WIDTH;
	for (let index = 0; index <= pointCount; index++) {
		if (index === pointCount) {
			tickXs.push(plotRight - endTickInset);
			continue;
		}
		tickXs.push(plotLeft + index * segmentWidth);
	}
	return tickXs;
}

export function buildCreditPoolXAxis(params: {
	periodDates: readonly string[];
	plotLeft: number;
	plotWidth: number;
	plotBottom: number;
}): CreditPoolXAxisGeometry {
	const pointCount = params.periodDates.length;
	const firstDay = params.periodDates[0] ?? '';
	const lastDay = params.periodDates[pointCount - 1] ?? firstDay;
	const tickXs = creditPoolXGapTickPositions(pointCount, params.plotWidth, params.plotLeft);
	const edgeLabels: CreditPoolXAxisEdgeLabel[] = [];
	const plotRight = params.plotLeft + params.plotWidth;

	if (firstDay) {
		edgeLabels.push({
			x: params.plotLeft,
			label: formatCreditPoolChartEdgeTick(firstDay),
			labelAnchor: 'start',
		});
	}

	if (lastDay && lastDay !== firstDay) {
		edgeLabels.push({
			x: plotRight,
			label: formatCreditPoolChartEdgeTick(lastDay),
			labelAnchor: 'end',
		});
	}

	const baselineY = params.plotBottom;
	return {
		baselineY,
		tickHeight: CREDIT_POOL_X_AXIS_TICK_HEIGHT,
		labelY: baselineY + CREDIT_POOL_X_AXIS_TICK_HEIGHT + 11,
		tickXs,
		edgeLabels,
	};
}

/** Today's calendar day key in the burndown series timezone (through-today cutoff). */
export function usageChartTodayKey(timeZone: string): string {
	try {
		return new Date().toLocaleDateString('en-CA', { timeZone });
	} catch {
		return new Date().toISOString().slice(0, 10);
	}
}
