# Code Quality Review V2

Scope: current active app surface only: `index.html`, `src/domain.js`, `src/state.js`, `src/catalog-view.js`, `src/export-view.js`, `catalog.eh.json`, `scripts/build-file-dev.mjs`, and `test/domain.test.js`. This review does not use git history, old snapshots, or external context.

## Current Ratings

| Area | Rating | Notes |
|---|---:|---|
| Code quality | 7.6/10 | The core logic is better isolated, the app has real module boundaries, and data normalization is now deliberate. |
| Readability | 7.2/10 | The code is easier to navigate than before, though `index.html` and `export-view.js` still contain large rendering blocks. |
| Simplicity | 6.5/10 | The architecture is cleaner, but there are now two normalization paths and several render styles mixed together. |
| Senior-dev maintainability | 7.3/10 | The direction is solid. A senior dev could work in this now without immediately needing a rescue refactor, but the UI layer still needs finishing. |

## Summary

The project has moved from a mostly monolithic single-page HTML app toward a small, modular client application. The strongest parts are now the domain layer, state boundary, catalog metadata helpers, and expanded test coverage. The previous concrete defects are mostly addressed:

- Unknown module keys no longer crash rendering because `moduleMeta()` has a fallback.
- Persisted stack quantities are normalized and invalid entries are dropped.
- Domain functions clamp odd quantities before computing totals or mutating stack state.
- Popup-blocked print behavior now falls back to download.
- Catalog load failure and empty catalog states are visible to the user.
- Stack group unit pluralization is fixed.
- Tests expanded from the original narrow domain surface to cover edge cases and helper boundaries.

The remaining work is not emergency cleanup. It is architecture finishing work: reduce the remaining large files, remove duplicated rules, and make browser-level behavior easier to verify.

## 1. Finish Extracting UI Rendering From `index.html`

Impact: High  
Effort: Medium  
Status: Partially done

`index.html` is smaller and healthier than before, but it still owns too much active application behavior: filter popovers, catalog cards, detail modal rendering, stack rendering, event wiring, drawer control, export open/close, and bootstrap.

Recommended next modules:

- `src/catalog-grid-view.js`: filtering, sorting, catalog grid, cards, active filter chips.
- `src/detail-view.js`: detail modal header/body rendering and item detail sections.
- `src/stack-view.js`: stack panel rendering, totals rendering, node controls, drop-zone behavior.
- `src/app-controller.js`: app bootstrap and event wiring.

Target shape:

- `index.html` should provide static shell markup, CSS, and script imports.
- View modules should receive dependencies explicitly, similar to `createExportView()`.
- DOM mutation should live in view/controller modules, not scattered across the shell.

Senior-dev bar: changing the detail modal should not require paging through stack mutation, export behavior, and catalog bootstrap code.

## 2. Consolidate Stack Normalization Into One Owner

Impact: High  
Effort: Low to Medium  
Status: Needs cleanup

Both `src/state.js` and `src/domain.js` normalize stack entries. The implementations are not identical: domain normalization knows about sensors and singleton roles, while state normalization only knows ids and quantities. This is understandable because persisted state loads before the catalog is available, but two rule sets invite drift.

Recommended direction:

- Make `src/domain.js` the owner of catalog-aware stack normalization.
- Keep `src/state.js` responsible for safe storage access, JSON parsing, and primitive persisted values.
- When loading persisted stack data, store raw stack entries temporarily, then normalize with `domain.normalizeStackEntries()` once the catalog is loaded.
- Rename any remaining state helper to make the boundary clear, for example `parsePersistedStack()` instead of `normalizeStack()`.

Senior-dev bar: there should be one canonical definition of a valid stack.

## 3. Make Filter Options Fully Catalog-Driven

Impact: Medium  
Effort: Low  
Status: Partially done

The rendering path now handles unknown module keys through `moduleMeta()`, but module filter options still come from `Object.keys(MODULE_META)`. If a future catalog entry adds a valid new module before metadata is updated, it can render but cannot be filtered.

Recommended direction:

- Derive module filter keys from the loaded catalog with `moduleKeys(item)`.
- Sort known modules by current metadata order and unknown modules alphabetically.
- Use `moduleMeta()` for all labels, colors, and descriptions.
- Optionally surface unknown module filters with a neutral color and fallback description.

Senior-dev bar: catalog data should drive catalog controls.

## 4. Split `export-view.js` Into Document and Topology Modules

Impact: Medium  
Effort: Medium  
Status: Partially done

Moving export logic out of `index.html` was the right call, but `src/export-view.js` is now a large specialized module. It mixes one-pager document composition, topology planning/layout, SVG primitives, connection legend rendering, export CSS, and HTML document wrapping.

Recommended split:

- `src/topology-view.js`: layout, SVG nodes, cables, legends, edge-port rail.
- `src/export-document-view.js`: one-pager content, export styles, document wrapper.
- Keep `src/export-view.js` as a thin factory if you want one public entry point.

Senior-dev bar: topology visual changes and one-pager content changes should be separable.

## 5. Add Browser-Level Smoke Tests

Impact: Medium  
Effort: Medium  
Status: Missing

The current Node tests are useful and pass, but the remaining app risk lives in the browser: DOM rendering, modal behavior, drag/drop-adjacent paths, drawer state, export preview, generated SVG visibility, and catalog load fallbacks.

Recommended smoke coverage:

- App loads catalog and shows nonzero appliance count.
- Search filters the grid.
- Add an appliance to the stack and verify totals update.
- Open details and add from the modal.
- Open export preview and verify the topology SVG is present.
- Toggle "Show connections" and verify export content updates.
- Simulate or stub popup blocking for print fallback if practical.

Senior-dev bar: a simple browser test should catch a broken script import, missing global, empty grid, or blank export before a user does.

## 6. Normalize Rendering Helpers For Repeated UI Patterns

Impact: Medium  
Effort: Low to Medium  
Status: Still useful

There is less duplication than before, but repeated string templates remain for module tags, status badges, metric cards, icon buttons, stack nodes, export list rows, and warning blocks.

Recommended direction:

- Add small helpers for module tags, metric blocks, status pills, and appliance summary metadata.
- Keep export HTML and SVG string generation where that is practical.
- Prefer DOM-node construction for interactive UI sections where event handlers are attached afterward.

Senior-dev bar: repeated concepts should have one path unless there is a specific UX reason to diverge.

## Suggested Work Order

1. Consolidate stack normalization ownership between `state` and `domain`.
2. Make module filters catalog-driven.
3. Extract `stack-view.js` from `index.html`.
4. Extract `detail-view.js` from `index.html`.
5. Split topology rendering out of `export-view.js`.
6. Add browser smoke tests for load, stack, modal, and export flows.

## Updated Assessment

This codebase is now in a good middle state. It is no longer a fragile single-file app, and the new tests cover the most important data-boundary risks. The main thing holding it below an 8/10 is incomplete separation in the UI layer: `index.html` still does real application work, and `export-view.js` has become a second large island.

The next refactor should be calm and incremental. Do not rewrite the app. Move one view surface at a time, keep the existing UMD-style module pattern unless you decide to introduce a build step, and add a small test around each boundary as it moves.
