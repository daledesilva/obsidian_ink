# Handwriting transcription eval fixtures

Each eval sample is a **pair** in this folder:

| Fixture ID | SVG | Expected transcript |
|---|---|---|
| `short - single paragraph` | `short - single paragraph.svg` | `short - single paragraph.expected.txt` |
| `short - multi-paragraph` | `short - multi-paragraph.svg` | `short - multi-paragraph.expected.txt` |
| `long - multi-paragraph` | `long - multi-paragraph.svg` | `long - multi-paragraph.expected.txt` |

- **`.svg`** — real Ink writing file (may include `<metadata>`; eval strips it for vision).
- **`.expected.txt`** — exact markdown/plain text you wrote by hand.

Manifest: `fixtures.ts` (`HANDWRITING_TRANSCRIPTION_FIXTURE_IDS`).

## Run live eval

```bash
HANDWRITING_TRANSCRIPTION_LIVE=1 npm run test:unit -- tests/logic/handwriting-transcription-live.test.ts
```

**Default auth (`device`):** starts OAuth device login, opens your browser to the portal, polls until you authorize Ink — no token copy/paste.

Optional env:

| Variable | Purpose |
|---|---|
| `ALMOSTUSEFUL_PORTAL_ORIGIN` | Staging host (default `https://account.almostuseful.xyz`) |
| `ALMOSTUSEFUL_LIVE_AUTH` | `device` (default), `paste`, or `env` |
| `ALMOSTUSEFUL_APP_ACCESS_TOKEN` | Skip login when set (`env` mode, or forces env mode) |

**Paste mode** (interactive terminal):

```bash
HANDWRITING_TRANSCRIPTION_LIVE=1 ALMOSTUSEFUL_LIVE_AUTH=paste \
npm run test:unit -- tests/logic/handwriting-transcription-live.test.ts
```

Paste an `eyJ…` access token from Obsidian localStorage, or a fresh `device_code` after approving on `/oauth/device`.

Runs **12 portal calls** (3 fixtures × 4 variants) and debits Pool A credits.
