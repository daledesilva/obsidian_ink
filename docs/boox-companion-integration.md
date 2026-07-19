# Boox companion app integration (Obsidian Ink)

> **Cross-component documentation** for how Obsidian Ink and eInk Bridge work together lives in the **eink-bridge** repo, not here:
>
> - **[Obsidian Ink surfaces and eInk Bridge](../../eink-bridge/docs/implementations/obsidian-ink-surfaces-and-boox.md)** — writing/drawing embeds and dedicated views, session stack, leaf visibility, writing resize queue
> - **[Obsidian Ink drawing embed integration (protocol)](../../eink-bridge/docs/implementations/obsidian-ink-embed-integration.md)** — WebSocket messages and Bridge behaviour
> - **[Single active embed constraint](../../eink-bridge/docs/implementations/single-active-embed-constraint.md)** — one unlocked embed when Boox is enabled

For **USB debugging and correlated logs**, see [Debugging on device](debugging-on-device.md) (plugin) and [Debugging eInk Bridge on device](../../eink-bridge/docs/debugging-on-device.md) (native app).

Plugin implementation entry point: `src/connections/boox/boox-connection.ts`.
