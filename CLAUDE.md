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

## Architecture notes

- All styles in a single `s` object at the bottom of App.tsx
- CSS string `css` for hover/active states (inline styles can't do :hover)
- `isLoadingRef` + `hasLoadedRef` guards prevent syncing before first load completes
- `syncExtrasLockRef` mutex prevents concurrent DELETE+INSERT races on extras
- `visibilitychange` throttled to once per 5s via `lastVisibilityLoadRef`
- `loadAll` bails early if `isLoadingRef.current` is true (concurrent load guard)
- `viewedWeekStart` drives which week is loaded; `viewedWeekStartRef` keeps it current for async callbacks
- `nextWeekMeals` loaded alongside current week to compute cross-week thaw reminders; `prevWeekMeals` (week before viewed) loaded too, used by Auto-Fill to avoid repeating last week's recipes
- `weatherData` fetched from Open-Meteo (no API key); location stored in localStorage as `mealplanner_loc`
- `customTags` stored in Supabase app_settings table AND localStorage fallback
- `history.pushState` used for all navigation (tab changes, modals, panels, confirms) so Android back button works
- App-level popstate handler only responds to states with a `tab` property (ignores overlay states)

## Key components

- **App**: top-level state, data fetching, sync
- **PlannerView**: week grid, header with week nav + weather, thaw banners, meal modal, extras panel, Auto-Fill panel

## Auto-Fill

- Module-level engine: `generateSlotPlan(recipes, slot, opts)` and `generateWeekPlan(recipes, slots, opts)` (pure). Per slot, picks a weekday segment (Mon–Fri: 1 recipe, or random 1–2 for Dinner) laid out as **consecutive blocks** (`afLayBlocks`) to match meal-prep, plus a single weekend recipe (Sat–Sun) distinct from the weekday picks when possible (repeats allowed as fallback). Only recipes tagged for that slot are eligible.
- Variety: `opts.avoidIds` (last week's recipe ids per slot, from `prevWeekMeals` via `afBuildAvoid`) steers picks away from last week's recipes, but only if that leaves ≥2 usable recipes so within-week variety wins. Controlled by the `afAvoidLast` toggle ("Avoid last week's meals", default on) in the panel — only shown when the prior week actually has recipe-linked meals (`afHasPrev`). `opts.prevKey` + `afPlanKey` make a re-roll retry until it differs day-by-day from the previous roll (swapped days count as different; identical pool of 1 can't change).
- `✨ Auto-Fill` button in the planner header opens a preview panel (overlay history pattern, `{overlay:"autofill"}`). Options: which slots to fill, and mode = "keep existing, fill gaps" vs "replace whole week".
- Preview groups consecutive same-meal days into segments (`afSegments`); per-slot 🔄 re-roll regenerates just that slot, 🔀 shuffles all. Apply writes into week state (same sync path as manual edits), setting `recipeId` directly so meals link to recipes. Replace mode shows an overwrite confirm counting affected meals; empty mode never touches existing meals.
- **ThawItemRow**: shared component for thaw reminder rows
- **RecipesView**: router between RecipeGrid / RecipeDetail / RecipeEditor
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
