import { describe, it, expect } from "vitest";
import {
  parseMinutes, formatMinutes,
  parseQty, formatQty, scaleAmount,
  normIngredient, groceryKey, unitKey, unitDisplay, ingredientToMeasure, mergeMeasures, formatMeasures, parseQtyInput, parseItemQty, sumSourceMeasures,
  normalizeImported, addWeeks,
  mealCellEq, mealRow,
  afLayBlocks, generateSlotPlan, layoutPickerOrder,
  sortListItems,
  sortRecipes, nextRecipeStatus, lastMadeLabel,
} from "./App";

// ─── Time parsing ──────────────────────────────────────────────────────────────
describe("parseMinutes / formatMinutes", () => {
  it("parses common time strings", () => {
    expect(parseMinutes("30 min")).toBe(30);
    expect(parseMinutes("1 hr")).toBe(60);
    expect(parseMinutes("1h 30m")).toBe(90);
    expect(parseMinutes("1.5 hr")).toBe(90);
    expect(parseMinutes("90")).toBe(90);
    expect(parseMinutes("")).toBe(0);
  });
  it("formats minutes back to short strings", () => {
    expect(formatMinutes(0)).toBeNull();
    expect(formatMinutes(30)).toBe("30 min");
    expect(formatMinutes(60)).toBe("1 hr");
    expect(formatMinutes(90)).toBe("1 hr 30 min");
  });
});

// ─── Quantity parsing/formatting (source of the fraction bugs) ───────────────────
describe("parseQty", () => {
  it("parses numbers, fractions, mixed, and unicode", () => {
    expect(parseQty("2")).toBe(2);
    expect(parseQty(".5")).toBe(0.5);
    expect(parseQty("1/2")).toBe(0.5);
    expect(parseQty("1 1/2")).toBe(1.5);
    expect(parseQty("½")).toBe(0.5);
    expect(parseQty("1½")).toBe(1.5);
  });
  it("returns null for non-numeric and ranges", () => {
    expect(parseQty("a pinch")).toBeNull();
    expect(parseQty("1/4-1/2")).toBeNull(); // a range isn't a single quantity
    expect(parseQty("")).toBeNull();
  });
});

describe("formatQty", () => {
  it("snaps to clean unicode fractions", () => {
    expect(formatQty(2)).toBe("2");
    expect(formatQty(0.5)).toBe("½");
    expect(formatQty(1.5)).toBe("1½");
    expect(formatQty(0.25)).toBe("¼");
    expect(formatQty(1 / 3)).toBe("⅓");
  });
});

describe("scaleAmount", () => {
  it("normalizes to fractions even at base servings (the reported bug)", () => {
    expect(scaleAmount("1/4-1/2", 4, 4)).toBe("¼–½");
    expect(scaleAmount("1/2", 4, 4)).toBe("½");
  });
  it("scales by the servings ratio", () => {
    expect(scaleAmount("1/2", 4, 8)).toBe("1");
    expect(scaleAmount("1/4-1/2", 4, 8)).toBe("½–1");
    expect(scaleAmount("2", 4, 2)).toBe("1");
  });
  it("leaves non-numeric amounts verbatim", () => {
    expect(scaleAmount("a pinch", 4, 8)).toBe("a pinch");
    expect(scaleAmount("", 4, 8)).toBe("");
  });
});

// ─── Grocery normalization / units / aggregation ────────────────────────────────
describe("normIngredient", () => {
  it("strips quantities, units, and filler words to a cache key", () => {
    expect(normIngredient("1 lb lean ground beef")).toBe("ground beef");
    expect(normIngredient("1 lb ground beef")).toBe("ground beef"); // same key as above
    expect(normIngredient("2 cups Organic Flour")).toBe("flour");
  });
  it("keeps aisle-determining words like frozen", () => {
    expect(normIngredient("Frozen Peas")).toBe("frozen peas");
  });
});

describe("groceryKey", () => {
  it("drops prep notes after a comma", () => {
    expect(groceryKey("Onion, diced")).toBe("onion");
    expect(groceryKey("  MILK ")).toBe("milk");
  });
});

describe("unit canonicalization", () => {
  it("maps variants to one key for merging", () => {
    expect(unitKey("pound")).toBe("lb");
    expect(unitKey("lbs")).toBe("lb");
    expect(unitKey("cups")).toBe("cup");
  });
  it("displays known units abbreviated, unknown verbatim", () => {
    expect(unitDisplay("pound")).toBe("lb");
    expect(unitDisplay("leaves")).toBe("leaves");
  });
});

describe("ingredientToMeasure / mergeMeasures / formatMeasures", () => {
  it("builds numeric vs text measures", () => {
    expect(ingredientToMeasure("1", "pound")).toEqual({ amount: 1, unit: "lb" });
    expect(ingredientToMeasure("", "")).toBeNull();
    expect(ingredientToMeasure("a pinch", "")).toEqual({ text: "a pinch" });
  });
  it("sums matching units (pound + lbs), keeps mismatched units separate", () => {
    const merged = mergeMeasures([{ amount: 1, unit: "lb" }], [{ amount: 1, unit: "lbs" }]);
    expect(merged).toEqual([{ amount: 2, unit: "lb" }]);
    const mixed = mergeMeasures([{ amount: 1, unit: "cup" }], [{ amount: 200, unit: "g" }]);
    expect(mixed).toHaveLength(2);
  });
  it("formats measures for display", () => {
    expect(formatMeasures([{ amount: 2, unit: "lb" }])).toBe("2 lb");
    expect(formatMeasures([{ amount: 1, unit: "cup" }, { amount: 200, unit: "g" }])).toBe("1 cup + 200 g");
  });
});

describe("parseQtyInput (manual quantity edit)", () => {
  it("parses amount + unit, plain numbers, and fractions", () => {
    expect(parseQtyInput("2 lbs")).toEqual([{ amount: 2, unit: "lb" }]);
    expect(parseQtyInput("1 1/2 cups")).toEqual([{ amount: 1.5, unit: "cup" }]);
    expect(parseQtyInput("3")).toEqual([{ amount: 3, unit: "" }]);
  });
  it("keeps non-numeric quantities as text, and empty as none", () => {
    expect(parseQtyInput("a dozen")).toEqual([{ text: "a dozen" }]);
    expect(parseQtyInput("")).toEqual([]);
  });
});

describe("per-recipe quantity model", () => {
  it("sumSourceMeasures adds matching units across recipes (the subtraction primitive)", () => {
    const sources = [
      { id: "r1", name: "Tacos", measures: [{ amount: 1, unit: "lb" }] },
      { id: "r2", name: "Soup", measures: [{ amount: 1, unit: "lb" }] },
    ];
    expect(formatMeasures(sumSourceMeasures(sources))).toBe("2 lb");
    // removing Soup → re-sum the rest → 1 lb
    expect(formatMeasures(sumSourceMeasures(sources.filter(s => s.id !== "r2")))).toBe("1 lb");
  });
  it("parseItemQty reads legacy arrays and the new {measures,manual} shape", () => {
    expect(parseItemQty(JSON.stringify([{ amount: 2, unit: "lb" }]))).toEqual({ measures: [{ amount: 2, unit: "lb" }], manual: false });
    expect(parseItemQty(JSON.stringify({ measures: [{ amount: 3, unit: "lb" }], manual: true }))).toEqual({ measures: [{ amount: 3, unit: "lb" }], manual: true });
    expect(parseItemQty(null)).toEqual({ measures: [], manual: false });
  });
});

// ─── Meal cell equality (the sync correctness primitive) ────────────────────────
describe("mealCellEq", () => {
  const cell = (o = {}) => ({ meal: "Tacos", thaw: false, thawDays: 2, recipeId: null, ...o });
  it("treats identical cells as equal (incl. default thawDays)", () => {
    expect(mealCellEq(cell(), cell())).toBe(true);
    expect(mealCellEq({ meal: "X" }, { meal: "X", thawDays: 2 })).toBe(true);
  });
  it("detects differences", () => {
    expect(mealCellEq(cell(), cell({ meal: "Pizza" }))).toBe(false);
    expect(mealCellEq(cell(), cell({ recipeId: "r1" }))).toBe(false);
    expect(mealCellEq(cell(), cell({ thaw: true }))).toBe(false);
  });
  it("returns false for missing cells", () => {
    expect(mealCellEq(null, cell())).toBe(false);
    expect(mealCellEq(cell(), undefined)).toBe(false);
  });
});

describe("mealRow", () => {
  it("maps an entry to the meals row shape", () => {
    const row = mealRow("2026-06-01", "Monday", "Dinner", { meal: "Tacos", thaw: true, thawDays: 3, recipeId: "r1" });
    expect(row).toMatchObject({ week_start: "2026-06-01", day: "Monday", slot: "Dinner", meal_name: "Tacos", thaw: true, thaw_days: 3, recipe_id: "r1" });
  });
});

// ─── Recipe import normalization ────────────────────────────────────────────────
describe("normalizeImported", () => {
  it("maps extracted data into an editable recipe with ids", () => {
    const r = normalizeImported({
      name: "Soup",
      ingredients: [{ amount: "2", unit: "cups", name: "broth" }],
      steps: ["Boil it"],
      baseServings: 6,
    });
    expect(r.name).toBe("Soup");
    expect(r.baseServings).toBe(6);
    expect(r.ingredients).toHaveLength(1);
    expect(r.ingredients[0]).toMatchObject({ amount: "2", unit: "cups", name: "broth" });
    expect(r.ingredients[0].id).toBeTruthy();
    expect(r.steps[0]).toMatchObject({ text: "Boil it" });
    expect(r.steps[0].id).toBeTruthy();
  });
  it("defaults servings and tolerates missing fields", () => {
    const r = normalizeImported({});
    expect(r.baseServings).toBe(4);
    expect(Array.isArray(r.mealTypes)).toBe(true);
  });
});

// ─── Dates ──────────────────────────────────────────────────────────────────────
describe("addWeeks", () => {
  it("shifts a week-start string by n weeks", () => {
    expect(addWeeks("2026-06-01", 1)).toBe("2026-06-08");
    expect(addWeeks("2026-06-08", -1)).toBe("2026-06-01");
  });
});

// ─── Auto-fill engine (invariants, since it's randomized) ───────────────────────
describe("afLayBlocks", () => {
  it("fills every day with a single pick", () => {
    const out = afLayBlocks(["a", "b", "c", "d", "e"], [{ recipeId: "1", name: "A" }]);
    expect(Object.values(out).every(v => v && v.recipeId === "1")).toBe(true);
  });
  it("lays two picks as consecutive blocks (no alternating)", () => {
    const days = ["a", "b", "c", "d", "e"];
    const picks = [{ recipeId: "1" }, { recipeId: "2" }];
    const seq = days.map(d => afLayBlocks(days, picks)[d].recipeId);
    // exactly one transition point between the two blocks
    let transitions = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) transitions++;
    expect(transitions).toBe(1);
  });
});

describe("generateSlotPlan", () => {
  const recipes = [
    { id: "1", name: "Eggs", mealTypes: ["Breakfast"] },
    { id: "2", name: "Cereal", mealTypes: ["Breakfast"] },
    { id: "3", name: "Yogurt", mealTypes: ["Breakfast"] },
  ];
  it("fills all 7 days and keeps the weekend a single recipe", () => {
    for (let i = 0; i < 20; i++) {
      const plan = generateSlotPlan(recipes, "Breakfast");
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      expect(days.every(d => plan[d] && plan[d].recipeId)).toBe(true);
      expect(plan["Saturday"].recipeId).toBe(plan["Sunday"].recipeId);
      // weekend distinct from the weekday pick (pool is big enough)
      expect(plan["Saturday"].recipeId).not.toBe(plan["Monday"].recipeId);
    }
  });
  it("returns all-null when no recipes are tagged for the slot", () => {
    const plan = generateSlotPlan(recipes, "Dinner");
    expect(Object.values(plan).every(v => v === null)).toBe(true);
  });
});

describe("layoutPickerOrder", () => {
  it("lists wall sections first, then aisles, then 'other' last", () => {
    const layout = [
      { id: "produce", aisle: null },
      { id: "aisle5", aisle: 5 },
      { id: "dairy", aisle: null },
      { id: "other", aisle: null },
    ];
    expect(layoutPickerOrder(layout).map(s => s.id)).toEqual(["produce", "dairy", "aisle5", "other"]);
  });
});

// ─── List sorting ────────────────────────────────────────────────────────────────
describe("sortListItems", () => {
  const items = [
    { id: "a", text: "Banana", position: 2, created_at: "2026-01-03" },
    { id: "b", text: "apple",  position: 0, created_at: "2026-01-01" },
    { id: "c", text: "Cherry", position: 1, created_at: "2026-01-02" },
  ];
  const ids = (mode) => sortListItems(items, mode).map(i => i.id);

  it("manual = position order (default)", () => {
    expect(ids("manual")).toEqual(["b", "c", "a"]);
    expect(ids("whatever")).toEqual(["b", "c", "a"]); // unknown falls back to manual
  });
  it("a-z / z-a are case-insensitive", () => {
    expect(ids("az")).toEqual(["b", "a", "c"]); // apple, Banana, Cherry
    expect(ids("za")).toEqual(["c", "a", "b"]);
  });
  it("recent = newest created first, oldest = reverse", () => {
    expect(ids("recent")).toEqual(["a", "c", "b"]);
    expect(ids("oldest")).toEqual(["b", "c", "a"]);
  });
  it("does not mutate the input array", () => {
    const arr = [...items];
    sortListItems(arr, "az");
    expect(arr.map(i => i.id)).toEqual(["a", "b", "c"]);
  });
  it("recent/oldest fall back to position when created_at is missing", () => {
    const noDates = [
      { id: "x", text: "x", position: 1 },
      { id: "y", text: "y", position: 0 },
    ];
    expect(sortListItems(noDates, "recent").map(i => i.id)).toEqual(["x", "y"]);
    expect(sortListItems(noDates, "oldest").map(i => i.id)).toEqual(["y", "x"]);
  });
});

// ─── Recipe sorting / status / last-made ─────────────────────────────────────────
describe("sortRecipes", () => {
  const recipes = [
    { id: "1", name: "Pancakes", prepTime: "10 min", created_at: "2026-01-01" },
    { id: "2", name: "apple pie", prepTime: "45 min", created_at: "2026-03-01" },
    { id: "3", name: "Chili",    prepTime: "",        created_at: "2026-02-01" },
  ];
  const ids = (mode) => sortRecipes(recipes, mode).map(r => r.id);
  it("newest = created_at desc (default)", () => {
    expect(ids("newest")).toEqual(["2", "3", "1"]);
  });
  it("a-z is case-insensitive", () => {
    expect(ids("az")).toEqual(["2", "3", "1"]); // apple pie, Chili, Pancakes
  });
  it("prep sorts ascending, empty prep last", () => {
    expect(ids("prep")).toEqual(["1", "2", "3"]); // 10, 45, (none)
  });
  it("does not mutate input", () => {
    const arr = [...recipes];
    sortRecipes(arr, "az");
    expect(arr.map(r => r.id)).toEqual(["1", "2", "3"]);
  });
});

describe("nextRecipeStatus", () => {
  it("cycles want → made → favorite → want", () => {
    expect(nextRecipeStatus("want")).toBe("made");
    expect(nextRecipeStatus("made")).toBe("favorite");
    expect(nextRecipeStatus("favorite")).toBe("want");
  });
  it("treats unknown/missing as the start of the cycle", () => {
    expect(nextRecipeStatus(undefined)).toBe("want");
  });
});

describe("lastMadeLabel", () => {
  const monday = "2026-06-15";
  it("returns null when never planned", () => {
    expect(lastMadeLabel(null, monday)).toBeNull();
  });
  it("uses relative weeks for recent plans", () => {
    expect(lastMadeLabel("2026-06-15", monday)).toBe("Made this week");
    expect(lastMadeLabel("2026-06-08", monday)).toBe("Made last week");
    expect(lastMadeLabel("2026-05-25", monday)).toBe("Made 3 weeks ago");
  });
  it("falls back to month/year for older plans", () => {
    expect(lastMadeLabel("2026-01-05", monday)).toMatch(/^Last made /);
  });
});
