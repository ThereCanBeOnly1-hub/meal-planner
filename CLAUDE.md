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
- `nextWeekMeals` loaded alongside current week to compute cross-week thaw reminders
- `weatherData` fetched from Open-Meteo (no API key); location stored in localStorage as `mealplanner_loc`
- `customTags` stored in Supabase app_settings table AND localStorage fallback
- `history.pushState` used for all navigation (tab changes, modals, panels, confirms) so Android back button works
- App-level popstate handler only responds to states with a `tab` property (ignores overlay states)

## Key components

- **App**: top-level state, data fetching, sync
- **PlannerView**: week grid, header with week nav + weather, thaw banners, meal modal, extras panel
- **ThawItemRow**: shared component for thaw reminder rows
- **RecipesView**: router between RecipeGrid / RecipeDetail / RecipeEditor
- **TagPicker**: reusable tag selector used in RecipeEditor, supports custom tags via props
- **RecipeGrid**: recipe list with collapsed Meal/Diet/Cuisine filter dropdowns
- **RecipeDetail**: hero photo, meta, ingredients (3-col), steps with dividers, notes at bottom
- **RecipeEditor**: full recipe form including photo upload (canvas-resized to 600px JPEG)

## Deployment

- Git push to main → auto-deploys via Vercel
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`

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
