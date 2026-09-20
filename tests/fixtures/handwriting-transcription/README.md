# Handwriting transcription eval fixtures

Drop real handwriting SVG files here with a sidecar `*.expected.txt` containing the exact markdown you wrote.

Used by `tests/logic/handwriting-transcription-live.test.ts` when `HANDWRITING_TRANSCRIPTION_LIVE=1`.

Eval variants pass an allow-listed `model` in the job body. Production can omit `model` and use the portal env default (`OPENROUTER_HANDWRITING_TRANSCRIPTION_MODEL`).
