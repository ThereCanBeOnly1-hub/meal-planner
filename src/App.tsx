// @ts-nocheck
import { useState, useEffect, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_ABBR = ["M","Tu","W","Th","F","Sa","Su"];
const MEAL_SLOTS = ["Breakfast","Lunch","Dinner"];
const slotColors = { Breakfast:"#f4c97a", Lunch:"#89c4a1", Dinner:"#e07a5f" };

const DIET_TAGS = ["Gluten-Free","Dairy-Free","Low Sodium","Low Carb","Vegetarian","Vegan","Nut-Free","High Protein"];
const MEAL_TYPE_TAGS = ["Breakfast","Lunch","Dinner","Snack","Dessert"];
const CUISINE_TAGS = ["American","Italian","Mexican","Asian","Mediterranean","Indian","Chinese","Japanese","Thai","French","Greek","Middle Eastern","BBQ","Comfort Food","Seafood"];

const SNACK_SUGGESTIONS = ["Apple & PB","Cheese & Crackers","Trail Mix","Yogurt","Hummus & Veggies","Granola Bar","Popcorn","String Cheese","Rice Cakes","Fruit Salad"];
const DESSERT_SUGGESTIONS = ["Ice Cream","Brownies","Cookies","Fruit Sorbet","Pudding","Cheesecake","Apple Pie","Chocolate Mousse","Gelato","Cupcakes"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const initialWeek = () => {
  const w = {};
  DAYS.forEach(d => { w[d] = {}; MEAL_SLOTS.forEach(sl => { w[d][sl] = { meal:"", thaw:false, thawDays:2 }; }); });
  return w;
};

const mealRow = (ws, day, slot, e) => ({
  week_start: ws, day, slot,
  meal_name: e.meal || "", thaw: e.thaw || false, thaw_days: e.thawDays || 2, recipe_id: e.recipeId || null,
  updated_at: new Date().toISOString(),
});
const mealCellEq = (a, b) => !!a && !!b && a.meal === b.meal && !!a.thaw === !!b.thaw && (a.thawDays || 2) === (b.thawDays || 2) && (a.recipeId || null) === (b.recipeId || null);

const addWeeks = (ws, n) => {
  const d = new Date(ws + "T00:00:00"); d.setDate(d.getDate() + n * 7);
  return d.toISOString().split("T")[0];
};

const getWeekRange = (ws) => {
  const mon = new Date(ws + "T00:00:00");
  const sun = new Date(ws + "T00:00:00"); sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toLocaleDateString("en-US", {month:"short", day:"numeric"});
  const currentYear = new Date().getFullYear();
  const yearStr = (mon.getFullYear() !== currentYear || sun.getFullYear() !== currentYear) ? ` ${sun.getFullYear()}` : "";
  return `${fmt(mon)} – ${fmt(sun)}${yearStr}`;
};

const getDateForDay = (dayName, ws) => {
  const mon = new Date(ws + "T00:00:00");
  const d = new Date(mon); d.setDate(mon.getDate() + DAYS.indexOf(dayName));
  return d;
};

const getWeeksInMonth = (year, month) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const dow = firstDay.getDay();
  const mon = new Date(firstDay); mon.setDate(firstDay.getDate() - (dow === 0 ? 6 : dow - 1));
  const weeks = [];
  while (mon <= lastDay) {
    weeks.push(mon.toISOString().split("T")[0]);
    mon.setDate(mon.getDate() + 7);
  }
  return weeks;
};

const getTodayName = () => ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];

// ─── Recipe helpers ───────────────────────────────────────────────────────────
const loadCustomTags = (key) => { try { return JSON.parse(localStorage.getItem(`mealplanner_custom_${key}`) || "[]"); } catch { return []; } };
const saveCustomTags = (key, tags) => localStorage.setItem(`mealplanner_custom_${key}`, JSON.stringify(tags));

const resizeImage = (file, maxW = 600) => new Promise(resolve => {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

const parseMinutes = (str) => {
  if (!str) return 0;
  const s = str.toLowerCase().trim();
  const hr = s.match(/(\d+\.?\d*)\s*h/); const mn = s.match(/(\d+\.?\d*)\s*m/);
  if (hr || mn) return Math.round((hr ? parseFloat(hr[1]) * 60 : 0) + (mn ? parseFloat(mn[1]) : 0));
  const n = s.match(/^(\d+)$/); return n ? parseInt(n[1]) : 0;
};
const formatMinutes = (mins) => {
  if (!mins) return null;
  const h = Math.floor(mins / 60); const m = mins % 60;
  if (h === 0) return `${m} min`; if (m === 0) return `${h} hr`; return `${h} hr ${m} min`;
};

const MEAL_HOURS = { Breakfast: 8, Lunch: 12, Dinner: 19 };

const wmoEmoji = (code) => {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 55) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "❄️";
  return "⛈️";
};

const fetchWeather = async (lat, lon, startDate, endDate) => {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
    `&hourly=temperature_2m,weathercode&temperature_unit=fahrenheit` +
    `&timezone=auto&start_date=${startDate}&end_date=${endDate}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Weather fetch failed");
  const data = await r.json();
  const result = {};
  data.daily.time.forEach((date, i) => {
    result[date] = {
      high: Math.round(data.daily.temperature_2m_max[i]),
      low: Math.round(data.daily.temperature_2m_min[i]),
      icon: wmoEmoji(data.daily.weathercode[i]),
      meals: {},
    };
  });
  data.hourly.time.forEach((timeStr, i) => {
    const [date, hourStr] = timeStr.split("T");
    const hour = parseInt(hourStr);
    if (!result[date]) return;
    for (const [meal, mealHour] of Object.entries(MEAL_HOURS)) {
      if (hour === mealHour) {
        result[date].meals[meal] = {
          temp: Math.round(data.hourly.temperature_2m[i]),
          icon: wmoEmoji(data.hourly.weathercode[i]),
        };
      }
    }
  });
  return result;
};

const openCalendarEvent = (mealName, slot, dayName, thawDays, ws) => {
  const mealDate = getDateForDay(dayName, ws);
  const thawDate = new Date(mealDate); thawDate.setDate(mealDate.getDate()-thawDays);
  const thawDateEnd = new Date(thawDate); thawDateEnd.setDate(thawDate.getDate()+1);
  const fmt = d => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Thaw: ${mealName}`,
    dates: `${fmt(thawDate)}/${fmt(thawDateEnd)}`,
    details: `Thaw ${thawDays} day(s) before ${dayName}'s ${slot}`,
  });
  window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank");
};

// Parse a single quantity token to a number: "1", "1.5", "1/2", "1 1/2", "½", "1½".
// Returns null if it isn't a plain numeric quantity (e.g. "a pinch").
const parseQty = (str) => {
  const s = String(str).trim();
  if (!s) return null;
  const uni = { "⅛":0.125, "¼":0.25, "⅜":0.375, "½":0.5, "⅝":0.625, "¾":0.75, "⅞":0.875, "⅓":1/3, "⅔":2/3, "⅙":1/6 };
  let m = s.match(/^(\d+)?\s*([⅛¼⅜½⅝¾⅞⅓⅔⅙])$/);        // "½" or "1½" / "1 ½"
  if (m) return (m[1] ? parseInt(m[1], 10) : 0) + uni[m[2]];
  m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);                  // "1 1/2"
  if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10);
  m = s.match(/^(\d+)\/(\d+)$/);                          // "1/2"
  if (m) return parseInt(m[1], 10) / parseInt(m[2], 10);
  if (/^\d*\.?\d+$/.test(s)) return parseFloat(s);        // "2", "1.5", ".5"
  return null;
};

// Format a number to a clean unicode-fraction string, snapping to the nearest
// common cooking fraction (eighths plus thirds/sixths).
const formatQty = (n) => {
  const rounded = Math.round(n * 1e6) / 1e6;
  if (Number.isInteger(rounded)) return String(rounded);
  const whole = Math.floor(rounded);
  const frac = rounded - whole;
  const table = [[0,""],[0.125,"⅛"],[1/6,"⅙"],[0.25,"¼"],[1/3,"⅓"],[0.375,"⅜"],[0.5,"½"],[0.625,"⅝"],[2/3,"⅔"],[0.75,"¾"],[0.875,"⅞"],[1,""]];
  let best = table[0], bestD = Infinity;
  for (const t of table) { const d = Math.abs(frac - t[0]); if (d <= bestD) { bestD = d; best = t; } } // table ascending: ties round up
  if (best[0] === 1) return String(whole + 1);          // rounded up to next whole
  if (best[1] === "") return String(whole);             // rounded down to whole
  return whole === 0 ? best[1] : `${whole}${best[1]}`;
};

// Scale an amount string by the servings ratio and normalize to unicode
// fractions. Handles ranges ("1/4-1/2") and falls back to the verbatim string
// if any part isn't a plain number ("a pinch", "to taste").
const scaleAmount = (amountStr, baseServings, currentServings) => {
  const raw = String(amountStr ?? "").trim();
  if (!raw) return "";
  const factor = baseServings ? currentServings / baseServings : 1;
  const parts = raw.split(/\s*(?:–|—|-|\bto\b)\s*/i);    // split ranges, keep mixed numbers intact
  const nums = parts.map(parseQty);
  if (nums.some(n => n === null)) return raw;
  return nums.map(n => formatQty(n * factor)).join("–");
};

const newRecipe = () => ({
  id: Date.now().toString(),
  name: "", description: "", url: "", photo: "", notes: "",
  prepTime: "", cookTime: "", baseServings: 4,
  ingredients: [{ id: Date.now().toString(), amount: "", unit: "", name: "" }],
  steps: [{ id: Date.now().toString(), text: "" }],
  mealTypes: [], dietTags: [], cuisineTags: [],
});

// Merge a recipe extracted by /api/import-recipe into an editable recipe shape.
// `photoOverride` lets a photo-import supply the uploaded image as the recipe photo.
const normalizeImported = (data, photoOverride) => {
  const base = newRecipe();
  const now = Date.now();
  const ings = Array.isArray(data?.ingredients) && data.ingredients.length ? data.ingredients : [{}];
  const steps = Array.isArray(data?.steps) && data.steps.length ? data.steps : [""];
  return {
    ...base,
    name: data?.name || "",
    description: data?.description || "",
    url: typeof data?.url === "string" ? data.url : "",
    photo: photoOverride || (typeof data?.photo === "string" && data.photo.startsWith("http") ? data.photo : ""),
    notes: data?.notes || "",
    prepTime: data?.prepTime || "",
    cookTime: data?.cookTime || "",
    baseServings: Number.isFinite(data?.baseServings) && data.baseServings > 0 ? data.baseServings : 4,
    mealTypes: Array.isArray(data?.mealTypes) ? data.mealTypes : [],
    dietTags: Array.isArray(data?.dietTags) ? data.dietTags : [],
    cuisineTags: Array.isArray(data?.cuisineTags) ? data.cuisineTags : [],
    ingredients: ings.map((ing, i) => ({
      id: `${now}-i${i}`,
      amount: ing?.amount || "", unit: ing?.unit || "", name: ing?.name || "",
    })),
    steps: steps.map((st, i) => ({
      id: `${now}-s${i}`,
      text: typeof st === "string" ? st : (st?.text || ""),
    })),
  };
};

// Maps an in-app recipe to its Supabase row shape.
const recipeToRow = (r) => ({
  id: r.id, name: r.name, description: r.description, url: r.url, photo: r.photo, notes: r.notes,
  prep_time: r.prepTime, cook_time: r.cookTime, base_servings: r.baseServings,
  meal_types: r.mealTypes, diet_tags: r.dietTags, cuisine_tags: r.cuisineTags,
  ingredients: r.ingredients, steps: r.steps, updated_at: new Date().toISOString(),
});

// Custom-tag category key -> recipe field holding that tag list.
const TAG_TYPE_FIELD = { mealtypes: "mealTypes", diets: "dietTags", cuisines: "cuisineTags" };

// ─── Lists ────────────────────────────────────────────────────────────────────
// Default store layout (Mariano's), ordered to match the walk path: Produce →
// Meat → Aisles 17→2 → Dairy → Alcohol → Deli → Bakery. Doubles as the category
// set, the Claude prompt hints, and the Shopping Mode sort order. Editable and
// persisted in app_settings; "other" is the catch-all. `aisle` distinguishes
// numbered aisles from wall sections (for the move-picker grouping).
const DEFAULT_STORE_LAYOUT = [
  { id: "produce", label: "Produce", hints: "fresh fruits and vegetables", aisle: null },
  { id: "meat", label: "Meat", hints: "fresh meat, poultry, seafood", aisle: null },
  { id: "aisle17", label: "Aisle 17", hints: "condiments, rice, peanut butter", aisle: 17 },
  { id: "aisle16", label: "Aisle 16", hints: "pasta, Mexican food, asian food, Italian food", aisle: 16 },
  { id: "aisle15", label: "Aisle 15", hints: "canned vegetables, canned fruit, soup, applesauce", aisle: 15 },
  { id: "aisle14", label: "Aisle 14", hints: "spices, sugar, vinegar, baking, flour", aisle: 14 },
  { id: "aisle13", label: "Aisle 13", hints: "cereal, pancake mix, syrup, oatmeal, granola bars", aisle: 13 },
  { id: "aisle12", label: "Aisle 12", hints: "coffee, tea, dried fruit, candy", aisle: 12 },
  { id: "aisle11", label: "Aisle 11", hints: "snack nuts, chips, popcorn, pretzels, salsas, dips", aisle: 11 },
  { id: "aisle10", label: "Aisle 10", hints: "cookies, bottled water, crackers, juice", aisle: 10 },
  { id: "aisle9", label: "Aisle 9", hints: "soda, energy drinks, natural beverages, bottled tea", aisle: 9 },
  { id: "aisle8", label: "Aisle 8", hints: "pet care, pet food, household cleaners, dish cleaning", aisle: 8 },
  { id: "aisle7", label: "Aisle 7", hints: "foil, plastic wrap, laundry supplies, office supplies", aisle: 7 },
  { id: "aisle6", label: "Aisle 6", hints: "frozen pizza, frozen snacks, frozen meals", aisle: 6 },
  { id: "aisle5", label: "Aisle 5", hints: "ice cream, frozen vegetables, frozen bread, frozen potatoes, frozen breakfast, frozen juices", aisle: 5 },
  { id: "aisle4", label: "Aisle 4", hints: "cosmetics, shaving, shampoo, deodorant, skin care", aisle: 4 },
  { id: "aisle3", label: "Aisle 3", hints: "toothpaste, vitamins, feminine care, first aid", aisle: 3 },
  { id: "aisle2", label: "Aisle 2", hints: "pain medicine, cold and flu medicine", aisle: 2 },
  { id: "dairy", label: "Dairy", hints: "milk, cheese, eggs, yogurt, butter, cream", aisle: null },
  { id: "alcohol", label: "Alcohol", hints: "beer, wine, liquor", aisle: null },
  { id: "deli", label: "Deli", hints: "deli meats, prepared foods, fresh-sliced cheese", aisle: null },
  { id: "bakery", label: "Bakery", hints: "fresh bread, pastries, cakes, bagels", aisle: null },
  { id: "other", label: "Not sorted", hints: "anything that doesn't clearly fit a section above", aisle: null },
];
// Order for the move-to picker: wall sections first, then aisles (in layout
// order, i.e. 17→2), then the "other" catch-all last.
const layoutPickerOrder = (layout) => {
  const wall = layout.filter(s => s.aisle == null && s.id !== "other");
  const aisles = layout.filter(s => s.aisle != null);
  const other = layout.filter(s => s.id === "other");
  return [...wall, ...aisles, ...other];
};
// Words safe to strip when building a category cache key (don't change the aisle).
// NOTE: never strip frozen/canned/dried — those determine the aisle.
const NORM_FILLERS = ["organic", "fresh", "ripe", "large", "small", "medium", "lean", "boneless", "skinless", "raw", "extra", "premium", "fine", "whole", "natural", "unsalted", "salted"];
const NORM_UNITS = ["lb", "lbs", "oz", "cup", "cups", "tsp", "tbsp", "g", "kg", "ml", "l", "pound", "pounds", "ounce", "ounces", "can", "cans", "package", "pkg", "bunch", "clove", "cloves", "stick", "sticks", "pint", "quart", "gallon", "box", "jar", "bag", "head", "stalk", "sprig"];
const normIngredient = (name) => {
  let s = String(name || "").toLowerCase().split(",")[0];
  s = s.replace(/[^a-z0-9%\s/-]/g, " ").replace(/\b[\d./-]+\b/g, " ");
  s = s.replace(new RegExp(`\\b(${NORM_UNITS.join("|")})\\b`, "g"), " ");
  s = s.replace(new RegExp(`\\b(${NORM_FILLERS.join("|")})\\b`, "g"), " ");
  return s.replace(/\s+/g, " ").trim();
};

const GROCERY_ID = "grocery"; // fixed id makes the singleton idempotent across devices
const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const LIST_ICONS = ["📝", "✅", "🧳", "🛠", "🎁", "🏠", "💡", "🛒", "📦", "🌱", "🎉", "✈️"];
const listToRow = (l) => ({ id: l.id, name: l.name, type: l.type, icon: l.icon, position: l.position ?? 0, updated_at: new Date().toISOString() });
// `qty` column holds { measures, manual } (the displayed total + override flag);
// `source_recipe_id` holds sources[] = {id,name,measures} (per-recipe amounts).
const listItemToRow = (it, listId) => ({
  id: it.id, list_id: listId, text: it.text, checked: !!it.checked, position: it.position ?? 0,
  qty: (it.measures && it.measures.length) || it.manual ? JSON.stringify({ measures: it.measures || [], manual: !!it.manual }) : null,
  unit: null, category: it.category || null,
  source_recipe_id: it.sources && it.sources.length ? JSON.stringify(it.sources) : null,
  updated_at: new Date().toISOString(),
});
const parseJsonArr = (raw) => { if (!raw) return []; try { const v = typeof raw === "string" ? JSON.parse(raw) : raw; return Array.isArray(v) ? v : []; } catch { return []; } };
// Accepts the legacy shape (a bare measures array) or the new { measures, manual } object.
const parseItemQty = (raw) => {
  if (!raw) return { measures: [], manual: false };
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(v)) return { measures: v, manual: false };
    if (v && typeof v === "object") return { measures: Array.isArray(v.measures) ? v.measures : [], manual: !!v.manual };
  } catch {}
  return { measures: [], manual: false };
};
// Total of an item's per-recipe source measures (used when not manually overridden).
const sumSourceMeasures = (sources) => (sources || []).reduce((acc, s) => mergeMeasures(acc, s.measures || []), []);
const sourcesHaveAmounts = (sources) => (sources || []).length > 0 && sources.every(s => Array.isArray(s.measures));

// Normalized key for matching the same grocery ingredient (drops prep notes after a comma).
const groceryKey = (name) => String(name || "").trim().toLowerCase().split(",")[0].replace(/\s+/g, " ").trim();
// Canonical abbreviation for common units (full names, plurals, and variants all
// map to one short form) so "1 pound" + "1 lbs" merge and display compactly.
const UNIT_CANON = {
  teaspoon:"tsp", tsp:"tsp",
  tablespoon:"tbsp", tablespoonful:"tbsp", tbsp:"tbsp", tbs:"tbsp", tbl:"tbsp",
  cup:"cup", c:"cup",
  ounce:"oz", oz:"oz",
  "fluid ounce":"fl oz", "fl oz":"fl oz", floz:"fl oz",
  pound:"lb", lb:"lb",
  gram:"g", gramme:"g", g:"g",
  kilogram:"kg", kilo:"kg", kg:"kg",
  milliliter:"ml", millilitre:"ml", ml:"ml",
  liter:"L", litre:"L", l:"L",
  pint:"pt", pt:"pt",
  quart:"qt", qt:"qt",
  gallon:"gal", gal:"gal",
  package:"pkg", pkg:"pkg", pack:"pkg",
  // irregular plurals (can't just strip a trailing "s")
  pinch:"pinch", pinches:"pinch",
  dash:"dash", dashes:"dash",
  bunch:"bunch", bunches:"bunch",
  box:"box", boxes:"box",
};
const _unitNorm = (u) => String(u || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
// Key used to decide whether two units are the same (for merging).
const unitKey = (u) => { const k = _unitNorm(u); return UNIT_CANON[k] || UNIT_CANON[k.replace(/s$/, "")] || k.replace(/s$/, ""); };
// What to show: a known unit's abbreviation, else the unit as typed.
const unitDisplay = (u) => { const k = _unitNorm(u); return UNIT_CANON[k] || UNIT_CANON[k.replace(/s$/, "")] || String(u || "").trim(); };

// Turn a recipe ingredient amount/unit into a measure: numeric {amount,unit} when parseable, else {text}.
const ingredientToMeasure = (amount, unit) => {
  const a = String(amount || "").trim(), u = unitDisplay(unit);
  if (!a && !u) return null;
  const n = parseQty(a);
  if (n !== null) return { amount: n, unit: u };
  return { text: [a, u].filter(Boolean).join(" ") };
};
// Merge incoming measures into existing: sum numerics with matching units, else append.
const mergeMeasures = (existing, incoming) => {
  const out = (existing || []).map(m => ({ ...m }));
  (incoming || []).forEach(im => {
    if (im.amount != null) {
      const match = out.find(m => m.amount != null && unitKey(m.unit) === unitKey(im.unit));
      if (match) { match.amount += im.amount; return; }
    }
    out.push({ ...im });
  });
  return out;
};
const formatMeasures = (measures) => (measures || []).map(m => m.amount != null ? `${formatQty(m.amount)}${m.unit ? ` ${unitDisplay(m.unit)}` : ""}` : m.text).filter(Boolean).join(" + ");

// Parse a free-typed quantity ("2 lbs", "1 1/2 cups", "3", "a dozen") into a
// measures array. Used for manual quantity edits on grocery items.
const parseQtyInput = (str) => {
  const s = String(str || "").trim();
  if (!s) return [];
  const m = s.match(/^([0-9./\s¼½¾⅓⅔⅛⅜⅝⅞]+?)\s*([a-zA-Z].*)?$/);
  if (m) {
    const n = parseQty((m[1] || "").trim());
    if (n !== null) return [{ amount: n, unit: m[2] ? unitDisplay(m[2].trim()) : "" }];
  }
  return [{ text: s }];
};

// ─── Auto-Fill engine ─────────────────────────────────────────────────────────
const AF_WEEKDAYS = DAYS.slice(0, 5); // Mon–Fri
const AF_WEEKEND = DAYS.slice(5);     // Sat, Sun

// Random sample of n items from arr (Fisher–Yates partial shuffle).
const afSample = (arr, n) => {
  const pool = [...arr];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
};

// Lay picks across `days` as consecutive blocks (roughly even) — mirrors how a
// meal-prepped batch is eaten on consecutive days rather than alternating.
const afLayBlocks = (days, picks) => {
  const out = {};
  const k = picks.length;
  if (k === 0) { days.forEach(d => (out[d] = null)); return out; }
  if (k === 1) { days.forEach(d => (out[d] = picks[0])); return out; }
  const base = Math.floor(days.length / k);
  const rem = days.length - base * k;
  const sizes = Array.from({ length: k }, () => base);
  afSample(Array.from({ length: k }, (_, i) => i), rem).forEach(idx => sizes[idx]++); // scatter remainder
  let di = 0;
  picks.forEach((p, ci) => { for (let s = 0; s < sizes[ci]; s++) out[days[di++]] = p; });
  return out;
};

// Day-by-day signature of a slot plan, for detecting identical re-rolls.
const afPlanKey = (slotPlan) => DAYS.map(d => slotPlan?.[d]?.recipeId ?? "").join("|");

// Build one slot assignment from a given pool: { [day]: {recipeId, name} | null }.
const afBuildSlotPlan = (pool, slot) => {
  const result = {};
  DAYS.forEach(d => (result[d] = null));
  if (pool.length === 0) return result;
  const toPick = r => ({ recipeId: r.id, name: r.name });

  // Weekday segment (Mon–Fri): 1 recipe, or 1–2 for dinner, as consecutive blocks.
  const weekdayCount = slot === "Dinner" ? (Math.random() < 0.5 ? 1 : 2) : 1;
  const weekdayPicks = afSample(pool, Math.min(weekdayCount, pool.length)).map(toPick);
  Object.assign(result, afLayBlocks(AF_WEEKDAYS, weekdayPicks));

  // Weekend segment (Sat–Sun): one recipe for both days, distinct from weekday
  // picks when possible, otherwise allow a repeat so the week still fills.
  const usedIds = new Set(weekdayPicks.map(p => p.recipeId));
  const remaining = pool.filter(r => !usedIds.has(r.id));
  const weekendPick = toPick(afSample(remaining.length ? remaining : pool, 1)[0]);
  AF_WEEKEND.forEach(d => (result[d] = weekendPick));
  return result;
};

// Assignment for one slot. opts.avoidIds = recipe ids to steer away from (e.g.
// last week's picks); opts.prevKey = previous roll's signature to avoid an
// identical re-roll.
const generateSlotPlan = (recipes, slot, opts = {}) => {
  const { avoidIds, prevKey } = opts;
  const base = recipes.filter(r => (r.mealTypes || []).includes(slot));
  // Prefer recipes not used last week, but only if that still leaves enough to
  // fill the week with within-week variety (weekend distinct from weekday).
  let pool = base;
  if (avoidIds && avoidIds.size) {
    const fresh = base.filter(r => !avoidIds.has(r.id));
    if (fresh.length >= 2) pool = fresh;
  }
  let plan = afBuildSlotPlan(pool, slot);
  // Retry to avoid producing the exact same day-by-day result as the last roll.
  for (let i = 0; i < 12 && prevKey && afPlanKey(plan) === prevKey; i++) plan = afBuildSlotPlan(pool, slot);
  return plan;
};

const generateWeekPlan = (recipes, slots, opts = {}) => {
  const { avoidIdsBySlot } = opts;
  const plan = {};
  slots.forEach(slot => (plan[slot] = generateSlotPlan(recipes, slot, { avoidIds: avoidIdsBySlot?.[slot] })));
  return plan;
};

// ─── Supabase Config ─────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? "";
const isConfigured = !SUPABASE_URL.includes("PASTE");

// Current logged-in access token (set by App). DB requests use it instead of the
// anon key, so RLS can restrict the database to authenticated users.
let _authToken = null;
let _onAuthError = () => {};        // called when auth truly fails (→ sign out)
let _refreshHook = async () => null; // returns a fresh token or null; set by App
const setAuthToken = (t) => { _authToken = t; };
const setOnAuthError = (fn) => { _onAuthError = fn; };
const setRefreshHook = (fn) => { _refreshHook = fn; };

const sb = {
  h: () => ({
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${_authToken || SUPABASE_KEY}`,
    "Content-Type": "application/json",
  }),
  // On 401/403, try one token refresh and retry; if that fails, trigger sign-out.
  async _req(url, opts = {}) {
    let r = await fetch(url, { ...opts, headers: { ...this.h(), ...(opts.headers || {}) } });
    if (r.status === 401 || r.status === 403) {
      const t = await _refreshHook();
      if (t) r = await fetch(url, { ...opts, headers: { ...this.h(), ...(opts.headers || {}) } });
      else _onAuthError();
    }
    return r;
  },
  async get(table, query = "") {
    const r = await this._req(`${SUPABASE_URL}/rest/v1/${table}${query}`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async upsert(table, data, onConflict = "") {
    const q = onConflict ? `?on_conflict=${onConflict}` : "";
    const r = await this._req(`${SUPABASE_URL}/rest/v1/${table}${q}`, {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(Array.isArray(data) ? data : [data]),
    });
    if (!r.ok) throw new Error(await r.text());
  },
  async del(table, query) {
    const r = await this._req(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { method: "DELETE" });
    if (!r.ok) throw new Error(await r.text());
  },
};

// ─── Auth (email + password; login only, no in-app sign-up) ───────────────────
const AUTH_URL = `${SUPABASE_URL}/auth/v1`;
const SESSION_KEY = "mealplanner_session";
const loadSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } };
const saveSession = (s) => { try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch {} };
const withExpiry = (data) => ({ ...data, expires_at: data.expires_at || (Math.floor(Date.now() / 1000) + (data.expires_in || 3600)) });
const authSignIn = async (email, password) => {
  const r = await fetch(`${AUTH_URL}/token?grant_type=password`, {
    method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.msg || data.error || "Sign in failed");
  return withExpiry(data);
};
const authRefresh = async (refresh_token) => {
  const r = await fetch(`${AUTH_URL}/token?grant_type=refresh_token`, {
    method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error("Session refresh failed");
  return withExpiry(data);
};
const authSignOut = (access_token) => {
  fetch(`${AUTH_URL}/logout`, { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${access_token}` } }).catch(() => {});
};

const weekStart = () => {
  const now = new Date(); const dow = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  return mon.toISOString().split("T")[0];
};

// List sort options. "manual" = the user's custom order (by position, which the
// ▲/▼ arrows rewrite); the rest are derived views. recent/oldest fall back to
// position when created_at is missing (legacy rows / optimistic adds).
const LIST_SORTS = [
  { id: "manual", label: "Custom order" },
  { id: "az", label: "A → Z" },
  { id: "za", label: "Z → A" },
  { id: "recent", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
];
const sortListItems = (items, mode) => {
  const arr = [...items];
  const byPos = (a, b) => (a.position ?? 0) - (b.position ?? 0);
  const byText = (a, b) => (a.text || "").localeCompare(b.text || "", undefined, { sensitivity: "base" });
  const byCreated = (a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""));
  switch (mode) {
    case "az": arr.sort((a, b) => byText(a, b) || byPos(a, b)); break;
    case "za": arr.sort((a, b) => byText(b, a) || byPos(b, a)); break;
    case "recent": arr.sort((a, b) => byCreated(b, a) || byPos(b, a)); break;
    case "oldest": arr.sort((a, b) => byCreated(a, b) || byPos(a, b)); break;
    default: arr.sort(byPos); // manual
  }
  return arr;
};

// Pure helpers exported for unit tests (see src/App.test.ts). No runtime effect
// on the app; the entry point only uses the default-exported App component.
export {
  parseMinutes, formatMinutes,
  parseQty, formatQty, scaleAmount,
  normalizeImported, recipeToRow,
  normIngredient, groceryKey, unitKey, unitDisplay, ingredientToMeasure, mergeMeasures, formatMeasures, parseQtyInput, parseItemQty, sumSourceMeasures,
  afSample, afLayBlocks, afPlanKey, generateSlotPlan, generateWeekPlan,
  layoutPickerOrder, addWeeks, getWeeksInMonth, weekStart,
  mealRow, mealCellEq, sortListItems,
};

// Prop-driven components exported for component tests (see src/components.test.tsx).
// Function declarations hoist, so this works before their definitions below.
export {
  RecipesView, TagPicker, ListDetail, ListItemsList, ListIndex, ShoppingMode,
};

// ─── Main Component ───────────────────────────────────────────────────────────
function Login({ onSignIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true); setError("");
    try { await onSignIn(email, password); }
    catch (e) { setError(e?.message || "Sign in failed"); setBusy(false); }
  };
  return (
    <div style={s.loginRoot}>
      <div style={s.loginCard} className="modal-in">
        <div style={s.loginIcon}>🍽️</div>
        <div style={s.loginTitle}>Meal Planner</div>
        <div style={s.loginSub}>Sign in to continue</div>
        <input style={s.loginInput} type="email" autoComplete="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} />
        <input style={s.loginInput} type="password" autoComplete="current-password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} />
        {error && <div style={s.loginError}>⚠️ {error}</div>}
        <button style={{...s.loginBtn, ...((busy || !email.trim() || !password) ? s.btnDisabled : {})}} onClick={submit} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(() => loadSession());
  const sessionRef = useRef(session);
  // Keep the DB client's token + auth-error handler in sync with the session.
  if (_authToken !== (session?.access_token || null)) setAuthToken(session?.access_token || null);
  const applySession = (s) => { sessionRef.current = s; setAuthToken(s?.access_token || null); saveSession(s); setSession(s); };
  const signOut = () => { if (sessionRef.current?.access_token) authSignOut(sessionRef.current.access_token); applySession(null); };
  const handleSignIn = async (email, password) => { applySession(await authSignIn(email, password)); };
  const signOutRef = useRef(signOut); signOutRef.current = signOut;
  const refreshingRef = useRef(null); // dedupes concurrent refreshes
  useEffect(() => {
    setOnAuthError(() => signOutRef.current());
    setRefreshHook(() => {
      const s = sessionRef.current;
      if (!s?.refresh_token) return Promise.resolve(null);
      if (!refreshingRef.current) {
        refreshingRef.current = authRefresh(s.refresh_token)
          .then(ns => { applySession(ns); return ns.access_token; })
          .catch(() => null)
          .finally(() => { refreshingRef.current = null; });
      }
      return refreshingRef.current;
    });
  }, []);
  // Keep the session token fresh; drop to login if it can't be refreshed.
  useEffect(() => {
    if (!session) return;
    let alive = true;
    const tick = async () => {
      const s = sessionRef.current; if (!s) return;
      if (s.expires_at && s.expires_at - Math.floor(Date.now() / 1000) < 300) {
        try { const ns = await authRefresh(s.refresh_token); if (alive) applySession(ns); }
        catch { if (alive) signOut(); }
      }
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => { alive = false; clearInterval(id); };
  }, [session]);

  const [tab, setTab] = useState("planner");
  const [recipes, setRecipes] = useState([]);
  const [recipeView, setRecipeView] = useState(null);
  const [week, setWeek] = useState(initialWeek());
  const [snacks, setSnacks] = useState([]);
  const [desserts, setDesserts] = useState([]);
  const [syncStatus, setSyncStatus] = useState(isConfigured ? "loading" : "unconfigured");
  const [failedWrites, setFailedWrites] = useState([]); // unresolved save failures {id,label,message,fn}
  const failIdRef = useRef(0);
  const [viewedWeekStart, setViewedWeekStart] = useState(weekStart());
  const [nextWeekMeals, setNextWeekMeals] = useState(initialWeek());
  const [prevWeekMeals, setPrevWeekMeals] = useState(initialWeek());
  const [lists, setLists] = useState([]);
  const [listView, setListView] = useState(null); // open list id or null
  const pendingListRef = useRef(new Map()); // in-flight list/item writes, kept so a poll can't clobber optimistic edits
  const addGroceryBusyRef = useRef(false); // debounces rapid double "add to grocery"
  const [groceryOpen, setGroceryOpen] = useState(false);
  const groceryPopRef = useRef(false);
  const [ingredientCats, setIngredientCats] = useState({});
  const [listSorts, setListSorts] = useState({}); // { [listId]: "manual"|"az"|"za"|"recent"|"oldest" }, synced via app_settings
  const [storeLayout, setStoreLayout] = useState(DEFAULT_STORE_LAYOUT);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [catStatus, setCatStatus] = useState(""); // "", "loading", or an error message
  const shoppingPopRef = useRef(false);
  const [customTags, setCustomTags] = useState(() => ({
    mealtypes: loadCustomTags("mealtypes"),
    diets: loadCustomTags("diets"),
    cuisines: loadCustomTags("cuisines"),
  }));
  const [location, setLocation] = useState(() => { try { const s = localStorage.getItem("mealplanner_loc"); return s ? JSON.parse(s) : null; } catch { return null; } });
  const [weatherData, setWeatherData] = useState({});
  const isLoadingRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const recipesLoadedRef = useRef(false);
  const pendingMealsRef = useRef(new Map()); // `ws::day::slot` -> entry of in-flight meal writes
  const lastSyncedWeekRef = useRef(null);    // baseline week to diff against for per-cell sync
  const lastSyncedWsRef = useRef(null);      // which week_start the baseline belongs to
  const extrasDirtyRef = useRef({ ws: null, ts: 0 }); // recent local extras edit, to guard against poll clobber
  const pendingMealLinkRef = useRef(null); // {ws,day,slot,recipeId} when creating a recipe from a planner meal
  const lastPayloadSigRef = useRef(""); // signature of last applied load, to skip no-op re-renders
  const syncExtrasLockRef = useRef(false);
  const lastVisibilityLoadRef = useRef(0);
  const mealTimer = useRef(null);
  const extrasTimer = useRef(null);
  const recipesRef = useRef(recipes);
  const isRestoringRef = useRef(false);
  const viewedWeekStartRef = useRef(weekStart());

  useEffect(() => { recipesRef.current = recipes; }, [recipes]);
  useEffect(() => { viewedWeekStartRef.current = viewedWeekStart; }, [viewedWeekStart]);

  // Central DB write: runs `fn` (a thunk returning a promise). On failure it
  // records the operation so the user is told (sticky banner) and can retry it.
  // A successful read can't clear these — only a successful (re)write does.
  const dbWrite = (label, fn) => {
    if (!isConfigured || !sessionRef.current) return Promise.resolve(true);
    return fn()
      .then(() => { setSyncStatus("synced"); return true; })
      .catch(err => {
        console.error(label, err);
        const message = String(err?.message || err || "").replace(/\s+/g, " ").slice(0, 160);
        setSyncStatus("error");
        setFailedWrites(prev => [...prev, { id: ++failIdRef.current, label, message, fn }]);
        return false;
      });
  };
  const retryFailedWrites = () => {
    if (!failedWrites.length) return;
    const items = failedWrites;
    setFailedWrites([]);
    setSyncStatus("syncing");
    items.forEach(f => dbWrite(f.label, f.fn)); // re-adds any that still fail
  };
  const dismissFailedWrites = () => setFailedWrites([]);

  const navigate = (newTab: string, newView: any) => {
    setTab(newTab);
    if (newTab === "lists") setListView(newView?.listId ?? null);
    else setRecipeView(newView);
    if (!isRestoringRef.current) {
      history.pushState({ tab: newTab, recipeId: newView?.recipe?.id ?? null, recipeEdit: newView?.edit ?? false, listId: newView?.listId ?? null }, "");
    }
  };

  // Set up history + back-button handling on mount
  useEffect(() => {
    history.replaceState({ tab: "planner", recipeId: null, recipeEdit: false }, "");
    const onPopState = (e: PopStateEvent) => {
      if (!e.state || !e.state.tab) return;
      const { tab: t, recipeId, recipeEdit, listId } = e.state;
      isRestoringRef.current = true;
      setTab(t);
      if (recipeId) {
        const recipe = recipesRef.current.find(r => r.id === recipeId);
        setRecipeView(recipe ? { recipe, edit: recipeEdit } : null);
      } else {
        setRecipeView(null);
      }
      setListView(listId ?? null);
      isRestoringRef.current = false;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Grocery quick-drawer: close on Android back (overlay history pattern)
  useEffect(() => {
    const onPop = () => { if (groceryOpen) { groceryPopRef.current = true; setGroceryOpen(false); groceryPopRef.current = false; } };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [groceryOpen]);

  // Shopping Mode: close on Android back
  useEffect(() => {
    const onPop = () => { if (shoppingOpen) { shoppingPopRef.current = true; setShoppingOpen(false); shoppingPopRef.current = false; } };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [shoppingOpen]);

  // Reload when the viewed week changes, or when a user signs in.
  useEffect(() => {
    if (!isConfigured || !session) return;
    hasLoadedRef.current = false;
    recipesLoadedRef.current = false;      // refetch recipes on (re)login
    lastPayloadSigRef.current = "";        // force loadAll to apply the new week's data
    setWeek(initialWeek());
    setNextWeekMeals(initialWeek());
    setPrevWeekMeals(initialWeek());
    setLists([]);
    setSnacks([]);
    setDesserts([]);
    loadAll();
  }, [viewedWeekStart, session?.user?.id]);

  // One-time geolocation prompt
  useEffect(() => {
    if (location || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      localStorage.setItem("mealplanner_loc", JSON.stringify(loc));
      setLocation(loc);
    }, () => {});
  }, []);

  // Fetch weather when location or viewed week changes
  useEffect(() => {
    if (!location) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const wkEnd = new Date(viewedWeekStart + "T00:00:00"); wkEnd.setDate(wkEnd.getDate()+6);
    const maxDate = new Date(today); maxDate.setDate(today.getDate()+15);
    if (wkEnd < today || new Date(viewedWeekStart + "T00:00:00") > maxDate) { setWeatherData({}); return; }
    const endDate = wkEnd > maxDate ? maxDate.toISOString().split("T")[0] : wkEnd.toISOString().split("T")[0];
    fetchWeather(location.lat, location.lon, viewedWeekStart, endDate)
      .then(setWeatherData).catch(() => setWeatherData({}));
  }, [location, viewedWeekStart]);

  // Background poll every 10s (paused while tab hidden) + refresh on tab focus.
  // Polls skip the recipe fetch (recipes change rarely and carry big base64
  // photos); recipes refresh on mount + when the tab regains focus.
  useEffect(() => {
    if (!isConfigured) return;
    const id = setInterval(() => { if (!document.hidden && sessionRef.current) loadAll({ recipes: false, silent: true }); }, 10000);
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !sessionRef.current) return;
      const now = Date.now();
      if (now - lastVisibilityLoadRef.current < 5000) return;
      lastVisibilityLoadRef.current = now;
      loadAll({ recipes: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  // Sync meals to DB when the week changes. Writes immediately (no shared timer)
  // and ONLY the cells that differ from the baseline FOR THIS WEEK — so it can
  // never write one week's data onto another, never loses an edit, and doesn't
  // overwrite the other user's edits to other cells.
  useEffect(() => {
    if (isLoadingRef.current || !hasLoadedRef.current || !isConfigured) return;
    const ws = viewedWeekStartRef.current;
    // If the baseline isn't for this week yet (just loaded/navigated), adopt the
    // current week as the baseline and don't write.
    if (lastSyncedWsRef.current !== ws) { lastSyncedWeekRef.current = week; lastSyncedWsRef.current = ws; return; }
    const prev = lastSyncedWeekRef.current;
    const cells = [];
    DAYS.forEach(day => MEAL_SLOTS.forEach(slot => {
      const cur = week[day][slot];
      if (!mealCellEq(cur, prev?.[day]?.[slot])) cells.push({ day, slot, entry: cur });
    }));
    lastSyncedWeekRef.current = week;
    if (!cells.length) return;
    cells.forEach(({ day, slot, entry }) => pendingMealsRef.current.set(`${ws}::${day}::${slot}`, entry));
    const settle = () => setTimeout(() => cells.forEach(({ day, slot }) => pendingMealsRef.current.delete(`${ws}::${day}::${slot}`)), 2500);
    dbWrite("Couldn't save the meal", () => sb.upsert("meals", cells.map(({ day, slot, entry }) => mealRow(ws, day, slot, entry)), "week_start,day,slot"))
      .finally(settle);
  }, [week]);

  // Sync extras to DB when snacks/desserts change (debounced 300ms)
  useEffect(() => {
    if (isLoadingRef.current || !hasLoadedRef.current || !isConfigured) return;
    extrasDirtyRef.current = { ws: viewedWeekStartRef.current, ts: Date.now() }; // guard loadAll from clobbering
    clearTimeout(extrasTimer.current);
    extrasTimer.current = setTimeout(() => syncExtras(snacks, desserts), 300);
  }, [snacks, desserts]);

  const saveCustomTagsToDB = (tags) => dbWrite("Couldn't save custom tags", () => sb.upsert("app_settings", [{ key: "custom_tags", value: tags }], "key"));

  const addCustomTag = (type, tag) => {
    setCustomTags(prev => {
      const next = { ...prev, [type]: prev[type].includes(tag) ? prev[type] : [...prev[type], tag] };
      if (isConfigured) saveCustomTagsToDB(next);
      else saveCustomTags(type, next[type]);
      return next;
    });
  };

  // Delete a custom tag from the vocab AND strip it from any recipes using it,
  // so no recipe is left referencing a tag that no longer exists.
  const deleteCustomTag = (type, tag) => {
    setCustomTags(prev => {
      const next = { ...prev, [type]: (prev[type] || []).filter(t => t !== tag) };
      if (isConfigured) saveCustomTagsToDB(next);
      else saveCustomTags(type, next[type]);
      return next;
    });
    const field = TAG_TYPE_FIELD[type];
    if (!field) return;
    setRecipes(prev => {
      const changed = [];
      const updated = prev.map(r => {
        if ((r[field] || []).includes(tag)) {
          const nr = { ...r, [field]: r[field].filter(x => x !== tag) };
          changed.push(nr);
          return nr;
        }
        return r;
      });
      if (changed.length) dbWrite("Couldn't update recipes after tag delete", () => sb.upsert("recipes", changed.map(recipeToRow)));
      return updated;
    });
  };

  const loadAll = async (opts = {}) => {
    if (isLoadingRef.current || (isConfigured && !sessionRef.current)) return;
    // Fetch recipes on the first load and when explicitly requested; polls skip
    // them (rarely change, heavy base64 photos).
    const wantRecipes = opts.recipes !== false || !recipesLoadedRef.current;
    try {
      isLoadingRef.current = true;
      if (!opts.silent) setSyncStatus("syncing"); // background polls don't flash the indicator
      const ws = viewedWeekStartRef.current;

      const nextWs = addWeeks(ws, 1);
      const prevWs = addWeeks(ws, -1);
      const [mealsRows, nextMealsRows, prevMealsRows, extrasRows, listRows, listItemRows] = await Promise.all([
        sb.get("meals", `?week_start=eq.${ws}`),
        sb.get("meals", `?week_start=eq.${nextWs}`),
        sb.get("meals", `?week_start=eq.${prevWs}`),
        sb.get("extras", `?week_start=eq.${ws}&order=created_at.asc`),
        sb.get("lists", "?order=created_at.asc").catch(() => []),
        sb.get("list_items", "?order=created_at.asc").catch(() => []),
      ]);
      const recipeRows = wantRecipes ? await sb.get("recipes", "?order=created_at.asc") : null;
      const settingsRows = await sb.get("app_settings", "?key=in.(custom_tags,ingredient_categories,store_layout,list_sorts)").catch(() => []);

      const parseWeekRows = (rows) => {
        const w = initialWeek();
        rows.forEach(row => {
          if (w[row.day]?.[row.slot] !== undefined)
            w[row.day][row.slot] = { meal: row.meal_name || "", thaw: row.thaw || false, thawDays: row.thaw_days || 2, recipeId: row.recipe_id || null };
        });
        return w;
      };
      // Re-apply in-flight meal edits so a poll mid-write can't clobber them.
      const mergedWeek = parseWeekRows(mealsRows);
      pendingMealsRef.current.forEach((entry, key) => {
        const [pws, day, slot] = key.split("::");
        if (pws === ws && mergedWeek[day]?.[slot] !== undefined) mergedWeek[day][slot] = entry;
      });
      lastSyncedWeekRef.current = mergedWeek; // baseline so the sync effect sees no spurious diff
      lastSyncedWsRef.current = ws;
      const nextNext = parseWeekRows(nextMealsRows);
      const nextPrev = parseWeekRows(prevMealsRows);

      const mappedRecipes = recipeRows ? recipeRows.map(r => ({
        id: r.id, name: r.name, description: r.description || "",
        url: r.url || "", photo: r.photo || "", notes: r.notes || "",
        prepTime: r.prep_time || "", cookTime: r.cook_time || "",
        baseServings: r.base_servings || 4,
        mealTypes: r.meal_types || [], dietTags: r.diet_tags || [], cuisineTags: r.cuisine_tags || [],
        ingredients: r.ingredients || [], steps: r.steps || [],
      })) : null;

      const serverSnacks = extrasRows.filter(e => e.type === "snack").map(e => e.name);
      const serverDesserts = extrasRows.filter(e => e.type === "dessert").map(e => e.name);

      // Nest list items under their lists; ensure the grocery singleton exists.
      const itemsByList = {};
      listItemRows.forEach(it => { (itemsByList[it.list_id] ||= []).push(it); });
      const byPos = (a, b) => (a.position ?? 0) - (b.position ?? 0);
      let builtLists = listRows.map(l => ({
        id: l.id, name: l.name, type: l.type || "custom", icon: l.icon || "📝", position: l.position ?? 0,
        items: (itemsByList[l.id] || []).map(it => {
          const q = parseItemQty(it.qty);
          return { id: it.id, text: it.text || "", checked: !!it.checked, position: it.position ?? 0, created_at: it.created_at || null,
            category: it.category || "", measures: q.measures, manual: q.manual, sources: parseJsonArr(it.source_recipe_id) };
        }).sort(byPos),
      }));
      if (!builtLists.some(l => l.type === "grocery")) {
        const grocery = { id: GROCERY_ID, name: "Grocery", type: "grocery", icon: "🛒", position: -1, items: [] };
        builtLists = [grocery, ...builtLists];
        dbWrite("Couldn't create the grocery list", () => sb.upsert("lists", [listToRow(grocery)], "id"));
      }
      // Re-apply any in-flight local writes so a poll mid-write doesn't make a
      // just-added/just-toggled item flicker out until it's confirmed server-side.
      const pending = pendingListRef.current;
      if (pending.size) {
        pending.forEach((p, id) => {
          if (p.kind !== "list") return;
          if (p.deleted) builtLists = builtLists.filter(l => l.id !== id);
          else if (!builtLists.some(l => l.id === id)) builtLists.push({ ...p.listObj, items: p.listObj.items || [] });
          else builtLists = builtLists.map(l => l.id === id ? { ...l, name: p.listObj.name, icon: p.listObj.icon, position: p.listObj.position } : l);
        });
        builtLists = builtLists.map(l => {
          let items = l.items, changed = false;
          pending.forEach((p, id) => {
            if (p.kind !== "item" || p.listId !== l.id) return;
            if (p.deleted) { if (items.some(it => it.id === id)) { items = items.filter(it => it.id !== id); changed = true; } }
            else if (!items.some(it => it.id === id)) { items = [...items, p.item]; changed = true; }
            else { items = items.map(it => it.id === id ? p.item : it); changed = true; }
          });
          return changed ? { ...l, items } : l;
        });
      }
      // Grocery always pinned first, then by position/creation order.
      builtLists.sort((a, b) => (a.type === "grocery" ? -1 : b.type === "grocery" ? 1 : (a.position ?? 0) - (b.position ?? 0)));

      const customTagsVal = settingsRows.find(r => r.key === "custom_tags")?.value || null;
      const catsVal = settingsRows.find(r => r.key === "ingredient_categories")?.value || null;
      const layoutVal = settingsRows.find(r => r.key === "store_layout")?.value || null;
      const sortsVal = settingsRows.find(r => r.key === "list_sorts")?.value || null;

      // Skip all setState when nothing changed since the last load (avoids a
      // full re-render on every poll). Recipes fall back to the current ref when
      // not fetched, so skipping their fetch doesn't register as a change.
      const sig = JSON.stringify([mergedWeek, nextNext, nextPrev, builtLists, serverSnacks, serverDesserts, customTagsVal, catsVal, layoutVal, sortsVal, mappedRecipes ?? recipesRef.current]);
      if (sig === lastPayloadSigRef.current) { hasLoadedRef.current = true; setSyncStatus("synced"); return; }
      lastPayloadSigRef.current = sig;

      setWeek(mergedWeek);
      setNextWeekMeals(nextNext);
      setPrevWeekMeals(nextPrev);
      if (mappedRecipes) { setRecipes(mappedRecipes); recipesLoadedRef.current = true; }
      // Skip overwriting extras if they were just edited locally (covers the
      // syncExtras delete-then-insert gap and the optimistic window).
      const ed = extrasDirtyRef.current;
      if (!(ed.ws === ws && Date.now() - ed.ts < 4000)) { setSnacks(serverSnacks); setDesserts(serverDesserts); }
      setLists(builtLists);
      if (customTagsVal) setCustomTags(prev => ({ ...prev, ...customTagsVal }));
      if (catsVal) setIngredientCats(catsVal);
      if (Array.isArray(layoutVal) && layoutVal.length) setStoreLayout(layoutVal);
      if (sortsVal && typeof sortsVal === "object") setListSorts(sortsVal);

      hasLoadedRef.current = true;
      setSyncStatus("synced");
    } catch (err) {
      console.error("Load error:", err);
      setSyncStatus("error");
    } finally {
      isLoadingRef.current = false;
    }
  };

  const syncExtras = async (snackList, dessertList) => {
    if (syncExtrasLockRef.current) return;
    syncExtrasLockRef.current = true;
    const ws = viewedWeekStartRef.current;
    const run = async () => {
      await sb.del("extras", `week_start=eq.${ws}`);
      const rows = [
        ...snackList.map(name => ({ week_start: ws, type: "snack", name })),
        ...dessertList.map(name => ({ week_start: ws, type: "dessert", name })),
      ];
      if (rows.length > 0) await sb.upsert("extras", rows);
    };
    dbWrite("Couldn't save snacks/desserts", run).finally(() => { syncExtrasLockRef.current = false; });
  };

  // Create a new recipe pre-filled from a planner meal; remember which cell to
  // link once it's saved.
  const createRecipeFromMeal = (name, day, slot) => {
    const r = { ...newRecipe(), name };
    pendingMealLinkRef.current = { ws: viewedWeekStartRef.current, day, slot, recipeId: r.id };
    navigate("recipes", { recipe: r, edit: true });
  };

  const saveRecipe = (recipe) => {
    recipe = { ...recipe, name: recipe.name.trim() };
    setRecipes(prev => {
      const exists = prev.find(r => r.id === recipe.id);
      return exists ? prev.map(r => r.id === recipe.id ? recipe : r) : [...prev, recipe];
    });
    const link = pendingMealLinkRef.current;
    if (link && link.recipeId === recipe.id) {
      pendingMealLinkRef.current = null;
      if (link.ws === viewedWeekStartRef.current) {
        setWeek(prev => ({ ...prev, [link.day]: { ...prev[link.day], [link.slot]: { ...prev[link.day][link.slot], meal: recipe.name, recipeId: recipe.id } } }));
      }
      navigate("planner", null); // back to the Meals tab to see the linked meal
    } else {
      navigate("recipes", { recipe });
    }
    dbWrite("Couldn't save the recipe", () => sb.upsert("recipes", [recipeToRow(recipe)]));
  };

  const deleteRecipe = (id) => {
    setRecipes(prev => prev.filter(r => r.id !== id));
    navigate("recipes", null);
    dbWrite("Couldn't delete the recipe", () => sb.del("recipes", `id=eq.${id}`));
  };

  const recipesBySlot = (slot) => recipes.filter(r => r.mealTypes.includes(slot)).map(r => r.name);

  const openGrocery = () => { setGroceryOpen(true); history.pushState({ overlay: "grocery" }, ""); };
  const closeGrocery = () => { setGroceryOpen(false); if (!groceryPopRef.current) history.back(); };

  // ─── List operations (optimistic state + per-row sync) ───────────────────────
  // Record an in-flight write so a background poll can't overwrite it (see loadAll
  // reconcile). Entries linger briefly after the write settles to cover a poll
  // that started mid-write.
  const trackPending = (id, desc) => pendingListRef.current.set(id, desc);
  const syncWrite = (label, makeP, settleIds) => {
    const clear = () => settleIds && settleIds.forEach(id => pendingListRef.current.delete(id));
    if (!isConfigured) { clear(); return; }
    dbWrite(label, makeP).finally(() => { if (settleIds) setTimeout(clear, 2500); });
  };

  const addList = (name, icon) => {
    const pos = lists.reduce((m, l) => Math.max(m, l.position || 0), 0) + 1;
    const list = { id: genId(), name: name.trim() || "Untitled List", type: "custom", icon: icon || "📝", position: pos, items: [] };
    setLists(prev => [...prev, list]);
    trackPending(list.id, { kind: "list", listObj: list });
    syncWrite("Couldn't save the new list", () => sb.upsert("lists", [listToRow(list)], "id"), [list.id]);
    return list.id;
  };
  const updateList = (id, fields) => {
    const cur = lists.find(l => l.id === id); if (!cur) return;
    const updated = { ...cur, ...fields };
    setLists(prev => prev.map(l => l.id === id ? updated : l));
    trackPending(id, { kind: "list", listObj: updated });
    syncWrite("Couldn't save the list change", () => sb.upsert("lists", [listToRow(updated)], "id"), [id]);
  };
  const deleteList = (id) => {
    if (id === GROCERY_ID) return; // grocery can't be deleted
    setLists(prev => prev.filter(l => l.id !== id));
    if (listView === id) navigate("lists", null);
    trackPending(id, { kind: "list", deleted: true });
    syncWrite("Couldn't delete the list", () => sb.del("lists", `id=eq.${id}`), [id]); // cascade removes items
  };
  const addListItem = (listId, text) => {
    const t = text.trim(); if (!t) return;
    const list = lists.find(l => l.id === listId);
    const pos = (list ? list.items.reduce((m, i) => Math.max(m, i.position || 0), 0) : 0) + 1;
    const item = { id: genId(), text: t, checked: false, position: pos, created_at: new Date().toISOString(), category: "", measures: [], manual: false, sources: [] };
    setLists(prev => prev.map(l => l.id === listId ? { ...l, items: [...l.items, item] } : l));
    trackPending(item.id, { kind: "item", listId, item });
    syncWrite("Couldn't save the item", () => sb.upsert("list_items", [listItemToRow(item, listId)], "id"), [item.id]);
  };
  const toggleListItem = (listId, itemId) => {
    const cur = lists.find(l => l.id === listId); const it = cur && cur.items.find(x => x.id === itemId); if (!it) return;
    const toggled = { ...it, checked: !it.checked };
    setLists(prev => prev.map(l => l.id !== listId ? l : { ...l, items: l.items.map(x => x.id === itemId ? toggled : x) }));
    trackPending(itemId, { kind: "item", listId, item: toggled });
    syncWrite("Couldn't save the check", () => sb.upsert("list_items", [listItemToRow(toggled, listId)], "id"), [itemId]);
  };
  const deleteListItem = (listId, itemId) => {
    setLists(prev => prev.map(l => l.id === listId ? { ...l, items: l.items.filter(it => it.id !== itemId) } : l));
    trackPending(itemId, { kind: "item", listId, deleted: true });
    syncWrite("Couldn't delete the item", () => sb.del("list_items", `id=eq.${itemId}`), [itemId]);
  };
  // Custom (manual) reorder via ▲/▼. Renumbers the moved item's display group
  // (siblingIds, in current order) to 0..n so positions stay clean & distinct;
  // grouping is by source type, so within-group positions can safely overlap
  // other groups. Only the rows whose position actually changed are written.
  const moveListItem = (listId, itemId, dir, siblingIds) => {
    const idx = siblingIds.indexOf(itemId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= siblingIds.length) return;
    const order = [...siblingIds];
    [order[idx], order[j]] = [order[j], order[idx]];
    const posOf = new Map(order.map((id, i) => [id, i]));
    const list = lists.find(l => l.id === listId); if (!list) return;
    const rows = [], ids = [];
    const nextItems = list.items.map(it => {
      if (!posOf.has(it.id)) return it;
      const np = posOf.get(it.id);
      if (np === it.position) return it;
      const u = { ...it, position: np };
      rows.push(listItemToRow(u, listId)); ids.push(it.id);
      trackPending(it.id, { kind: "item", listId, item: u });
      return u;
    });
    if (!rows.length) return;
    setLists(prev => prev.map(l => l.id === listId ? { ...l, items: nextItems } : l));
    syncWrite("Couldn't reorder the list", () => sb.upsert("list_items", rows, "id"), ids);
  };
  const clearListItems = (listId, onlyChecked) => {
    const list = lists.find(l => l.id === listId);
    const removed = list ? (onlyChecked ? list.items.filter(it => it.checked) : list.items).map(it => it.id) : [];
    setLists(prev => prev.map(l => l.id === listId ? { ...l, items: onlyChecked ? l.items.filter(it => !it.checked) : [] } : l));
    removed.forEach(id => trackPending(id, { kind: "item", listId, deleted: true }));
    const q = onlyChecked ? `list_id=eq.${listId}&checked=eq.true` : `list_id=eq.${listId}`;
    syncWrite("Couldn't clear the items", () => sb.del("list_items", q), removed);
  };

  // Add one or more recipes' ingredients to the grocery list. Recipe-sourced
  // items dedupe/aggregate against each other and existing recipe-sourced lines;
  // manual items are never merged into. Returns {added, merged}.
  const addRecipesToGrocery = (recipesToAdd) => {
    if (addGroceryBusyRef.current) return { added: 0, merged: 0 }; // ignore rapid double-tap
    const grocery = lists.find(l => l.type === "grocery");
    if (!grocery) return { added: 0, merged: 0 };
    addGroceryBusyRef.current = true;
    setTimeout(() => { addGroceryBusyRef.current = false; }, 700);
    // Build per-recipe contributions for each ingredient key.
    const candByKey = new Map();
    recipesToAdd.forEach(rec => (rec.ingredients || []).forEach(ing => {
      const name = (ing.name || "").trim(); if (!name) return;
      const key = groceryKey(name);
      const measure = ingredientToMeasure(ing.amount, ing.unit);
      let c = candByKey.get(key);
      if (!c) { c = { text: name, byRecipe: new Map() }; candByKey.set(key, c); }
      let sc = c.byRecipe.get(rec.id);
      if (!sc) { sc = { id: rec.id, name: rec.name, measures: [] }; c.byRecipe.set(rec.id, sc); }
      if (measure) sc.measures = mergeMeasures(sc.measures, [measure]);
    }));
    if (candByKey.size === 0) return { added: 0, merged: 0 };

    let added = 0, merged = 0;
    const rows = [];
    const changedIds = [];
    const items = grocery.items.map(it => ({ ...it, measures: [...(it.measures || [])], sources: (it.sources || []).map(s => ({ ...s, measures: s.measures ? [...s.measures] : undefined })) }));
    let maxPos = items.reduce((mx, i) => Math.max(mx, i.position || 0), 0);
    const newItems = [];
    candByKey.forEach((c, key) => {
      const existing = items.find(it => (it.sources && it.sources.length > 0) && groceryKey(it.text) === key);
      if (existing) {
        c.byRecipe.forEach((sc) => {
          const ex = existing.sources.find(s => s.id === sc.id);
          if (ex) ex.measures = sc.measures;       // same recipe re-added → fixed amount (no double-count)
          else existing.sources.push(sc);
        });
        if (!existing.manual) existing.measures = sumSourceMeasures(existing.sources);
        rows.push(listItemToRow(existing, grocery.id));
        trackPending(existing.id, { kind: "item", listId: grocery.id, item: existing });
        changedIds.push(existing.id);
        merged++;
      } else {
        const sources = [...c.byRecipe.values()];
        const item = { id: genId(), text: c.text, checked: false, position: ++maxPos, created_at: new Date().toISOString(), category: "", manual: false, measures: sumSourceMeasures(sources), sources };
        newItems.push(item);
        rows.push(listItemToRow(item, grocery.id));
        trackPending(item.id, { kind: "item", listId: grocery.id, item });
        changedIds.push(item.id);
        added++;
      }
    });
    const finalItems = [...items, ...newItems];
    setLists(prev => prev.map(l => l.id === grocery.id ? { ...l, items: finalItems } : l));
    if (rows.length) syncWrite("Couldn't add to grocery", () => sb.upsert("list_items", rows, "id"), changedIds);
    return { added, merged };
  };
  const addRecipeToGrocery = (recipe) => addRecipesToGrocery([recipe]);
  // Recipes linked to the currently-viewed week's planned meals.
  const weekRecipeList = () => {
    const ids = new Set();
    DAYS.forEach(d => MEAL_SLOTS.forEach(slot => { const rid = week[d]?.[slot]?.recipeId; if (rid) ids.add(rid); }));
    return [...ids].map(id => recipes.find(r => r.id === id)).filter(Boolean);
  };
  const addWeekToGrocery = () => addRecipesToGrocery(weekRecipeList());

  // How many grocery items were contributed by a given recipe.
  const groceryCountForRecipe = (recipeId) => {
    const grocery = lists.find(l => l.type === "grocery");
    return grocery ? grocery.items.filter(it => (it.sources || []).some(s => s.id === recipeId)).length : 0;
  };
  // Undo one or more recipes' contributions: delete items added only by those
  // recipes; for items shared with other recipes, keep the item and just drop
  // the selected recipes from its sources.
  const removeRecipesFromGrocery = (recipeIds) => {
    const grocery = lists.find(l => l.type === "grocery");
    if (!grocery || !recipeIds || !recipeIds.length) return { removed: 0, kept: 0 };
    const idSet = new Set(recipeIds);
    let removed = 0, kept = 0;
    const delIds = [], upRows = [], upIds = [];
    const nextItems = [];
    grocery.items.forEach(it => {
      const srcs = it.sources || [];
      const remaining = srcs.filter(s => !idSet.has(s.id));
      if (remaining.length === srcs.length) { nextItems.push(it); return; } // unaffected (incl. manual)
      if (remaining.length === 0 && !it.manual) { delIds.push(it.id); removed++; return; }
      // Keep: re-sum the remaining recipes' amounts (unless overridden or legacy item without per-recipe amounts).
      const measures = (!it.manual && sourcesHaveAmounts(srcs)) ? sumSourceMeasures(remaining) : it.measures;
      const nit = { ...it, sources: remaining, measures };
      nextItems.push(nit); upRows.push(listItemToRow(nit, grocery.id)); upIds.push(nit.id); kept++;
    });
    if (!delIds.length && !upRows.length) return { removed: 0, kept: 0 };
    setLists(prev => prev.map(l => l.id === grocery.id ? { ...l, items: nextItems } : l));
    delIds.forEach(id => trackPending(id, { kind: "item", listId: grocery.id, deleted: true }));
    upIds.forEach(id => trackPending(id, { kind: "item", listId: grocery.id, item: nextItems.find(x => x.id === id) }));
    if (delIds.length) syncWrite("Couldn't remove from grocery", () => sb.del("list_items", `id=in.(${delIds.join(",")})`), delIds);
    if (upRows.length) syncWrite("Couldn't update grocery", () => sb.upsert("list_items", upRows, "id"), upIds);
    return { removed, kept };
  };
  const removeRecipeFromGrocery = (recipeId) => removeRecipesFromGrocery([recipeId]);
  // Manual quantity override on a grocery item. For recipe-sourced items this
  // sets the `manual` flag (moves it to the "Adjusted" section); the per-recipe
  // source amounts are kept so the breakdown still shows what each recipe needs.
  const setItemQty = (listId, itemId, text) => {
    const cur = lists.find(l => l.id === listId); const it = cur && cur.items.find(x => x.id === itemId); if (!it) return;
    const hasSources = (it.sources || []).length > 0;
    const updated = { ...it, measures: parseQtyInput(text), manual: hasSources };
    setLists(prev => prev.map(l => l.id !== listId ? l : { ...l, items: l.items.map(x => x.id === itemId ? updated : x) }));
    trackPending(itemId, { kind: "item", listId, item: updated });
    syncWrite("Couldn't save the quantity", () => sb.upsert("list_items", [listItemToRow(updated, listId)], "id"), [itemId]);
  };

  // ─── Categorization (Shopping Mode) ──────────────────────────────────────────
  // Merge with the latest server cache before writing so two devices
  // categorizing at once don't drop each other's entries (ours wins on conflict).
  const saveIngredientCats = (next) => {
    if (!isConfigured) return;
    dbWrite("Couldn't save aisle categories", async () => {
      const rows = await sb.get("app_settings", "?key=eq.ingredient_categories").catch(() => []);
      const merged = { ...(rows[0]?.value || {}), ...next };
      await sb.upsert("app_settings", [{ key: "ingredient_categories", value: merged }], "key");
      setIngredientCats(merged);
    });
  };

  // Categorize any grocery items whose ingredient isn't cached yet (one batched call).
  const categorizeGroceryItems = async () => {
    const grocery = lists.find(l => l.type === "grocery");
    if (!grocery) return;
    const misses = new Set();
    grocery.items.forEach(it => { const k = normIngredient(it.text); if (k && !ingredientCats[k]) misses.add(k); });
    if (misses.size === 0) { setCatStatus(""); return; }
    setCatStatus("loading");
    try {
      const resp = await fetch("/api/categorize", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${_authToken || ""}` },
        body: JSON.stringify({ names: [...misses], sections: storeLayout }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { setCatStatus(data.message || "Couldn't sort items into aisles."); return; }
      const next = { ...ingredientCats };
      Object.entries(data.categories || {}).forEach(([name, section]) => { next[normIngredient(name)] = section; });
      setIngredientCats(next);
      saveIngredientCats(next);
      setCatStatus("");
    } catch (e) { console.error("Categorize:", e); setCatStatus("Couldn't reach the categorizer."); }
  };
  // Manual correction — remembered for that ingredient going forward.
  const setItemAisle = (item, sectionId) => {
    const key = normIngredient(item.text); if (!key) return;
    const next = { ...ingredientCats, [key]: sectionId };
    setIngredientCats(next);
    saveIngredientCats(next);
  };

  const openShopping = () => { setShoppingOpen(true); setCatStatus(""); history.pushState({ overlay: "shopping" }, ""); categorizeGroceryItems(); };
  const closeShopping = () => { setShoppingOpen(false); if (!shoppingPopRef.current) history.back(); };
  const saveStoreLayout = (next) => { setStoreLayout(next); dbWrite("Couldn't save the store layout", () => sb.upsert("app_settings", [{ key: "store_layout", value: next }], "key")); };
  const setListSort = (listId, mode) => {
    setListSorts(prev => {
      const next = { ...prev, [listId]: mode };
      dbWrite("Couldn't save the sort order", () => sb.upsert("app_settings", [{ key: "list_sorts", value: next }], "key"));
      return next;
    });
  };

  if (isConfigured && !session) return <Login onSignIn={handleSignIn} />;

  return (
    <div style={s.appRoot}>
      <style>{css}</style>

      {failedWrites.length > 0 && (
        <div style={s.saveErrorBar}>
          <span style={s.saveErrorText}>
            ⚠️ {failedWrites.length === 1 ? (failedWrites[0].label || "A change didn't save") : `${failedWrites.length} changes didn't save`}
            {failedWrites.length === 1 && failedWrites[0].message ? ` — ${failedWrites[0].message}` : ""}
          </span>
          <div style={s.saveErrorBtns}>
            <button style={s.saveErrorRetry} className="save-error-retry" onClick={retryFailedWrites}>Retry</button>
            <button style={s.saveErrorDismiss} className="save-error-dismiss" onClick={dismissFailedWrites}>✕</button>
          </div>
        </div>
      )}

      <div style={s.appBody}>
        {tab === "planner" && (
          <PlannerView recipesBySlot={recipesBySlot} recipes={recipes}
            week={week} setWeek={setWeek}
            snacks={snacks} setSnacks={setSnacks}
            desserts={desserts} setDesserts={setDesserts}
            syncStatus={syncStatus}
            viewedWeekStart={viewedWeekStart}
            nextWeekMeals={nextWeekMeals} prevWeekMeals={prevWeekMeals}
            weatherData={weatherData}
            onPrevWeek={() => setViewedWeekStart(ws => addWeeks(ws, -1))}
            onNextWeek={() => setViewedWeekStart(ws => addWeeks(ws, 1))}
            onGoToWeek={(ws) => setViewedWeekStart(ws)}
            onGoToToday={() => setViewedWeekStart(weekStart())}
            onViewRecipe={(name) => {
              const r = recipes.find(r => r.name.toLowerCase() === name.toLowerCase());
              if (r) navigate("recipes", { recipe: r });
            }}
            onCreateRecipeFromMeal={createRecipeFromMeal} />
        )}
        {tab === "recipes" && (
          <RecipesView recipes={recipes} view={recipeView} setView={(v) => navigate("recipes", v)}
            onSave={saveRecipe} onDelete={deleteRecipe}
            customTags={customTags} onAddCustomTag={addCustomTag} onDeleteCustomTag={deleteCustomTag}
            onAddToGrocery={addRecipeToGrocery} onRemoveFromGrocery={removeRecipeFromGrocery} groceryCountFor={groceryCountForRecipe} />
        )}
        {tab === "lists" && (
          <ListsView lists={lists} openId={listView} syncStatus={syncStatus}
            onOpen={(id) => navigate("lists", id ? { listId: id } : null)}
            onAddList={addList} onUpdateList={updateList} onDeleteList={deleteList}
            onAddItem={addListItem} onToggleItem={toggleListItem} onDeleteItem={deleteListItem} onClearItems={clearListItems}
            onSetItemQty={setItemQty} onRemoveRecipes={removeRecipesFromGrocery} onShopping={openShopping}
            listSorts={listSorts} onSetSort={setListSort} onMoveItem={moveListItem}
            userEmail={session?.user?.email} onSignOut={signOut} />
        )}
      </div>
      <nav style={s.bottomNav}>
        <button style={{ ...s.navBtn, ...(tab==="planner"?s.navBtnActive:{}) }} onClick={() => navigate("planner", null)}>
          <span style={s.navIcon}>🍽️</span>
          <span style={s.navLabel}>Meals</span>
        </button>
        <button style={{ ...s.navBtn, ...(tab==="recipes"?s.navBtnActive:{}) }} onClick={() => navigate("recipes", null)}>
          <span style={s.navIcon}>📖</span>
          <span style={s.navLabel}>Recipes</span>
          {recipes.length > 0 && <span style={s.navBadge}>{recipes.length}</span>}
        </button>
        <button style={{ ...s.navBtn, ...(tab==="lists"?s.navBtnActive:{}) }} onClick={() => navigate("lists", null)}>
          <span style={s.navIcon}>🛒</span>
          <span style={s.navLabel}>Lists</span>
        </button>
      </nav>

      {/* Grocery quick-access FAB (everywhere except the Lists tab) */}
      {tab !== "lists" && !groceryOpen && (()=>{
        const g = lists.find(l => l.type === "grocery");
        const left = g ? g.items.filter(i => !i.checked).length : 0;
        return (
          <button style={s.groceryFab} className="grocery-fab" onClick={openGrocery} title="Grocery list">
            <span style={{fontSize:16}}>🛒</span>
            {left > 0 && <span style={s.groceryFabBadge}>{left}</span>}
          </button>
        );
      })()}

      {groceryOpen && (
        <GroceryDrawer
          list={lists.find(l => l.type === "grocery")}
          onClose={closeGrocery}
          onAddItem={addListItem} onToggleItem={toggleListItem} onDeleteItem={deleteListItem} onClearItems={clearListItems} onSetItemQty={setItemQty}
          weekRecipeCount={weekRecipeList().length} onAddWeek={addWeekToGrocery}
          onOpenFull={() => { setGroceryOpen(false); navigate("lists", { listId: GROCERY_ID }); }} />
      )}

      {shoppingOpen && (
        <ShoppingMode list={lists.find(l => l.type === "grocery")} cats={ingredientCats} catStatus={catStatus} layout={storeLayout}
          onToggle={toggleListItem} onSetAisle={setItemAisle} onAddItem={addListItem}
          onRecategorize={categorizeGroceryItems} onSaveLayout={saveStoreLayout} onClose={closeShopping} />
      )}
    </div>
  );
}

// ─── Grocery quick-drawer ─────────────────────────────────────────────────────
function GroceryDrawer({ list, onClose, onAddItem, onToggleItem, onDeleteItem, onClearItems, onSetItemQty, onOpenFull, weekRecipeCount, onAddWeek }) {
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const items = list?.items || [];
  const checked = items.filter(i => i.checked);
  const submit = () => { const t = input.trim(); if (!t || !list) return; onAddItem(list.id, t); setInput(""); };
  const addWeek = () => {
    const { added, merged } = onAddWeek();
    setMsg(added + merged === 0 ? "Nothing to add from this week" : `✓ Added ${added}${merged ? `, merged ${merged}` : ""}`);
    setTimeout(() => setMsg(""), 2600);
  };

  return (
    <div style={s.groceryOverlay} onClick={onClose}>
      <div style={s.groceryDrawer} onClick={e => e.stopPropagation()}>
        <div style={s.groceryDrawerHead}>
          <div style={s.groceryDrawerTitle}><span style={{fontSize:20,marginRight:8}}>🛒</span>Grocery</div>
          <button style={s.modalClose} onClick={onClose}>✕</button>
        </div>

        <div style={s.listAddRow}>
          <input style={{...s.modalInput,marginBottom:0,flex:1}} autoFocus placeholder="Add an item…" value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submit(); }} />
          <button style={{...s.btnSave,...(input.trim()?{}:s.btnDisabled)}} onClick={submit}>Add</button>
        </div>

        {weekRecipeCount > 0 && (
          <button style={s.addWeekBtn} className="add-grocery-btn" onClick={addWeek}>🍽 Add this week's meals ({weekRecipeCount})</button>
        )}
        {msg && <div style={s.groceryMsg}>{msg}</div>}

        <div style={s.groceryDrawerBody}>
          {items.length === 0 ? (
            <div style={s.listEmptyState}><div style={{fontSize:28,marginBottom:8}}>🛒</div><div style={s.listEmptyStateText}>Grocery list is empty. Add items above.</div></div>
          ) : (
            <ListItemsList items={items} listId={list.id} onToggle={onToggleItem} onDelete={onDeleteItem} onSetQty={onSetItemQty} qtyEditable={true} />
          )}
        </div>

        <div style={s.groceryDrawerFoot}>
          {checked.length > 0 && <button style={s.btnClear} onClick={() => setConfirmDel(true)}>Delete checked</button>}
          <button style={{...s.btnClear,marginLeft:"auto"}} onClick={onOpenFull}>Open full list →</button>
        </div>
      </div>

      {confirmDel && (
        <ConfirmModal icon="🧹" title={`Delete ${checked.length} checked item${checked.length>1?"s":""}?`} body="This removes the checked items from the grocery list."
          confirmLabel="Delete checked" onCancel={() => setConfirmDel(false)} onConfirm={() => { onClearItems(list.id, true); setConfirmDel(false); }} />
      )}
    </div>
  );
}

// ─── Shopping Mode ────────────────────────────────────────────────────────────
function ShoppingMode({ list, cats, catStatus, layout, onToggle, onSetAisle, onAddItem, onRecategorize, onSaveLayout, onClose }) {
  const [checkOrder, setCheckOrder] = useState([]);
  const [pickerItem, setPickerItem] = useState(null);
  const [addInput, setAddInput] = useState("");
  const [editLayout, setEditLayout] = useState(false);
  const items = list?.items || [];
  const total = items.length;
  const doneCount = items.filter(i => i.checked).length;
  const knownIds = new Set(layout.map(s => s.id));
  const catFor = (it) => { const c = cats[normIngredient(it.text)]; return c && knownIds.has(c) ? c : "other"; };

  const toggle = (it) => {
    const willCheck = !it.checked;
    setCheckOrder(prev => willCheck ? [it.id, ...prev.filter(x => x !== it.id)] : prev.filter(x => x !== it.id));
    onToggle(list.id, it.id);
  };
  const submitAdd = () => { const t = addInput.trim(); if (!t) return; onAddItem(list.id, t); setAddInput(""); };

  // The add box doubles as a search: typing filters the list so you can see if
  // something's already on it (and tap to re-check) without scrolling.
  const q = addInput.trim().toLowerCase();
  const matches = (it) => !q || (it.text || "").toLowerCase().includes(q);
  const byText = (a, b) => (a.text || "").localeCompare(b.text || "", undefined, { sensitivity: "base" });

  const unchecked = items.filter(i => !i.checked && matches(i));
  const bySection = {};
  unchecked.forEach(it => { const sec = catFor(it); (bySection[sec] ||= []).push(it); });
  Object.values(bySection).forEach(arr => arr.sort(byText)); // alphabetical within each aisle
  const orderedSections = layout.filter(sec => bySection[sec.id]?.length);
  const checkedItems = items.filter(i => i.checked && matches(i))
    .sort((a, b) => { const ia = checkOrder.indexOf(a.id), ib = checkOrder.indexOf(b.id); return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib); });

  const row = (it) => {
    const m = formatMeasures(it.measures);
    return (
      <div key={it.id} style={{...s.shopRow,...(it.checked?s.shopRowDone:{})}} className="shop-row" onClick={() => toggle(it)}>
        <span style={{...s.shopCheck,...(it.checked?s.shopCheckOn:{})}}>{it.checked ? "✓" : ""}</span>
        <span style={{...s.shopText,...(it.checked?s.shopTextDone:{})}}>{m && <span style={s.shopQty}>{m} </span>}{it.text}</span>
        <button style={s.shopAisleBtn} className="shop-aisle-btn" onClick={(e) => { e.stopPropagation(); setPickerItem(it); }}>📍</button>
      </div>
    );
  };

  return (
    <div style={s.shopRoot}>
      <div style={s.shopTopBar}>
        <button style={s.detailBackBtn} className="back-btn" onClick={onClose}>← Done</button>
        <div style={s.shopTitle}>Shopping</div>
        <div style={s.shopTopRight}>
          <button style={s.shopGearBtn} className="shop-aisle-btn" onClick={() => setEditLayout(true)} title="Edit aisles">⚙</button>
          <div style={s.shopProgress}>{doneCount}/{total}</div>
        </div>
      </div>
      <div style={s.shopProgressTrack}><div style={{...s.shopProgressFill, width: total ? `${(doneCount / total) * 100}%` : "0%"}} /></div>

      {catStatus === "loading" && <div style={s.shopBanner}>🧮 Sorting items into aisles…</div>}
      {catStatus && catStatus !== "loading" && (
        <div style={{...s.shopBanner,...s.shopBannerErr}}>⚠️ {catStatus}<button style={s.shopRetry} className="shop-retry" onClick={onRecategorize}>Retry</button></div>
      )}

      <div style={s.shopBody}>
        {total === 0 ? (
          <div style={s.listEmptyState}><div style={{fontSize:30,marginBottom:8}}>🛒</div><div style={s.listEmptyStateText}>Grocery list is empty.</div></div>
        ) : q && orderedSections.length === 0 && checkedItems.length === 0 ? (
          <div style={s.listSearchEmpty}>No matches — press Add to add “{addInput.trim()}”.</div>
        ) : (
          <>
            {orderedSections.map(sec => (
              <div key={sec.id} style={s.shopSection}>
                <div style={s.shopSectionHead}>
                  <span style={s.shopSectionLabel}>{sec.label}</span>
                  {sec.id !== "other" && <span style={s.shopSectionHint}>{sec.hints.split(",")[0]}</span>}
                </div>
                {bySection[sec.id].map(row)}
              </div>
            ))}
            {checkedItems.length > 0 && (
              <div style={s.shopSection}>
                <div style={s.shopDoneHead}>✓ In the cart ({checkedItems.length})</div>
                {checkedItems.map(row)}
              </div>
            )}
          </>
        )}
        <div style={{height:90}} />
      </div>

      <div style={s.shopAddBar}>
        <div style={{position:"relative",flex:1,display:"flex",alignItems:"center"}}>
          <input style={{...s.modalInput,marginBottom:0,flex:1,...(addInput?{paddingRight:30}:{})}} placeholder="Add or search…" value={addInput}
            onChange={e => setAddInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submitAdd(); if (e.key === "Escape") setAddInput(""); }} />
          {addInput && <button style={s.listSearchClear} className="list-item-del" onClick={() => setAddInput("")} title="Clear">✕</button>}
        </div>
        <button style={{...s.btnSave,...(addInput.trim()?{}:s.btnDisabled)}} onClick={submitAdd}>Add</button>
      </div>

      {pickerItem && (
        <div style={s.overlay} onClick={() => setPickerItem(null)}>
          <div style={s.shopPicker} onClick={e => e.stopPropagation()} className="modal-in">
            <div style={s.shopPickerTitle}>Move “{abbrev(pickerItem.text, 28)}” to…</div>
            <div style={s.shopPickerList}>
              {layoutPickerOrder(layout).map(sec => (
                <button key={sec.id} style={{...s.shopPickerItem,...(catFor(pickerItem)===sec.id?s.shopPickerItemOn:{})}}
                  onClick={() => { onSetAisle(pickerItem, sec.id); setPickerItem(null); }}>
                  <span style={s.shopPickerName}>{sec.label}</span>
                  {sec.hints && <span style={s.shopPickerHint}>{sec.hints}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {editLayout && <LayoutEditor layout={layout} onSave={(next) => { onSaveLayout(next); setEditLayout(false); }} onClose={() => setEditLayout(false)} />}
    </div>
  );
}

// ─── Store layout editor ──────────────────────────────────────────────────────
function LayoutEditor({ layout, onSave, onClose }) {
  const [draft, setDraft] = useState(() => layout.map(s => ({ ...s })));
  const update = (i, key, val) => setDraft(d => d.map((s, idx) => idx === i ? { ...s, [key]: val } : s));
  const move = (i, dir) => setDraft(d => {
    const j = i + dir;
    if (j < 0 || j >= d.length) return d;
    const n = [...d]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.layoutEditor} onClick={e => e.stopPropagation()} className="modal-in">
        <div style={s.modalHead}>
          <div><div style={s.modalEyebrow}>⚙ Store layout</div><div style={s.modalTitle}>Edit aisles</div></div>
          <button style={s.modalClose} onClick={onClose}>✕</button>
        </div>
        <div style={s.layoutHint}>Rename sections, edit what's in each (helps sorting), and reorder to match your walk path.</div>
        <div style={s.layoutList}>
          {draft.map((sec, i) => (
            <div key={sec.id} style={s.layoutRow}>
              <div style={s.layoutMoveCol}>
                <button style={{...s.layoutMoveBtn,...(i===0?s.layoutMoveDim:{})}} className="layout-move" onClick={() => move(i, -1)}>▲</button>
                <button style={{...s.layoutMoveBtn,...(i===draft.length-1?s.layoutMoveDim:{})}} className="layout-move" onClick={() => move(i, 1)}>▼</button>
              </div>
              <div style={{flex:1, minWidth:0}}>
                <input style={{...s.editorInput,fontSize:14,fontWeight:700,marginBottom:5}} value={sec.label} onChange={e => update(i, "label", e.target.value)} placeholder="Section name" />
                <input style={{...s.editorInput,fontSize:12.5}} value={sec.hints} onChange={e => update(i, "hints", e.target.value)} placeholder="What's here (e.g. spices, sugar, flour)" />
              </div>
            </div>
          ))}
        </div>
        <div style={s.layoutFoot}>
          <button style={s.btnClear} onClick={onClose}>Cancel</button>
          <button style={s.btnSave} onClick={() => onSave(draft)}>Save layout</button>
        </div>
      </div>
    </div>
  );
}

// ─── Thaw Item Row ────────────────────────────────────────────────────────────
function ThawItemRow({ item }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const thaw = new Date(item.thawDate); thaw.setHours(0,0,0,0);
  const isToday = thaw.getTime() === today.getTime();
  return (
    <div style={{...s.prepItem,...(isToday?{background:"#3d1515",border:"1px solid #c0392b"}:{})}}>
      <div style={s.prepItemLeft}>
        <span style={s.prepMeal}>{item.mealName}</span>
        <span style={s.prepMeta}>{item.day} · {item.slot}</span>
      </div>
      <div style={s.prepItemRight}>
        <span style={{...s.prepThawDate,...(isToday?s.prepThawDateUrgent:{})}}>{isToday ? "🚨 Thaw Today!" : `Thaw by ${item.thawDate.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}`}</span>
        <button style={s.prepCalBtn} className="cal-btn" onClick={() => openCalendarEvent(item.mealName,item.slot,item.day,item.thawDays,item.ws)}>📅 Add</button>
      </div>
    </div>
  );
}

// ─── Planner View ─────────────────────────────────────────────────────────────
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function PlannerView({ recipesBySlot, recipes, onViewRecipe, onCreateRecipeFromMeal, week, setWeek, snacks, setSnacks, desserts, setDesserts, syncStatus, viewedWeekStart, nextWeekMeals, prevWeekMeals, weatherData, onPrevWeek, onNextWeek, onGoToWeek, onGoToToday }) {
  const [modal, setModal] = useState(null);
  const [inputVal, setInputVal] = useState("");
  const [thawOn, setThawOn] = useState(false);
  const [thawDays, setThawDays] = useState(2);
  const [copyDays, setCopyDays] = useState([]);
  const [showCopyTo, setShowCopyTo] = useState(false);
  const [dayCopyDay, setDayCopyDay] = useState(null);
  const [dayCopyTargets, setDayCopyTargets] = useState([]);
  const [snackInput, setSnackInput] = useState("");
  const [dessertInput, setDessertInput] = useState("");
  const [snackSugOpen, setSnackSugOpen] = useState(false);
  const [dessertSugOpen, setDessertSugOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [dayClearConfirm, setDayClearConfirm] = useState(null); // day name pending clear-confirm
  const [afOpen, setAfOpen] = useState(false);
  const [afMode, setAfMode] = useState("empty"); // "empty" | "replace"
  const [afSlots, setAfSlots] = useState(() => new Set());
  const [afPlan, setAfPlan] = useState(null);
  const [afConfirm, setAfConfirm] = useState(false);
  const [afAvoidLast, setAfAvoidLast] = useState(true);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date(viewedWeekStart + "T00:00:00").getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date(viewedWeekStart + "T00:00:00").getMonth());

  const isCurrentWeek = viewedWeekStart === weekStart();
  const todayName = getTodayName();

  useEffect(() => {
    if (monthPickerOpen) {
      const d = new Date(viewedWeekStart + "T00:00:00");
      setPickerYear(d.getFullYear());
      setPickerMonth(d.getMonth());
    }
  }, [monthPickerOpen]);

  const isRestoringRef = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      isRestoringRef.current = true;
      if (modal) { setModal(null); setInputVal(""); setThawOn(false); setThawDays(2); setCopyDays([]); setShowCopyTo(false); }
      else if (showClearConfirm) { setShowClearConfirm(false); }
      else if (dayClearConfirm) { setDayClearConfirm(null); }
      else if (afOpen) { setAfOpen(false); setAfConfirm(false); }
      else if (panelOpen) { setPanelOpen(false); }
      isRestoringRef.current = false;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [modal, showClearConfirm, dayClearConfirm, panelOpen, afOpen]);

  // A linked meal shows the recipe's CURRENT name (so renaming the recipe keeps
  // the planner in sync); falls back to the stored meal text otherwise.
  const displayMealName = (e) => { const r = e?.recipeId ? recipes.find(x => x.id === e.recipeId) : null; return r ? r.name : (e?.meal || ""); };

  const openModal = (day, slot) => {
    const cur = week[day][slot];
    setModal({ day, slot }); setInputVal(displayMealName(cur));
    setThawOn(cur.thaw); setThawDays(cur.thawDays);
    setCopyDays([]); setShowCopyTo(false);
    history.pushState({ overlay: "modal" }, "");
  };
  const closeModal = () => {
    setModal(null); setInputVal(""); setThawOn(false); setThawDays(2); setCopyDays([]); setShowCopyTo(false);
    if (!isRestoringRef.current) history.back();
  };

  const saveMeal = (val) => {
    if (!modal) return;
    const matchedRecipe = val ? recipes.find(r => r.name.trim().toLowerCase() === val.trim().toLowerCase()) : null;
    const entry = { meal: val, thaw: val ? thawOn : false, thawDays, recipeId: matchedRecipe ? matchedRecipe.id : null };
    setWeek(prev => {
      const next = { ...prev, [modal.day]: { ...prev[modal.day], [modal.slot]: entry } };
      if (copyDays.length > 0) copyDays.forEach(di => {
        const d = DAYS[di];
        if (d !== modal.day) next[d] = { ...next[d], [modal.slot]: { meal: val, thaw: false, thawDays: 2, recipeId: matchedRecipe ? matchedRecipe.id : null } };
      });
      return next;
    });
    closeModal();
  };

  const clearMeal = (day, slot, e) => {
    e.stopPropagation();
    setWeek(prev => ({ ...prev, [day]: { ...prev[day], [slot]: { meal:"", thaw:false, thawDays:2, recipeId:null } } }));
  };

  const clearDay = (day) => {
    setWeek(prev => {
      const cleared = {};
      MEAL_SLOTS.forEach(sl => (cleared[sl] = { meal: "", thaw: false, thawDays: 2, recipeId: null }));
      return { ...prev, [day]: cleared };
    });
    setDayClearConfirm(null);
    history.back();
  };

  const clearWeek = () => { setWeek(initialWeek()); setShowClearConfirm(false); history.back(); };

  // Save the meal as-is and jump to a new recipe editor pre-filled with its name;
  // the meal gets linked to the recipe when it's saved (see App.saveRecipe).
  const createFromMeal = () => {
    const name = inputVal.trim(); if (!name || !modal) return;
    const day = modal.day, slot = modal.slot;
    const matched = recipes.find(r => r.name.trim().toLowerCase() === name.toLowerCase());
    setWeek(prev => ({ ...prev, [day]: { ...prev[day], [slot]: { meal: name, thaw: thawOn, thawDays, recipeId: matched ? matched.id : null } } }));
    setModal(null); setInputVal(""); setThawOn(false); setThawDays(2); setCopyDays([]); setShowCopyTo(false);
    onCreateRecipeFromMeal(name, day, slot);
  };

  // ─── Auto-Fill ───────────────────────────────────────────────────────────────
  const afEligibleSlots = MEAL_SLOTS.filter(slot => recipes.some(r => (r.mealTypes || []).includes(slot)));
  // Recipe ids used in the previous week, per slot — steered away from for variety.
  const afBuildAvoid = () => {
    const map = {};
    if (!afAvoidLast) return map;
    MEAL_SLOTS.forEach(slot => {
      const ids = new Set();
      DAYS.forEach(d => { const rid = prevWeekMeals?.[d]?.[slot]?.recipeId; if (rid) ids.add(rid); });
      map[slot] = ids;
    });
    return map;
  };
  const afHasPrev = MEAL_SLOTS.some(slot => DAYS.some(d => prevWeekMeals?.[d]?.[slot]?.recipeId));
  const openAutoFill = () => {
    const init = new Set(afEligibleSlots);
    setAfSlots(init);
    setAfMode("empty");
    setAfConfirm(false);
    setAfPlan(generateWeekPlan(recipes, [...init], { avoidIdsBySlot: afBuildAvoid() }));
    setAfOpen(true);
    history.pushState({ overlay: "autofill" }, "");
  };
  const closeAutoFill = () => { setAfOpen(false); setAfConfirm(false); if (!isRestoringRef.current) history.back(); };
  const afToggleSlot = (slot) => {
    setAfConfirm(false);
    setAfSlots(prev => {
      const n = new Set(prev);
      n.has(slot) ? n.delete(slot) : n.add(slot);
      return n;
    });
    setAfPlan(prev => {
      const np = { ...(prev || {}) };
      if (np[slot]) delete np[slot]; else np[slot] = generateSlotPlan(recipes, slot, { avoidIds: afBuildAvoid()[slot] });
      return np;
    });
  };
  const afRerollSlot = (slot) => {
    setAfConfirm(false);
    const avoid = afBuildAvoid()[slot];
    setAfPlan(prev => ({ ...prev, [slot]: generateSlotPlan(recipes, slot, { avoidIds: avoid, prevKey: afPlanKey(prev?.[slot]) }) }));
  };
  const afShuffleAll = () => {
    setAfConfirm(false);
    const avoid = afBuildAvoid();
    setAfPlan(prev => {
      const np = {};
      [...afSlots].forEach(slot => { np[slot] = generateSlotPlan(recipes, slot, { avoidIds: avoid[slot], prevKey: afPlanKey(prev?.[slot]) }); });
      return np;
    });
  };
  const afSetMode = (m) => { setAfMode(m); setAfConfirm(false); };
  const afToggleAvoid = () => {
    const next = !afAvoidLast;
    setAfAvoidLast(next);
    setAfConfirm(false);
    const avoid = {};
    if (next) MEAL_SLOTS.forEach(slot => {
      const ids = new Set();
      DAYS.forEach(d => { const rid = prevWeekMeals?.[d]?.[slot]?.recipeId; if (rid) ids.add(rid); });
      avoid[slot] = ids;
    });
    setAfPlan(prev => {
      const np = {};
      [...afSlots].forEach(slot => { np[slot] = generateSlotPlan(recipes, slot, { avoidIds: avoid[slot] }); });
      return np;
    });
  };

  // Resolve the final value for a cell given the chosen mode (kept existing vs picked).
  const afResolveCell = (slot, day) => {
    const existing = week[day][slot];
    if (afMode === "empty" && existing.meal) return { name: existing.meal, recipeId: existing.recipeId, kept: true };
    const pick = afPlan?.[slot]?.[day];
    if (pick) return { name: pick.name, recipeId: pick.recipeId, kept: false };
    if (existing.meal) return { name: existing.meal, recipeId: existing.recipeId, kept: true };
    return null;
  };
  // Group consecutive days with the same resolved meal into segments for the preview.
  const afSegments = (slot) => {
    const segs = [];
    DAYS.forEach(day => {
      const cell = afResolveCell(slot, day);
      const key = cell ? `${cell.recipeId || cell.name}|${cell.kept}` : "__none";
      const last = segs[segs.length - 1];
      if (last && last.key === key) last.days.push(day);
      else segs.push({ key, days: [day], cell });
    });
    return segs;
  };
  const afOverwriteCount = afMode === "replace"
    ? [...afSlots].reduce((acc, slot) => acc + DAYS.filter(d => week[d][slot].meal && afPlan?.[slot]?.[d]).length, 0)
    : 0;
  const afApply = () => {
    if (afMode === "replace" && afOverwriteCount > 0 && !afConfirm) { setAfConfirm(true); return; }
    setWeek(prev => {
      const next = {};
      DAYS.forEach(day => { next[day] = { ...prev[day] }; });
      [...afSlots].forEach(slot => {
        DAYS.forEach(day => {
          if (afMode === "empty" && prev[day][slot].meal) return;
          const pick = afPlan?.[slot]?.[day];
          if (!pick) return;
          next[day][slot] = { meal: pick.name, thaw: false, thawDays: 2, recipeId: pick.recipeId };
        });
      });
      return next;
    });
    closeAutoFill();
  };

  const toggleCopyDay = (di) => setCopyDays(prev => prev.includes(di)?prev.filter(x=>x!==di):[...prev,di]);

  const applyDayCopy = (srcDay) => {
    setWeek(prev => {
      const next = { ...prev };
      dayCopyTargets.forEach(di => {
        const d = DAYS[di];
        next[d] = { ...next[d] };
        MEAL_SLOTS.forEach(slot => {
          const src = prev[srcDay][slot];
          if (src.meal) next[d][slot] = { meal: src.meal, thaw: false, thawDays: 2, recipeId: src.recipeId };
        });
      });
      return next;
    });
    setDayCopyDay(null);
    setDayCopyTargets([]);
  };
  const addSnack = (v) => { v=v.trim(); if(!v)return; setSnacks(p=>[...p,v]); setSnackInput(""); setSnackSugOpen(false); };
  const addDessert = (v) => { v=v.trim(); if(!v)return; setDesserts(p=>[...p,v]); setDessertInput(""); setDessertSugOpen(false); };

  // Suggestions come from the recipe library only
  const getSuggestions = (slot, query) => {
    const all = [...new Set(recipesBySlot(slot))];
    if (!query) return all.slice(0, 8);
    return all.filter(m => m.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  };

  const slotCounts = MEAL_SLOTS.reduce((acc, slot) => { acc[slot] = Object.values(week).filter(d=>d[slot].meal).length; return acc; }, {});
  const extrasCount = snacks.length + desserts.length;

  const buildThawItems = (weekData, ws) => {
    const items = [];
    DAYS.forEach(day => MEAL_SLOTS.forEach(slot => {
      const e = weekData[day][slot];
      if (e.meal && e.thaw) {
        const md = getDateForDay(day, ws); const td = new Date(md); td.setDate(md.getDate()-e.thawDays);
        items.push({ mealName:displayMealName(e), slot, day, thawDays:e.thawDays, thawDate:td, ws });
      }
    }));
    return items.sort((a,b) => a.thawDate-b.thawDate);
  };
  const thawItems = buildThawItems(week, viewedWeekStart);
  const nextWs = addWeeks(viewedWeekStart, 1);
  const wsStart = new Date(viewedWeekStart + "T00:00:00");
  const wsEnd = new Date(viewedWeekStart + "T00:00:00"); wsEnd.setDate(wsEnd.getDate()+6); wsEnd.setHours(23,59,59,999);
  const nextWeekThawItems = buildThawItems(nextWeekMeals, nextWs).filter(item => {
    const td = new Date(item.thawDate); td.setHours(0,0,0,0);
    return td >= wsStart && td <= wsEnd;
  });



  return (
    <div style={s.plannerRoot}>
      {/* HEADER */}
      <header style={s.header}>
        <div style={s.headerInner}>
          {/* Top bar: sync left, clear right */}
          <div style={s.headerTopBar}>
            {syncStatus && syncStatus !== "unconfigured" ? (
              <div style={{...s.syncIndicator,...(syncStatus==="error"?s.syncError:syncStatus==="synced"?s.syncOk:s.syncBusy)}}>
                {syncStatus==="loading"||syncStatus==="syncing" ? "🔄 Syncing…" : syncStatus==="synced" ? "✓ Synced" : "⚠ Sync error"}
              </div>
            ) : <div />}
            <div style={s.headerTopBtns}>
              <button style={s.autoFillBtn} className="autofill-btn" onClick={openAutoFill} title="Auto-fill this week">
                <span style={{fontSize:13}}>✨</span>
                <span style={s.clearWeekLabel}>Auto-Fill</span>
              </button>
              <button style={s.clearWeekBtn} className="clear-week-btn" onClick={() => { setShowClearConfirm(true); history.pushState({ overlay: "clearConfirm" }, ""); }} title="Clear week">
                <span style={{fontSize:14}}>🗑</span>
                <span style={s.clearWeekLabel}>Clear</span>
              </button>
            </div>
          </div>
          {/* Centered title */}
          <div style={s.headerTitleBlock}>
            <div style={s.eyebrow}>Weekly Meal Planner</div>
            <h1 style={s.title}>What's Cooking?</h1>
          </div>
          {/* Week navigation */}
          <div style={s.weekNav}>
            <button style={s.weekNavArrow} onClick={onPrevWeek}>◀</button>
            <div style={{position:"relative"}}>
              <button style={s.weekRangeBtn} onClick={() => setMonthPickerOpen(v => !v)}>
                {getWeekRange(viewedWeekStart)}
              </button>
              {monthPickerOpen && (
                <div style={s.monthPicker}>
                  <div style={s.monthPickerHead}>
                    <button style={s.monthNavArrow} onClick={() => { let m=pickerMonth-1,y=pickerYear; if(m<0){m=11;y--;} setPickerMonth(m);setPickerYear(y); }}>◀</button>
                    <span style={s.monthPickerTitle}>{MONTH_NAMES[pickerMonth]} {pickerYear}</span>
                    <button style={s.monthNavArrow} onClick={() => { let m=pickerMonth+1,y=pickerYear; if(m>11){m=0;y++;} setPickerMonth(m);setPickerYear(y); }}>▶</button>
                  </div>
                  {getWeeksInMonth(pickerYear, pickerMonth).map(ws => {
                    const isViewed = ws === viewedWeekStart;
                    const isCurrWeek = ws === weekStart();
                    return (
                      <button key={ws} style={{...s.weekPickerRow,...(isViewed?s.weekPickerRowViewed:{}),...(isCurrWeek&&!isViewed?s.weekPickerRowCurrent:{})}}
                        onClick={() => { onGoToWeek(ws); setMonthPickerOpen(false); }}>
                        {getWeekRange(ws)}
                        {isCurrWeek && <span style={s.weekPickerDot}>●</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button style={s.weekNavArrow} onClick={onNextWeek}>▶</button>
            {!isCurrentWeek && (
              <button style={s.todayJumpBtn} onClick={() => { onGoToToday(); setMonthPickerOpen(false); }}>Today</button>
            )}
          </div>
          {/* Counts centered, Extras pinned right */}
          <div style={s.headerCountsRow}>
            <div style={{flex:1}} />
            <div style={s.counters}>
              {MEAL_SLOTS.map(slot => {
                const count = slotCounts[slot]; const full = count===7;
                return (
                  <div key={slot} style={s.counterItem}>
                    <div style={s.counterTop}>
                      <span style={{...s.dot,background:slotColors[slot]}} />
                      <span style={s.counterLabel}>{slot}</span>
                      <span style={{...s.counterFrac,...(full?s.counterFracFull:{})}}>{count}<span style={s.counterOf}>/7</span></span>
                    </div>
                    <div style={s.counterTrack}><div style={{...s.counterFill,background:slotColors[slot],width:`${(count/7)*100}%`,opacity:full?1:0.7}} /></div>
                  </div>
                );
              })}
            </div>
            <div style={{flex:1,display:"flex",justifyContent:"flex-end"}}>
              <button style={s.extrasBtn} className="extras-btn" onClick={() => { if (!panelOpen) { setPanelOpen(true); history.pushState({ overlay: "panel" }, ""); } else { setPanelOpen(false); history.back(); } }}>
                <span style={s.extrasBtnIcon}>🍪</span>
                <span style={s.extrasBtnLabel}>Extras</span>
                {extrasCount > 0 && <span style={s.extrasBadge}>{extrasCount}</span>}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* THAW BANNER */}
      {(thawItems.length > 0 || nextWeekThawItems.length > 0) && (
        <div style={s.prepBanner}>
          <div style={s.prepBannerInner}>
            {thawItems.length > 0 && <>
              <div style={s.prepBannerTitle}><span>🧊</span> This Week's Thaw Reminders</div>
              <div style={s.prepList}>
                {thawItems.map((item,i) => <ThawItemRow key={i} item={item} />)}
              </div>
            </>}
            {nextWeekThawItems.length > 0 && <>
              <div style={{...s.prepBannerTitle, marginTop: thawItems.length>0 ? 14 : 0, color:"#c8a878"}}><span>🔜</span> Thaw Now — for Next Week</div>
              <div style={s.prepList}>
                {nextWeekThawItems.map((item,i) => <ThawItemRow key={i} item={item} />)}
              </div>
            </>}
          </div>
        </div>
      )}

      {/* GRID */}
      <main style={s.main}>
        <div style={s.grid}>
          {DAYS.map(day => {
            const isToday = isCurrentWeek && day === todayName;
            const hasThaw = MEAL_SLOTS.some(sl=>week[day][sl].meal&&week[day][sl].thaw);
            const hasMeals = MEAL_SLOTS.some(sl=>week[day][sl].meal);
            const isDayCopying = dayCopyDay===day;
            const dayKey = getDateForDay(day, viewedWeekStart).toISOString().split("T")[0];
            const dayWeather = weatherData[dayKey];
            return (
              <div key={day} style={{...s.card,...(isToday?s.cardToday:{}),...(hasThaw?s.cardThaw:{})}} className="day-card">
                <div style={s.cardHead}>
                  <div style={{display:"flex",alignItems:"baseline",gap:5,flexWrap:"wrap"}}>
                    <span style={{...s.dayName,...(isToday?s.dayNameToday:{})}}>{day.slice(0,3).toUpperCase()}</span>
                    <span style={s.dayDate}>{getDateForDay(day, viewedWeekStart).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                    {dayWeather && <span style={s.dayWeather}>{dayWeather.icon} {dayWeather.high}°/{dayWeather.low}°</span>}
                  </div>
                  <div style={s.cardBadges}>
                    {hasThaw && <span style={s.thawBadge}>🧊</span>}
                    {isToday && <span style={s.todayBadge}>Today</span>}
                    {hasMeals && (
                      <button style={{...s.dayCopyBtn,...(isDayCopying?s.dayCopyBtnActive:{})}} className="day-copy-btn"
                        onClick={e=>{e.stopPropagation(); setDayCopyDay(isDayCopying?null:day); setDayCopyTargets([]);}}>⎘</button>
                    )}
                    {hasMeals && (
                      <button style={s.dayClearBtn} className="day-clear-btn" title="Clear this day"
                        onClick={e=>{e.stopPropagation(); setDayClearConfirm(day); history.pushState({ overlay: "dayClearConfirm" }, "");}}>🗑</button>
                    )}
                  </div>
                </div>
                {isDayCopying && (
                  <div style={s.dayCopyPicker} onClick={e=>e.stopPropagation()}>
                    <div style={s.copyPickerLbl}>Copy all meals to:</div>
                    <div style={s.copyDaysRow}>
                      {DAY_ABBR.map((abbr,di) => {
                        const isSrc=DAYS[di]===day; const isSel=dayCopyTargets.includes(di);
                        return <button key={di} disabled={isSrc} style={{...s.dayChip,...(isSrc?s.dayChipSource:{}),...(isSel?s.dayChipSelected:{})}} className={isSrc?"":`day-chip${isSel?" day-chip-sel":""}`} onClick={()=>!isSrc&&setDayCopyTargets(prev=>prev.includes(di)?prev.filter(x=>x!==di):[...prev,di])}>{abbr}</button>;
                      })}
                    </div>
                    {dayCopyTargets.length>0 && (
                      <button style={s.dayCopyApplyBtn} onClick={()=>applyDayCopy(day)}>
                        Copy to {dayCopyTargets.length} day{dayCopyTargets.length>1?"s":""}
                      </button>
                    )}
                  </div>
                )}
                <div style={s.slots}>
                  {MEAL_SLOTS.map(slot => {
                    const entry = week[day][slot]; const val = entry.meal;
                    const linkedRecipeForCard = entry.recipeId ? recipes.find(r => r.id === entry.recipeId) : null;
                    const hasLinkedRecipe = !!linkedRecipeForCard;
                    const mealWeather = dayWeather?.meals[slot];
                    return (
                      <div key={slot}
                        style={{...s.slot,...(val?s.slotFilled:s.slotEmpty),...(val&&entry.thaw?s.slotThaw:{}),...(linkedRecipeForCard?s.slotHasRecipe:{})}}
                        className="meal-slot" onClick={() => openModal(day,slot)}
                      >
                        <span style={{...s.dot,background:slotColors[slot],flexShrink:0,marginTop:2,alignSelf:"flex-start"}} />
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:4}}>
                            <div style={{display:"flex",alignItems:"center",gap:4}}>
                              <span style={s.slotLbl}>{slot}</span>
                              {val&&entry.thaw && <span style={{fontSize:9}}>🧊</span>}
                            </div>
                            {mealWeather && <span style={s.slotWeather}>{mealWeather.icon} {mealWeather.temp}°</span>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
                            {val ? <span style={s.slotMeal}>{linkedRecipeForCard ? linkedRecipeForCard.name : val}</span> : <span style={s.slotPlaceholder}>+ Add</span>}
                            {linkedRecipeForCard && (
                              <button style={s.slotRecipeBtn} className="slot-recipe-btn"
                                onClick={e=>{e.stopPropagation(); onViewRecipe(linkedRecipeForCard.name);}}>
                                📖 <span style={{fontSize:10,fontWeight:700}}>View Recipe</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* MONTH PICKER BACKDROP */}
      {monthPickerOpen && <div style={s.monthPickerBackdrop} onClick={() => setMonthPickerOpen(false)} />}

      {/* EXTRAS PANEL */}
      <div style={{...s.backdrop,...(panelOpen?s.backdropVisible:{})}} onClick={()=>{ setPanelOpen(false); if (!isRestoringRef.current) history.back(); }} />
      <aside style={{...s.panel,...(panelOpen?s.panelOpen:{})}}>
        <div style={s.panelHeader}>
          <div style={s.panelTitle}>Weekly Extras</div>
          <button style={s.panelClose} onClick={()=>{ setPanelOpen(false); if (!isRestoringRef.current) history.back(); }}>✕</button>
        </div>
        {[{label:"Snacks",color:"#b89ac8",items:snacks,setItems:setSnacks,input:snackInput,setInput:setSnackInput,sugOpen:snackSugOpen,setSugOpen:setSnackSugOpen,suggestions:SNACK_SUGGESTIONS,add:addSnack},{label:"Desserts",color:"#e8a0b4",items:desserts,setItems:setDesserts,input:dessertInput,setInput:setDessertInput,sugOpen:dessertSugOpen,setSugOpen:setDessertSugOpen,suggestions:DESSERT_SUGGESTIONS,add:addDessert}].map(bin => (
          <div key={bin.label} style={s.binCard}>
            <div style={s.binHeader}><span style={{...s.dot,background:bin.color}} /><span style={s.binLabel}>{bin.label}</span><span style={s.binCount}>{bin.items.length}</span></div>
            <div style={s.binItems}>
              {bin.items.length===0 && <div style={s.binEmpty}>Nothing added yet</div>}
              {bin.items.map((item,i) => (
                <div key={i} style={s.binItem} className="bin-item">
                  <span style={s.binItemText}>{item}</span>
                  <button style={s.binRemove} className="bin-remove" onClick={()=>bin.setItems(p=>p.filter((_,j)=>j!==i))}>✕</button>
                </div>
              ))}
            </div>
            <div style={s.binInputRow}>
              <input style={s.binInput} placeholder={`Add a ${bin.label.toLowerCase().slice(0,-1)}…`} value={bin.input}
                onChange={e=>{bin.setInput(e.target.value);bin.setSugOpen(e.target.value.length>0);}}
                onKeyDown={e=>{if(e.key==="Enter")bin.add(bin.input);}} />
              <button style={s.binAdd} className="bin-add-btn" onClick={()=>bin.add(bin.input)}>+</button>
            </div>
            {bin.sugOpen && (
              <div style={s.binSugs}>
                {bin.suggestions.filter(sg=>sg.toLowerCase().includes(bin.input.toLowerCase())).slice(0,5).map(sg=>(
                  <button key={sg} style={chips.small} className="chip" onClick={()=>bin.add(sg)}>{sg}</button>
                ))}
              </div>
            )}
          </div>
        ))}
      </aside>

      {/* CLEAR WEEK CONFIRM */}
      {/* AUTO-FILL PANEL */}
      {afOpen && (
        <div style={s.overlay} onClick={closeAutoFill}>
          <div style={s.modal} onClick={e=>e.stopPropagation()} className="modal-in">
            <div style={s.modalHead}>
              <div>
                <div style={s.modalEyebrow}>✨ Auto-Fill</div>
                <div style={s.modalTitle}>Plan {getWeekRange(viewedWeekStart)}</div>
              </div>
              <button style={s.modalClose} onClick={closeAutoFill}>✕</button>
            </div>

            {afEligibleSlots.length === 0 ? (
              <div style={{textAlign:"center",padding:"20px 4px"}}>
                <div style={{fontSize:30,marginBottom:10}}>🍽</div>
                <div style={{fontSize:14,color:"#c8a878",fontFamily:"'DM Sans',sans-serif",marginBottom:6,fontWeight:600}}>No recipes to pull from yet</div>
                <div style={{fontSize:12.5,color:"#9a7f60",fontFamily:"'DM Sans',sans-serif",lineHeight:1.5}}>Add some recipes and tag them with a meal type (Breakfast / Lunch / Dinner), then Auto-Fill can build your week.</div>
              </div>
            ) : (
              <>
                {/* Slot toggles */}
                <div style={s.afOptLabel}>Fill which meals?</div>
                <div style={s.afSlotRow}>
                  {afEligibleSlots.map(slot => {
                    const on = afSlots.has(slot);
                    return (
                      <button key={slot} style={{...s.afSlotChip,...(on?{...s.afSlotChipOn,borderColor:slotColors[slot],color:slotColors[slot]}:{})}} onClick={()=>afToggleSlot(slot)}>
                        <span style={{...s.dot,background:slotColors[slot],marginRight:6,opacity:on?1:0.4}} />{slot}
                      </button>
                    );
                  })}
                </div>

                {/* Mode toggle */}
                <div style={s.afOptLabel}>If the week already has meals…</div>
                <div style={s.afModeRow}>
                  <button style={{...s.afModeBtn,...(afMode==="empty"?s.afModeBtnOn:{})}} onClick={()=>afSetMode("empty")}>Keep them, fill the gaps</button>
                  <button style={{...s.afModeBtn,...(afMode==="replace"?s.afModeBtnOn:{})}} onClick={()=>afSetMode("replace")}>Replace the whole week</button>
                </div>

                {/* Avoid-last-week toggle (only when there's a planned prior week to avoid) */}
                {afHasPrev && (
                  <button style={s.afToggleRow} className="af-toggle-row" onClick={afToggleAvoid}>
                    <span style={s.afToggleLabel}>Avoid last week's meals</span>
                    <span style={{...s.afTogglePill,...(afAvoidLast?s.afTogglePillOn:{})}}>{afAvoidLast?"ON":"OFF"}</span>
                  </button>
                )}

                {/* Preview */}
                <div style={s.afPreviewHead}>
                  <span style={s.afOptLabel}>Preview</span>
                  <button style={s.afShuffleBtn} className="af-shuffle-btn" onClick={afShuffleAll}>🔀 Shuffle all</button>
                </div>
                {afSlots.size === 0 ? (
                  <div style={s.afEmptyHint}>Pick at least one meal above.</div>
                ) : (
                  <div style={s.afPreview}>
                    {MEAL_SLOTS.filter(sl=>afSlots.has(sl)).map(slot => (
                      <div key={slot} style={s.afSlotBlock}>
                        <div style={s.afSlotBlockHead}>
                          <span style={s.afSlotBlockTitle}><span style={{...s.dot,background:slotColors[slot],marginRight:6}} />{slot}</span>
                          <button style={s.afRerollBtn} className="af-shuffle-btn" onClick={()=>afRerollSlot(slot)}>🔄 Re-roll</button>
                        </div>
                        {afSegments(slot).map((seg,i) => {
                          const range = seg.days.length===1 ? seg.days[0].slice(0,3) : `${seg.days[0].slice(0,3)}–${seg.days[seg.days.length-1].slice(0,3)}`;
                          return (
                            <div key={i} style={s.afSegRow}>
                              <span style={s.afSegRange}>{range}</span>
                              {seg.cell
                                ? <span style={s.afSegName}>{seg.cell.name}{seg.cell.kept && <span style={s.afKeptTag}>kept</span>}</span>
                                : <span style={s.afSegEmpty}>— empty</span>}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}

                {/* Confirm / actions */}
                {afConfirm ? (
                  <div style={s.afConfirmBar}>
                    <div style={s.afConfirmText}>This replaces {afOverwriteCount} meal{afOverwriteCount!==1?"s":""} already on the week.</div>
                    <div style={s.afActions}>
                      <button style={s.btnClear} onClick={()=>setAfConfirm(false)}>Cancel</button>
                      <button style={{...s.btnSave,background:"linear-gradient(135deg,#e07a5f,#c05040)"}} onClick={afApply}>Replace & Apply</button>
                    </div>
                  </div>
                ) : (
                  <div style={s.afActions}>
                    <button style={s.btnClear} onClick={closeAutoFill}>Cancel</button>
                    <button style={{...s.btnSave,...(afSlots.size===0?s.btnDisabled:{})}} onClick={()=>afSlots.size>0&&afApply()}>Apply to week</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showClearConfirm && (
        <div style={s.overlay} onClick={()=>{ setShowClearConfirm(false); history.back(); }}>
          <div style={{...s.modal,maxWidth:320,textAlign:"center"}} onClick={e=>e.stopPropagation()} className="modal-in">
            <div style={{fontSize:32,marginBottom:12}}>🗑</div>
            <div style={{...s.modalTitle,fontSize:18,marginBottom:8}}>Clear the week?</div>
            <div style={{fontSize:13,color:"#9a7f60",marginBottom:24,fontFamily:"'DM Sans',sans-serif"}}>This will remove all meals from every day. Can't be undone.</div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button style={s.btnClear} onClick={()=>{ setShowClearConfirm(false); history.back(); }}>Cancel</button>
              <button style={{...s.btnSave,background:"linear-gradient(135deg,#e07a5f,#c05040)"}} onClick={clearWeek}>Clear Week</button>
            </div>
          </div>
        </div>
      )}

      {dayClearConfirm && (
        <div style={s.overlay} onClick={()=>{ setDayClearConfirm(null); history.back(); }}>
          <div style={{...s.modal,maxWidth:320,textAlign:"center"}} onClick={e=>e.stopPropagation()} className="modal-in">
            <div style={{fontSize:32,marginBottom:12}}>🗑</div>
            <div style={{...s.modalTitle,fontSize:18,marginBottom:8}}>Clear {dayClearConfirm}'s meals?</div>
            <div style={{fontSize:13,color:"#9a7f60",marginBottom:24,fontFamily:"'DM Sans',sans-serif"}}>This removes every meal for {dayClearConfirm}. Can't be undone.</div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button style={s.btnClear} onClick={()=>{ setDayClearConfirm(null); history.back(); }}>Cancel</button>
              <button style={{...s.btnSave,background:"linear-gradient(135deg,#e07a5f,#c05040)"}} onClick={()=>clearDay(dayClearConfirm)}>Clear Day</button>
            </div>
          </div>
        </div>
      )}

      {/* MEAL MODAL */}
      {modal && (
        <div style={s.overlay} onClick={closeModal}>
          <div style={s.modal} onClick={e=>e.stopPropagation()} className="modal-in">
            <div style={s.modalHead}>
              <div>
                <div style={s.modalEyebrow}><span style={{...s.dot,background:slotColors[modal.slot],marginRight:6}} />{modal.slot} · {modal.day}</div>
                <div style={s.modalTitle}>What's on the menu?</div>
              </div>
              <button style={s.modalClose} onClick={closeModal}>✕</button>
            </div>

            <input style={s.modalInput} placeholder="Type a meal name…" value={inputVal} autoFocus
              onChange={e=>setInputVal(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&inputVal.trim())saveMeal(inputVal.trim());}} />

            {/* View recipe link — computed inline so it's always fresh */}
            {(() => {
              const slotEntry = modal ? week[modal.day][modal.slot] : null;
              const byId = slotEntry?.recipeId ? recipes.find(r => r.id === slotEntry.recipeId) : null;
              const byName = inputVal.trim() ? recipes.find(r => r.name.trim().toLowerCase() === inputVal.trim().toLowerCase()) : null;
              const linked = byId || byName;
              if (!linked) return null;
              return (
                <div style={s.viewRecipeRow}>
                  <span style={s.viewRecipeIcon}>📖</span>
                  <span style={s.viewRecipeName}>{linked.name}</span>
                  <button style={s.viewRecipeBtn} className="view-recipe-btn"
                    onClick={() => { closeModal(); onViewRecipe(linked.name); }}>
                    View Recipe →
                  </button>
                </div>
              );
            })()}

            {/* Create a recipe for a typed-in meal that isn't a recipe yet */}
            {(() => {
              const slotEntry = modal ? week[modal.day][modal.slot] : null;
              const byId = slotEntry?.recipeId ? recipes.find(r => r.id === slotEntry.recipeId) : null;
              const byName = inputVal.trim() ? recipes.find(r => r.name.trim().toLowerCase() === inputVal.trim().toLowerCase()) : null;
              if (byId || byName || !inputVal.trim()) return null;
              return (
                <button style={s.createRecipeBtn} className="create-recipe-btn" onClick={createFromMeal}>
                  ➕ Create a recipe for "{inputVal.trim()}"
                </button>
              );
            })()}

            {/* Suggestions */}
            {(()=>{
              const sugs = getSuggestions(modal.slot, inputVal.length>0?inputVal:"");
              if (sugs.length===0) return null;
              return (
                <div style={s.sugs}>
                  <div style={s.sugsLbl}>{inputVal.length>0?"Suggestions":"From your recipes"}</div>
                  <div style={s.sugsList}>
                    {sugs.map(m => {
                      const isFromLib = recipes.some(r=>r.name.toLowerCase()===m.toLowerCase());
                      return (
                        <button key={m} style={{...chips.normal,...(isFromLib?chips.recipeChip:{})}} className="chip" onClick={()=>setInputVal(m)}>
                          {isFromLib && <span style={{marginRight:4,fontSize:10}}>📖</span>}{m}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Thaw */}
            {inputVal.trim() && (
              <div style={s.thawSection}>
                <div style={s.thawRow}>
                  <button style={{...s.thawToggle,...(thawOn?s.thawToggleOn:{})}} className="thaw-toggle" onClick={()=>setThawOn(v=>!v)}>
                    <span style={s.thawToggleIcon}>🧊</span>
                    <span>Needs thaw</span>
                    <span style={{...s.thawTogglePill,...(thawOn?s.thawTogglePillOn:{})}}>{thawOn?"ON":"OFF"}</span>
                  </button>
                </div>
                {thawOn && (
                  <div style={s.thawOptions}>
                    <span style={s.thawOptionsLbl}>Thaw how many days before?</span>
                    <div style={s.thawDayBtns}>
                      {[1,2,3].map(n=>(
                        <button key={n} style={{...s.thawDayBtn,...(thawDays===n?s.thawDayBtnActive:{})}} className="thaw-day-btn" onClick={()=>setThawDays(n)}>{n} day{n>1?"s":""}</button>
                      ))}
                    </div>
                    <div style={s.thawPreview}>↳ Thaw by {(()=>{const d=getDateForDay(modal.day,viewedWeekStart);d.setDate(d.getDate()-thawDays);return d.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"});})()}</div>
                    <button style={s.thawCalBtn} className="cal-btn" onClick={()=>openCalendarEvent(inputVal.trim(),modal.slot,modal.day,thawDays,viewedWeekStart)}>📅 Add thaw reminder to calendar</button>
                  </div>
                )}
              </div>
            )}

            {/* Copy to */}
            {inputVal.trim() && (
              <div style={s.copySection}>
                <button style={{...s.copyToggle,...(showCopyTo?s.copyToggleActive:{})}} onClick={()=>setShowCopyTo(v=>!v)}>
                  <span>⎘</span> Copy to other days
                  {copyDays.length>0 && <span style={s.copyBadge}>{copyDays.length}</span>}
                </button>
                {showCopyTo && (
                  <div style={s.copyPicker}>
                    <div style={s.copyPickerLbl}>Select days to also set {modal.slot.toLowerCase()}:</div>
                    <div style={s.copyDaysRow}>
                      {DAY_ABBR.map((abbr,di)=>{
                        const isSrc=DAYS[di]===modal.day; const isSel=copyDays.includes(di);
                        return <button key={di} disabled={isSrc} style={{...s.dayChip,...(isSrc?s.dayChipSource:{}),...(isSel?s.dayChipSelected:{})}} className={isSrc?"":`day-chip${isSel?" day-chip-sel":""}`} onClick={()=>!isSrc&&toggleCopyDay(di)}>{abbr}</button>;
                      })}
                    </div>
                    {copyDays.length>0 && <div style={s.copyPreview}>→ {copyDays.map(di=>DAYS[di]).join(", ")}</div>}
                  </div>
                )}
              </div>
            )}

            <div style={s.modalActions}>
              {week[modal.day][modal.slot].meal && <button style={s.btnClear} onClick={()=>saveMeal("")}>Clear</button>}
              <button style={{...s.btnSave,...(!inputVal.trim()?s.btnDisabled:{})}} onClick={()=>inputVal.trim()&&saveMeal(inputVal.trim())}>
                {copyDays.length>0?`Save & Copy (${copyDays.length+1})`:"Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recipes View ─────────────────────────────────────────────────────────────
function RecipesView({ recipes, view, setView, onSave, onDelete, customTags, onAddCustomTag, onDeleteCustomTag, onAddToGrocery, onRemoveFromGrocery, groceryCountFor }) {
  if (view && view.edit) return <RecipeEditor recipe={view.recipe} onSave={onSave} onCancel={()=>setView(recipes.some(r=>r.id===view.recipe?.id)?{recipe:view.recipe}:null)} customTags={customTags} onAddCustomTag={onAddCustomTag} onDeleteCustomTag={onDeleteCustomTag} />;
  if (view && view.recipe) return <RecipeDetail recipe={view.recipe} onEdit={()=>setView({recipe:view.recipe,edit:true})} onDelete={onDelete} onBack={()=>setView(null)} onAddToGrocery={onAddToGrocery} onRemoveFromGrocery={onRemoveFromGrocery} groceryCount={groceryCountFor ? groceryCountFor(view.recipe.id) : 0} />;
  return <RecipeGrid recipes={recipes} onNew={()=>setView({recipe:newRecipe(),edit:true})} onSelect={r=>setView({recipe:r})} onImported={rec=>setView({recipe:rec,edit:true})} customTags={customTags} onAddCustomTag={onAddCustomTag} />;
}

// ─── Tag Picker ───────────────────────────────────────────────────────────────
function TagPicker({ label, defaultTags, customTagsList, onAddCustomTag, onDeleteCustomTag, selected, onToggle, chipStyle, chipActiveStyle }) {
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [input, setInput] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const customList = (customTagsList||[]).filter(t => !defaultTags.includes(t));
  const allTags = [...defaultTags, ...customList];
  const addCustom = () => {
    const v = input.trim(); if (!v) return;
    onAddCustomTag(v);
    if (!selected.includes(v)) onToggle(v);
    setInput(""); setAdding(false);
  };
  const doDeleteTag = (t) => {
    if (selected.includes(t)) onToggle(t);   // drop it from the recipe being edited too
    onDeleteCustomTag(t);
    setPendingDelete(null);
  };
  const canManage = onDeleteCustomTag && customList.length > 0;
  return (
    <div style={s.editorField}>
      <div style={s.tagPickerHead}>
        <label style={{...s.editorLabel,marginBottom:0}}>{label}</label>
        {(canManage || managing) && (
          <button style={{...s.tagManageBtn,...(managing?s.tagManageBtnOn:{})}} onClick={()=>setManaging(m=>!m)}>{managing?"Done":"Manage"}</button>
        )}
      </div>
      <div style={s.tagPicker}>
        {allTags.map(t => {
          const isCustom = customList.includes(t);
          if (managing && isCustom) {
            return <button key={t} style={{...s.tagPickerChip,...s.tagDeleteChip}} className="tag-delete-chip" onClick={()=>setPendingDelete(t)}>{t} ✕</button>;
          }
          return <button key={t} disabled={managing} style={{...s.tagPickerChip,...(selected.includes(t)?chipActiveStyle:{}),...(managing?s.tagChipDim:{})}} className="tag-chip" onClick={()=>!managing&&onToggle(t)}>{t}</button>;
        })}
        {!adding && !managing && <button style={s.addCustomChip} onClick={()=>setAdding(true)}>+ Custom</button>}
      </div>
      {managing && <div style={s.tagManageHint}>Tap a custom tag to remove it everywhere. Built-in tags can't be deleted.</div>}
      {adding && (
        <div style={s.customTagRow}>
          <input style={{...s.editorInput,flex:1}} autoFocus placeholder="New tag…" value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")addCustom();if(e.key==="Escape"){setAdding(false);setInput("");}}} />
          <button style={s.btnSave} onClick={addCustom}>Add</button>
          <button style={s.btnClear} onClick={()=>{setAdding(false);setInput("");}}>✕</button>
        </div>
      )}
      {pendingDelete && (
        <ConfirmModal title={`Remove the "${pendingDelete}" tag?`} body="It will be deleted from this and any other recipes using it."
          confirmLabel="Remove tag" onCancel={() => setPendingDelete(null)} onConfirm={() => doDeleteTag(pendingDelete)} />
      )}
    </div>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────
function ImportModal({ onClose, onImported }) {
  const [mode, setMode] = useState("url"); // "url" | "photo"
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(null); // imported recipe waiting to open after the overlay history entry unwinds

  useEffect(() => {
    const onPop = () => {
      if (pendingRef.current) { const r = pendingRef.current; pendingRef.current = null; onImported(r); }
      else onClose();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [onClose, onImported]);

  // All exits (✕, overlay click, success, Android back) go through history.back()
  // so the pushed overlay entry is consumed; the popstate handler above finishes the job.
  const close = () => history.back();

  const callImport = async (payload) => {
    let resp;
    try {
      resp = await fetch("/api/import-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${_authToken || ""}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(75000), // never hang the UI if the server stalls
      });
    } catch (e) {
      throw new Error(e?.name === "TimeoutError"
        ? "This is taking too long — the recipe site may be blocking the import. Try a different link or the photo option."
        : "Couldn't reach the import service. Check your connection and try again.");
    }
    let data;
    try { data = await resp.json(); } catch { data = {}; }
    if (!resp.ok) throw new Error(data.message || "Import failed. Please try again.");
    return data.recipe;
  };

  const importUrl = async () => {
    const v = url.trim();
    if (!/^https?:\/\//i.test(v)) { setError("Enter a valid link starting with http(s)://"); return; }
    setLoading(true); setError("");
    try {
      const recipe = await callImport({ type: "url", url: v });
      pendingRef.current = normalizeImported(recipe);
      history.back();
    } catch (e) { setError(e.message); setLoading(false); }
  };

  const importPhoto = async (file) => {
    if (!file) return;
    setLoading(true); setError("");
    try {
      // Higher-res copy for OCR accuracy; smaller copy kept as the recipe photo.
      const [ocrImg, thumbImg] = await Promise.all([resizeImage(file, 1568), resizeImage(file, 600)]);
      const recipe = await callImport({ type: "photo", imageBase64: ocrImg });
      pendingRef.current = normalizeImported(recipe, thumbImg);
      history.back();
    } catch (e) { setError(e.message); setLoading(false); }
  };

  return (
    <div style={s.overlay} onClick={close}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHead}>
          <div>
            <div style={s.modalEyebrow}>✨ Import Recipe</div>
            <div style={s.modalTitle}>Bring in a recipe</div>
          </div>
          <button style={s.modalClose} onClick={close}>✕</button>
        </div>

        <div style={s.importTabs}>
          <button style={{...s.importTab, ...(mode==="url"?s.importTabOn:{})}} onClick={()=>{setMode("url");setError("");}}>🔗 From link</button>
          <button style={{...s.importTab, ...(mode==="photo"?s.importTabOn:{})}} onClick={()=>{setMode("photo");setError("");}}>📷 From photo</button>
        </div>

        {loading ? (
          <div style={s.importLoading}>
            <div style={s.importSpinner}>🍳</div>
            <div style={s.importLoadingText}>Reading the recipe…</div>
            <div style={s.importLoadingSub}>This usually takes a few seconds.</div>
          </div>
        ) : mode === "url" ? (
          <>
            <input style={s.modalInput} placeholder="https://…  paste a recipe link" value={url} autoFocus
              onChange={e=>setUrl(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")importUrl();}} />
            <div style={s.importHint}>Works best on recipe sites with a standard recipe page.</div>
            <button style={{...s.btnSave, ...s.importGoBtn}} onClick={importUrl}>Import from link</button>
          </>
        ) : (
          <>
            <label style={s.importPhotoDrop}>
              <div style={{fontSize:30,marginBottom:6}}>📷</div>
              <div style={s.importPhotoDropText}>Take or choose a photo</div>
              <div style={s.importPhotoDropSub}>A clear shot of the full recipe page works best.</div>
              <input type="file" accept="image/*" capture="environment" style={{display:"none"}}
                onChange={e=>{const f=e.target.files?.[0]; importPhoto(f); e.target.value="";}} />
            </label>
          </>
        )}

        {error && <div style={s.importError}>⚠️ {error}</div>}
        <div style={s.importDisclaimer}>You'll review and tweak everything before it's saved.</div>
      </div>
    </div>
  );
}

// ─── Recipe Grid ──────────────────────────────────────────────────────────────
function RecipeGrid({ recipes, onNew, onSelect, onImported, customTags, onAddCustomTag }) {
  const [showImport, setShowImport] = useState(false);
  const [filter, setFilter] = useState("");
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [openFilter, setOpenFilter] = useState(null);

  const toggleFilter = (tag) => setActiveFilters(prev => { const n=new Set(prev); n.has(tag)?n.delete(tag):n.add(tag); return n; });
  const resetAll = () => { setFilter(""); setActiveFilters(new Set()); setOpenFilter(null); };

  // Map imported cuisine/diet tags onto existing tags (case-insensitive); register
  // any genuinely new ones as custom tags so they show pre-selected in the editor.
  const reconcileTagList = (tags, defaults, customKey) => {
    const known = [...defaults, ...(customTags?.[customKey] || [])];
    const out = [];
    for (const raw of tags || []) {
      const v = String(raw).trim();
      if (!v) continue;
      const match = known.find(k => k.toLowerCase() === v.toLowerCase());
      if (match) { if (!out.includes(match)) out.push(match); }
      else { onAddCustomTag(customKey, v); known.push(v); if (!out.includes(v)) out.push(v); }
    }
    return out;
  };
  const reconcileImportedTags = (rec) => ({
    ...rec,
    cuisineTags: reconcileTagList(rec.cuisineTags, CUISINE_TAGS, "cuisines"),
    dietTags: reconcileTagList(rec.dietTags, DIET_TAGS, "diets"),
  });

  const allMealTypes = [...new Set([...MEAL_TYPE_TAGS, ...(customTags?.mealtypes||[]), ...recipes.flatMap(r=>r.mealTypes)])];
  const allDietTags  = [...new Set([...DIET_TAGS,      ...(customTags?.diets||[]),     ...recipes.flatMap(r=>r.dietTags)])];
  const allCuisines  = [...new Set([...CUISINE_TAGS,   ...(customTags?.cuisines||[]),  ...recipes.flatMap(r=>r.cuisineTags||[])])];

  const filterGroups = [
    { key:"meal",    label:"Meal",    tags:allMealTypes, activeStyle:s.typeChipActive },
    { key:"diet",    label:"Diet",    tags:allDietTags,  activeStyle:s.typeChipDietActive },
    { key:"cuisine", label:"Cuisine", tags:allCuisines,  activeStyle:s.typeChipCuisineActive },
  ];

  const filtered = recipes.filter(r => {
    const matchName = r.name.toLowerCase().includes(filter.toLowerCase());
    if (activeFilters.size === 0) return matchName;
    const allTags = [...r.mealTypes, ...r.dietTags, ...(r.cuisineTags||[])];
    return matchName && [...activeFilters].every(f => allTags.includes(f));
  });

  const hasAny = filter || activeFilters.size > 0;

  return (
    <div style={s.recipesRoot}>
      <div style={s.recipesHeader}>
        <div><div style={s.eyebrow}>Recipe Library</div><h1 style={s.title}>Your Recipes</h1></div>
        <div style={s.recipesHeaderBtns}>
          <button style={s.importRecipeBtn} className="import-recipe-btn" onClick={()=>{ setShowImport(true); history.pushState({ overlay: "import" }, ""); }}>✨ Import</button>
          <button style={s.newRecipeBtn} className="new-recipe-btn" onClick={onNew}>+ New</button>
        </div>
      </div>
      <div style={s.recipeFilters}>
        {/* Search + reset */}
        <div style={s.searchRow}>
          <input style={{...s.recipeSearch,marginBottom:0,flex:1}} placeholder="🔍  Search recipes…" value={filter} onChange={e=>setFilter(e.target.value)} />
          {hasAny && <button style={s.resetBtn} onClick={resetAll}>✕ Reset</button>}
        </div>

        {/* Filter group toggles */}
        <div style={s.filterGroupRow}>
          {filterGroups.map(({key,label,tags}) => {
            const count = tags.filter(t=>activeFilters.has(t)).length;
            const isOpen = openFilter===key;
            return (
              <button key={key} style={{...s.filterGroupBtn,...(isOpen||count>0?s.filterGroupBtnActive:{})}}
                onClick={()=>setOpenFilter(isOpen?null:key)}>
                {label}
                {count>0 && <span style={s.filterGroupBadge}>{count}</span>}
                <span style={{fontSize:9,marginLeft:3,opacity:0.6}}>{isOpen?"▲":"▼"}</span>
              </button>
            );
          })}
        </div>

        {/* Expanded tag panel */}
        {openFilter && (()=>{
          const grp = filterGroups.find(g=>g.key===openFilter);
          return (
            <div style={s.filterPanel}>
              {grp.tags.map(t=>(
                <button key={t} style={{...s.typeChip,...(activeFilters.has(t)?grp.activeStyle:{})}}
                  className="type-chip" onClick={()=>toggleFilter(t)}>{t}</button>
              ))}
            </div>
          );
        })()}

        {/* Active filter chips */}
        {activeFilters.size>0 && (
          <div style={s.activeChipsRow}>
            {[...activeFilters].map(t=>(
              <button key={t} style={s.activeFilterChip} onClick={()=>toggleFilter(t)}>
                {t} <span style={{opacity:0.6}}>×</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {recipes.length===0 ? (
        <div style={s.recipeEmpty}>
          <div style={s.recipeEmptyIcon}>📖</div>
          <div style={s.recipeEmptyTitle}>No recipes yet</div>
          <div style={s.recipeEmptyText}>Add your first recipe and it'll show up as a suggestion in the planner.</div>
          <button style={s.btnSave} onClick={onNew}>Add First Recipe</button>
        </div>
      ) : filtered.length===0 ? (
        <div style={s.recipeEmpty}><div style={s.recipeEmptyIcon}>🔍</div><div style={s.recipeEmptyTitle}>No matches</div><div style={s.recipeEmptyText}>Try a different search or filter.</div></div>
      ) : (
        <div style={s.recipeGrid}>
          {filtered.map(r => {
            const total = formatMinutes(parseMinutes(r.prepTime)+parseMinutes(r.cookTime));
            return (
              <button key={r.id} style={s.recipeCard} className="recipe-card" onClick={()=>onSelect(r)}>
                {r.photo
                  ? <img src={r.photo} style={s.recipeCardPhoto} alt={r.name} />
                  : <div style={s.recipeCardPhotoPlaceholder}><span style={{fontSize:28}}>🍽</span></div>}
                <div style={s.recipeCardContent}>
                  <div style={s.recipeCardName}>{r.name}</div>
                  {total && <div style={s.recipeCardTime}>⏱ {total}</div>}
                  {r.description && <div style={s.recipeCardDesc}>{r.description}</div>}
                  <div style={s.recipeCardTags}>
                    {r.mealTypes.map(t=><span key={t} style={{...s.tag,...s.tagMeal}}>{t}</span>)}
                    {(r.cuisineTags||[]).slice(0,1).map(t=><span key={t} style={{...s.tag,...s.tagCuisine}}>{t}</span>)}
                    {r.dietTags.slice(0,1).map(t=><span key={t} style={{...s.tag,...s.tagDiet}}>{t}</span>)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showImport && <ImportModal onClose={()=>setShowImport(false)} onImported={rec=>{ setShowImport(false); onImported(reconcileImportedTags(rec)); }} />}
    </div>
  );
}

// ─── Recipe Detail ────────────────────────────────────────────────────────────
function RecipeDetail({ recipe, onEdit, onDelete, onBack, onAddToGrocery, onRemoveFromGrocery, groceryCount }) {
  const [servings, setServings] = useState(recipe.baseServings || 4);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [groceryMsg, setGroceryMsg] = useState("");
  const isRestoringRef = useRef(false);

  const addToGrocery = () => {
    const { added, merged } = onAddToGrocery(recipe);
    if (added + merged === 0) setGroceryMsg("No ingredients to add");
    else setGroceryMsg(`✓ Added ${added}${merged ? `, merged ${merged}` : ""} to grocery`);
    setTimeout(() => setGroceryMsg(""), 2600);
  };
  const removeFromGrocery = () => {
    const { removed, kept } = onRemoveFromGrocery(recipe.id);
    setGroceryMsg(removed + kept === 0 ? "Nothing from this recipe on the list" : `✓ Removed ${removed}${kept ? `, kept ${kept} shared` : ""}`);
    setTimeout(() => setGroceryMsg(""), 2600);
  };

  useEffect(() => {
    const onPopState = () => {
      if (showDeleteConfirm) { isRestoringRef.current = true; setShowDeleteConfirm(false); isRestoringRef.current = false; }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [showDeleteConfirm]);

  return (
    <div style={s.recipeDetailRoot}>
      {/* Top bar */}
      <div style={s.detailTopBar}>
        <button style={s.detailBackBtn} className="back-btn" onClick={onBack}>← Recipes</button>
        <div style={s.detailTopActions}>
          <button style={s.detailEditBtn} className="detail-edit-btn" onClick={onEdit}>Edit</button>
          <button style={s.detailDeleteBtn} className="detail-delete-btn" onClick={()=>{ setShowDeleteConfirm(true); history.pushState({ overlay: "deleteConfirm" }, ""); }}>Delete</button>
        </div>
      </div>

      {/* Hero photo */}
      {recipe.photo && <img src={recipe.photo} style={s.detailHero} alt={recipe.name} />}

      <div style={s.detailBody}>
        {/* Name + meta */}
        <h1 style={s.detailTitle}>{recipe.name}</h1>
        {recipe.description && <p style={s.detailDesc}>{recipe.description}</p>}

        <div style={s.detailMeta}>
          {recipe.prepTime && <div style={s.detailMetaItem}><span style={s.detailMetaIcon}>⏱</span><div><div style={s.detailMetaVal}>{recipe.prepTime}</div><div style={s.detailMetaLbl}>Prep</div></div></div>}
          {recipe.cookTime && <div style={s.detailMetaItem}><span style={s.detailMetaIcon}>🔥</span><div><div style={s.detailMetaVal}>{recipe.cookTime}</div><div style={s.detailMetaLbl}>Cook</div></div></div>}
          {(()=>{ const t=formatMinutes(parseMinutes(recipe.prepTime)+parseMinutes(recipe.cookTime)); return t ? <div style={s.detailMetaItem}><span style={s.detailMetaIcon}>⏱</span><div><div style={s.detailMetaVal}>{t}</div><div style={s.detailMetaLbl}>Total</div></div></div> : null; })()}
          <div style={s.detailMetaItem}><span style={s.detailMetaIcon}>🍽</span><div><div style={s.detailMetaVal}>{recipe.baseServings}</div><div style={s.detailMetaLbl}>Serves</div></div></div>
        </div>

        {/* Tags */}
        {(recipe.mealTypes.length>0||recipe.dietTags.length>0||(recipe.cuisineTags||[]).length>0) && (
          <div style={s.detailTags}>
            {recipe.mealTypes.map(t=><span key={t} style={{...s.tag,...s.tagMeal}}>{t}</span>)}
            {(recipe.cuisineTags||[]).map(t=><span key={t} style={{...s.tag,...s.tagCuisine}}>{t}</span>)}
            {recipe.dietTags.map(t=><span key={t} style={{...s.tag,...s.tagDiet}}>{t}</span>)}
          </div>
        )}

        {/* URL */}
        {recipe.url && <a href={/^https?:\/\//i.test(recipe.url) ? recipe.url : `https://${recipe.url}`} target="_blank" rel="noopener noreferrer" style={s.detailUrl}>🔗 View original recipe</a>}

        {/* Serving scaler */}
        {recipe.ingredients.length>0 && recipe.ingredients.some(i=>i.name) && (
          <div style={s.detailSection}>
            <div style={s.detailSectionHead}>
              <div style={s.detailSectionTitle}>Ingredients</div>
              <div style={s.scalerRow}>
                <button style={s.scalerBtn} className="scaler-btn" onClick={()=>setServings(v=>Math.max(1,v-1))}>−</button>
                <span style={s.scalerVal}>{servings} <span style={s.scalerLbl}>serving{servings!==1?"s":""}</span></span>
                <button style={s.scalerBtn} className="scaler-btn" onClick={()=>setServings(v=>v+1)}>+</button>
              </div>
            </div>
            <div style={s.ingredientList}>
              {recipe.ingredients.filter(i=>i.name).map(ing => {
                const scaledAmt = scaleAmount(ing.amount, recipe.baseServings, servings);
                return (
                  <div key={ing.id} style={s.ingredientRow}>
                    <span style={s.ingredientAmt}>{scaledAmt}</span>
                    <span style={s.ingredientUnit}>{ing.unit}</span>
                    <span style={s.ingredientName}>{ing.name}</span>
                  </div>
                );
              })}
            </div>
            <button style={s.addGroceryBtn} className="add-grocery-btn" onClick={addToGrocery}>🛒 Add to grocery list</button>
            {groceryCount > 0 && <button style={s.removeGroceryBtn} className="remove-grocery-btn" onClick={removeFromGrocery}>🛒 Remove from grocery ({groceryCount})</button>}
            {groceryMsg && <div style={s.groceryMsg}>{groceryMsg}</div>}
          </div>
        )}

        {/* Steps */}
        {recipe.steps.length>0 && recipe.steps.some(st=>st.text) && (
          <div style={s.detailSection}>
            <div style={s.detailSectionTitle}>Instructions</div>
            <div style={s.stepList}>
              {recipe.steps.filter(st=>st.text).map((step,i,arr) => (
                <div key={step.id} style={{...s.stepRow,...(i<arr.length-1?s.stepRowDivider:{})}}>
                  <div style={s.stepNum}>{i+1}</div>
                  <div style={s.stepText}>{step.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {recipe.notes && (
          <div style={s.detailSection}>
            <div style={s.detailSectionTitle}>Notes</div>
            <p style={s.detailNotes}>{recipe.notes}</p>
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div style={s.overlay} onClick={()=>{ setShowDeleteConfirm(false); if (!isRestoringRef.current) history.back(); }}>
          <div style={{...s.modal,maxWidth:300,textAlign:"center"}} onClick={e=>e.stopPropagation()} className="modal-in">
            <div style={{fontSize:28,marginBottom:10}}>🗑</div>
            <div style={{...s.modalTitle,fontSize:17,marginBottom:6}}>Delete recipe?</div>
            <div style={{fontSize:12,color:"#9a7f60",marginBottom:20,fontFamily:"'DM Sans',sans-serif"}}>"{recipe.name}" will be permanently removed.</div>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              <button style={s.btnClear} onClick={()=>{ setShowDeleteConfirm(false); history.back(); }}>Cancel</button>
              <button style={{...s.btnSave,background:"linear-gradient(135deg,#e07a5f,#c05040)"}} onClick={()=>{ history.back(); onDelete(recipe.id); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recipe Editor ────────────────────────────────────────────────────────────
function RecipeEditor({ recipe: initialRecipe, onSave, onCancel, customTags, onAddCustomTag, onDeleteCustomTag }) {
  const [r, setR] = useState(initialRecipe);
  const set = (key, val) => setR(prev => ({...prev, [key]: val}));

  const addIngredient = () => set("ingredients", [...r.ingredients, {id:Date.now().toString(),amount:"",unit:"",name:""}]);
  const removeIngredient = (id) => set("ingredients", r.ingredients.filter(i=>i.id!==id));
  const updateIngredient = (id, key, val) => set("ingredients", r.ingredients.map(i=>i.id===id?{...i,[key]:val}:i));

  const addStep = () => set("steps", [...r.steps, {id:Date.now().toString(),text:""}]);
  const removeStep = (id) => set("steps", r.steps.filter(st=>st.id!==id));
  const updateStep = (id, val) => set("steps", r.steps.map(st=>st.id===id?{...st,text:val}:st));

  const toggleMealType   = (t) => set("mealTypes",   r.mealTypes.includes(t)   ? r.mealTypes.filter(x=>x!==t)   : [...r.mealTypes, t]);
  const toggleDietTag    = (t) => set("dietTags",    r.dietTags.includes(t)    ? r.dietTags.filter(x=>x!==t)    : [...r.dietTags, t]);
  const toggleCuisineTag = (t) => set("cuisineTags", (r.cuisineTags||[]).includes(t) ? (r.cuisineTags||[]).filter(x=>x!==t) : [...(r.cuisineTags||[]), t]);

  const canSave = r.name.trim().length > 0;

  return (
    <div style={s.editorRoot}>
      <div style={s.editorTopBar}>
        <button style={s.detailBackBtn} className="back-btn" onClick={onCancel}>✕ Cancel</button>
        <div style={s.eyebrow}>{initialRecipe.name ? "Edit Recipe" : "New Recipe"}</div>
        <button style={{...s.btnSave,...(!canSave?s.btnDisabled:{}),...s.editorSaveBtn}} onClick={()=>canSave&&onSave(r)}>Save</button>
      </div>

      <div style={s.editorBody}>
        {/* Photo */}
        <div style={s.editorField}>
          <label style={s.editorLabel}>Photo</label>
          {r.photo && (
            <div style={{position:"relative",marginBottom:8}}>
              <img src={r.photo} style={{width:"100%",height:180,objectFit:"cover",borderRadius:10}} alt="recipe" />
              <button style={s.photoRemoveBtn} onClick={()=>set("photo","")}>✕</button>
            </div>
          )}
          <div style={s.photoActions}>
            <label style={s.photoUploadBtn}>
              📷 {r.photo?"Change photo":"Upload photo"}
              <input type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{const f=e.target.files?.[0];if(f)set("photo",await resizeImage(f));e.target.value="";}} />
            </label>
            <span style={s.photoOrText}>or</span>
            <input style={{...s.editorInput,flex:1,fontSize:12}} placeholder="Paste image URL…"
              onBlur={e=>{const v=e.target.value.trim();if(v.startsWith("http"))set("photo",v);}}
              onKeyDown={e=>{if(e.key==="Enter"){const v=e.currentTarget.value.trim();if(v.startsWith("http"))set("photo",v);}}} />
          </div>
        </div>

        {/* Name */}
        <div style={s.editorField}>
          <label style={s.editorLabel}>Recipe Name *</label>
          <input style={s.editorInput} placeholder="e.g. Grilled Chicken" value={r.name} onChange={e=>set("name",e.target.value)} />
        </div>

        {/* Description */}
        <div style={s.editorField}>
          <label style={s.editorLabel}>Description</label>
          <textarea style={s.editorTextarea} placeholder="A short description…" value={r.description} onChange={e=>set("description",e.target.value)} rows={2} />
        </div>

        {/* URL */}
        <div style={s.editorField}>
          <label style={s.editorLabel}>Recipe URL (optional)</label>
          <input style={s.editorInput} placeholder="https://…" value={r.url} onChange={e=>set("url",e.target.value)} />
        </div>

        {/* Times + servings */}
        <div style={s.editorRow}>
          <div style={{...s.editorField,flex:1}}>
            <label style={s.editorLabel}>Prep Time</label>
            <input style={s.editorInput} placeholder="e.g. 15 min" value={r.prepTime} onChange={e=>set("prepTime",e.target.value)} />
          </div>
          <div style={{...s.editorField,flex:1}}>
            <label style={s.editorLabel}>Cook Time</label>
            <input style={s.editorInput} placeholder="e.g. 30 min" value={r.cookTime} onChange={e=>set("cookTime",e.target.value)} />
          </div>
          <div style={{...s.editorField,width:90,flexShrink:0}}>
            <label style={s.editorLabel}>Serves</label>
            <div style={s.servingsRow}>
              <button style={s.scalerBtn} className="scaler-btn" onClick={()=>set("baseServings",Math.max(1,r.baseServings-1))}>−</button>
              <span style={{...s.scalerVal,fontSize:15}}>{r.baseServings}</span>
              <button style={s.scalerBtn} className="scaler-btn" onClick={()=>set("baseServings",r.baseServings+1)}>+</button>
            </div>
          </div>
        </div>
        {(()=>{const t=formatMinutes(parseMinutes(r.prepTime)+parseMinutes(r.cookTime));return t?<div style={{fontSize:11,color:"#89c4a1",marginTop:-8,marginBottom:4,fontFamily:"'DM Sans',sans-serif"}}>⏱ Total: {t}</div>:null;})()}

        {/* Meal Types */}
        <TagPicker label="Meal Type" defaultTags={MEAL_TYPE_TAGS}
          customTagsList={customTags?.mealtypes} onAddCustomTag={t=>onAddCustomTag("mealtypes",t)} onDeleteCustomTag={t=>onDeleteCustomTag("mealtypes",t)}
          selected={r.mealTypes} onToggle={toggleMealType} chipActiveStyle={s.tagPickerChipOn} />

        {/* Diet Tags */}
        <TagPicker label="Dietary Tags" defaultTags={DIET_TAGS}
          customTagsList={customTags?.diets} onAddCustomTag={t=>onAddCustomTag("diets",t)} onDeleteCustomTag={t=>onDeleteCustomTag("diets",t)}
          selected={r.dietTags} onToggle={toggleDietTag} chipActiveStyle={s.tagPickerDietOn} />

        {/* Cuisine Tags */}
        <TagPicker label="Cuisine" defaultTags={CUISINE_TAGS}
          customTagsList={customTags?.cuisines} onAddCustomTag={t=>onAddCustomTag("cuisines",t)} onDeleteCustomTag={t=>onDeleteCustomTag("cuisines",t)}
          selected={r.cuisineTags||[]} onToggle={toggleCuisineTag} chipActiveStyle={s.tagPickerCuisineOn} />

        {/* Ingredients */}
        <div style={s.editorField}>
          <label style={s.editorLabel}>Ingredients</label>
          <div style={s.ingredientEditor}>
            {r.ingredients.map((ing,i) => (
              <div key={ing.id} style={s.ingredientEditorRow}>
                <input style={{...s.editorInput,...s.ingAmtInput}} placeholder="Amt" value={ing.amount} onChange={e=>updateIngredient(ing.id,"amount",e.target.value)} />
                <input style={{...s.editorInput,...s.ingUnitInput}} placeholder="Unit" value={ing.unit} onChange={e=>updateIngredient(ing.id,"unit",e.target.value)} />
                <input style={{...s.editorInput,flex:1}} placeholder="Ingredient name" value={ing.name} onChange={e=>updateIngredient(ing.id,"name",e.target.value)} />
                {r.ingredients.length>1 && <button style={s.editorRemoveBtn} className="editor-remove-btn" onClick={()=>removeIngredient(ing.id)}>✕</button>}
              </div>
            ))}
            <button style={s.editorAddRowBtn} className="editor-add-btn" onClick={addIngredient}>+ Add ingredient</button>
          </div>
        </div>

        {/* Steps */}
        <div style={s.editorField}>
          <label style={s.editorLabel}>Instructions</label>
          <div style={s.stepEditor}>
            {r.steps.map((step,i) => (
              <div key={step.id} style={s.stepEditorRow}>
                <div style={s.stepEditorNum}>{i+1}</div>
                <textarea style={{...s.editorTextarea,flex:1,marginBottom:0}} placeholder={`Step ${i+1}…`} value={step.text} onChange={e=>updateStep(step.id,e.target.value)} rows={2} />
                {r.steps.length>1 && <button style={s.editorRemoveBtn} className="editor-remove-btn" onClick={()=>removeStep(step.id)}>✕</button>}
              </div>
            ))}
            <button style={s.editorAddRowBtn} className="editor-add-btn" onClick={addStep}>+ Add step</button>
          </div>
        </div>

        {/* Notes */}
        <div style={s.editorField}>
          <label style={s.editorLabel}>Notes</label>
          <textarea style={s.editorTextarea} placeholder="Tips, substitutions, things to remember…" value={r.notes||""} onChange={e=>set("notes",e.target.value)} rows={3} />
        </div>

        <div style={{height:40}} />
      </div>
    </div>
  );
}

// Reusable styled confirm dialog (matches Clear Week/Day). Presentational only.
function ConfirmModal({ icon, title, body, confirmLabel, onConfirm, onCancel }) {
  return (
    <div style={s.overlay} onClick={onCancel}>
      <div style={{...s.modal,maxWidth:320,textAlign:"center"}} onClick={e=>e.stopPropagation()} className="modal-in">
        <div style={{fontSize:32,marginBottom:12}}>{icon || "🗑"}</div>
        <div style={{...s.modalTitle,fontSize:18,marginBottom:8}}>{title}</div>
        {body && <div style={{fontSize:13,color:"#9a7f60",marginBottom:24,fontFamily:"'DM Sans',sans-serif",lineHeight:1.45}}>{body}</div>}
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button style={s.btnClear} onClick={onCancel}>Cancel</button>
          <button style={{...s.btnSave,background:"linear-gradient(135deg,#e07a5f,#c05040)"}} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Lists View ───────────────────────────────────────────────────────────────
// Keys present in BOTH a manual and a recipe-sourced item (the "duplicate" case).
const computeDupKeys = (items) => {
  const manual = new Set(), recipe = new Set();
  (items || []).forEach(it => { const k = groceryKey(it.text); (it.sources && it.sources.length ? recipe : manual).add(k); });
  return new Set([...manual].filter(k => recipe.has(k)));
};

const abbrev = (str, n) => (str && str.length > n ? str.slice(0, n - 1) + "…" : str || "");

function ListItemRow({ item, listId, isDup, onToggle, onDelete, onSetQty, qtyEditable, showArrows, isFirst, isLast, onMoveUp, onMoveDown }) {
  const [showSrc, setShowSrc] = useState(false);
  const [editingQty, setEditingQty] = useState(false);
  const [qtyInput, setQtyInput] = useState("");
  const measures = formatMeasures(item.measures);
  const sources = item.sources || [];
  const hasSrc = sources.length > 0;
  const startEdit = () => { setQtyInput(measures); setEditingQty(true); };
  const saveQty = () => { onSetQty && onSetQty(listId, item.id, qtyInput); setEditingQty(false); };
  return (
    <div style={s.listItemRow}>
      <button style={{...s.listCheck,...(item.checked?s.listCheckOn:{})}} className="list-check" onClick={() => onToggle(listId, item.id)}>{item.checked ? "✓" : ""}</button>
      <div style={{flex:1, minWidth:0}}>
        <div style={{...s.listItemText,...(item.checked?s.listItemTextChecked:{})}}>
          {measures
            ? (qtyEditable
                ? <button style={s.listItemQtyBtn} className="list-qty-btn" onClick={startEdit}>{measures}{item.manual && hasSrc ? " ✎" : ""}</button>
                : <span style={s.listItemQty}>{measures} </span>)
            : (qtyEditable && !item.checked ? <button style={s.listItemQtyAdd} className="list-qty-btn" onClick={startEdit}>+ qty</button> : null)}
          {measures && qtyEditable ? " " : ""}{item.text}
          {isDup && <span style={s.listItemDup} title="Also on the list from another source">dup</span>}
        </div>
        {editingQty && (
          <div style={s.listQtyEditRow}>
            <input style={s.listQtyInput} autoFocus value={qtyInput} placeholder="e.g. 2 lbs"
              onChange={e => setQtyInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveQty(); if (e.key === "Escape") setEditingQty(false); }}
              onBlur={saveQty} />
          </div>
        )}
        {hasSrc && showSrc && (
          <div style={s.listItemSrcNames}>
            {sources.map(sr => (
              <div key={sr.id}>{sr.measures && sr.measures.length ? <span style={s.listItemSrcQty}>{formatMeasures(sr.measures)} </span> : null}{sr.name}</div>
            ))}
            {item.manual && <div style={s.listItemSrcOverride}>✎ You set: {measures || "—"}</div>}
          </div>
        )}
      </div>
      {hasSrc && <button style={s.listSrcIcon} className="list-src-icon" onClick={() => setShowSrc(v => !v)} title={sources.map(s => s.name).join(", ")}>🍽</button>}
      {showArrows && (
        <div style={s.listReorder}>
          <button style={{...s.listReorderBtn,...(isFirst?s.listReorderBtnDim:{})}} className="list-reorder-btn" disabled={isFirst} onClick={onMoveUp} title="Move up">▲</button>
          <button style={{...s.listReorderBtn,...(isLast?s.listReorderBtnDim:{})}} className="list-reorder-btn" disabled={isLast} onClick={onMoveDown} title="Move down">▼</button>
        </div>
      )}
      <button style={s.listItemDel} className="list-item-del" onClick={() => onDelete(listId, item.id)}>✕</button>
    </div>
  );
}

// Shared renderer: manual items pinned on top, a thin divider, then recipe-sourced
// items, then checked items at the bottom.
function ListItemsList({ items, listId, onToggle, onDelete, onSetQty, qtyEditable, sortMode = "manual", filter = "", onMove }) {
  const dupKeys = computeDupKeys(items);
  const q = (filter || "").trim().toLowerCase();
  const matches = (it) => !q || (it.text || "").toLowerCase().includes(q);
  // Arrows only make sense in custom order, with no search filter narrowing the view.
  const arrowsOn = sortMode === "manual" && !q && !!onMove;

  // `group` (when given) is the ordered array the item lives in — used so the
  // ▲/▼ arrows know their bounds and can renumber that group on move.
  const row = (it, group) => {
    const ids = group ? group.map(x => x.id) : null;
    const idx = ids ? ids.indexOf(it.id) : -1;
    return <ListItemRow key={it.id} item={it} listId={listId} isDup={dupKeys.has(groceryKey(it.text))}
      onToggle={onToggle} onDelete={onDelete} onSetQty={onSetQty} qtyEditable={qtyEditable}
      showArrows={arrowsOn && !!group} isFirst={idx === 0} isLast={idx === (ids ? ids.length - 1 : 0)}
      onMoveUp={() => onMove(listId, it.id, -1, ids)} onMoveDown={() => onMove(listId, it.id, +1, ids)} />;
  };

  // Search view: one flat matching list (incl. checked), so it's easy to see if
  // something's already on the list and to re-check/uncheck it in place.
  if (q) {
    const um = sortListItems(items.filter(i => !i.checked && matches(i)), sortMode);
    const cm = sortListItems(items.filter(i => i.checked && matches(i)), sortMode);
    return (
      <div style={s.listItems}>
        {um.length === 0 && cm.length === 0 && <div style={s.listSearchEmpty}>No matches — press Add to add “{filter.trim()}”.</div>}
        {um.map(it => row(it))}
        {cm.length > 0 && <div style={s.listCheckedDivider}>{cm.length} done</div>}
        {cm.map(it => row(it))}
      </div>
    );
  }

  const checked = sortListItems(items.filter(i => i.checked), sortMode);
  const unchecked = items.filter(i => !i.checked);
  const manual = sortListItems(unchecked.filter(i => !(i.sources && i.sources.length)), sortMode);            // added by you
  const adjusted = sortListItems(unchecked.filter(i => i.sources && i.sources.length && i.manual), sortMode); // recipe item, quantity overridden
  const recipe = sortListItems(unchecked.filter(i => i.sources && i.sources.length && !i.manual), sortMode);  // from recipes
  const aboveRecipe = manual.length > 0 || adjusted.length > 0;
  return (
    <div style={s.listItems}>
      {manual.map(it => row(it, manual))}
      {adjusted.length > 0 && <div style={s.listSectionHead}>Adjusted</div>}
      {adjusted.map(it => row(it, adjusted))}
      {recipe.length > 0 && aboveRecipe && <div style={s.listSectionHead}>From recipes</div>}
      {recipe.map(it => row(it, recipe))}
      {checked.length > 0 && (
        <>
          <div style={s.listCheckedDivider}>{checked.length} done</div>
          {checked.map(it => row(it))}
        </>
      )}
    </div>
  );
}

function ListsView({ lists, openId, syncStatus, onOpen, onAddList, onUpdateList, onDeleteList, onAddItem, onToggleItem, onDeleteItem, onClearItems, onSetItemQty, onRemoveRecipes, onShopping, listSorts, onSetSort, onMoveItem, userEmail, onSignOut }) {
  const open = openId ? lists.find(l => l.id === openId) : null;
  if (open) {
    return <ListDetail list={open} onBack={() => onOpen(null)}
      onAddItem={onAddItem} onToggleItem={onToggleItem} onDeleteItem={onDeleteItem} onClearItems={onClearItems}
      onSetItemQty={onSetItemQty} onRemoveRecipes={onRemoveRecipes} onUpdateList={onUpdateList} onDeleteList={onDeleteList} onShopping={onShopping}
      sortMode={listSorts?.[open.id] || "manual"} onSetSort={onSetSort} onMoveItem={onMoveItem} />;
  }
  return <ListIndex lists={lists} syncStatus={syncStatus} onOpen={onOpen} onAddList={onAddList} userEmail={userEmail} onSignOut={onSignOut} />;
}

function ListIndex({ lists, syncStatus, onOpen, onAddList, userEmail, onSignOut }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📝");
  const grocery = lists.find(l => l.type === "grocery");
  const custom = lists.filter(l => l.type !== "grocery");

  const submit = () => {
    const id = onAddList(name, icon);
    setName(""); setIcon("📝"); setCreating(false);
    onOpen(id);
  };

  const card = (l) => {
    const open = l.items.filter(i => !i.checked).length;
    return (
      <button key={l.id} style={s.listCard} className="list-card" onClick={() => onOpen(l.id)}>
        <span style={s.listCardIcon}>{l.icon}</span>
        <div style={s.listCardBody}>
          <div style={s.listCardName}>{l.name}</div>
          <div style={s.listCardMeta}>{l.items.length === 0 ? "Empty" : `${open} of ${l.items.length} left`}</div>
        </div>
        <span style={s.listCardArrow}>›</span>
      </button>
    );
  };

  return (
    <div style={s.recipesRoot}>
      <div style={s.recipesHeader}>
        <div><div style={s.eyebrow}>Lists</div><h1 style={s.title}>Your Lists</h1></div>
        <button style={s.newRecipeBtn} className="new-recipe-btn" onClick={() => setCreating(true)}>+ New List</button>
      </div>

      {creating && (
        <div style={s.listCreateBox}>
          <div style={s.listIconRow}>
            {LIST_ICONS.map(ic => (
              <button key={ic} style={{...s.listIconPick,...(icon===ic?s.listIconPickOn:{})}} onClick={() => setIcon(ic)}>{ic}</button>
            ))}
          </div>
          <div style={s.listCreateInputRow}>
            <input style={{...s.editorInput,flex:1}} autoFocus placeholder="List name (e.g. Packing, Projects)…" value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && name.trim()) submit(); if (e.key === "Escape") { setCreating(false); setName(""); } }} />
            <button style={{...s.btnSave,...(name.trim()?{}:s.btnDisabled)}} onClick={() => name.trim() && submit()}>Create</button>
            <button style={s.btnClear} onClick={() => { setCreating(false); setName(""); }}>✕</button>
          </div>
        </div>
      )}

      {grocery && (
        <>
          <div style={s.listSectionLbl}>Grocery</div>
          {card(grocery)}
        </>
      )}

      <div style={s.listSectionLbl}>My Lists</div>
      {custom.length === 0 ? (
        <div style={s.listEmptyHint}>No custom lists yet. Create one for to-dos, packing, projects — anything.</div>
      ) : custom.map(card)}

      {onSignOut && (
        <div style={s.accountRow}>
          {userEmail && <span style={s.accountEmail}>Signed in as {userEmail}</span>}
          <button style={s.signOutBtn} className="sign-out-btn" onClick={onSignOut}>Sign out</button>
        </div>
      )}
      <div style={{height:40}} />
    </div>
  );
}

function ListDetail({ list, onBack, onAddItem, onToggleItem, onDeleteItem, onClearItems, onSetItemQty, onRemoveRecipes, onUpdateList, onDeleteList, onShopping, sortMode = "manual", onSetSort, onMoveItem }) {
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(list.name);
  const [dbrOpen, setDbrOpen] = useState(false);       // "delete by recipe" modal
  const [dbrSelected, setDbrSelected] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null);        // {icon,title,body,label,onYes} for destructive actions
  const isGrocery = list.type === "grocery";

  const checked = list.items.filter(i => i.checked);
  const hasChecked = checked.length > 0;

  // Distinct recipes that contributed items to this (grocery) list, with counts.
  const recipeSources = (() => {
    const map = new Map();
    list.items.forEach(it => (it.sources || []).forEach(sr => {
      const e = map.get(sr.id) || { id: sr.id, name: sr.name, count: 0 };
      e.count++; map.set(sr.id, e);
    }));
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();

  useEffect(() => {
    const onPop = () => { if (dbrOpen) setDbrOpen(false); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [dbrOpen]);

  const openDbr = () => { setDbrSelected(new Set()); setDbrOpen(true); setMenuOpen(false); history.pushState({ overlay: "dbr" }, ""); };
  const closeDbr = () => { setDbrOpen(false); history.back(); };
  const toggleDbr = (id) => setDbrSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const confirmDbr = () => { if (dbrSelected.size) onRemoveRecipes([...dbrSelected]); setDbrOpen(false); history.back(); };

  const submit = () => { const t = input.trim(); if (!t) return; onAddItem(list.id, t); setInput(""); };
  const saveName = () => { const n = nameDraft.trim(); if (n) onUpdateList(list.id, { name: n }); setRenaming(false); };

  return (
    <div style={s.recipeDetailRoot}>
      <div style={s.detailTopBar}>
        <button style={s.detailBackBtn} className="back-btn" onClick={onBack}>← Lists</button>
        <div style={{position:"relative"}}>
          <button style={s.detailEditBtn} className="detail-edit-btn" onClick={() => setMenuOpen(o => !o)}>⋯</button>
          {menuOpen && (
            <>
              <div style={s.listMenuBackdrop} onClick={() => setMenuOpen(false)} />
              <div style={s.listMenu}>
                {!isGrocery && <button style={s.listMenuItem} className="list-menu-item" onClick={() => { setRenaming(true); setNameDraft(list.name); setMenuOpen(false); }}>✏️ Rename</button>}
                <button style={{...s.listMenuItem,...(hasChecked?{}:s.listMenuItemDim)}} className="list-menu-item" onClick={() => { if (!hasChecked) return; setMenuOpen(false); setConfirm({ icon:"🧹", title:`Delete ${checked.length} checked item${checked.length>1?"s":""}?`, body:"This removes the checked items from the list.", label:"Delete checked", onYes:() => onClearItems(list.id, true) }); }}>🧹 Delete checked</button>
                {isGrocery && recipeSources.length > 0 && <button style={s.listMenuItem} className="list-menu-item" onClick={openDbr}>📖 Delete by recipe</button>}
                <button style={{...s.listMenuItem,...(list.items.length?{}:s.listMenuItemDim)}} className="list-menu-item" onClick={() => { if (!list.items.length) return; setMenuOpen(false); setConfirm({ icon:"🗑", title:`Delete all ${list.items.length} items?`, body:`This empties ${list.name}. Can't be undone.`, label:"Delete all", onYes:() => onClearItems(list.id, false) }); }}>🗑 Delete all</button>
                {!isGrocery && <button style={{...s.listMenuItem,color:"#e07a5f"}} className="list-menu-item" onClick={() => { setMenuOpen(false); setConfirm({ icon:"🗑", title:`Delete "${list.name}"?`, body:"This deletes the whole list and all its items. Can't be undone.", label:"Delete list", onYes:() => onDeleteList(list.id) }); }}>Delete list</button>}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={s.detailBody}>
        <div style={s.listDetailTitleRow}>
          <span style={{fontSize:26}}>{list.icon}</span>
          {renaming ? (
            <input style={{...s.editorInput,flex:1}} autoFocus value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setRenaming(false); }}
              onBlur={saveName} />
          ) : (
            <h1 style={{...s.title,margin:0}}>{list.name}</h1>
          )}
        </div>

        {isGrocery && list.items.length > 0 && (
          <button style={s.shopModeBtn} className="add-grocery-btn" onClick={onShopping}>🛒 Shopping Mode</button>
        )}

        <div style={s.listAddRow}>
          <div style={{position:"relative",flex:1,display:"flex",alignItems:"center"}}>
            <input style={{...s.modalInput,marginBottom:0,flex:1,...(input?{paddingRight:30}:{})}} placeholder="Add or search…" value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setInput(""); }} />
            {input && <button style={s.listSearchClear} className="list-item-del" onClick={() => setInput("")} title="Clear">✕</button>}
          </div>
          <button style={{...s.btnSave,...(input.trim()?{}:s.btnDisabled)}} onClick={submit}>Add</button>
        </div>

        {list.items.length > 1 && (
          <div style={s.listSortRow}>
            <div style={{position:"relative"}}>
              <button style={s.listSortBtn} className="list-sort-btn" onClick={() => setSortOpen(o => !o)}>
                ⇅ {LIST_SORTS.find(o => o.id === sortMode)?.label || "Custom order"} ▾
              </button>
              {sortOpen && (
                <>
                  <div style={s.listMenuBackdrop} onClick={() => setSortOpen(false)} />
                  <div style={s.listSortMenu}>
                    {LIST_SORTS.map(o => (
                      <button key={o.id} style={{...s.listMenuItem,...(o.id===sortMode?s.listSortItemOn:{})}} className="list-menu-item"
                        onClick={() => { onSetSort && onSetSort(list.id, o.id); setSortOpen(false); }}>{o.id===sortMode ? "✓ " : ""}{o.label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {sortMode === "manual" && !input && <span style={s.listSortHint}>Use ▲▼ to arrange</span>}
          </div>
        )}

        {list.items.length === 0 ? (
          <div style={s.listEmptyState}>
            <div style={{fontSize:30,marginBottom:8}}>{isGrocery ? "🛒" : "📝"}</div>
            <div style={s.listEmptyStateText}>{isGrocery ? "Your grocery list is empty. Add items above." : "Nothing here yet. Add your first item above."}</div>
          </div>
        ) : (
          <ListItemsList items={list.items} listId={list.id} onToggle={onToggleItem} onDelete={onDeleteItem} onSetQty={onSetItemQty} qtyEditable={isGrocery}
            sortMode={sortMode} filter={input} onMove={onMoveItem} />
        )}
        <div style={{height:40}} />
      </div>

      {confirm && (
        <ConfirmModal icon={confirm.icon} title={confirm.title} body={confirm.body} confirmLabel={confirm.label}
          onCancel={() => setConfirm(null)} onConfirm={() => { confirm.onYes(); setConfirm(null); }} />
      )}

      {dbrOpen && (
        <div style={s.overlay} onClick={closeDbr}>
          <div style={{...s.modal,maxWidth:360}} onClick={e=>e.stopPropagation()} className="modal-in">
            <div style={s.modalHead}>
              <div><div style={s.modalEyebrow}>🛒 Grocery</div><div style={s.modalTitle}>Delete by recipe</div></div>
              <button style={s.modalClose} onClick={closeDbr}>✕</button>
            </div>
            <div style={s.dbrHint}>Check the recipes whose ingredients you want to remove from the list.</div>
            <div style={s.dbrList}>
              {recipeSources.map(r => (
                <button key={r.id} style={{...s.dbrRow,...(dbrSelected.has(r.id)?s.dbrRowOn:{})}} onClick={() => toggleDbr(r.id)}>
                  <span style={{...s.dbrCheck,...(dbrSelected.has(r.id)?s.dbrCheckOn:{})}}>{dbrSelected.has(r.id) ? "✓" : ""}</span>
                  <span style={s.dbrName}>{r.name}</span>
                  <span style={s.dbrCount}>{r.count}</span>
                </button>
              ))}
            </div>
            <div style={s.afActions}>
              <button style={s.btnClear} onClick={closeDbr}>Cancel</button>
              <button style={{...s.btnSave,...(dbrSelected.size?{background:"linear-gradient(135deg,#e07a5f,#c05040)"}:s.btnDisabled)}} onClick={()=>dbrSelected.size&&confirmDbr()}>
                Remove {dbrSelected.size || ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  loginRoot: { minHeight:"100vh", background:"linear-gradient(160deg,#2a2118,#1c1712)", display:"flex", alignItems:"center", justifyContent:"center", padding:20 },
  loginCard: { width:"100%", maxWidth:340, background:"#241e16", border:"1px solid #3a2e22", borderRadius:18, padding:"28px 22px", textAlign:"center", boxShadow:"0 24px 60px rgba(0,0,0,0.5)" },
  loginIcon: { fontSize:40, marginBottom:8 },
  loginTitle: { fontSize:22, fontWeight:700, color:"#f4e4c4", fontFamily:"'Lora',Georgia,serif", letterSpacing:"-0.01em" },
  loginSub: { fontSize:13, color:"#9a7f60", fontFamily:"'DM Sans',sans-serif", marginBottom:20 },
  loginInput: { width:"100%", background:"#1c1712", border:"1.5px solid #3a2e22", borderRadius:10, padding:"12px 14px", fontSize:16, color:"#f0e8d8", fontFamily:"'DM Sans',sans-serif", outline:"none", boxSizing:"border-box", marginBottom:10 },
  loginError: { fontSize:12.5, color:"#f0a890", fontFamily:"'DM Sans',sans-serif", marginBottom:10, textAlign:"left" },
  loginBtn: { width:"100%", background:"linear-gradient(135deg,#f4c97a,#e0a84a)", border:"none", borderRadius:10, padding:"12px", fontSize:15, fontWeight:700, color:"#1c1712", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", marginTop:4 },
  accountRow: { display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, marginTop:24, paddingTop:14, borderTop:"1px solid #2a2018" },
  accountEmail: { fontSize:11.5, color:"#7a6448", fontFamily:"'DM Sans',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  signOutBtn: { background:"#241e16", border:"1px solid #3a2e22", borderRadius:8, padding:"7px 13px", fontSize:12.5, color:"#c8a878", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600, flexShrink:0 },

  // App shell
  appRoot: { minHeight:"100vh", background:"#1c1712", fontFamily:"'Lora',Georgia,serif", color:"#f0e8d8", display:"flex", flexDirection:"column", overflowX:"hidden" },
  appBody: { flex:1, overflowY:"auto", paddingBottom:64 },

  // Bottom nav
  bottomNav: { position:"fixed", bottom:0, left:0, right:0, background:"#221a12", borderTop:"1px solid #3a2e22", display:"flex", zIndex:50, height:60 },
  navBtn: { flex:1, background:"none", border:"none", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2, cursor:"pointer", color:"#7a6448", position:"relative", transition:"color 0.15s" },
  navBtnActive: { color:"#f4c97a" },
  navIcon: { fontSize:20, lineHeight:1 },
  navLabel: { fontSize:10, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", fontFamily:"'DM Sans',sans-serif" },
  navBadge: { position:"absolute", top:6, right:"calc(50% - 16px)", background:"#e07a5f", color:"#fff", borderRadius:10, padding:"1px 5px", fontSize:9, fontWeight:700, fontFamily:"'DM Sans',sans-serif" },

  // Planner
  plannerRoot: { minHeight:"100%", background:"#1c1712" },
  header: { background:"linear-gradient(160deg,#2a2118,#1c1712)", borderBottom:"1px solid #3a2e22", padding:"20px 16px 14px", position:"sticky", top:0, zIndex:20, backdropFilter:"blur(12px)" },
  headerInner: { maxWidth:960, margin:"0 auto" },
  headerTopBar: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 },
  headerTitleBlock: { textAlign:"center", marginBottom:8 },
  headerCountsRow: { display:"flex", alignItems:"flex-start", gap:16 },
  weekNav: { display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:12 },
  weekNavArrow: { background:"none", border:"1px solid #3a2e22", borderRadius:6, color:"#9a7f60", fontSize:11, padding:"4px 9px", cursor:"pointer", lineHeight:1 },
  weekRangeBtn: { background:"none", border:"1px solid #3a2e22", borderRadius:8, color:"#f0e0c0", fontSize:13, fontWeight:600, padding:"5px 14px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", whiteSpace:"nowrap" },
  todayJumpBtn: { background:"#2a1e12", border:"1px solid #c8a878", borderRadius:6, color:"#c8a878", fontSize:11, fontWeight:700, padding:"4px 10px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
  monthPickerBackdrop: { position:"fixed", inset:0, zIndex:29 },
  monthPicker: { position:"absolute", top:"calc(100% + 6px)", left:"50%", transform:"translateX(-50%)", background:"#231c14", border:"1px solid #3a2e22", borderRadius:12, padding:"10px", zIndex:30, minWidth:200, boxShadow:"0 8px 32px rgba(0,0,0,0.5)" },
  monthPickerHead: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 },
  monthPickerTitle: { fontSize:13, fontWeight:700, color:"#f4e4c4", fontFamily:"'DM Sans',sans-serif" },
  monthNavArrow: { background:"none", border:"none", color:"#9a7f60", fontSize:12, cursor:"pointer", padding:"2px 6px" },
  weekPickerRow: { display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", background:"none", border:"none", borderRadius:7, padding:"7px 10px", fontSize:12, color:"#c8a878", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textAlign:"left" },
  weekPickerRowViewed: { background:"#3d3020", color:"#f4e4c4" },
  weekPickerRowCurrent: { color:"#89c4a1" },
  weekPickerDot: { fontSize:8, color:"#89c4a1", marginLeft:4 },
  eyebrow: { fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:"#a08060", marginBottom:3, fontFamily:"'DM Sans',sans-serif" },
  title: { margin:0, fontSize:"clamp(22px,5vw,34px)", fontWeight:700, color:"#f4e4c4", letterSpacing:"-0.02em", lineHeight:1.1 },
  weekRange: { fontSize:12, color:"#9a7f60", marginTop:3, fontFamily:"'DM Sans',sans-serif" },
  syncIndicator: { fontSize:10, marginTop:3, fontFamily:"'DM Sans',sans-serif", letterSpacing:"0.04em" },
  syncOk: { color:"#78c878" },
  syncBusy: { color:"#9a9a60" },
  syncError: { color:"#e07a5f" },
  counters: { display:"flex", gap:12, alignItems:"flex-start" },
  counterItem: { display:"flex", flexDirection:"column", gap:4, minWidth:72 },
  counterTop: { display:"flex", alignItems:"center", gap:4 },
  counterLabel: { fontSize:10, color:"#9a7f60", fontFamily:"'DM Sans',sans-serif", flex:1 },
  counterFrac: { fontSize:14, fontWeight:700, color:"#c8a878", fontFamily:"'DM Sans',sans-serif", lineHeight:1 },
  counterFracFull: { color:"#89c4a1" },
  counterOf: { fontSize:10, fontWeight:400, color:"#7a6448" },
  counterTrack: { height:3, background:"#3a2e22", borderRadius:2, overflow:"hidden" },
  counterFill: { height:"100%", borderRadius:2, transition:"width 0.35s ease" },
  clearWeekBtn: { background:"#241e16", border:"1px solid #3a2e22", borderRadius:8, padding:"5px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:5, transition:"border-color 0.2s,background 0.2s" },
  clearWeekLabel: { fontSize:10, color:"#9a7f60", letterSpacing:"0.06em", textTransform:"uppercase", fontFamily:"'DM Sans',sans-serif" },
  headerTopBtns: { display:"flex", alignItems:"center", gap:8 },
  autoFillBtn: { background:"#2e2418", border:"1px solid #4a3c2a", borderRadius:8, padding:"5px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:5, transition:"border-color 0.2s,background 0.2s" },

  afOptLabel: { fontSize:11, color:"#7a6448", letterSpacing:"0.06em", textTransform:"uppercase", fontFamily:"'DM Sans',sans-serif", marginBottom:8, marginTop:14 },
  afSlotRow: { display:"flex", flexWrap:"wrap", gap:7 },
  afSlotChip: { display:"flex", alignItems:"center", background:"#1c1712", border:"1.5px solid #3a2e22", borderRadius:20, padding:"7px 13px", fontSize:13, color:"#9a7f60", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 },
  afSlotChipOn: { background:"#241e16" },
  afModeRow: { display:"flex", gap:7 },
  afModeBtn: { flex:1, background:"#1c1712", border:"1.5px solid #3a2e22", borderRadius:10, padding:"9px 8px", fontSize:12.5, color:"#9a7f60", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600, lineHeight:1.25 },
  afModeBtnOn: { background:"#2e2418", borderColor:"#c8a878", color:"#f4c97a" },
  afToggleRow: { display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", background:"#1c1712", border:"1.5px solid #3a2e22", borderRadius:10, padding:"10px 12px", marginTop:8, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"border-color 0.2s" },
  afToggleLabel: { fontSize:13, color:"#c8a878", fontWeight:600, fontFamily:"'DM Sans',sans-serif" },
  afTogglePill: { fontSize:10, background:"#3a2e22", color:"#7a6448", borderRadius:8, padding:"3px 10px", fontWeight:700, letterSpacing:"0.06em" },
  afTogglePillOn: { background:"#2e2418", color:"#f4c97a", boxShadow:"inset 0 0 0 1px #c8a878" },
  afPreviewHead: { display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:16, marginBottom:8 },
  afShuffleBtn: { background:"#241e16", border:"1px solid #4a3c2a", borderRadius:8, padding:"5px 11px", fontSize:12, color:"#c8a878", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 },
  afEmptyHint: { fontSize:12.5, color:"#7a6448", fontFamily:"'DM Sans',sans-serif", padding:"10px 0", textAlign:"center" },
  afPreview: { display:"flex", flexDirection:"column", gap:10 },
  afSlotBlock: { background:"#1c1712", border:"1px solid #2a2018", borderRadius:11, padding:"11px 12px" },
  afSlotBlockHead: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 },
  afSlotBlockTitle: { display:"flex", alignItems:"center", fontSize:13, fontWeight:700, color:"#f0e0c0", fontFamily:"'DM Sans',sans-serif" },
  afRerollBtn: { background:"none", border:"1px solid #3a2e22", borderRadius:7, padding:"4px 9px", fontSize:11.5, color:"#9a7f60", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 },
  afSegRow: { display:"flex", alignItems:"baseline", gap:10, padding:"3px 0" },
  afSegRange: { fontSize:11, color:"#7a6448", fontFamily:"'DM Sans',sans-serif", fontWeight:700, width:62, flexShrink:0, letterSpacing:"0.03em" },
  afSegName: { fontSize:13.5, color:"#f4e4c4", fontFamily:"'Lora',Georgia,serif", display:"flex", alignItems:"center", gap:7 },
  afSegEmpty: { fontSize:13, color:"#5a4a38", fontFamily:"'DM Sans',sans-serif", fontStyle:"italic" },
  afKeptTag: { fontSize:9, color:"#7ecfcf", background:"#1c2a28", border:"1px solid #2a4a44", borderRadius:5, padding:"1px 5px", letterSpacing:"0.05em", textTransform:"uppercase", fontFamily:"'DM Sans',sans-serif", fontWeight:700 },
  afActions: { display:"flex", gap:10, justifyContent:"flex-end", marginTop:18 },
  afConfirmBar: { marginTop:18, background:"#2a1818", border:"1px solid #5a2e28", borderRadius:11, padding:"12px" },
  afConfirmText: { fontSize:12.5, color:"#f0a890", fontFamily:"'DM Sans',sans-serif", marginBottom:10, textAlign:"center" },
  extrasBtn: { background:"#241e16", border:"1px solid #3a2e22", borderRadius:8, padding:"5px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:6, position:"relative", transition:"border-color 0.2s,background 0.2s" },
  extrasBtnIcon: { fontSize:16, lineHeight:1 },
  extrasBtnLabel: { fontSize:10, color:"#9a7f60", letterSpacing:"0.06em", textTransform:"uppercase", fontFamily:"'DM Sans',sans-serif" },
  extrasBadge: { position:"absolute", top:-5, right:-5, background:"#e07a5f", color:"#fff", borderRadius:10, padding:"1px 5px", fontSize:9, fontWeight:700, fontFamily:"'DM Sans',sans-serif" },
  legend: { display:"flex", gap:12, marginTop:12, maxWidth:960, margin:"12px auto 0", flexWrap:"wrap" },
  legendItem: { display:"flex", alignItems:"center", gap:5, fontSize:11, color:"#9a7f60", fontFamily:"'DM Sans',sans-serif" },
  dot: { width:7, height:7, borderRadius:"50%", display:"inline-block" },

  prepBanner: { background:"#1a2420", borderBottom:"1px solid #2a3d38", padding:"0 16px" },
  prepBannerInner: { maxWidth:960, margin:"0 auto", padding:"12px 0" },
  prepBannerTitle: { fontSize:11, fontWeight:700, color:"#7ecfcf", letterSpacing:"0.05em", textTransform:"uppercase", fontFamily:"'DM Sans',sans-serif", marginBottom:8, display:"flex", alignItems:"center", gap:5 },
  prepList: { display:"flex", flexDirection:"column", gap:6 },
  prepItem: { display:"flex", alignItems:"center", justifyContent:"space-between", background:"#1f2e2a", border:"1px solid #2a3d38", borderRadius:9, padding:"9px 12px", gap:10, flexWrap:"wrap" },
  prepItemLeft: { display:"flex", flexDirection:"column", gap:2 },
  prepMeal: { fontSize:13, fontWeight:600, color:"#cceee8", fontFamily:"'DM Sans',sans-serif" },
  prepMeta: { fontSize:11, color:"#5a8a80", fontFamily:"'DM Sans',sans-serif" },
  prepItemRight: { display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" },
  prepThawDate: { fontSize:12, color:"#7ecfcf", fontFamily:"'DM Sans',sans-serif", fontWeight:600 },
  prepThawDateUrgent: { color:"#fff", background:"#c0392b", borderRadius:6, padding:"2px 8px" },
  prepCalBtn: { background:"#2a3d38", border:"1px solid #3a5a52", borderRadius:6, padding:"4px 10px", fontSize:11, color:"#7ecfcf", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },

  main: { padding:"16px 12px 24px", maxWidth:960, margin:"0 auto" },
  grid: { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:10 },
  card: { background:"#241e16", border:"1px solid #3a2e22", borderRadius:14, padding:"13px 11px", transition:"border-color 0.2s,transform 0.15s" },
  cardToday: { border:"1.5px solid #f4c97a66", background:"#2a2118" },
  cardThaw: { },
  cardHead: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:9 },
  cardBadges: { display:"flex", alignItems:"center", gap:4 },
  dayName: { fontSize:12, fontWeight:700, letterSpacing:"0.1em", color:"#c8a878", fontFamily:"'DM Sans',sans-serif" },
  dayNameToday: { color:"#f4c97a" },
  dayDate: { fontSize:10, color:"#7a6448", fontFamily:"'DM Sans',sans-serif" },
  dayWeather: { fontSize:10, color:"#a09878", fontFamily:"'DM Sans',sans-serif" },
  slotWeather: { fontSize:10, color:"#a09878", fontFamily:"'DM Sans',sans-serif", whiteSpace:"nowrap" },
  thawBadge: { fontSize:12 },
  todayBadge: { fontSize:10, background:"#f4c97a22", color:"#f4c97a", border:"1px solid #f4c97a55", borderRadius:10, padding:"2px 7px", fontFamily:"'DM Sans',sans-serif" },
  slots: { display:"flex", flexDirection:"column", gap:5 },
  slot: { display:"flex", alignItems:"center", gap:6, padding:"8px 9px", borderRadius:8, cursor:"pointer", transition:"background 0.15s", position:"relative" },
  slotEmpty: { background:"#1c1712", border:"1px dashed #3a2e22" },
  slotFilled: { background:"#2e2418", border:"1px solid #4a3c2a" },
  slotThaw: { background:"#1a2c28", border:"1px solid #2e5048" },
  slotHasRecipe: { borderColor:"#4a3878" },
  slotInner: { flex:1, minWidth:0, overflow:"hidden" },
  slotLbl: { display:"block", fontSize:9, color:"#7a6448", letterSpacing:"0.08em", textTransform:"uppercase", fontFamily:"'DM Sans',sans-serif" },
  slotMeal: { display:"inline", fontSize:12, color:"#f0e0c0", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  slotPlaceholder: { display:"block", fontSize:11, color:"#5a4a36", marginTop:1, fontFamily:"'DM Sans',sans-serif" },
  slotIcons: { display:"flex", gap:3, alignItems:"center", flexShrink:0, marginLeft:"auto" },
  slotThawIcon: { fontSize:10 },
  slotRecipeIcon: { fontSize:10 },
  clearBtn: { background:"rgba(28,23,18,0.85)", border:"none", color:"#9a6858", fontSize:10, cursor:"pointer", padding:"2px 5px", borderRadius:4, position:"absolute", top:4, right:4, opacity:0, transition:"opacity 0.15s,color 0.15s", lineHeight:1, zIndex:2 },

  backdrop: { position:"fixed", inset:0, background:"rgba(12,10,8,0)", zIndex:29, pointerEvents:"none", transition:"background 0.3s" },
  backdropVisible: { background:"rgba(12,10,8,0.6)", pointerEvents:"auto" },
  panel: { position:"fixed", top:0, right:0, height:"100vh", width:300, background:"#221a12", borderLeft:"1px solid #3a2e22", zIndex:30, transform:"translateX(100%)", transition:"transform 0.3s cubic-bezier(0.4,0,0.2,1)", overflowY:"auto", padding:"24px 16px 80px", boxShadow:"-8px 0 32px rgba(0,0,0,0.5)" },
  panelOpen: { transform:"translateX(0)" },
  panelHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 },
  panelTitle: { fontSize:15, fontWeight:700, color:"#f4e4c4" },
  panelClose: { background:"none", border:"none", color:"#7a6448", fontSize:18, cursor:"pointer", padding:4, lineHeight:1 },
  binCard: { background:"#2a2118", border:"1px solid #3a2e22", borderRadius:12, padding:"13px 11px", marginBottom:10 },
  binHeader: { display:"flex", alignItems:"center", gap:7, marginBottom:9 },
  binLabel: { fontSize:13, fontWeight:600, color:"#f4e4c4", flex:1, fontFamily:"'DM Sans',sans-serif" },
  binCount: { fontSize:11, background:"#3a2e22", color:"#9a7f60", borderRadius:10, padding:"1px 7px", fontFamily:"'DM Sans',sans-serif" },
  binItems: { marginBottom:7, minHeight:4 },
  binEmpty: { fontSize:11, color:"#5a4a36", fontFamily:"'DM Sans',sans-serif", padding:"3px 0" },
  binItem: { display:"flex", alignItems:"center", gap:6, padding:"6px 0", borderBottom:"1px solid #2e2418" },
  binItemText: { flex:1, fontSize:12, color:"#d4c0a0", fontFamily:"'DM Sans',sans-serif", minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  binRemove: { background:"none", border:"none", color:"#5a4a36", fontSize:10, cursor:"pointer", padding:"1px 3px", opacity:0, transition:"opacity 0.15s", flexShrink:0 },
  binInputRow: { display:"flex", gap:6 },
  binInput: { flex:1, background:"#1c1712", border:"1px solid #3a2e22", borderRadius:7, padding:"8px 9px", fontSize:13, color:"#f0e8d8", fontFamily:"'Lora',Georgia,serif", outline:"none", minWidth:0 },
  binAdd: { background:"#3a2e22", border:"none", borderRadius:7, padding:"7px 11px", color:"#c8a878", fontSize:18, cursor:"pointer", lineHeight:1 },
  binSugs: { display:"flex", flexWrap:"wrap", gap:4, marginTop:7 },

  overlay: { position:"fixed", inset:0, background:"rgba(12,10,8,0.88)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:16, backdropFilter:"blur(4px)" },
  modal: { background:"#2a2118", border:"1px solid #4a3c2a", borderRadius:18, padding:"22px", width:"100%", maxWidth:460, boxShadow:"0 24px 60px rgba(0,0,0,0.6)", maxHeight:"90vh", overflowY:"auto" },
  modalHead: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 },
  modalEyebrow: { fontSize:11, color:"#9a7f60", display:"flex", alignItems:"center", marginBottom:3, fontFamily:"'DM Sans',sans-serif" },
  modalTitle: { fontSize:21, fontWeight:700, color:"#f4e4c4", letterSpacing:"-0.01em" },
  modalClose: { background:"none", border:"none", color:"#7a6448", fontSize:18, cursor:"pointer", padding:4, flexShrink:0 },
  modalInput: { width:"100%", background:"#1c1712", border:"1.5px solid #4a3c2a", borderRadius:10, padding:"12px 14px", fontSize:16, color:"#f0e8d8", fontFamily:"'Lora',Georgia,serif", outline:"none", boxSizing:"border-box", marginBottom:12 },

  viewRecipeRow: { display:"flex", alignItems:"center", gap:8, background:"#1e1830", border:"1px solid #3a2858", borderRadius:9, padding:"9px 12px", marginBottom:12 },
  viewRecipeIcon: { fontSize:14 },
  viewRecipeName: { flex:1, fontSize:13, color:"#c4aae8", fontFamily:"'DM Sans',sans-serif", fontWeight:600, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  viewRecipeBtn: { background:"#3a2858", border:"1px solid #5a3888", borderRadius:7, padding:"5px 11px", fontSize:12, color:"#c4aae8", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600, flexShrink:0 },

  sugs: { marginBottom:12 },
  sugsLbl: { fontSize:10, color:"#7a6448", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6, fontFamily:"'DM Sans',sans-serif" },
  sugsList: { display:"flex", flexWrap:"wrap", gap:5 },

  thawSection: { background:"#1c2420", border:"1px solid #2a3d38", borderRadius:10, padding:"11px", marginBottom:12 },
  thawRow: { display:"flex", alignItems:"center" },
  thawToggle: { background:"none", border:"none", display:"flex", alignItems:"center", gap:8, cursor:"pointer", color:"#9a9a9a", fontSize:14, fontFamily:"'DM Sans',sans-serif", padding:0 },
  thawToggleOn: { color:"#7ecfcf" },
  thawToggleIcon: { fontSize:16 },
  thawTogglePill: { fontSize:10, background:"#3a2e22", color:"#7a6448", borderRadius:8, padding:"2px 7px", fontWeight:700, letterSpacing:"0.05em" },
  thawTogglePillOn: { background:"#2a4a44", color:"#7ecfcf" },
  thawOptions: { marginTop:10, paddingTop:10, borderTop:"1px solid #2a3d38" },
  thawOptionsLbl: { fontSize:11, color:"#5a8a80", fontFamily:"'DM Sans',sans-serif", marginBottom:7, display:"block" },
  thawDayBtns: { display:"flex", gap:6, marginBottom:8 },
  thawDayBtn: { background:"#1c1712", border:"1.5px solid #2a3d38", borderRadius:7, padding:"8px 14px", fontSize:13, color:"#5a8a80", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
  thawDayBtnActive: { background:"#1f3530", border:"1.5px solid #7ecfcf", color:"#7ecfcf" },
  thawPreview: { fontSize:12, color:"#7ecfcf", marginBottom:8, fontFamily:"'DM Sans',sans-serif" },
  thawCalBtn: { background:"#1f3530", border:"1px solid #2a5048", borderRadius:8, padding:"9px 14px", fontSize:13, color:"#7ecfcf", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", width:"100%", textAlign:"center" },

  copySection: { marginBottom:14 },
  copyToggle: { background:"#1c1712", border:"1px solid #4a3c2a", borderRadius:8, padding:"9px 14px", color:"#9a7f60", fontSize:13, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:6 },
  copyToggleActive: { borderColor:"#c8a878", color:"#c8a878", background:"#2e2418" },
  copyBadge: { background:"#f4c97a", color:"#1c1712", borderRadius:10, padding:"0px 6px", fontSize:10, fontWeight:700 },
  copyPicker: { background:"#1c1712", border:"1px solid #3a2e22", borderRadius:10, padding:"11px", marginTop:7 },
  copyPickerLbl: { fontSize:11, color:"#7a6448", marginBottom:8, fontFamily:"'DM Sans',sans-serif" },
  copyDaysRow: { display:"flex", gap:6, flexWrap:"wrap" },
  dayChip: { background:"#241e16", border:"1.5px solid #3a2e22", borderRadius:6, padding:"6px 0", width:38, textAlign:"center", fontSize:13, color:"#c8a878", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 },
  dayChipSource: { background:"#2e2418", border:"1.5px solid #f4c97a88", color:"#f4c97a", cursor:"default" },
  dayChipSelected: { background:"#3d3020", border:"1.5px solid #c8a878", color:"#f4e4c4" },
  copyPreview: { fontSize:11, color:"#89c4a1", marginTop:7, fontFamily:"'DM Sans',sans-serif" },
  dayCopyBtn: { background:"#241e16", border:"1px solid #3a2e22", borderRadius:5, padding:"2px 7px", fontSize:12, color:"#9a7f60", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", lineHeight:1.4 },
  dayCopyBtnActive: { borderColor:"#c8a878", color:"#c8a878", background:"#2e2418" },
  dayClearBtn: { background:"#241e16", border:"1px solid #3a2e22", borderRadius:5, padding:"2px 7px", fontSize:12, color:"#9a7f60", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", lineHeight:1.4 },
  createRecipeBtn: { width:"100%", background:"#1e1830", border:"1px solid #3a2858", borderRadius:9, padding:"10px 12px", fontSize:13.5, color:"#c4aae8", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600, marginBottom:12, textAlign:"center" },
  dayCopyPicker: { background:"#1c1712", border:"1px solid #3a2e22", borderRadius:8, padding:"10px", margin:"6px 0 4px" },
  dayCopyApplyBtn: { marginTop:8, width:"100%", background:"linear-gradient(135deg,#c8a878,#a07848)", border:"none", borderRadius:7, padding:"7px", fontSize:12, color:"#1c1712", fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },

  modalActions: { display:"flex", gap:8, justifyContent:"flex-end", marginTop:6 },
  btnClear: { background:"none", border:"1px solid #4a3c2a", borderRadius:10, padding:"11px 18px", color:"#9a7f60", fontSize:14, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
  btnSave: { background:"linear-gradient(135deg,#f4c97a,#e0a84a)", border:"none", borderRadius:10, padding:"11px 22px", color:"#1c1712", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
  btnDisabled: { opacity:0.4, cursor:"default" },

  // Recipe Library
  recipesRoot: { padding:"20px 16px 24px", maxWidth:960, margin:"0 auto" },
  recipesHeader: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 },
  newRecipeBtn: { background:"linear-gradient(135deg,#f4c97a,#e0a84a)", border:"none", borderRadius:10, padding:"10px 18px", color:"#1c1712", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", flexShrink:0, marginTop:4 },
  recipesHeaderBtns: { display:"flex", gap:8, flexShrink:0, marginTop:4 },
  importRecipeBtn: { background:"#2e2418", border:"1px solid #4a3c2a", borderRadius:10, padding:"10px 14px", color:"#f4c97a", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", flexShrink:0 },

  importTabs: { display:"flex", gap:6, marginBottom:16 },
  importTab: { flex:1, background:"#1c1712", border:"1.5px solid #3a2e22", borderRadius:10, padding:"10px 8px", color:"#9a7f60", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
  importTabOn: { background:"#2e2418", borderColor:"#c8a878", color:"#f4c97a" },
  importHint: { fontSize:12, color:"#7a6448", marginBottom:12, fontFamily:"'DM Sans',sans-serif" },
  importGoBtn: { width:"100%", padding:"12px", fontSize:15 },
  importPhotoDrop: { display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center", background:"#1c1712", border:"1.5px dashed #4a3c2a", borderRadius:12, padding:"28px 16px", cursor:"pointer", marginBottom:4 },
  importPhotoDropText: { fontSize:15, fontWeight:700, color:"#f0e8d8", fontFamily:"'DM Sans',sans-serif", marginBottom:3 },
  importPhotoDropSub: { fontSize:12, color:"#7a6448", fontFamily:"'DM Sans',sans-serif" },
  importLoading: { display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center", padding:"30px 16px" },
  importSpinner: { fontSize:38, animation:"importPulse 1.2s ease-in-out infinite" },
  importLoadingText: { fontSize:16, fontWeight:700, color:"#f0e8d8", fontFamily:"'DM Sans',sans-serif", marginTop:12 },
  importLoadingSub: { fontSize:12, color:"#7a6448", fontFamily:"'DM Sans',sans-serif", marginTop:4 },
  importError: { background:"#3a1f1a", border:"1px solid #6a3328", borderRadius:9, padding:"10px 12px", color:"#f0a890", fontSize:13, fontFamily:"'DM Sans',sans-serif", marginTop:12 },
  importDisclaimer: { fontSize:11, color:"#5a4a38", fontFamily:"'DM Sans',sans-serif", marginTop:14, textAlign:"center" },
  recipeFilters: { marginBottom:16 },
  recipeSearch: { width:"100%", background:"#241e16", border:"1px solid #3a2e22", borderRadius:10, padding:"11px 14px", fontSize:15, color:"#f0e8d8", fontFamily:"'Lora',Georgia,serif", outline:"none", boxSizing:"border-box", marginBottom:10 },
  typeFilters: { display:"flex", gap:6, flexWrap:"wrap" },
  typeChip: { background:"#241e16", border:"1px solid #3a2e22", borderRadius:20, padding:"6px 14px", fontSize:12, color:"#9a7f60", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 },
  typeChipActive: { background:"#3a2e22", border:"1px solid #c8a878", color:"#f4c97a" },
  typeChipDiet: { background:"#1e2a1e", border:"1.5px solid #2a4a2a", color:"#6a9a6a" },
  activeFilterRow: { display:"flex", alignItems:"center", gap:8, marginTop:8, padding:"6px 10px", background:"#1e2418", border:"1px solid #2a3820", borderRadius:8 },
  activeFilterLbl: { flex:1, fontSize:11, color:"#78c878", fontFamily:"'DM Sans',sans-serif" },
  activeFilterClear: { background:"none", border:"none", fontSize:11, color:"#5a8a50", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textDecoration:"underline" },
  searchRow: { display:"flex", alignItems:"center", gap:8, marginBottom:8 },
  resetBtn: { background:"#2e1e1e", border:"1px solid #5a3030", borderRadius:7, padding:"7px 12px", fontSize:12, color:"#c07060", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", whiteSpace:"nowrap" },
  filterGroupRow: { display:"flex", gap:6, marginBottom:6, flexWrap:"wrap" },
  filterGroupBtn: { display:"flex", alignItems:"center", gap:4, background:"#241e16", border:"1px solid #3a2e22", borderRadius:8, padding:"7px 14px", fontSize:12, color:"#9a7f60", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 },
  filterGroupBtnActive: { background:"#2e2418", border:"1px solid #c8a878", color:"#f4c97a" },
  filterGroupBadge: { background:"#c8a878", color:"#1c1712", borderRadius:10, padding:"0 5px", fontSize:10, fontWeight:700 },
  filterPanel: { display:"flex", flexWrap:"wrap", gap:6, background:"#1c1712", border:"1px solid #3a2e22", borderRadius:10, padding:"10px", marginBottom:6 },
  activeChipsRow: { display:"flex", flexWrap:"wrap", gap:6, marginTop:2 },
  activeFilterChip: { display:"flex", alignItems:"center", gap:4, background:"#2e2418", border:"1px solid #c8a878", borderRadius:20, padding:"4px 10px", fontSize:11, color:"#f4c97a", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 },
  typeChipDietActive: { background:"#1e3a1e", border:"1.5px solid #4a8a4a", color:"#78c878" },
  slotRecipeBtn: { display:"inline-flex", alignItems:"center", gap:4, background:"#2a1e40", border:"1px solid #5a3888", borderRadius:5, fontSize:10, cursor:"pointer", padding:"3px 7px", color:"#d4b8f8", fontFamily:"'DM Sans',sans-serif", fontWeight:700, lineHeight:1 },

  recipeEmpty: { textAlign:"center", padding:"60px 20px", display:"flex", flexDirection:"column", alignItems:"center", gap:10 },
  recipeEmptyIcon: { fontSize:40, marginBottom:4 },
  recipeEmptyTitle: { fontSize:18, fontWeight:700, color:"#c8a878" },
  recipeEmptyText: { fontSize:13, color:"#7a6448", fontFamily:"'DM Sans',sans-serif", maxWidth:280, lineHeight:1.5 },

  recipeGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10 },
  recipeCard: { background:"#241e16", border:"1px solid #3a2e22", borderRadius:14, cursor:"pointer", textAlign:"left", display:"flex", flexDirection:"column", overflow:"hidden", transition:"border-color 0.2s,transform 0.15s" },
  recipeCardPhoto: { width:"100%", height:120, objectFit:"cover", display:"block" },
  recipeCardPhotoPlaceholder: { width:"100%", height:100, background:"#2e2418", display:"flex", alignItems:"center", justifyContent:"center" },
  recipeCardContent: { padding:"10px 12px 12px", display:"flex", flexDirection:"column", gap:5, flex:1 },
  recipeCardName: { fontSize:14, fontWeight:700, color:"#f4e4c4", fontFamily:"'Lora',Georgia,serif", lineHeight:1.2 },
  recipeCardTime: { fontSize:11, color:"#9a7f60", fontFamily:"'DM Sans',sans-serif" },
  recipeCardDesc: { fontSize:12, color:"#9a7f60", fontFamily:"'DM Sans',sans-serif", lineHeight:1.4, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" },
  recipeCardTags: { display:"flex", gap:4, flexWrap:"wrap", alignItems:"flex-start", marginTop:"auto", paddingTop:4 },

  tag: { fontSize:10, borderRadius:8, padding:"2px 7px", fontFamily:"'DM Sans',sans-serif", fontWeight:600 },
  tagMeal: { background:"#2e2c18", color:"#c8b840", border:"1px solid #4a4428" },
  tagDiet: { background:"#1e2e20", color:"#78b878", border:"1px solid #2e4a30" },
  tagCuisine: { background:"#1e2438", color:"#7898d8", border:"1px solid #2e3858" },
  detailHero: { width:"100%", height:220, objectFit:"cover", display:"block" },
  detailNotes: { fontSize:13, color:"#c0a880", fontFamily:"'DM Sans',sans-serif", lineHeight:1.6, margin:0, whiteSpace:"pre-wrap" },
  typeChipCuisine: { background:"#1e2438", color:"#7898d8", border:"1px solid #2e3858" },
  typeChipCuisineActive: { background:"#2e3858", color:"#a8c8f8", border:"1px solid #7898d8" },
  tagPickerCuisineOn: { background:"#2e3858", border:"1.5px solid #7898d8", color:"#a8c8f8" },
  addCustomChip: { background:"none", border:"1.5px dashed #3a2e22", borderRadius:20, padding:"7px 14px", fontSize:13, color:"#6a5a48", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
  customTagRow: { display:"flex", gap:8, marginTop:6, alignItems:"center" },
  photoActions: { display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" },
  photoUploadBtn: { display:"inline-flex", alignItems:"center", gap:6, background:"#2e2418", border:"1px solid #4a3c2a", borderRadius:8, padding:"8px 14px", fontSize:13, color:"#c8a878", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600, whiteSpace:"nowrap" },
  photoOrText: { fontSize:12, color:"#6a5a48", fontFamily:"'DM Sans',sans-serif" },
  photoRemoveBtn: { position:"absolute", top:6, right:6, background:"rgba(0,0,0,0.6)", border:"none", borderRadius:20, color:"#fff", fontSize:12, cursor:"pointer", padding:"3px 8px" },

  // Recipe Detail
  recipeDetailRoot: { minHeight:"100%", background:"#1c1712" },
  detailTopBar: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:"1px solid #2a2118", position:"sticky", top:0, background:"#1c1712", zIndex:10 },
  detailBackBtn: { background:"none", border:"none", color:"#9a7f60", fontSize:14, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", padding:"4px 0" },
  detailTopActions: { display:"flex", gap:8 },
  detailEditBtn: { background:"#2e2418", border:"1px solid #4a3c2a", borderRadius:8, padding:"7px 16px", color:"#c8a878", fontSize:13, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 },
  detailDeleteBtn: { background:"none", border:"1px solid #4a2828", borderRadius:8, padding:"7px 14px", color:"#c07060", fontSize:13, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },

  detailBody: { padding:"20px 16px 40px", maxWidth:680, margin:"0 auto" },
  detailTitle: { margin:"0 0 8px", fontSize:"clamp(22px,5vw,30px)", fontWeight:700, color:"#f4e4c4", letterSpacing:"-0.02em" },
  detailDesc: { fontSize:14, color:"#9a8060", fontFamily:"'DM Sans',sans-serif", marginBottom:16, lineHeight:1.5 },
  detailMeta: { display:"flex", gap:20, marginBottom:14, flexWrap:"wrap" },
  detailMetaItem: { display:"flex", alignItems:"center", gap:8 },
  detailMetaIcon: { fontSize:20 },
  detailMetaVal: { fontSize:15, fontWeight:700, color:"#f4e4c4", fontFamily:"'DM Sans',sans-serif" },
  detailMetaLbl: { fontSize:10, color:"#7a6448", fontFamily:"'DM Sans',sans-serif", textTransform:"uppercase", letterSpacing:"0.08em" },
  detailTags: { display:"flex", gap:5, flexWrap:"wrap", marginBottom:14 },
  detailUrl: { display:"inline-flex", alignItems:"center", gap:6, color:"#9a99e8", fontSize:13, fontFamily:"'DM Sans',sans-serif", textDecoration:"none", marginBottom:20, padding:"8px 14px", background:"#1e1e2e", border:"1px solid #2e2e4a", borderRadius:8 },

  detailSection: { marginBottom:24 },
  detailSectionHead: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 },
  detailSectionTitle: { fontSize:13, fontWeight:700, color:"#a08060", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"'DM Sans',sans-serif" },
  scalerRow: { display:"flex", alignItems:"center", gap:10, background:"#241e16", border:"1px solid #3a2e22", borderRadius:10, padding:"6px 10px" },
  scalerBtn: { background:"#3a2e22", border:"none", borderRadius:6, width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", color:"#c8a878", fontSize:16, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", lineHeight:1 },
  scalerVal: { fontSize:16, fontWeight:700, color:"#f4c97a", fontFamily:"'DM Sans',sans-serif", minWidth:60, textAlign:"center" },
  scalerLbl: { fontSize:11, fontWeight:400, color:"#7a6448" },
  servingsRow: { display:"flex", alignItems:"center", gap:8 },

  ingredientList: { display:"flex", flexDirection:"column", gap:8 },
  ingredientRow: { display:"flex", alignItems:"baseline", gap:0, padding:"8px 0", borderBottom:"1px solid #2a2018" },
  ingredientAmt: { fontSize:13, fontWeight:700, color:"#f4c97a", fontFamily:"'DM Sans',sans-serif", width:44, flexShrink:0, textAlign:"right" as const, paddingRight:8 },
  ingredientUnit: { fontSize:13, color:"#a08060", fontFamily:"'DM Sans',sans-serif", width:88, flexShrink:0, paddingRight:10, boxSizing:"border-box" as const, whiteSpace:"normal" as const, wordBreak:"break-word" as const, lineHeight:1.3 },
  ingredientName: { fontSize:14, color:"#f0e0c0", fontFamily:"'DM Sans',sans-serif", flex:1, textAlign:"left" as const },

  stepList: { display:"flex", flexDirection:"column" },
  stepRow: { display:"flex", gap:12, alignItems:"flex-start", padding:"12px 0", textAlign:"left" as const },
  stepRowDivider: { borderBottom:"1px solid #2a2018" },
  stepNum: { width:26, height:26, borderRadius:"50%", background:"#3a2e22", color:"#c8a878", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontFamily:"'DM Sans',sans-serif", marginTop:2 },
  stepText: { fontSize:14, color:"#e0d0b8", fontFamily:"'DM Sans',sans-serif", lineHeight:1.6, flex:1, textAlign:"left" as const },

  // Recipe Editor
  editorRoot: { minHeight:"100%", background:"#1c1712" },
  editorTopBar: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:"1px solid #2a2118", position:"sticky", top:0, background:"#1c1712", zIndex:10 },
  editorSaveBtn: { padding:"9px 20px", fontSize:14 },
  editorBody: { padding:"20px 16px", maxWidth:680, margin:"0 auto" },
  editorField: { marginBottom:16 },
  editorRow: { display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" },
  editorLabel: { display:"block", fontSize:11, color:"#9a7f60", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6, fontFamily:"'DM Sans',sans-serif" },
  editorInput: { width:"100%", background:"#241e16", border:"1px solid #3a2e22", borderRadius:9, padding:"11px 13px", fontSize:15, color:"#f0e8d8", fontFamily:"'Lora',Georgia,serif", outline:"none", boxSizing:"border-box" },
  editorTextarea: { width:"100%", background:"#241e16", border:"1px solid #3a2e22", borderRadius:9, padding:"11px 13px", fontSize:14, color:"#f0e8d8", fontFamily:"'DM Sans',sans-serif", outline:"none", boxSizing:"border-box", resize:"vertical" },

  tagPickerHead: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 },
  tagManageBtn: { background:"none", border:"none", color:"#7a6448", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", padding:"2px 4px" },
  tagManageBtnOn: { color:"#f4c97a" },
  tagManageHint: { fontSize:11, color:"#7a6448", fontFamily:"'DM Sans',sans-serif", marginTop:7 },
  tagDeleteChip: { background:"#3a1f1a", border:"1.5px solid #6a3328", color:"#f0a890" },
  tagChipDim: { opacity:0.4 },
  tagPicker: { display:"flex", flexWrap:"wrap", gap:6 },
  tagPickerChip: { background:"#241e16", border:"1.5px solid #3a2e22", borderRadius:20, padding:"7px 14px", fontSize:13, color:"#9a7f60", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 },
  tagPickerChipOn: { background:"#2e2c18", border:"1.5px solid #c8b840", color:"#f4e060" },
  tagPickerDietOn: { background:"#1e2e20", border:"1.5px solid #4a8a50", color:"#78c878" },

  ingredientEditor: { display:"flex", flexDirection:"column", gap:7 },
  ingredientEditorRow: { display:"flex", gap:6, alignItems:"center" },
  ingAmtInput: { width:60, flexShrink:0, padding:"10px 8px", fontSize:14 },
  ingUnitInput: { width:70, flexShrink:0, padding:"10px 8px", fontSize:14 },
  editorRemoveBtn: { background:"none", border:"none", color:"#7a6448", fontSize:14, cursor:"pointer", padding:"4px 6px", flexShrink:0 },
  editorAddRowBtn: { background:"none", border:"1px dashed #3a2e22", borderRadius:8, padding:"9px", fontSize:13, color:"#7a6448", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", marginTop:2, textAlign:"center" },

  stepEditor: { display:"flex", flexDirection:"column", gap:8 },
  stepEditorRow: { display:"flex", gap:8, alignItems:"flex-start" },
  stepEditorNum: { width:26, height:26, borderRadius:"50%", background:"#3a2e22", color:"#c8a878", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontFamily:"'DM Sans',sans-serif", marginTop:10 },

  // Lists
  listSectionLbl: { fontSize:10, color:"#7a6448", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"'DM Sans',sans-serif", margin:"18px 0 8px" },
  listEmptyHint: { fontSize:13, color:"#7a6448", fontFamily:"'DM Sans',sans-serif", lineHeight:1.5, padding:"4px 2px" },
  listCard: { display:"flex", alignItems:"center", gap:12, width:"100%", background:"#241e16", border:"1px solid #3a2e22", borderRadius:13, padding:"13px 14px", cursor:"pointer", textAlign:"left", marginBottom:8, transition:"border-color 0.15s,transform 0.12s" },
  listCardIcon: { fontSize:24, flexShrink:0, width:30, textAlign:"center" },
  listCardBody: { flex:1, minWidth:0 },
  listCardName: { fontSize:15.5, fontWeight:700, color:"#f4e4c4", fontFamily:"'Lora',Georgia,serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  listCardMeta: { fontSize:12, color:"#9a7f60", fontFamily:"'DM Sans',sans-serif", marginTop:2 },
  listCardArrow: { fontSize:22, color:"#5a4a36", flexShrink:0 },
  listCreateBox: { background:"#1c1712", border:"1px solid #3a2e22", borderRadius:12, padding:"12px", marginBottom:10 },
  listIconRow: { display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 },
  listIconPick: { background:"#241e16", border:"1.5px solid #3a2e22", borderRadius:9, width:38, height:38, fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" },
  listIconPickOn: { borderColor:"#c8a878", background:"#2e2418" },
  listCreateInputRow: { display:"flex", gap:8, alignItems:"center" },

  listDetailTitleRow: { display:"flex", alignItems:"center", gap:10, marginBottom:16 },
  listAddRow: { display:"flex", gap:8, alignItems:"center", marginBottom:16 },
  listItems: { display:"flex", flexDirection:"column", gap:2 },
  listItemRow: { display:"flex", alignItems:"center", gap:11, padding:"10px 2px", borderBottom:"1px solid #221b13" },
  listCheck: { width:24, height:24, borderRadius:7, border:"1.5px solid #4a3c2a", background:"#1c1712", color:"#1c1712", fontSize:14, fontWeight:800, cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 },
  listCheckOn: { background:"#8ac878", borderColor:"#8ac878", color:"#1c1712" },
  listItemText: { fontSize:15, color:"#f0e0c0", fontFamily:"'DM Sans',sans-serif", lineHeight:1.35, wordBreak:"break-word" },
  listItemTextChecked: { color:"#6a5a48", textDecoration:"line-through" },
  listItemQty: { color:"#f4c97a", fontWeight:700 },
  listItemQtyBtn: { background:"none", border:"none", padding:0, color:"#f4c97a", fontWeight:700, fontSize:"inherit", fontFamily:"inherit", cursor:"pointer", textDecoration:"underline", textDecorationStyle:"dotted", textUnderlineOffset:3 },
  listItemQtyAdd: { background:"none", border:"1px dashed #4a3c2a", borderRadius:6, padding:"0 6px", color:"#7a6448", fontSize:11, fontFamily:"'DM Sans',sans-serif", cursor:"pointer", marginRight:5 },
  listQtyEditRow: { marginTop:6 },
  listQtyInput: { width:"100%", maxWidth:160, background:"#1c1712", border:"1.5px solid #c8a878", borderRadius:8, padding:"6px 10px", fontSize:14, color:"#f0e8d8", fontFamily:"'DM Sans',sans-serif", outline:"none", boxSizing:"border-box" },
  listItemSrcNames: { fontSize:11.5, color:"#89a98c", fontFamily:"'DM Sans',sans-serif", marginTop:4, display:"flex", flexDirection:"column", gap:2 },
  listItemSrcQty: { color:"#7ab89a", fontWeight:700 },
  listItemSrcOverride: { color:"#c8a878", marginTop:2, paddingTop:2, borderTop:"1px solid #2a2a22" },
  listSectionHead: { fontSize:10, color:"#7a6448", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"'DM Sans',sans-serif", margin:"14px 0 5px" },
  listSrcIcon: { background:"none", border:"none", fontSize:14, cursor:"pointer", padding:"4px 4px", flexShrink:0, opacity:0.85, lineHeight:1 },
  listGroupDivider: { height:1, background:"#3a2e22", margin:"7px 0" },
  listItemDup: { fontSize:9, color:"#e0a84a", background:"#2e2418", border:"1px solid #6a5320", borderRadius:5, padding:"1px 5px", letterSpacing:"0.05em", textTransform:"uppercase", fontFamily:"'DM Sans',sans-serif", fontWeight:700, marginLeft:7, verticalAlign:"middle", whiteSpace:"nowrap" },
  listItemDel: { background:"none", border:"none", color:"#5a4a38", fontSize:13, cursor:"pointer", padding:"4px 6px", flexShrink:0 },
  addGroceryBtn: { width:"100%", background:"#1f3530", border:"1px solid #2a5048", borderRadius:10, padding:"11px", fontSize:14, color:"#7ecfcf", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600, marginTop:12 },
  removeGroceryBtn: { width:"100%", background:"#2e1f1a", border:"1px solid #5a3328", borderRadius:10, padding:"10px", fontSize:13.5, color:"#e0a890", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600, marginTop:8 },
  addWeekBtn: { width:"100%", background:"#1f3530", border:"1px solid #2a5048", borderRadius:10, padding:"10px", fontSize:13.5, color:"#7ecfcf", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600, marginBottom:4 },
  groceryMsg: { fontSize:12.5, color:"#8ac878", fontFamily:"'DM Sans',sans-serif", textAlign:"center", marginTop:8 },
  listCheckedDivider: { fontSize:10, color:"#7a6448", letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"'DM Sans',sans-serif", margin:"16px 0 6px" },
  listEmptyState: { textAlign:"center", padding:"36px 16px", color:"#7a6448" },
  listEmptyStateText: { fontSize:13.5, color:"#9a7f60", fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 },

  listMenuBackdrop: { position:"fixed", inset:0, zIndex:40 },
  listMenu: { position:"absolute", top:"110%", right:0, background:"#2a2118", border:"1px solid #4a3c2a", borderRadius:11, padding:6, minWidth:160, boxShadow:"0 14px 36px rgba(0,0,0,0.5)", zIndex:41, display:"flex", flexDirection:"column", gap:2 },
  listMenuItem: { background:"none", border:"none", textAlign:"left", padding:"9px 11px", borderRadius:7, fontSize:13.5, color:"#e8dcc4", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", whiteSpace:"nowrap" },

  // Reorder arrows (custom order)
  listReorder: { display:"flex", flexDirection:"column", flexShrink:0, marginLeft:2 },
  listReorderBtn: { background:"none", border:"none", color:"#9a7f60", fontSize:9, lineHeight:1, cursor:"pointer", padding:"2px 4px" },
  listReorderBtnDim: { color:"#3a2e22", cursor:"default" },
  // Search clear ✕ inside the add box
  listSearchClear: { position:"absolute", right:6, background:"none", border:"none", color:"#7a6448", fontSize:12, cursor:"pointer", padding:"4px 5px", lineHeight:1 },
  listSearchEmpty: { fontSize:13, color:"#9a7f60", fontFamily:"'DM Sans',sans-serif", textAlign:"center", padding:"20px 12px", lineHeight:1.5 },
  // Sort selector
  listSortRow: { display:"flex", alignItems:"center", gap:10, margin:"12px 0 2px" },
  listSortBtn: { background:"#241e16", border:"1px solid #3a2e22", borderRadius:8, padding:"6px 11px", fontSize:12.5, color:"#c8a878", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600, whiteSpace:"nowrap" },
  listSortMenu: { position:"absolute", top:"110%", left:0, background:"#2a2118", border:"1px solid #4a3c2a", borderRadius:11, padding:6, minWidth:150, boxShadow:"0 14px 36px rgba(0,0,0,0.5)", zIndex:41, display:"flex", flexDirection:"column", gap:2 },
  listSortItemOn: { background:"#33281b", color:"#f4c97a", fontWeight:700 },
  listSortHint: { fontSize:11, color:"#7a6448", fontFamily:"'DM Sans',sans-serif" },
  dbrHint: { fontSize:12.5, color:"#9a7f60", fontFamily:"'DM Sans',sans-serif", marginBottom:12, lineHeight:1.45 },
  dbrList: { display:"flex", flexDirection:"column", gap:5, maxHeight:"50vh", overflowY:"auto" },
  dbrRow: { display:"flex", alignItems:"center", gap:11, background:"#1c1712", border:"1.5px solid #3a2e22", borderRadius:9, padding:"10px 12px", cursor:"pointer", textAlign:"left", width:"100%" },
  dbrRowOn: { borderColor:"#c8a878", background:"#241e16" },
  dbrCheck: { width:22, height:22, borderRadius:6, border:"1.5px solid #4a3c2a", background:"#1c1712", color:"#1c1712", fontSize:13, fontWeight:800, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 },
  dbrCheckOn: { background:"#f4c97a", borderColor:"#f4c97a" },
  dbrName: { flex:1, fontSize:14, color:"#f0e0c0", fontFamily:"'DM Sans',sans-serif", minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  dbrCount: { fontSize:11.5, color:"#7a6448", fontFamily:"'DM Sans',sans-serif", background:"#2a2018", borderRadius:8, padding:"1px 8px", flexShrink:0 },
  listMenuItemDim: { opacity:0.4 },

  // Grocery FAB + quick-drawer
  saveErrorBar: { position:"fixed", top:0, left:0, right:0, zIndex:95, background:"#5a1f18", borderBottom:"1px solid #8a3328", display:"flex", alignItems:"center", gap:10, padding:"9px 14px", boxShadow:"0 4px 14px rgba(0,0,0,0.4)" },
  saveErrorText: { flex:1, fontSize:12.5, color:"#f4c4b4", fontFamily:"'DM Sans',sans-serif", lineHeight:1.35, minWidth:0 },
  saveErrorBtns: { display:"flex", alignItems:"center", gap:8, flexShrink:0 },
  saveErrorRetry: { background:"#f4c97a", border:"none", borderRadius:7, padding:"5px 13px", fontSize:12.5, fontWeight:700, color:"#1c1712", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
  saveErrorDismiss: { background:"none", border:"none", color:"#e0a890", fontSize:14, cursor:"pointer", padding:"2px 6px" },
  groceryFab: { position:"fixed", right:16, bottom:72, width:38, height:38, borderRadius:"50%", background:"linear-gradient(135deg,#f4c97a,#e0a84a)", border:"none", boxShadow:"0 6px 16px rgba(0,0,0,0.4)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", zIndex:48 },
  groceryFabBadge: { position:"absolute", top:-4, right:-4, background:"#e07a5f", color:"#fff", fontSize:9, fontWeight:800, minWidth:16, height:16, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", padding:"0 4px", fontFamily:"'DM Sans',sans-serif", border:"1.5px solid #1c1712" },
  groceryOverlay: { position:"fixed", inset:0, background:"rgba(12,10,8,0.6)", zIndex:110, display:"flex", justifyContent:"flex-end", backdropFilter:"blur(2px)" },
  groceryDrawer: { width:"min(400px,90vw)", height:"100%", background:"#221a12", borderLeft:"1px solid #3a2e22", boxShadow:"-12px 0 40px rgba(0,0,0,0.5)", display:"flex", flexDirection:"column", padding:"16px", boxSizing:"border-box", animation:"drawerIn 0.22s ease" },
  groceryDrawerHead: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 },
  groceryDrawerTitle: { display:"flex", alignItems:"center", fontSize:19, fontWeight:700, color:"#f4e4c4", fontFamily:"'Lora',Georgia,serif" },
  groceryDrawerBody: { flex:1, overflowY:"auto", marginTop:4 },
  groceryDrawerFoot: { display:"flex", alignItems:"center", gap:8, paddingTop:12, marginTop:8, borderTop:"1px solid #3a2e22" },

  // Shopping Mode
  shopModeBtn: { width:"100%", background:"#1f3530", border:"1px solid #2a5048", borderRadius:10, padding:"12px", fontSize:15, color:"#7ecfcf", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:700, marginBottom:16 },
  shopRoot: { position:"fixed", inset:0, background:"#15110c", zIndex:120, display:"flex", flexDirection:"column" },
  shopTopBar: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px 10px", background:"#1c1712", borderBottom:"1px solid #2a2018" },
  shopTitle: { fontSize:16, fontWeight:700, color:"#f4e4c4", fontFamily:"'Lora',Georgia,serif" },
  shopProgress: { fontSize:14, fontWeight:700, color:"#7ecfcf", fontFamily:"'DM Sans',sans-serif", minWidth:46, textAlign:"right" },
  shopProgressTrack: { height:3, background:"#2a2018" },
  shopProgressFill: { height:"100%", background:"linear-gradient(90deg,#7ecfcf,#8ac878)", transition:"width 0.25s" },
  shopBanner: { padding:"10px 16px", background:"#1f2e2c", color:"#7ecfcf", fontSize:13, fontFamily:"'DM Sans',sans-serif", display:"flex", alignItems:"center", gap:8 },
  shopBannerErr: { background:"#2e1f1a", color:"#f0a890" },
  shopRetry: { marginLeft:"auto", background:"#3a2418", border:"1px solid #6a4a30", borderRadius:7, padding:"4px 12px", fontSize:12, color:"#f4c97a", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 },
  shopBody: { flex:1, overflowY:"auto", padding:"8px 14px 0", WebkitOverflowScrolling:"touch" },
  shopSection: { marginBottom:14 },
  shopSectionHead: { display:"flex", alignItems:"baseline", gap:8, padding:"8px 4px 6px", borderBottom:"1px solid #2a2018", marginBottom:4, position:"sticky", top:0, background:"#15110c", zIndex:1 },
  shopSectionLabel: { fontSize:14, fontWeight:800, color:"#f4c97a", fontFamily:"'DM Sans',sans-serif", letterSpacing:"0.02em" },
  shopSectionHint: { fontSize:11, color:"#7a6448", fontFamily:"'DM Sans',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  shopDoneHead: { fontSize:12, color:"#6a8a70", letterSpacing:"0.08em", textTransform:"uppercase", fontFamily:"'DM Sans',sans-serif", padding:"14px 4px 6px", borderBottom:"1px solid #2a2018", marginBottom:4 },
  shopRow: { display:"flex", alignItems:"center", gap:13, padding:"14px 6px", borderBottom:"1px solid #201a13", cursor:"pointer", userSelect:"none" },
  shopRowDone: { opacity:0.55 },
  shopCheck: { width:28, height:28, borderRadius:8, border:"2px solid #4a5c4a", background:"#1c1712", color:"#1c1712", fontSize:17, fontWeight:800, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 },
  shopCheckOn: { background:"#8ac878", borderColor:"#8ac878" },
  shopText: { flex:1, fontSize:17, color:"#f0e4d0", fontFamily:"'DM Sans',sans-serif", lineHeight:1.3, wordBreak:"break-word" },
  shopTextDone: { textDecoration:"line-through", color:"#7a6a55" },
  shopQty: { color:"#f4c97a", fontWeight:700 },
  shopAisleBtn: { background:"none", border:"none", fontSize:15, cursor:"pointer", padding:"6px", flexShrink:0, opacity:0.5 },
  shopAddBar: { display:"flex", gap:8, alignItems:"center", padding:"10px 14px", background:"#1c1712", borderTop:"1px solid #2a2018" },
  shopTopRight: { display:"flex", alignItems:"center", gap:10 },
  shopGearBtn: { background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#9a7f60", padding:"2px 4px", lineHeight:1 },
  shopPicker: { background:"#2a2118", border:"1px solid #4a3c2a", borderRadius:16, padding:"16px", width:"100%", maxWidth:380, maxHeight:"78vh", display:"flex", flexDirection:"column" },
  shopPickerTitle: { fontSize:15, fontWeight:700, color:"#f4e4c4", fontFamily:"'DM Sans',sans-serif", marginBottom:12 },
  shopPickerList: { display:"flex", flexDirection:"column", gap:4, overflowY:"auto" },
  shopPickerItem: { background:"#1c1712", border:"1px solid #3a2e22", borderRadius:9, padding:"10px 13px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", textAlign:"left", display:"flex", flexDirection:"column", gap:2 },
  shopPickerItemOn: { background:"#2e2418", borderColor:"#c8a878" },
  shopPickerName: { fontSize:14, fontWeight:700, color:"#f4e4c4", fontFamily:"'DM Sans',sans-serif" },
  shopPickerHint: { fontSize:11.5, color:"#9a7f60", fontFamily:"'DM Sans',sans-serif", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },

  layoutEditor: { background:"#2a2118", border:"1px solid #4a3c2a", borderRadius:16, padding:"18px", width:"100%", maxWidth:440, maxHeight:"88vh", display:"flex", flexDirection:"column" },
  layoutHint: { fontSize:12, color:"#9a7f60", fontFamily:"'DM Sans',sans-serif", marginBottom:12, lineHeight:1.45 },
  layoutList: { display:"flex", flexDirection:"column", gap:8, overflowY:"auto", flex:1 },
  layoutRow: { display:"flex", gap:9, alignItems:"flex-start", background:"#1c1712", border:"1px solid #2a2018", borderRadius:10, padding:"9px" },
  layoutMoveCol: { display:"flex", flexDirection:"column", gap:3, flexShrink:0 },
  layoutMoveBtn: { background:"#2e2418", border:"1px solid #3a2e22", borderRadius:6, width:30, height:26, fontSize:11, color:"#c8a878", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 },
  layoutMoveDim: { opacity:0.3 },
  layoutFoot: { display:"flex", justifyContent:"flex-end", gap:10, paddingTop:14, marginTop:6, borderTop:"1px solid #3a2e22" },
};

const chips = {
  normal: { background:"#1c1712", border:"1px solid #4a3c2a", borderRadius:20, padding:"6px 12px", fontSize:13, color:"#c8a878", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
  recipeChip: { background:"#1e1830", border:"1px solid #3a2858", color:"#c4aae8" },
  small: { background:"#1c1712", border:"1px solid #3a2e22", borderRadius:12, padding:"4px 9px", fontSize:12, color:"#c8a878", cursor:"pointer", fontFamily:"'DM Sans',sans-serif" },
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;500;700&family=DM+Sans:wght@400;500;700&display=swap');
  * { box-sizing: border-box; margin: 0; }
  .day-card:hover { border-color: #5a4a36 !important; transform: translateY(-1px); }
  .meal-slot:hover { background: #2e2418; border-color: #5a4a36 !important; }
  .meal-slot:hover .clear-btn { opacity: 1 !important; }
  .clear-btn:hover { color: #e07a5f !important; }
  .bin-item:hover .bin-remove { opacity: 1 !important; }
  .bin-add-btn:hover { background: #4a3c2a !important; }
  .extras-btn:hover, .clear-week-btn:hover { border-color: #5a4a36 !important; background: #2e2418 !important; }
  .autofill-btn:hover { border-color: #c8a878 !important; background: #3a2e1c !important; }
  .af-shuffle-btn:hover { border-color: #c8a878 !important; color: #f4c97a !important; }
  .af-toggle-row:hover { border-color: #5a4a36 !important; }
  .list-card:hover { border-color: #5a4a36 !important; transform: translateY(-1px); }
  .list-item-del:hover { color: #e07a5f !important; }
  .list-src-icon:hover { opacity: 1 !important; }
  .shop-row:active { background: #221a12; }
  .shop-aisle-btn:hover { opacity: 1 !important; }
  .shop-retry:hover { background: #4a2e1c !important; }
  .shop-picker-item:hover { border-color: #c8a878 !important; }
  .layout-move:hover { background: #3a2e22 !important; color: #f4c97a !important; }
  .list-check:hover { border-color: #8ac878 !important; }
  .list-menu-item:hover { background: #3a2e22 !important; }
  .list-reorder-btn:not(:disabled):hover { color: #f4c97a !important; }
  .list-sort-btn:hover { border-color: #c8a878 !important; }
  .add-grocery-btn:hover { background: #244039 !important; border-color: #3a6a60 !important; }
  .grocery-fab:hover { transform: scale(1.06); }
  .save-error-retry:hover { opacity: 0.9; }
  .save-error-dismiss:hover { color: #f4c4b4 !important; }
  .day-clear-btn:hover { border-color: #e07a5f !important; color: #e07a5f !important; }
  .create-recipe-btn:hover { border-color: #6a4a9a !important; background: #261e3e !important; }
  .remove-grocery-btn:hover { border-color: #8a4838 !important; background: #3a2620 !important; }
  .list-qty-btn:hover { color: #f4e060 !important; }
  .sign-out-btn:hover { border-color: #5a4a36 !important; background: #2e2418 !important; }
  .grocery-fab:active { transform: scale(0.96); }
  @keyframes drawerIn { from{transform:translateX(100%)} to{transform:none} }
  .chip:hover { background: #2e2418 !important; border-color: #c8a878 !important; color: #f0e0c0 !important; }
  .day-chip:hover { background: #2e2418 !important; border-color: #9a7f60 !important; color: #f4e4c4 !important; }
  .day-chip.day-chip-sel, .day-chip.day-chip-sel:hover { background: #3d3020 !important; border-color: #c8a878 !important; color: #f4e4c4 !important; }
  .thaw-toggle:hover { color: #7ecfcf !important; }
  .thaw-day-btn:hover { background: #1f3530 !important; border-color: #4a8a80 !important; color: #9ecfcf !important; }
  .cal-btn:hover { background: #2a5048 !important; }
  .slot-recipe-btn:hover { background: #3a2858 !important; border-color: #6a48a8 !important; }
  .view-recipe-btn:hover { background: #4a3878 !important; }
  .recipe-card:hover { border-color: #5a4a36 !important; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.4); }
  button.type-chip:focus { outline: none; }
  button.type-chip:focus-visible { outline: none; }
  .tag-chip:hover { opacity: 0.8; }
  .tag-chip:disabled { cursor: default; }
  .tag-delete-chip:hover { background: #4a261f !important; border-color: #8a4030 !important; }
  .new-recipe-btn:hover { opacity: 0.9; }
  .import-recipe-btn:hover { border-color: #c8a878 !important; background: #3a2e22 !important; }
  @keyframes importPulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.18);opacity:0.7} }
  .back-btn:hover { color: #c8a878 !important; }
  .detail-edit-btn:hover { background: #3a2e22 !important; border-color: #c8a878 !important; }
  .detail-delete-btn:hover { background: #2a1818 !important; }
  .scaler-btn:hover { background: #4a3c2a !important; }
  .editor-remove-btn:hover { color: #e07a5f !important; }
  .editor-add-btn:hover { border-color: #7a6448 !important; color: #c8a878 !important; }
  .modal-in { animation: modalIn 0.2s ease; }
  @keyframes modalIn { from{opacity:0;transform:translateY(10px) scale(0.97)} to{opacity:1;transform:none} }
  input::placeholder, textarea::placeholder { color: #5a4a36; }
  input:focus, textarea:focus { border-color: #f4c97a88 !important; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #1c1712; }
  ::-webkit-scrollbar-thumb { background: #3a2e22; border-radius: 2px; }
  @media (max-width: 480px) {
    .recipe-grid { grid-template-columns: 1fr 1fr !important; }
  }
`;
