import { browser, expect } from "@wdio/globals";
import { dismissBlockingPopups } from "./helpers/dismiss-popups";

/**
 * The low-credit notice is raised after a transcription, from the cached remaining percent.
 * These cases seed that cache and call the same function, so they cover 5% and 2%
 * (including 1% remaining, which is already under 2%) without a live portal job.
 */

const OCTOBER_PERIOD = { periodStartDay: "2026-10-01", periodLastDay: "2026-10-31" };
const NOVEMBER_PERIOD = { periodStartDay: "2026-11-01", periodLastDay: "2026-11-30" };

type LoadMode = "cache" | "null" | "throw";

interface ShowLowCreditNoticeArgs {
	signedIn: boolean;
	/** Null skips a usable cache so the portal load stub is what decides. */
	remainingPercent: number | null;
	periodStartDay: string;
	periodLastDay: string;
	loadMode: LoadMode;
	/** When set, View account uses the plugin's real browser opener instead of the test record. */
	openAccountInBrowser?: boolean;
}

////////
// Helpers

async function waitForPluginReady() {
	await browser.waitUntil(
		async () => browser.executeObsidian(({ app }) => !!(app.plugins.plugins as any)["ink"]),
		{ timeout: 15000 },
	);
}

/** One Obsidian profile is shared by every case, so the latch and any open notice must start clean. */
async function resetLowCreditHarness() {
	await browser.executeObsidian(async ({ app }) => {
		const plugin = (app.plugins.plugins as any)["ink"];
		plugin.clearAlmostUsefulSession();
		plugin.writeAlmostUsefulUsageCache("u1", []);
		plugin.resetLowCreditNoticeStateForTests();
		plugin.resetLowCreditNoticeShowingForTests();
		(window as any).__inkOpenedAccountUrls = [];
		document.querySelectorAll(".ddc_ink_notice").forEach((noticeEl) => {
			if (noticeEl.textContent?.includes("AI credits are running low")) noticeEl.remove();
		});
	});
}

async function showLowCreditNotice(args: ShowLowCreditNoticeArgs) {
	await browser.executeObsidian(async ({ app }, seed) => {
		const plugin = (app.plugins.plugins as any)["ink"];
		if (!seed.signedIn) {
			plugin.clearAlmostUsefulSession();
		} else {
			plugin.writeAlmostUsefulSession({
				tokenType: "almostuseful_app",
				accessToken: "t",
				refreshToken: "r",
				expiresAtEpochSeconds: 0,
				grantId: "g",
				userId: "u1",
				clientId: "ink",
				displayName: "Ink",
				userEmail: "a@b.c",
			});
		}

		if (seed.remainingPercent === null) {
			plugin.writeAlmostUsefulUsageCache("u1", []);
		} else {
			plugin.writeAlmostUsefulUsageCache("u1", [{
				series: {
					periodStartDay: seed.periodStartDay,
					periodLastDay: seed.periodLastDay,
					chartTimeZone: "UTC",
					points: [
						{
							date: seed.periodStartDay,
							remainingPercent: 100,
							usedPercent: 0,
							idealRemainingPercent: 100,
						},
						{
							date: seed.periodLastDay,
							remainingPercent: seed.remainingPercent,
							usedPercent: 100 - seed.remainingPercent,
							idealRemainingPercent: 10,
						},
					],
				},
			}]);
		}

		// Cache is preferred. These stubs only run when the cache has no remaining percent,
		// which is how a missing burndown and a thrown portal read stay silent.
		const loadRemainingCreditPercent = seed.loadMode === "null"
			? async () => null
			: seed.loadMode === "throw"
				? async () => {
					throw new Error("offline");
				}
				: undefined;

		await plugin.maybeShowLowCreditNotice(plugin.readAlmostUsefulSession(), {
			loadRemainingCreditPercent,
			// The suite records the URL so it does not open a browser on every run.
			// A watched run leaves this unset so View account opens the portal for real.
			...(seed.openAccountInBrowser
				? {}
				: {
					openAccountPage: (url: string) => {
						const opened = (window as any).__inkOpenedAccountUrls as string[];
						opened.push(url);
					},
				}),
		});
	}, args);
}

async function visibleLowCreditNoticeTexts(): Promise<string[]> {
	return browser.execute(() => {
		return [...document.querySelectorAll(".ddc_ink_notice")]
			.filter((noticeEl) => {
				const element = noticeEl as HTMLElement;
				return element.offsetParent !== null
					&& (element.textContent?.includes("AI credits are running low") ?? false);
			})
			.map((noticeEl) => noticeEl.textContent ?? "");
	});
}

async function visibleLowCreditNoticeButtons(): Promise<string[]> {
	return browser.execute(() => {
		const noticeEl = [...document.querySelectorAll(".ddc_ink_notice")].find((candidate) => {
			const element = candidate as HTMLElement;
			return element.offsetParent !== null
				&& (element.textContent?.includes("AI credits are running low") ?? false);
		});
		if (!noticeEl) return [];
		return [...noticeEl.querySelectorAll("button")].map((button) => button.textContent ?? "");
	});
}

async function clickVisibleLowCreditButton(label: string) {
	const clicked = await browser.execute((buttonLabel) => {
		const noticeEl = [...document.querySelectorAll(".ddc_ink_notice")].find((candidate) => {
			const element = candidate as HTMLElement;
			return element.offsetParent !== null
				&& (element.textContent?.includes("AI credits are running low") ?? false);
		});
		const button = [...(noticeEl?.querySelectorAll("button") ?? [])].find(
			(candidate) => candidate.textContent === buttonLabel,
		);
		if (!(button instanceof HTMLElement)) return false;
		button.click();
		return true;
	}, label);
	expect(clicked).toBe(true);
}

async function readShownThresholds(): Promise<number[]> {
	return browser.executeObsidian(({ app }) => {
		const plugin = (app.plugins.plugins as any)["ink"];
		return plugin.readLowCreditNoticeState().shownThresholdsPercent as number[];
	});
}

async function readOpenedAccountUrls(): Promise<string[]> {
	return browser.execute(() => (window as any).__inkOpenedAccountUrls as string[]);
}

////////
////////

describe("Low credit notice", function () {
	before(async function () {
		await browser.reloadObsidian({ vault: "qa-test-vault" });
		await waitForPluginReady();
		await dismissBlockingPopups();
	});

	beforeEach(async function () {
		await resetLowCreditHarness();
	});

	it("does nothing when no account is linked, even at 1% remaining", async function () {
		await showLowCreditNotice({
			signedIn: false,
			remainingPercent: 1,
			...OCTOBER_PERIOD,
			loadMode: "cache",
		});
		expect(await visibleLowCreditNoticeTexts()).toEqual([]);
	});

	it("stays quiet above 5%, including 50% and 5.01%", async function () {
		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: 50,
			...OCTOBER_PERIOD,
			loadMode: "cache",
		});
		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: 5.01,
			...OCTOBER_PERIOD,
			loadMode: "cache",
		});
		expect(await visibleLowCreditNoticeTexts()).toEqual([]);
		expect(await readShownThresholds()).toEqual([]);
	});

	it("warns at exactly 5% and at 4% with View account and Dismiss", async function () {
		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: 5,
			...OCTOBER_PERIOD,
			loadMode: "cache",
		});
		const exactTexts = await visibleLowCreditNoticeTexts();
		expect(exactTexts).toHaveLength(1);
		expect(exactTexts[0]).toContain("You have less than 6% left.");

		await resetLowCreditHarness();

		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: 4,
			...OCTOBER_PERIOD,
			loadMode: "cache",
		});
		const texts = await visibleLowCreditNoticeTexts();
		expect(texts).toHaveLength(1);
		expect(texts[0]).toContain("AI credits are running low");
		expect(texts[0]).toContain("You have less than 5% left.");
		expect(await visibleLowCreditNoticeButtons()).toEqual(["View account", "Dismiss"]);
		expect(await readShownThresholds()).toEqual([5]);

		// The notice above records the click. Show a fresh one that opens the browser, then wait.
		if (process.env.SHOW_LOW_CREDIT_NOTICE === "1") {
			await resetLowCreditHarness();
			await showLowCreditNotice({
				signedIn: true,
				remainingPercent: 4,
				...OCTOBER_PERIOD,
				loadMode: "cache",
				openAccountInBrowser: true,
			});
			console.log("Low credit notice is on screen");
			await browser.pause(120000);
			return;
		}

		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: 4,
			...OCTOBER_PERIOD,
			loadMode: "cache",
		});
		expect(await visibleLowCreditNoticeTexts()).toHaveLength(1);

		await clickVisibleLowCreditButton("View account");
		const opened = await readOpenedAccountUrls();
		expect(opened).toHaveLength(1);
		expect(opened[0]).toContain("/account");
		expect(await visibleLowCreditNoticeTexts()).toEqual([]);
	});

	it("states the balance under the next whole percent, including 2.9% then 0.2%", async function () {
		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: 2.9,
			...OCTOBER_PERIOD,
			loadMode: "cache",
		});
		const fivePercentTexts = await visibleLowCreditNoticeTexts();
		expect(fivePercentTexts).toHaveLength(1);
		expect(fivePercentTexts[0]).toContain("You have less than 3% left.");
		expect(await readShownThresholds()).toEqual([5]);

		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: 0.2,
			...OCTOBER_PERIOD,
			loadMode: "cache",
		});
		const twoPercentTexts = await visibleLowCreditNoticeTexts();
		expect(twoPercentTexts).toHaveLength(1);
		expect(twoPercentTexts[0]).toContain("You have less than 1% left.");
		expect(await readShownThresholds()).toEqual([5, 2]);

		await resetLowCreditHarness();
		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: 1,
			...OCTOBER_PERIOD,
			loadMode: "cache",
		});
		expect((await visibleLowCreditNoticeTexts())[0]).toContain("You have less than 2% left.");
		expect(await readShownThresholds()).toEqual([2]);

		// The notice above records the click. Show a fresh 2% warning that opens the browser, then wait.
		if (process.env.SHOW_LOW_CREDIT_NOTICE === "1") {
			await resetLowCreditHarness();
			await showLowCreditNotice({
				signedIn: true,
				remainingPercent: 1,
				...OCTOBER_PERIOD,
				loadMode: "cache",
				openAccountInBrowser: true,
			});
			console.log("Low credit notice is on screen");
			await browser.pause(120000);
			return;
		}

		await resetLowCreditHarness();
		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: 2,
			...OCTOBER_PERIOD,
			loadMode: "cache",
		});
		expect((await visibleLowCreditNoticeTexts())[0]).toContain("You have less than 3% left.");
		expect(await readShownThresholds()).toEqual([2]);

		await resetLowCreditHarness();
		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: 0,
			...OCTOBER_PERIOD,
			loadMode: "cache",
		});
		expect((await visibleLowCreditNoticeTexts())[0]).toContain("You have less than 1% left.");
		expect(await readShownThresholds()).toEqual([2]);
	});

	it("says less than 1% when 0.5% remains", async function () {
		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: 0.5,
			...OCTOBER_PERIOD,
			loadMode: "cache",
		});
		const texts = await visibleLowCreditNoticeTexts();
		expect(texts).toHaveLength(1);
		expect(texts[0]).toContain("You have less than 1% left.");
		expect(texts[0]).not.toContain("less than 2%");
		expect(texts[0]).not.toContain("less than 5%");
		expect(await readShownThresholds()).toEqual([2]);

		if (process.env.SHOW_LOW_CREDIT_NOTICE === "1") {
			await resetLowCreditHarness();
			await showLowCreditNotice({
				signedIn: true,
				remainingPercent: 0.5,
				...OCTOBER_PERIOD,
				loadMode: "cache",
				openAccountInBrowser: true,
			});
			console.log("Low credit notice is on screen");
			await browser.pause(120000);
		}
	});

	it("warns again at 5% when the billing period changes", async function () {
		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: 4,
			...OCTOBER_PERIOD,
			loadMode: "cache",
		});
		expect(await visibleLowCreditNoticeTexts()).toHaveLength(1);
		// A 5% notice still on screen blocks another 5% warning, including a new period.
		await clickVisibleLowCreditButton("Dismiss");
		expect(await visibleLowCreditNoticeTexts()).toEqual([]);

		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: 4,
			...NOVEMBER_PERIOD,
			loadMode: "cache",
		});
		const texts = await visibleLowCreditNoticeTexts();
		expect(texts).toHaveLength(1);
		expect(texts[0]).toContain("You have less than 5% left.");
		const latch = await browser.executeObsidian(({ app }) => {
			return (app.plugins.plugins as any)["ink"].readLowCreditNoticeState();
		});
		expect(latch.userId).toBe("u1");
		expect(latch.periodKey).toBe("2026-11-01..2026-11-30");
		expect(latch.shownThresholdsPercent).toEqual([5]);
	});

	it("stays silent when the remaining percent is unknown", async function () {
		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: null,
			...OCTOBER_PERIOD,
			loadMode: "null",
		});
		expect(await visibleLowCreditNoticeTexts()).toEqual([]);
		expect(await readShownThresholds()).toEqual([]);
	});

	it("stays silent when the portal load throws", async function () {
		await showLowCreditNotice({
			signedIn: true,
			remainingPercent: null,
			...OCTOBER_PERIOD,
			loadMode: "throw",
		});
		expect(await visibleLowCreditNoticeTexts()).toEqual([]);
		expect(await readShownThresholds()).toEqual([]);
	});
});
