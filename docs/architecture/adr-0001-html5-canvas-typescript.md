# ADR-0001: HTML5 Canvas 2D + TypeScript instead of an installed engine

## Status
Accepted (2026-11-23)

## Context
- The repository had no engine install, no game code and no `/setup-engine` run.
- The template's version pin points at Godot 4.7, but no Godot binary exists in the
  development container, and the editor can't be fetched here.
- The project rules require every player-observable change to be launched and observed,
  with screenshot evidence in `production/qa/evidence/`. Doing that needs a runtime we can drive headlessly.

## Decision
Implement Wild Frontier as a browser game:
- **Language and rendering:** TypeScript, rendered with the Canvas 2D API at a low internal resolution and integer-upscaled for pixel-perfect art.
- **Build:** bundled by esbuild.
- **Assets:** every sprite and sound is generated procedurally at runtime, so no third-party or unlicensed assets are needed.
- **Fonts:** the only external assets, all three under the SIL Open Font License.

## Consequences
- **Positive:**
  - Zero-install play, and a single-file distributable (`dist/wild-frontier.html`).
  - Fully automated verification: Node unit tests, plus Playwright end-to-end tests with screenshots.
  - Data and logic layers are engine-agnostic and could be ported to Godot later.
- **Negative:**
  - Canvas 2D has a lower performance ceiling than a GPU engine.
  - No editor tooling, so all world layout is data or procedural.
  - Gamepad support and localization are not implemented yet; both are listed as known limitations.

## ADR Dependencies
None.

## Engine Compatibility
- Not tied to the Godot pin in `docs/engine-reference/godot/VERSION.md`.
- Requires a browser with ES2022, Canvas 2D, Web Audio and `OffscreenCanvas` (with a DOM canvas fallback).

## GDD Requirements Addressed
- Open-world streaming (§4 of the architecture doc).
- Horse simulation (design/gdd/horse-system.md).
- Save system.
- Procedural pixel-art visual direction.
- Verified, runnable builds.
