# Version and welcome notices

## Why it exists

Ink uses persistent Obsidian notices for first-run onboarding (`welcome-notice.ts`) and for “what’s new” after a plugin upgrade (`version-notices.ts`). Both share `notice-components.ts` so scroll layout, footer CTAs, and pointer handling stay consistent. Version tips gate on vault-synced `onboardingTips.lastVersionTipRead` in `data.json`; welcome tips use `welcomeTipRead`.

---

## Conceptual understanding

**Welcome flow** — One notice with several pages, shown on first load when `welcomeTipRead` is false. A first install does not also show the version notice (`showOnboardingTips_maybe` skips it). Only the last page finishes the series. That sets both `welcomeTipRead` and `lastVersionTipRead`, so the upgrade tip does not appear on the next launch.

Each **Continue** or **Read now** replaces the text and footer inside the same card. The card fades that content and eases its height. It does not close and open another notice, so other notices keep their place in the stack.

Pages, in order:

| Page | What it tells the user | Footer |
|------|------------------------|--------|
| Welcome to ink | Pen input in Markdown notes | **Read now** continues. **Remind me later** hides and does not mark the series read |
| Inserting handwriting sections | Command `"Ink: new handwriting section"` | **Continue**. **Remind me later** hides and does not mark the series read |
| Other sections | **Drawings:** `"Ink: new drawing"`. **Trace photos:** `"Ink: Insert handwriting/drawing from photos"` (the palette name of `create-handwriting-from-photo`) | **Continue** opens the account page. **Remind me later** hides and does not mark the series read |
| Handwriting transcription | Optional Almost Useful subscription for turning handwriting into searchable text | **Continue** and **Remind me later**. Neither marks the series read |
| Syncing with your vault | Ink files sync with the vault; Obsidian Sync needs “sync all other types” | **Continue**. **Remind me later** hides and does not mark the series read |
| Get involved | Bug reports and the feature-demo and social links | **Dismiss** finishes the series |

The transcription page is not last. It sits directly after **Other sections** because a new install never sees the version notice’s account controls. **Continue** replaces it with the syncing page and does not mark the series finished. **Remind me later** hides the card and leaves the series unfinished, so a later **Welcome tips...** in settings can show it again. **Link account** opens Ink settings and then does the same advance as **Continue**. It does not finish the series. **Create account** opens portal sign-up and leaves this page up.

**Stroke-limit tip** — The two-page “lines disappearing” tip uses the same one-card paging (`stroke-limit-notice.ts`). **Learn why** swaps the page in place. **Dismiss for now** hides it and does not set `strokeLimitTipRead`. The second page’s **Dismiss** hides it and sets that flag.

**Version flow** — Single-page **Changes in Ink v…** notice when the installed manifest version is newer than `lastVersionTipRead` (semver compare; `-beta` suffix stripped). **Dismiss** hides the notice and writes `lastVersionTipRead` to the current manifest version. `showRecentChanges()` always shows the current page for manual QA (command/settings entry).

**Account controls on the version notice** — After the changelog, the same centred **Link account** / **Create account** stack as the welcome transcription page (`appendAlmostUsefulNoticeAccountCta`). On this notice only, **Link account** hides the notice, marks `lastVersionTipRead`, then opens Ink settings so the notice does not sit over the account section. **Create account** does not hide it. **Dismiss** hides it and marks the tip read.

```mermaid
flowchart TD
  Load[Plugin load] --> First{welcomeTipRead?}
  First -->|no| Welcome[Welcome series]
  First -->|yes| Semver{manifest version greater than lastVersionTipRead?}
  Semver -->|yes| Version[Version notice]
  Semver -->|no| Skip[No tip]
  Welcome --> Handwriting[Handwriting section]
  Handwriting --> Other[Other sections]
  Other --> Account[Handwriting transcription]
  Account -->|Continue or Link account| Sync[Syncing]
  Account -->|Link account| Settings[Ink settings stays open]
  Welcome -->|Remind me later| HideLater["Hide, series not finished"]
  Handwriting -->|Remind me later| HideLater
  Other -->|Remind me later| HideLater
  Account -->|Remind me later| HideLater
  Sync -->|Remind me later| HideLater
  Sync --> Involved[Get involved]
  Involved -->|Dismiss| Finish[welcomeTipRead and lastVersionTipRead]
  Version -->|Link account| EndVersion[Hide, save lastVersionTipRead, open settings]
  Version -->|Create account| StayOpen[Notice stays visible]
  Version -->|Dismiss| EndVersionDismiss[Hide and save lastVersionTipRead]
```

**Interaction rule:** **Create account** leaves whichever notice is open, because the browser covers Obsidian and the explanation should still be there. **Link account** is not the same on both notices. The version notice ends so settings are uncovered. The welcome transcription page advances to syncing instead, and settings opens underneath that next tip.

---

## Technical details

| Piece | Location |
|-------|----------|
| Version gate + changelog | `version-notices.ts` — `showVersionNotice`, `showChanges` |
| Welcome carousel, including Other sections and the transcription page | `welcome-notice.ts` |
| Shared Link account / Create account stack | `almostuseful-link-account-button.ts` — `appendAlmostUsefulNoticeAccountCta` |
| Onboarding gate | `main.ts` — `showOnboardingTips_maybe` |
| One-card paging, fade, and height ease | `notice-components.ts` — `launchPagedNotice`; `notice-components.scss` — `--ddc_ink_notice-page-ms` |
| Template, footer bar, body CTA row | `notice-components.ts`, `notice-components.scss` |
| Stroke-limit two-page tip | `stroke-limit-notice.ts` |
| Persistence | `onboardingTips.welcomeTipRead` and `lastVersionTipRead` in vault `data.json` |
| Welcome e2e | `tests/e2e/onboarding.e2e.ts` clicks `.ddc_ink_notice-cta-bar .ddc_ink_primary-btn` so the transcription page’s **Continue** is used, not **Link account** |
| QA pre-seed | `qa-test-vault/generate.mjs` sets `lastVersionTipRead` so `open-qa` skips the popup |

**Notice helpers**

- `createNoticeBodyCtaRow(scrollAreaEl)` — `.ddc_ink_notice-body-cta-row` flex container in scroll content.
- `createNoticeBodyCtaButton(parentEl, label)` — primary button inside that row (replaces the old one-button-per-wrapper API).

---

## Technical Gotchas

- **Create account must stay open** — The shared helper wires that click. Hiding on that link loses the explanation when the browser overlays Obsidian.
- **Welcome Link account must not finish the series** — It opens settings and advances to syncing. Copying the version-notice handler here marks `welcomeTipRead` and drops the remaining pages.
- **Welcome Remind me later does not finish the series** — Every page except **Get involved** uses it. The card hides and both onboarding flags stay unset. When the notice element leaves the screen, `tipsShowingOrDismissed` clears, so **Welcome tips...** in settings can open the series again. **Continue** on the transcription page still does not finish the series. Only **Dismiss** on **Get involved** sets both flags.
- **Page clicks must not reach `.notice`** — Obsidian hides a notice when a click bubbles to `.notice`, which slides the whole card away and leaves the welcome guard set. `wireNoticePointerHandling` stops those clicks. Real dismiss paths call `notice.hide()` themselves.
- **Do not move Ink notices onto the main workspace window** — Obsidian parents a notice to the focused window, including a separate Settings window. Reparenting the card to the main window makes a click raise that window and send Settings to the background.
- **A fade is in progress for 160ms** — `--ddc_ink_notice-page-ms`. Another page request during that fade replaces the queued page. It does not stack a second notice. Reduced motion swaps immediately.
- **Welcome transcription copy is not the settings description** — The page says an optional Almost Useful account is a subscription for transcribing handwriting into searchable text. Settings keeps its own Link account description.
- **`showRecentChanges` bypasses semver** — Useful for settings “Recent changes”; does not update `lastVersionTipRead` unless the user clicks **Dismiss**.
- **Beta suffix** — `showVersionNotice` strips `-beta` before semver compare so beta builds still match the release tip version string.
- **`manifest.version` must be valid semver** — `showVersionNotice` calls `semVer.gt` on the current version during onload. `semver` throws `Invalid Version` for a two-part string such as `0.6`. That throw fails plugin load (`Plugin failure: ink`). Use three numeric parts (`0.6.0`). `semVer.valid` is only applied to `lastVersionTipRead`, so a bad current version is not skipped. The notice heading `Changes in Ink v0.6.1` is display copy and is not the string passed to `semver`.
- **Footer vs body CTAs** — Footer uses `createNoticeCtaBar` (primary/tertiary + links); scroll-body actions use the body CTA row so multiple primaries can sit on one line.

High-contrast restyle of these notices (layout-stable 1px border + 1px outline) is documented in [High contrast user interface](high-contrast-user-interface.md).
