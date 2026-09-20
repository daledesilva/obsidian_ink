# Handwriting transcription eval fixtures

Each eval sample is a **pair** in this folder:

| Fixture ID | SVG | Expected transcript |
|---|---|---|
| `short - single paragraph` | `short - single paragraph.svg` | `short - single paragraph.expected.txt` |
| `short - multi-paragraph` | `short - multi-paragraph.svg` | `short - multi-paragraph.expected.txt` |
| `long - multi-paragraph` | `long - multi-paragraph.svg` | `long - multi-paragraph.expected.txt` |

- **`.svg`** — real Ink writing file (may include `<metadata>`; eval strips it for vision).
- **`.expected.txt`** — exact markdown/plain text you wrote by hand.

Manifest: `fixtures.ts` (`HANDWRITING_TRANSCRIPTION_FIXTURE_IDS`). Used by `tests/logic/handwriting-transcription-live.test.ts` when `HANDWRITING_TRANSCRIPTION_LIVE=1`.

Eval variants pass an allow-listed `model` in the job body. Production can omit `model` and use the portal env default (`OPENROUTER_HANDWRITING_TRANSCRIPTION_MODEL`).

```bash
HANDWRITING_TRANSCRIPTION_LIVE=1 \
ALMOSTUSEFUL_PORTAL_ORIGIN=https://your-staging-host \
ALMOSTUSEFUL_APP_ACCESS_TOKEN=your-token \
npm run test:unit -- tests/logic/handwriting-transcription-live.test.ts
```
