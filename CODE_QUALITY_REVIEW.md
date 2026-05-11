# Code Quality Review: Top 5 Improvements

Scope: current active app surface only (`index.html`, `src/domain.js`, `catalog.eh.json`, `scripts/build-file-dev.mjs`, and `test/domain.test.js`). This does not include git history, old snapshots, or external context.

Overall assessment: the project has a useful, working shape and a notably better pure domain layer than UI layer. The main risk is that `index.html` has become the place where almost everything lives: rendering, app state, catalog metadata, topology layout, export generation, persistence, and event wiring. That is manageable today, but it will get expensive quickly as the catalog and workflows grow.

## 1. Split the UI Monolith Into Small Modules

Impact: High  
Effort: Medium  
Why it matters: `index.html` is carrying CSS, markup, state, card rendering, detail rendering, stack rendering, topology SVG generation, export generation, persistence, and event wiring in one file. That makes local changes harder to reason about and raises regression risk because unrelated concerns share the same global scope.

Recommended direction:

- Move app state and persistence into a small `src/state.js` module.
- Move catalog display helpers and metadata into `src/catalog-view.js`.
- Move stack rendering into `src/stack-view.js`.
- Move export and topology SVG generation into `src/export-view.js`.
- Keep `index.html` mostly as static shell markup and script imports.

Senior-dev bar: a new contributor should be able to change the export layout without mentally paging through filter popovers, card click handlers, and localStorage bootstrap.

## 2. Harden Catalog and Persisted Data Boundaries

Impact: High  
Effort: Low to Medium  
Why it matters: the catalog is treated as trusted internal data, but it is still a data boundary. Unknown module keys currently crash render paths, and persisted stack quantities are loaded from localStorage without normalization.

Specific fixes:

- Add a safe module metadata helper, for example `moduleMeta(key)`, with a fallback label/color/description.
- Use that helper everywhere instead of direct `MODULE_META[m]` access.
- Normalize persisted stack entries to `{ id, qty }` where `id` exists in the catalog and `qty` is a positive integer.
- Clamp quantities in domain functions as well, so the pure layer remains safe even when called by future UI code.

Senior-dev bar: malformed localStorage or a new catalog field should degrade gracefully, not break the app.

## 3. Expand Tests Around Domain Edge Cases and UI Helpers

Impact: High  
Effort: Medium  
Why it matters: `src/domain.js` is the best-structured code in the app and already has useful tests. The tests cover happy paths and a few rule violations, but the riskier behaviors are around malformed inputs, quantity normalization, mixed ESU assignment, and export/topology assumptions.

Recommended tests:

- Unknown or removed catalog items in a saved stack.
- Zero, negative, fractional, string, and `NaN` quantities.
- Duplicate ESU types with multiple hosts and capacity limits.
- Unknown module metadata fallback.
- Empty stack export/topology output.
- Popup-blocked print behavior if that logic gets extracted behind a function.

Senior-dev bar: the domain layer should make invalid states hard to create, and tests should pin the weird cases that future refactors are likely to disturb.

## 4. Reduce Repeated HTML String Rendering

Impact: Medium  
Effort: Medium  
Why it matters: the app repeatedly builds large HTML strings with similar escaping, tags, module pills, metric cards, appliance summaries, and buttons. Most values are escaped carefully, which is good, but the duplication makes it easy for one path to be safer or more polished than another.

Recommended direction:

- Create small render helpers for repeated concepts: module tags, status badges, appliance summary bits, metric cards, and icon buttons.
- Prefer helper functions that return DOM nodes for interactive UI, especially cards and stack nodes.
- Keep HTML-string rendering where it is genuinely useful, such as generated export documents and SVG strings.

Senior-dev bar: repeated UI concepts should have one implementation unless there is a clear product reason for divergence.

## 5. Add Defensive UX Handling for Browser-Specific Paths

Impact: Medium  
Effort: Low  
Why it matters: the app uses browser APIs that can fail depending on browser policy or context: `window.open`, file downloads, localStorage, and catalog fetches. Some paths already handle failures, but a few still assume success.

Specific fixes:

- Guard `window.open` in `printExport()` and show a toast or fall back to `downloadExport()`.
- Consider showing an in-app catalog load failure state rather than silently rendering an empty catalog.
- Keep the file-dev catalog fallback, but make the empty-catalog failure visible to the user.
- Fix small presentation correctness issues like the stack group pluralization bug.

Senior-dev bar: user actions should fail visibly and recoverably, especially export actions.

## Suggested Order

1. Fix the concrete defects from the review findings.
2. Add data normalization and fallback helpers.
3. Add tests for the new boundary behavior.
4. Extract export/topology rendering from `index.html`.
5. Extract remaining UI rendering and state management into small modules.

This order keeps the first pass practical: stabilize behavior first, then make the codebase easier to change without pulling the whole app apart at once.
