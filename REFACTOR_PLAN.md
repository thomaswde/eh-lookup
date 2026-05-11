# Refactor Plan

This project is in a good place functionally: the active app is small, static, and coherent. The refactor goal is not to rewrite it or add a framework. The goal is to keep every feature, reduce the amount of code a future change has to understand, and make the risky logic testable.

## Current Maintained Surface

Treat these as the active product files:

- `index.html`: single-page app, styles, markup, state, rendering, topology diagram, export flow.
- `catalog.eh.json`: product catalog data.
- `scripts/build-file-dev.mjs`: generates `index.file-dev.html` for `file://` development.

Treat these as historical/reference files unless explicitly revived:

- `old/`
- `v1_site/`
- `test_site/`
- `index.file-dev.html`

## Guiding Principles

- Preserve behavior first. The refactor should produce the same UI and same stack/export behavior before making feature changes.
- Prefer pure functions for domain logic: catalog lookups, stack rules, totals, compatibility warnings, topology planning.
- Keep rendering functions thin. Rendering should consume already-derived view models where practical.
- Avoid introducing a large build system unless needed. A simple ES module split plus lightweight tests is enough.
- Delete stale code before abstracting around it.

## Phase 0: Baseline And Safety Net

### Recommendations

- Add a tiny test harness using Node's built-in `node:test`.
- Extract the current inline script into a temporary testable module only where needed, or begin with duplicated pure functions in a new module and reconcile during Phase 1.
- Create behavioral fixtures for a few representative stacks:
  - One EDA only.
  - EDA plus ECA, EXA, ETA, ESU.
  - AIO plus ESU.
  - Mixed Enterprise-only and Reveal(x) 360-only components.
  - Orphaned ESU case.

### Acceptance Criteria

- `node --check` passes for the application script.
- Tests cover stack totals, stack validation, track conflicts, and ESU assignment.
- Existing `scripts/build-file-dev.mjs` still generates `index.file-dev.html`.

### Suggested Commands

```sh
node --check /tmp/extracted-eh-lookup-script.js
node --test
node scripts/build-file-dev.mjs
```

## Phase 1: Low-Risk Cleanup

### Recommendations

- Remove unused code:
  - `STACKABLE_PLATFORMS`
  - `deploymentKeysFor`
  - `fmtGbps`
  - `acceptsEsu`
  - `acceptsAnyEsu`
- Add shared HTML/SVG escaping helpers:
  - `escapeHtml(value)`
  - `escapeAttr(value)`
  - `escapeUrl(value)` or a URL allow-list helper for external references.
- Replace direct interpolation of user-controlled or catalog-controlled text in `innerHTML` strings.
- Keep the rendering structure intact during this phase; do not split major files yet.

### Acceptance Criteria

- Search, filters, cards, detail modal, stack builder, export preview, print, and download still work.
- User-entered stack names and notes render as text, not HTML.
- Catalog notes and links cannot inject arbitrary markup.

## Phase 2: Stack Domain Module

### Recommendations

Create a dedicated stack/domain section or file, eventually `src/stack.js`, containing:

- `getStackItems(stack, catalog)`
- `canAddToStack(stack, item, catalog)`
- `addStackItem(stack, itemName, catalog, qty)`
- `removeStackItem(stack, itemName)`
- `changeStackItemQty(stack, itemName, delta, catalog)`
- `computeStackTotals(stack, catalog)`
- `computeCompatibilityWarnings(stack, catalog)`

Use one UI helper for mutation side effects:

- `commitStackChange(nextStack, options)`

That helper should handle:

- `state.stack = nextStack`
- `persistStack()`
- `renderStack()`
- `pulseTotals()` when appropriate
- `updateCatalogAddedStates()`
- `updateFabCount()`

### Acceptance Criteria

- Stack rules are enforced in one place.
- UI handlers no longer duplicate persistence and repaint calls.
- Tests cover single EDA, single ECA, single EXA, track conflicts, quantity changes, and remove-to-zero behavior.

## Phase 3: Topology Planning And Diagram Split

### Recommendations

Keep `planTopology` pure and make it the contract between stack/domain logic and rendering.

Split the current topology code into smaller pieces:

- `planTopology(items)`
- `layoutTopology(plan, options)`
- `renderTopologySvg(layout, options)`
- `renderTopologyNode(node)`
- `renderTopologyConnection(edge)`
- `renderConnectionLegend(routes, bounds)`
- `renderEdgePortsRail(bounds)`

Avoid changing the visual design during this phase. The immediate win is separating:

- What components exist.
- Where components sit.
- How components and connections are drawn.

### Acceptance Criteria

- `renderTopologyDiagram` becomes a small coordinator, ideally under 40 lines.
- ESU assignment tests run without browser APIs.
- Generated SVG for known fixtures is stable enough to snapshot or compare by key substrings.
- Export preview still shows the same topology for the same stack.

## Phase 4: Export Flow Simplification

### Recommendations

- Compute topology once in `buildExportContent`, then pass the plan/layout into the diagram renderer.
- Centralize export CSS:
  - Keep a single `getExportStyles()` helper, or
  - Move export styles to a clearly named `<style id="export-styles">` block.
- Make `downloadExport` and `printExport` consume the same export document builder:
  - `buildExportDocument(content, title)`

### Acceptance Criteria

- Preview, print, and downloaded one-pager have matching content.
- Export CSS no longer has two independent sources of truth.
- Stack name, notes, and catalog values are escaped in all export paths.

## Phase 5: Rendering Organization

### Recommendations

If the app remains framework-free, split rendering by feature:

- `src/catalog-render.js`
- `src/detail-render.js`
- `src/stack-render.js`
- `src/export-render.js`
- `src/topology-render.js`
- `src/domain.js`
- `src/state.js`

Then update `index.html` to load:

```html
<script type="module" src="./src/app.js"></script>
```

Keep CSS in `index.html` initially unless it becomes a blocker. Moving CSS can be a later cleanup.

### Acceptance Criteria

- `index.html` is mostly markup and styles, with app logic loaded as modules.
- Each module has a clear responsibility.
- No circular dependencies between render modules and domain modules.

## Phase 6: Repo Hygiene

### Recommendations

- Decide whether historical folders should remain tracked.
- If they are only reference material, move them to an archive outside the maintained app path or document their purpose.
- Remove tracked OS/browser sidecar files:
  - `.DS_Store`
  - `*:Zone.Identifier`
- Expand `.gitignore`:

```gitignore
index.file-dev.html
.DS_Store
*:Zone.Identifier
```

### Acceptance Criteria

- `git status` is clean after regenerating `index.file-dev.html`.
- New contributors and AI agents can identify the active app files immediately.

## Proposed Execution Order

1. Phase 1: delete stale helpers and add escaping.
2. Phase 2: extract stack rules and totals with tests.
3. Phase 3: split topology planning/layout/rendering.
4. Phase 4: simplify export generation.
5. Phase 6: clean repo hygiene.
6. Phase 5: module split, only after the logic is stable.

The reason to delay the full module split is simple: extraction is much safer once the pure functions and rendering boundaries already exist.

## Definition Of Done

- No functionality removed.
- Active UI behavior is unchanged except for safer escaping.
- Pure domain logic has automated tests.
- Largest functions are reduced substantially:
  - `renderTopologyDiagram`: target under 40 lines as a coordinator.
  - `renderDetailBody`: target under 80 lines by extracting section renderers.
  - `planTopology`: acceptable if still moderately large, but covered by tests.
  - `addToStack` / `changeQty`: replaced with pure stack mutation helpers plus one commit path.
- Generated development file still works through `scripts/build-file-dev.mjs`.
- The maintained app surface is obvious from the repo root.

## Non-Goals

- No framework migration.
- No TypeScript migration unless the project starts growing beyond this static tool.
- No visual redesign.
- No catalog data model rewrite beyond small normalization helpers.
- No removal of existing stack, topology, detail, export, print, or download functionality.

