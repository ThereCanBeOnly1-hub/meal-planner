# Meal Planner — CLAUDE.md

## Project

- React + TypeScript (ts-nocheck) SPA, built with Vite, deployed on Vercel
- Single file: `src/App.tsx` (all components, styles, helpers in one file)
- Supabase (REST API, no SDK) for persistence

## Supabase tables

- **meals**: week_start, day, slot, meal_name, thaw, thaw_days, recipe_id, updated_at
- **recipes**: id, name, description, url, photo (TEXT), notes (TEXT), prep_time, cook_time, base_servings, meal_types (jsonb), diet_tags (jsonb), cuisine_tags (jsonb DEFAULT '[]'::jsonb), ingredients (jsonb), steps (jsonb), updated_at
- **extras**: week_start, type (snack|dessert), name
- **app_settings**: key (TEXT PK), value (jsonb) — stores custom_tags: {mealtypes:[], diets:[], cuisines:[]}
- **lists**: id (TEXT PK), name, type ('grocery'|'custom'), icon, position, created_at, updated_at
- **list_items**: id (TEXT PK), list_id (FK→lists, ON DELETE CASCADE), text, checked, position, qty, unit, category, source_recipe_id (last four reserved for Phase 2), created_at, updated_at

## Architecture notes

- All styles in a single `s` object at the bottom of App.tsx
- CSS string `css` for hover/active states (inline styles can't do :hover)
- `isLoadingRef` + `hasLoadedRef` guards prevent syncing before first load completes
- **All DB writes go through `dbWrite(label, fn)`** (fn is a thunk returning the sb promise). On failure it records `{label, message, fn}` in `failedWrites` and shows a sticky top banner with Retry (re-runs the thunk) / Dismiss. A successful *read* (poll) can NOT clear a failed *write* — only a successful retry/dismiss does (this is what makes failed saves loud instead of silently reverting). `label` is the user-facing message ("Couldn't save the meal"). When adding a new write path, route it through `dbWrite`.
- `syncExtrasLockRef` mutex prevents concurrent DELETE+INSERT races on extras
- `visibilitychange` throttled to once per 5s via `lastVisibilityLoadRef`
- `loadAll(opts)` bails early if `isLoadingRef.current` is true (concurrent load guard). `opts.recipes:false` skips the recipe fetch (polls do this — recipes change rarely + carry base64 photos; refetched on mount/visibility via `recipesLoadedRef`). `opts.silent` skips the "syncing" indicator (background polls). It builds all next-values, computes a JSON `sig`, and **skips every `setState` when `sig` matches `lastPayloadSigRef`** — so a no-op poll causes zero re-renders. The 10s poll is paused while `document.hidden`.
- Meals sync **synchronously and per-cell** on each `week` change (no debounce timer): it writes only the cells that differ from `lastSyncedWeekRef`, and only when `lastSyncedWsRef` matches the current week (`viewedWeekStartRef`). This guarantees a meal edit is written to the week it was made on and can never write one week's data onto another (the prior debounce-timer version raced across week navigation). `pendingMealsRef` reconciles in `loadAll` like lists. `lastPayloadSigRef` is reset on week change so navigation always applies the loaded week. Extras use a short post-edit guard (`extrasDirtyRef`) instead.
- `viewedWeekStart` drives which week is loaded; `viewedWeekStartRef` keeps it current for async callbacks
- `nextWeekMeals` loaded alongside current week to compute cross-week thaw reminders; `prevWeekMeals` (week before viewed) loaded too, used by Auto-Fill to avoid repeating last week's recipes
- `weatherData` fetched from Open-Meteo (no API key); location stored in localStorage as `mealplanner_loc`
- `customTags` stored in Supabase app_settings table AND localStorage fallback
- `history.pushState` used for all navigation (tab changes, modals, panels, confirms) so Android back button works
- App-level popstate handler only responds to states with a `tab` property (ignores overlay states)
- Tab history state carries `recipeId`/`recipeEdit` (recipes) and `listId` (lists); views resolve the object from state by id so reload/back is robust
- Lists: normalized (`lists` + `list_items`), loaded in `loadAll`. Item ops (`addListItem`/`toggleListItem`/`deleteListItem`/`clearListItems`) are optimistic + per-row upsert/delete so concurrent co-editing doesn't clobber.
- Sync race fix: optimistic list writes register in `pendingListRef` (id → {kind,…}); `loadAll` re-applies pending adds/toggles/deletes on top of fetched data so a 10s poll firing mid-write can't flicker a just-edited item out. Entries linger ~2.5s after the write settles (covers a poll that started mid-write), then the server is source of truth. NOTE: meals/extras (week-scoped) don't yet have this guard. Grocery is a singleton with fixed id `GROCERY_ID` ("grocery") — auto-created on load if missing (idempotent across devices), can't be deleted
- List item quantity model: `sources[]` = `{id,name,measures}` per contributing recipe (stored as JSON in `source_recipe_id`); `measures[]` = the displayed total; `manual` = override flag. `qty` column stores `{measures,manual}` (legacy bare arrays still parse via `parseItemQty`). Total = `sumSourceMeasures(sources)` unless `manual` (the user's override wins). Removing a recipe re-sums the rest (`removeRecipesFromGrocery`); editing a recipe item's quantity sets `manual` and moves it to the **Adjusted** list section. Grocery list groups unchecked items: **Added by you** (no sources) → **Adjusted** (sources + manual) → **From recipes**. Tapping 🍽 shows a stacked per-recipe breakdown with amounts. Legacy items (no per-recipe amounts) keep their total on removal as a fallback.
- Remove-by-recipe: `removeRecipesFromGrocery(recipeIds)` deletes grocery items added only by those recipes; shared items keep the item and just drop the selected recipes from `sources`. Two entry points: "🛒 Remove from grocery (N)" on RecipeDetail (single, when `groceryCountForRecipe` > 0), and "📖 Delete by recipe" in the grocery list's ⋯ menu → checkbox modal of contributing recipes (`recipeSources`).
- Manual quantity edit: tap an item's qty (or "+ qty") on the grocery list/drawer to set it; `setItemQty` stores `parseQtyInput(text)` as the item's `measures` (overrides recipe quantities). Only enabled for grocery lists (`qtyEditable`).
- Grocery auto-populate: `addRecipesToGrocery` (and `addRecipeToGrocery`/`addWeekToGrocery`) appends ingredients; recipe-sourced items dedupe/aggregate against each other and existing recipe-sourced lines by `groceryKey` (name sans prep notes), summing `measures` whose units match after `unitKey` canonicalization (UNIT_CANON maps full names/plurals/variants like pound/lbs→lb); displayed via `unitDisplay` as the short abbreviation. Manual items are never merged into. `computeDupKeys` flags items present as both manual and recipe-sourced ("dup" badge). Entry points: Recipe detail "Add to grocery", grocery drawer "Add this week's meals"

## Confirmations

- **Reusable `ConfirmModal`** (styled overlay) backs the destructive-action confirms in the lists area: Delete checked, Delete all, Delete list (ListDetail menu), Delete checked (grocery drawer), and custom-tag delete (TagPicker). Clear Week / Clear Day / Delete Recipe / Delete-by-recipe use their own equivalent styled modals. Every bulk/clear/delete action has a confirm; single-item removals (the ✕ on one meal/list-item/snack) intentionally don't, to avoid confirm-fatigue. When adding a destructive action, gate it behind `ConfirmModal`.

## Key components

- **App**: top-level state, data fetching, sync
- **PlannerView**: week grid, header with week nav + weather, thaw banners, meal modal, extras panel, Auto-Fill panel. Bottom-nav tab labelled "Meals" (🍽️) but the internal tab key is still `"planner"`. Per-day 🗑 "clear day" (confirm). A meal not tied to a recipe shows "➕ Create a recipe" in its modal → `createRecipeFromMeal` opens a pre-filled new recipe editor and stashes `pendingMealLinkRef`; on save the meal cell gets the new `recipeId` (and the user lands back on Meals). `displayMealName(entry)` shows a linked meal's name from the *recipe* (so renaming the recipe keeps the planner in sync), falling back to the stored `meal` text.

## Auto-Fill

- Module-level engine: `generateSlotPlan(recipes, slot, opts)` and `generateWeekPlan(recipes, slots, opts)` (pure). Per slot, picks a weekday segment (Mon–Fri: 1 recipe, or random 1–2 for Dinner) laid out as **consecutive blocks** (`afLayBlocks`) to match meal-prep, plus a single weekend recipe (Sat–Sun) distinct from the weekday picks when possible (repeats allowed as fallback). Only recipes tagged for that slot are eligible.
- Variety: `opts.avoidIds` (last week's recipe ids per slot, from `prevWeekMeals` via `afBuildAvoid`) steers picks away from last week's recipes, but only if that leaves ≥2 usable recipes so within-week variety wins. Controlled by the `afAvoidLast` toggle ("Avoid last week's meals", default on) in the panel — only shown when the prior week actually has recipe-linked meals (`afHasPrev`). `opts.prevKey` + `afPlanKey` make a re-roll retry until it differs day-by-day from the previous roll (swapped days count as different; identical pool of 1 can't change).
- `✨ Auto-Fill` button in the planner header opens a preview panel (overlay history pattern, `{overlay:"autofill"}`). Options: which slots to fill, and mode = "keep existing, fill gaps" vs "replace whole week".
- Preview groups consecutive same-meal days into segments (`afSegments`); per-slot 🔄 re-roll regenerates just that slot, 🔀 shuffles all. Apply writes into week state (same sync path as manual edits), setting `recipeId` directly so meals link to recipes. Replace mode shows an overwrite confirm counting affected meals; empty mode never touches existing meals.
- **ThawItemRow**: shared component for thaw reminder rows
- **RecipesView**: router between RecipeGrid / RecipeDetail / RecipeEditor
- **ListsView**: router between ListIndex (grocery pinned + custom list cards + create) and ListDetail (add/check/delete items, clear checked/all, rename/delete list)
- **GroceryDrawer**: app-level slide-out grocery quick-panel, opened by a floating 🛒 button (hidden on the Lists tab); reuses the App-level list ops so adds/checks sync live. Uses overlay history pattern (`{overlay:"grocery"}`); "Open full list →" jumps to the Lists tab grocery view
- **ShoppingMode**: full-screen in-store view (button on grocery list). Groups items by store aisle in walk order, big tap rows, qty shown, progress bar, checked items drop to "In the cart" newest-first, 📍 reassigns an item's aisle (remembered). Overlay history pattern (`{overlay:"shopping"}`)
- **TagPicker**: reusable tag selector used in RecipeEditor, supports custom tags via props; "Manage" toggle reveals an ✕ on custom chips to delete them (built-in tags can't be deleted). Deleting calls `deleteCustomTag`, which removes the tag from the vocab AND strips it from every recipe using it (via `recipeToRow` bulk upsert), so no recipe is left referencing a removed tag.
- **RecipeGrid**: recipe list with collapsed Meal/Diet/Cuisine filter dropdowns; header has Import + New buttons
- **ImportModal**: "From link" / "From photo" recipe import; calls `/api/import-recipe`, normalizes result via `normalizeImported()`, then opens RecipeEditor pre-filled for review
- **RecipeDetail**: hero photo, meta, ingredients (3-col), steps with dividers, notes at bottom
- **RecipeEditor**: full recipe form including photo upload (canvas-resized to 600px JPEG)

## Recipe import

- `api/import-recipe.ts` — Vercel serverless function (Node). POST `{type:"url",url}` or `{type:"photo",imageBase64}` → `{recipe}` shaped like the editor.
- URL path: server-fetches the page (browser-like UA), prefers schema.org JSON-LD, falls back to stripped page text, then hands it to Claude (`claude-sonnet-4-6`) with a `save_recipe` tool whose schema mirrors the recipe shape. Photo path: same model via vision.
- Tag vocab (MEAL_TYPE_TAGS/DIET_TAGS/CUISINE_TAGS) is duplicated in the function. mealTypes is enum-locked to the existing list; diet/cuisine prefer existing tags but may coin at most 1-2 canonical new ones when nothing fits. `RecipeGrid.reconcileImportedTags()` then case-insensitively maps imported diet/cuisine tags onto existing vocab, or registers genuinely-new ones via `onAddCustomTag` so they appear pre-selected in the review editor (user confirms or deletes before saving).
- Errors are mapped to clear user messages: low credit balance → "API balance too low…", unfetchable/paywalled URL, no-recipe-found, missing/invalid key.
- Photo import sends a 1568px copy for OCR and keeps a 600px copy as the recipe photo; nothing auto-saves — user always reviews in the editor first.
- ImportModal uses the overlay history pattern: pushes `{overlay:"import"}`; all exits (✕/backdrop/success/back) call `history.back()`, and a `pendingRef` defers opening the editor until that entry unwinds (keeps Android back single-press clean).

## Shopping Mode / aisle categorization

- Store layout = ordered sections `{id,label,hints,aisle}` (`aisle` number marks numbered aisles vs wall sections). `DEFAULT_STORE_LAYOUT` seeds Mariano's (walk-path order); editable via `LayoutEditor` (rename label/description, reorder up/down — ids stay stable so the cache survives) and persisted in `app_settings` key `store_layout` → `storeLayout` state. Doubles as category set, Claude prompt hints, and sort order. `"other"` ("Not sorted") is the catch-all. The move-to picker uses `layoutPickerOrder` (wall sections first, then aisles, then other) showing label + description.
- `normIngredient` builds a cache key from an item name (strips quantities/units/filler words, drops text after a comma) — note it deliberately keeps frozen/canned/dried since those change the aisle.
- `ingredientCats` cache (normName → sectionId) persists in `app_settings` key `ingredient_categories`, shared across devices.
- `api/categorize.ts` (Vercel, reuses `ANTHROPIC_API_KEY`): batched Claude call, takes uncached names + current `storeLayout` sections, returns name→sectionId (enum-constrained). Called by `categorizeGroceryItems` only for cache misses, on entering Shopping Mode. Low-balance error surfaces in the Shopping Mode banner.
- `setItemAisle` overrides + remembers an ingredient's aisle in the cache.

## Testing

- Unit tests with Vitest: `npm test` (run once) / `npm run test:watch`. Config in `vitest.config.ts` (separate from vite.config so it can't affect the build; environment `node`).
- Tier 1 (unit): pure helpers are exported from `App.tsx` via a single `export { … }` block (no logic moved; tree-shaken out of the app bundle) and tested in `src/App.test.ts` (node env). When adding/altering a pure helper (parsing, scaling, sync primitives like `mealCellEq`, grocery/unit logic, auto-fill engine), add a test.
- Tier 2 (component): prop-driven components (`RecipesView`, `TagPicker`, `ListDetail`, `ListItemsList`, `ListIndex`, `ShoppingMode`) are exported the same way and tested in `src/components.test.tsx` (`// @vitest-environment jsdom`, React Testing Library — render with fake props, fire events, assert callbacks). Covers navigation/UI flows like New→Cancel, custom-tag add/delete, list item add/check/delete.
- `src/**/*.test.{ts,tsx}` is excluded from `tsconfig.app.json` so `tsc -b` (the build) ignores tests.

## Deployment

- Git push to main → auto-deploys via Vercel
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`, `ANTHROPIC_API_KEY` (server-only — no `VITE_` prefix — used by `api/import-recipe.ts`)

## Supabase setup notes

- app_settings table needs: `ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY; GRANT ALL ON app_settings TO anon, authenticated;`
- recipes table needs columns: `photo TEXT`, `notes TEXT`, `cuisine_tags JSONB DEFAULT '[]'::jsonb`

## Known patterns

- Never use `!important` in inline style objects (use CSS string for hover overrides)
- Tag chips use `className` + CSS for hover; selected state uses `day-chip-sel` class to override hover
- Photos stored as base64 data URLs (resized client-side) or http URLs in `recipe.photo` field
- Time strings parsed by `parseMinutes()` which handles "30 min", "1 hr", "1h 30m" etc.
- Week starts on Monday; `weekStart()` returns YYYY-MM-DD of current Monday
- `addWeeks(ws, n)` shifts a week-start string by n weeks
- `getWeeksInMonth(year, month)` returns array of Monday strings for that month
