# Version and welcome notices

## Why it exists

Ink uses persistent Obsidian notices for first-run onboarding (`welcome-notice.ts`) and for “what’s new” after a plugin upgrade (`version-notices.ts`). Both share `notice-components.ts` so scroll layout, footer CTAs, and pointer handling stay consistent. Version tips gate on vault-synced `onboardingTips.lastVersionTipRead` in `data.json`; welcome tips use `welcomeTipRead`.

---

## Conceptual understanding

**Welcome flow** — Multi-page carousel on first load when `welcomeTipRead` is false. Footer **Read now** / **Remind me later**; completing or dismissing sets `welcomeTipRead`.

**Version flow** — Single-page **Changes in Ink v…** notice when the installed manifest version is newer than `lastVersionTipRead` (semver compare; `-beta` suffix stripped). **Dismiss** hides the notice and writes `lastVersionTipRead` to the current manifest version. `showRecentChanges()` always shows the current page for manual QA (command/settings entry).

**v0.6 page (handwriting OCR)** — Promotes handwriting transcription and Almost Useful sign-in:

| Element | Behaviour |
|---------|-----------|
| **h2** | `Handwriting transcriptions (OCR)` |
| Body | Invite-only copy; only the product name **Almost Useful** is `<strong>` |
| **Link account** | Same CTA chrome as settings (`applyAlmostUsefulLinkAccountButtonChrome`, including `ddc_ink_primary-btn`). Centred. Hides the notice, marks `lastVersionTipRead`, then opens Ink settings (`openInkSettingsTab`) so the notice does not sit over the account section |
| **Create account** | Centred tertiary text link (`ddc_ink_tertiary-text-link`) under **Link account**, same `0.825em` stack gap as settings. Opens `{portalOrigin}/auth/sign-up` (`openAlmostUsefulBrowserUrl`). Does **not** hide the notice |
| **View feature demos** | Footer link to YouTube (unchanged pattern) |
| **Dismiss** | Hides notice and marks version tip read |

Body CTAs use a centred **`ddc_ink_almostuseful-link-account-cta-stack`** inside **`createNoticeBodyCtaRow`** (not the footer bar). **Join the waitlist** is gone.

```mermaid
flowchart TD
  Load[Plugin load] --> Semver{manifest version > lastVersionTipRead?}
  Semver -->|yes| Show[showChanges persistent notice]
  Semver -->|no| Skip[No version tip]
  Show --> Link[Link account → hide + save lastVersionTipRead + Ink settings]
  Show --> Create[Create account → portal sign-up]
  Show --> Dismiss[Dismiss → hide + save lastVersionTipRead]
  Create --> StayOpen[Notice stays visible]
```

**Interaction rule:** **Link account** hides the notice (and marks the tip read) so settings are not covered. **Create account** leaves it open so invite copy is still there when the browser overlays Obsidian. **Dismiss** also hides and marks the tip read.

---

## Technical details

| Piece | Location |
|-------|----------|
| Version gate + v0.6 copy | `version-notices.ts` — `showVersionNotice`, `showChanges` |
| Welcome carousel | `welcome-notice.ts` |
| Template, footer bar, body CTA row | `notice-components.ts`, `notice-components.scss` |
| Persistence | `PluginSettings.onboardingTips.lastVersionTipRead` (vault `data.json`) |
| QA pre-seed | `qa-test-vault/generate.mjs` sets `lastVersionTipRead` so `open-qa` skips the popup |

**Notice helpers**

- `createNoticeBodyCtaRow(scrollAreaEl)` — `.ddc_ink_notice-body-cta-row` flex container in scroll content.
- `createNoticeBodyCtaButton(parentEl, label)` — primary button inside that row (replaces the old one-button-per-wrapper API).

---

## Technical Gotchas

- **Create account must stay open** — Hiding on that link loses the invite copy when the browser overlays Obsidian. **Link account** is the exception: it must hide so it does not cover Settings.
- **`showRecentChanges` bypasses semver** — Useful for settings “Recent changes”; does not update `lastVersionTipRead` unless the user clicks **Dismiss**.
- **Beta suffix** — `showVersionNotice` strips `-beta` before semver compare so beta builds still match the release tip version string.
- **`manifest.version` must be valid semver** — `showVersionNotice` calls `semVer.gt` on the current version during onload. `semver` throws `Invalid Version` for a two-part string such as `0.6`. That throw fails plugin load (`Plugin failure: ink`). Use three numeric parts (`0.6.0`). `semVer.valid` is only applied to `lastVersionTipRead`, so a bad current version is not skipped. The notice heading `Changes in Ink v0.6` is display copy and is not the string passed to `semver`.
- **Footer vs body CTAs** — Footer uses `createNoticeCtaBar` (primary/tertiary + links); scroll-body actions use the body CTA row so multiple primaries can sit on one line.

High-contrast restyle of these notices (layout-stable 1px border + 1px outline) is documented in [High contrast user interface](high-contrast-user-interface.md).
