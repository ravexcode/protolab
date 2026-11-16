# ProtoLab: guide for AI agents

ProtoLab is a browser editor for breadboards (protoboards): a 2D SVG editor, a 3D view built with Three.js, and a local MCP bridge that lets AI agents edit the boards. It is a static site with no build step and no runtime dependencies. Live at https://ravexcode.github.io/protolab/.

## Commands

```bash
npm start        # serve the site at http://localhost:8000 (ES modules do not load from file://)
npm test         # syntax-check every script, then run the node:test suites in tests/
npm run bridge   # start the MCP bridge on 127.0.0.1:7337
```

Run `npm test` before every commit. CI runs it on Node 18, 20 and 22, and a green `main` deploys to GitHub Pages.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | All markup, including the SVG icon sprite and the MCP dialog |
| `css/style.css` | All styles. Design tokens live in `:root` at the top |
| `js/catalog.js` | Component definitions (`kind` decides placement, `shape` decides drawing) |
| `js/board.js` | Board geometry: holes, rails, footprints, hole names. Pure, no DOM |
| `js/draw2d.js` | SVG markup for every part, plus `esc()` and `safeColor()` |
| `js/editor2d.js` | Pointer handling: place, select, move, pan, pinch zoom |
| `js/view3d.js` | Three.js scene. Loaded lazily, so 2D works without WebGL |
| `js/ai.js` | Tools exposed to agents and the link to the bridge |
| `js/app.js` | State, localStorage, undo history, panels, menus |
| `bridge/protolab-mcp.mjs` | MCP server (HTTP and stdio) relaying tool calls to the open tab |
| `tests/` | `node:test` suites. No browser needed |
| `vendor/` | Three.js r160 and the Barlow fonts. Do not edit |

## Rules that are easy to break

- **Units.** Everything is in pitch units (1 = 2.54 mm). A hole is `[column, y]`: top rails y=0,1; rows a–e y=3..7; rows f–j y=10..14; bottom rails y=16,17. The same numbers drive 2D (x, y) and 3D (x, z).
- **A part exists in three places.** Adding a `shape` means a catalog entry, a 2D drawing in `draw2d.js` and a 3D model in `view3d.js`. The catalog test fails if the 2D drawing emits `NaN` or `undefined`.
- **User text is untrusted.** Board names, labels and values reach `innerHTML`. Pass them through `esc()`; pass colours through `safeColor()`. Imported JSON goes through `sanitizeBoard()`.
- **Every edit is one undo step.** Mutate `app.board`, then call `commit()` once. It saves, records history and redraws 2D, 3D and the panels.
- **Storage.** Boards live in `localStorage` under `protolab.v1`; the AI link settings under `protolab.ai`. Changing the shape of saved data needs a migration in `sanitizeBoard()`.
- **Bridge security.** It listens on 127.0.0.1 only, rejects any request to `/mcp` that carries an `Origin` header, checks the `Host` header, and accepts the page channel only from the allowed origins. Keep `tests/bridge.test.mjs` passing and extend it when you touch this.
- **Language.** Code and comments in English. Interface text in Spanish, sentence case.
- **No new dependencies or build tools** without asking the maintainer.

## Design system

The interface is an electronics workbench: the canvas is a green cutting mat, the chrome around it is quiet datasheet paper, and the breadboard is the only loud object. Follow this when changing any UI.

- **Tokens** (`css/style.css`, `:root`): `--paper`, `--paper-2`, `--line`, `--ink`, `--muted`, `--mat`, `--blue`, `--red`. A dark theme overrides them under `prefers-color-scheme: dark`. Use tokens, never raw hex, outside `:root`.
- **Colour meaning.** Blue and red come from the breadboard's power rails. Blue is selection, focus and the one primary action. Red is destructive only. The active tool or tab is filled with `--ink`.
- **Type.** Barlow for text, Barlow Semi Condensed 600 for headings and the wordmark. No uppercase labels, no letter-spacing tricks, no monospace except real commands.
- **Shape.** Panels are flat and flush. Only floating things (toolbar, menu, toast, dialog, sheets) get a radius of 10px or more and `--float-shadow`. Controls use 6px.
- **Icons.** Stroke icons from the sprite at the top of `index.html`: `<svg class="ico" aria-hidden="true"><use href="#i-name"/></svg>`. Icon-only buttons need `aria-label` and `title`.
- **Desktop (over 900px).** Component palette on the left, inspector on the right, tools floating over the 2D pane.
- **Phone (900px and under).** Panels become bottom sheets opened from the five-tab bar; undo, redo and fit float top right; a bar with Editar and Eliminar appears when a part is selected. Touch targets are at least 42px and inputs are 16px so iOS does not zoom.
- **Copy.** Say what the control does in the user's words. Empty states tell the user what to do next. Errors say what happened and how to fix it. Use `toast()` for feedback, `confirm()` only before destroying something.
- **Floor.** Visible `:focus-visible`, `prefers-reduced-motion` respected, safe-area insets on the bars, no `transition: all`.

## Skills

Two design skills are installed in the project, in `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex, OpenCode and others). `skills-lock.json` pins them; `npx skills experimental_install` restores them.

- `frontend-design`: use before designing or restyling any interface. It asks for a short plan (palette, type, layout) checked against the brief before writing code.
- `web-design-guidelines`: use to review UI changes for accessibility, focus, forms, motion and touch behaviour before finishing.

## Verifying UI work

Tests cover logic only. After a UI change, open the site and check it by hand, or with a headless browser, at 1440px and at 390px, in light and dark, in 2D, 3D and split view: place a wire and an IC, move one, undo, open both phone sheets, and open the MCP dialog.

## Commits and releases

Small commits with an imperative subject line. Pushing to `main` runs `.github/workflows/ci-cd.yml`, which tests and then publishes `index.html`, `css/`, `js/`, `vendor/` and `bridge/`. Anything a visitor must download has to be in one of those.

## Licence

MIT with the Commons Clause condition (see `LICENSE`). Keep third-party notices in `LICENSE` up to date when adding anything to `vendor/`.
