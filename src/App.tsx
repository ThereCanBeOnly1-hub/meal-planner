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
const FALLBACK_SUGGESTIONS = ["Spaghetti Bolognese","Tacos","Grilled Chicken","Stir Fry","Pizza Night","Salmon & Veggies","Burgers","Soup & Bread","Steak Night","Pasta Primavera","Fish Tacos","BBQ Ribs","Chicken Alfredo","Veggie Curry","Breakfast Burritos","Pancakes","French Toast","Omelette","Avocado Toast","Smoothie Bowl","BLT Sandwich","Caesar Salad","Pho","Ramen","Mac & Cheese"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const initialWeek = () => {
  const w = {};
  DAYS.forEach(d => { w[d] = {}; MEAL_SLOTS.forEach(sl => { w[d][sl] = { meal:"", thaw:false, thawDays:2 }; }); });
  return w;
};

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

const scaleAmount = (amount, baseServings, currentServings) => {
  const scaled = (amount / baseServings) * currentServings;
  if (scaled === Math.floor(scaled)) return String(scaled);
  const rounded = Math.round(scaled * 8) / 8;
  const whole = Math.floor(rounded);
  const frac = rounded - whole;
  const fracMap = { 0.125:"⅛", 0.25:"¼", 0.375:"⅜", 0.5:"½", 0.625:"⅝", 0.75:"¾", 0.875:"⅞" };
  if (whole === 0) return fracMap[frac] || rounded.toFixed(2);
  return frac === 0 ? String(whole) : `${whole}${fracMap[frac]||""}`;
};

const newRecipe = () => ({
  id: Date.now().toString(),
  name: "", description: "", url: "", photo: "", notes: "",
  prepTime: "", cookTime: "", baseServings: 4,
  ingredients: [{ id: Date.now().toString(), amount: "", unit: "", name: "" }],
  steps: [{ id: Date.now().toString(), text: "" }],
  mealTypes: [], dietTags: [], cuisineTags: [],
});

// ─── Supabase Config ─────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? "";
const isConfigured = !SUPABASE_URL.includes("PASTE");

const sb = {
  h: () => ({
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  }),
  async get(table, query = "") {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, { headers: this.h() });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async upsert(table, data, onConflict = "") {
    const q = onConflict ? `?on_conflict=${onConflict}` : "";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${q}`, {
      method: "POST",
      headers: { ...this.h(), "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(Array.isArray(data) ? data : [data]),
    });
    if (!r.ok) throw new Error(await r.text());
  },
  async del(table, query) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      method: "DELETE", headers: this.h(),
    });
    if (!r.ok) throw new Error(await r.text());
  },
};

const weekStart = () => {
  const now = new Date(); const dow = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  return mon.toISOString().split("T")[0];
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("planner");
  const [recipes, setRecipes] = useState([]);
  const [recipeView, setRecipeView] = useState(null);
  const [week, setWeek] = useState(initialWeek());
  const [snacks, setSnacks] = useState([]);
  const [desserts, setDesserts] = useState([]);
  const [syncStatus, setSyncStatus] = useState(isConfigured ? "loading" : "unconfigured");
  const [viewedWeekStart, setViewedWeekStart] = useState(weekStart());
  const [nextWeekMeals, setNextWeekMeals] = useState(initialWeek());
  const [customTags, setCustomTags] = useState(() => ({
    mealtypes: loadCustomTags("mealtypes"),
    diets: loadCustomTags("diets"),
    cuisines: loadCustomTags("cuisines"),
  }));
  const [location, setLocation] = useState(() => { try { const s = localStorage.getItem("mealplanner_loc"); return s ? JSON.parse(s) : null; } catch { return null; } });
  const [weatherData, setWeatherData] = useState({});
  const isLoadingRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const syncExtrasLockRef = useRef(false);
  const lastVisibilityLoadRef = useRef(0);
  const mealTimer = useRef(null);
  const extrasTimer = useRef(null);
  const recipesRef = useRef(recipes);
  const isRestoringRef = useRef(false);
  const viewedWeekStartRef = useRef(weekStart());

  useEffect(() => { recipesRef.current = recipes; }, [recipes]);
  useEffect(() => { viewedWeekStartRef.current = viewedWeekStart; }, [viewedWeekStart]);

  const navigate = (newTab: string, newView: any) => {
    setTab(newTab);
    setRecipeView(newView);
    if (!isRestoringRef.current) {
      history.pushState({ tab: newTab, recipeId: newView?.recipe?.id ?? null, recipeEdit: newView?.edit ?? false }, "");
    }
  };

  // Load on mount + poll every 20s
  useEffect(() => {
    history.replaceState({ tab: "planner", recipeId: null, recipeEdit: false }, "");
    const onPopState = (e: PopStateEvent) => {
      if (!e.state || !e.state.tab) return;
      const { tab: t, recipeId, recipeEdit } = e.state;
      isRestoringRef.current = true;
      setTab(t);
      if (recipeId) {
        const recipe = recipesRef.current.find(r => r.id === recipeId);
        setRecipeView(recipe ? { recipe, edit: recipeEdit } : null);
      } else {
        setRecipeView(null);
      }
      isRestoringRef.current = false;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Reload when viewed week changes
  useEffect(() => {
    if (!isConfigured) return;
    hasLoadedRef.current = false;
    setWeek(initialWeek());
    setNextWeekMeals(initialWeek());
    setSnacks([]);
    setDesserts([]);
    loadAll();
  }, [viewedWeekStart]);

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

  // Background poll every 10s + refresh on tab focus
  useEffect(() => {
    if (!isConfigured) return;
    const id = setInterval(loadAll, 10000);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastVisibilityLoadRef.current < 5000) return;
      lastVisibilityLoadRef.current = now;
      loadAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  // Sync meals to DB when week changes (debounced 300ms)
  useEffect(() => {
    if (isLoadingRef.current || !hasLoadedRef.current || !isConfigured) return;
    clearTimeout(mealTimer.current);
    mealTimer.current = setTimeout(() => syncMeals(week), 300);
  }, [week]);

  // Sync extras to DB when snacks/desserts change (debounced 300ms)
  useEffect(() => {
    if (isLoadingRef.current || !hasLoadedRef.current || !isConfigured) return;
    clearTimeout(extrasTimer.current);
    extrasTimer.current = setTimeout(() => syncExtras(snacks, desserts), 300);
  }, [snacks, desserts]);

  const saveCustomTagsToDB = async (tags) => {
    if (!isConfigured) return;
    try { await sb.upsert("app_settings", [{ key: "custom_tags", value: tags }], "key"); }
    catch (e) { console.error("Custom tag save failed:", e); }
  };

  const addCustomTag = (type, tag) => {
    setCustomTags(prev => {
      const next = { ...prev, [type]: prev[type].includes(tag) ? prev[type] : [...prev[type], tag] };
      if (isConfigured) saveCustomTagsToDB(next);
      else saveCustomTags(type, next[type]);
      return next;
    });
  };

  const loadAll = async () => {
    if (isLoadingRef.current) return;
    try {
      isLoadingRef.current = true;
      setSyncStatus("syncing");
      const ws = viewedWeekStartRef.current;

      const nextWs = addWeeks(ws, 1);
      const [mealsRows, nextMealsRows, recipeRows, extrasRows] = await Promise.all([
        sb.get("meals", `?week_start=eq.${ws}`),
        sb.get("meals", `?week_start=eq.${nextWs}`),
        sb.get("recipes", "?order=created_at.asc"),
        sb.get("extras", `?week_start=eq.${ws}&order=created_at.asc`),
      ]);
      const settingsRows = await sb.get("app_settings", "?key=eq.custom_tags").catch(() => []);

      const parseWeekRows = (rows) => {
        const w = initialWeek();
        rows.forEach(row => {
          if (w[row.day]?.[row.slot] !== undefined)
            w[row.day][row.slot] = { meal: row.meal_name || "", thaw: row.thaw || false, thawDays: row.thaw_days || 2, recipeId: row.recipe_id || null };
        });
        return w;
      };
      setWeek(parseWeekRows(mealsRows));
      setNextWeekMeals(parseWeekRows(nextMealsRows));

      setRecipes(recipeRows.map(r => ({
        id: r.id, name: r.name, description: r.description || "",
        url: r.url || "", photo: r.photo || "", notes: r.notes || "",
        prepTime: r.prep_time || "", cookTime: r.cook_time || "",
        baseServings: r.base_servings || 4,
        mealTypes: r.meal_types || [], dietTags: r.diet_tags || [], cuisineTags: r.cuisine_tags || [],
        ingredients: r.ingredients || [], steps: r.steps || [],
      })));

      setSnacks(extrasRows.filter(e => e.type === "snack").map(e => e.name));
      setDesserts(extrasRows.filter(e => e.type === "dessert").map(e => e.name));

      if (settingsRows.length > 0 && settingsRows[0].value) {
        setCustomTags(prev => ({ ...prev, ...settingsRows[0].value }));
      }

      hasLoadedRef.current = true;
      setSyncStatus("synced");
    } catch (err) {
      console.error("Load error:", err);
      setSyncStatus("error");
    } finally {
      isLoadingRef.current = false;
    }
  };

  const syncMeals = async (weekData) => {
    try {
      const ws = viewedWeekStartRef.current;
      const rows = [];
      DAYS.forEach(day => MEAL_SLOTS.forEach(slot => {
        const e = weekData[day][slot];
        rows.push({ week_start: ws, day, slot,
          meal_name: e.meal || "", thaw: e.thaw || false,
          thaw_days: e.thawDays || 2, recipe_id: e.recipeId || null,
          updated_at: new Date().toISOString() });
      }));
      await sb.upsert("meals", rows, "week_start,day,slot");
      setSyncStatus("synced");
    } catch (err) { console.error("Sync meals:", err); setSyncStatus("error"); }
  };

  const syncExtras = async (snackList, dessertList) => {
    if (syncExtrasLockRef.current) return;
    syncExtrasLockRef.current = true;
    try {
      const ws = viewedWeekStartRef.current;
      await sb.del("extras", `week_start=eq.${ws}`);
      const rows = [
        ...snackList.map(name => ({ week_start: ws, type: "snack", name })),
        ...dessertList.map(name => ({ week_start: ws, type: "dessert", name })),
      ];
      if (rows.length > 0) await sb.upsert("extras", rows);
      setSyncStatus("synced");
    } catch (err) { console.error("Sync extras:", err); setSyncStatus("error"); }
    finally { syncExtrasLockRef.current = false; }
  };

  const saveRecipe = async (recipe) => {
    setRecipes(prev => {
      const exists = prev.find(r => r.id === recipe.id);
      return exists ? prev.map(r => r.id === recipe.id ? recipe : r) : [...prev, recipe];
    });
    navigate("recipes", { recipe });
    if (isConfigured) {
      try {
        await sb.upsert("recipes", [{
          id: recipe.id, name: recipe.name, description: recipe.description,
          url: recipe.url, photo: recipe.photo, notes: recipe.notes,
          prep_time: recipe.prepTime, cook_time: recipe.cookTime,
          base_servings: recipe.baseServings, meal_types: recipe.mealTypes,
          diet_tags: recipe.dietTags, cuisine_tags: recipe.cuisineTags,
          ingredients: recipe.ingredients, steps: recipe.steps,
          updated_at: new Date().toISOString(),
        }]);
        setSyncStatus("synced");
      } catch (err) { console.error("Save recipe:", err); setSyncStatus("error"); }
    }
  };

  const deleteRecipe = async (id) => {
    setRecipes(prev => prev.filter(r => r.id !== id));
    navigate("recipes", null);
    if (isConfigured) {
      try {
        await sb.del("recipes", `id=eq.${id}`);
        setSyncStatus("synced");
      } catch (err) { console.error("Delete recipe:", err); setSyncStatus("error"); }
    }
  };

  const recipesBySlot = (slot) => recipes.filter(r => r.mealTypes.includes(slot)).map(r => r.name);

  return (
    <div style={s.appRoot}>
      <style>{css}</style>
      <div style={s.appBody}>
        {tab === "planner" && (
          <PlannerView recipesBySlot={recipesBySlot} recipes={recipes}
            week={week} setWeek={setWeek}
            snacks={snacks} setSnacks={setSnacks}
            desserts={desserts} setDesserts={setDesserts}
            syncStatus={syncStatus}
            viewedWeekStart={viewedWeekStart}
            nextWeekMeals={nextWeekMeals}
            weatherData={weatherData}
            onPrevWeek={() => setViewedWeekStart(ws => addWeeks(ws, -1))}
            onNextWeek={() => setViewedWeekStart(ws => addWeeks(ws, 1))}
            onGoToWeek={(ws) => setViewedWeekStart(ws)}
            onGoToToday={() => setViewedWeekStart(weekStart())}
            onViewRecipe={(name) => {
              const r = recipes.find(r => r.name.toLowerCase() === name.toLowerCase());
              if (r) navigate("recipes", { recipe: r });
            }} />
        )}
        {tab === "recipes" && (
          <RecipesView recipes={recipes} view={recipeView} setView={(v) => navigate("recipes", v)}
            onSave={saveRecipe} onDelete={deleteRecipe}
            customTags={customTags} onAddCustomTag={addCustomTag} />
        )}
      </div>
      <nav style={s.bottomNav}>
        <button style={{ ...s.navBtn, ...(tab==="planner"?s.navBtnActive:{}) }} onClick={() => navigate("planner", null)}>
          <span style={s.navIcon}>📅</span>
          <span style={s.navLabel}>Planner</span>
        </button>
        <button style={{ ...s.navBtn, ...(tab==="recipes"?s.navBtnActive:{}) }} onClick={() => navigate("recipes", null)}>
          <span style={s.navIcon}>📖</span>
          <span style={s.navLabel}>Recipes</span>
          {recipes.length > 0 && <span style={s.navBadge}>{recipes.length}</span>}
        </button>
      </nav>
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

function PlannerView({ recipesBySlot, recipes, onViewRecipe, week, setWeek, snacks, setSnacks, desserts, setDesserts, syncStatus, viewedWeekStart, nextWeekMeals, weatherData, onPrevWeek, onNextWeek, onGoToWeek, onGoToToday }) {
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
      else if (panelOpen) { setPanelOpen(false); }
      isRestoringRef.current = false;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [modal, showClearConfirm, panelOpen]);

  const openModal = (day, slot) => {
    const cur = week[day][slot];
    setModal({ day, slot }); setInputVal(cur.meal);
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
    const matchedRecipe = val ? recipes.find(r => r.name.toLowerCase() === val.trim().toLowerCase()) : null;
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

  const clearWeek = () => { setWeek(initialWeek()); setShowClearConfirm(false); history.back(); };

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

  // Suggestions: recipe library first, then fallbacks
  const getSuggestions = (slot, query) => {
    const libNames = recipesBySlot(slot);
    const all = [...new Set([...libNames, ...FALLBACK_SUGGESTIONS])];
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
        items.push({ mealName:e.meal, slot, day, thawDays:e.thawDays, thawDate:td, ws });
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
            <button style={s.clearWeekBtn} className="clear-week-btn" onClick={() => { setShowClearConfirm(true); history.pushState({ overlay: "clearConfirm" }, ""); }} title="Clear week">
              <span style={{fontSize:14}}>🗑</span>
              <span style={s.clearWeekLabel}>Clear</span>
            </button>
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
                            {val ? <span style={s.slotMeal}>{val}</span> : <span style={s.slotPlaceholder}>+ Add</span>}
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
              const byName = inputVal.trim() ? recipes.find(r => r.name.toLowerCase() === inputVal.trim().toLowerCase()) : null;
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

            {/* Suggestions */}
            <div style={s.sugs}>
              <div style={s.sugsLbl}>{inputVal.length>0?"Suggestions":"Quick picks"}</div>
              <div style={s.sugsList}>
                {getSuggestions(modal.slot, inputVal.length>0?inputVal:"").map(m => {
                  const isFromLib = recipes.some(r=>r.name.toLowerCase()===m.toLowerCase());
                  return (
                    <button key={m} style={{...chips.normal,...(isFromLib?chips.recipeChip:{})}} className="chip" onClick={()=>setInputVal(m)}>
                      {isFromLib && <span style={{marginRight:4,fontSize:10}}>📖</span>}{m}
                    </button>
                  );
                })}
              </div>
            </div>

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
function RecipesView({ recipes, view, setView, onSave, onDelete, customTags, onAddCustomTag }) {
  if (view && view.edit) return <RecipeEditor recipe={view.recipe} onSave={onSave} onCancel={()=>setView(view.recipe?{recipe:view.recipe}:null)} customTags={customTags} onAddCustomTag={onAddCustomTag} />;
  if (view && view.recipe) return <RecipeDetail recipe={view.recipe} onEdit={()=>setView({recipe:view.recipe,edit:true})} onDelete={onDelete} onBack={()=>setView(null)} />;
  return <RecipeGrid recipes={recipes} onNew={()=>setView({recipe:newRecipe(),edit:true})} onSelect={r=>setView({recipe:r})} customTags={customTags} onAddCustomTag={onAddCustomTag} />;
}

// ─── Tag Picker ───────────────────────────────────────────────────────────────
function TagPicker({ label, defaultTags, customTagsList, onAddCustomTag, selected, onToggle, chipStyle, chipActiveStyle }) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const allTags = [...defaultTags, ...(customTagsList||[]).filter(t => !defaultTags.includes(t))];
  const addCustom = () => {
    const v = input.trim(); if (!v) return;
    onAddCustomTag(v);
    if (!selected.includes(v)) onToggle(v);
    setInput(""); setAdding(false);
  };
  return (
    <div style={s.editorField}>
      <label style={s.editorLabel}>{label}</label>
      <div style={s.tagPicker}>
        {allTags.map(t => (
          <button key={t} style={{...s.tagPickerChip,...(selected.includes(t)?chipActiveStyle:{})}} className="tag-chip" onClick={()=>onToggle(t)}>{t}</button>
        ))}
        {!adding && <button style={s.addCustomChip} onClick={()=>setAdding(true)}>+ Custom</button>}
      </div>
      {adding && (
        <div style={s.customTagRow}>
          <input style={{...s.editorInput,flex:1}} autoFocus placeholder="New tag…" value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")addCustom();if(e.key==="Escape"){setAdding(false);setInput("");}}} />
          <button style={s.btnSave} onClick={addCustom}>Add</button>
          <button style={s.btnClear} onClick={()=>{setAdding(false);setInput("");}}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Recipe Grid ──────────────────────────────────────────────────────────────
function RecipeGrid({ recipes, onNew, onSelect, customTags, onAddCustomTag }) {
  const [filter, setFilter] = useState("");
  const [activeFilters, setActiveFilters] = useState(new Set());
  const [openFilter, setOpenFilter] = useState(null);

  const toggleFilter = (tag) => setActiveFilters(prev => { const n=new Set(prev); n.has(tag)?n.delete(tag):n.add(tag); return n; });
  const resetAll = () => { setFilter(""); setActiveFilters(new Set()); setOpenFilter(null); };

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
        <button style={s.newRecipeBtn} className="new-recipe-btn" onClick={onNew}>+ New</button>
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
    </div>
  );
}

// ─── Recipe Detail ────────────────────────────────────────────────────────────
function RecipeDetail({ recipe, onEdit, onDelete, onBack }) {
  const [servings, setServings] = useState(recipe.baseServings || 4);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isRestoringRef = useRef(false);

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
        {recipe.url && <a href={recipe.url} target="_blank" rel="noopener noreferrer" style={s.detailUrl}>🔗 View original recipe</a>}

        {/* Notes */}
        {recipe.notes && (
          <div style={s.detailSection}>
            <div style={s.detailSectionTitle}>Notes</div>
            <p style={s.detailNotes}>{recipe.notes}</p>
          </div>
        )}

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
                const scaledAmt = ing.amount ? scaleAmount(parseFloat(ing.amount)||0, recipe.baseServings, servings) : "";
                return (
                  <div key={ing.id} style={s.ingredientRow}>
                    <span style={s.ingredientDot} />
                    <span style={s.ingredientAmt}>{scaledAmt} {ing.unit}</span>
                    <span style={s.ingredientName}>{ing.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Steps */}
        {recipe.steps.length>0 && recipe.steps.some(st=>st.text) && (
          <div style={s.detailSection}>
            <div style={s.detailSectionTitle}>Instructions</div>
            <div style={s.stepList}>
              {recipe.steps.filter(st=>st.text).map((step,i) => (
                <div key={step.id} style={s.stepRow}>
                  <div style={s.stepNum}>{i+1}</div>
                  <div style={s.stepText}>{step.text}</div>
                </div>
              ))}
            </div>
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
function RecipeEditor({ recipe: initialRecipe, onSave, onCancel, customTags, onAddCustomTag }) {
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

        {/* Notes */}
        <div style={s.editorField}>
          <label style={s.editorLabel}>Notes</label>
          <textarea style={s.editorTextarea} placeholder="Tips, substitutions, things to remember…" value={r.notes||""} onChange={e=>set("notes",e.target.value)} rows={3} />
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
          customTagsList={customTags?.mealtypes} onAddCustomTag={t=>onAddCustomTag("mealtypes",t)}
          selected={r.mealTypes} onToggle={toggleMealType} chipActiveStyle={s.tagPickerChipOn} />

        {/* Diet Tags */}
        <TagPicker label="Dietary Tags" defaultTags={DIET_TAGS}
          customTagsList={customTags?.diets} onAddCustomTag={t=>onAddCustomTag("diets",t)}
          selected={r.dietTags} onToggle={toggleDietTag} chipActiveStyle={s.tagPickerDietOn} />

        {/* Cuisine Tags */}
        <TagPicker label="Cuisine" defaultTags={CUISINE_TAGS}
          customTagsList={customTags?.cuisines} onAddCustomTag={t=>onAddCustomTag("cuisines",t)}
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

        <div style={{height:40}} />
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const BASE = { fontFamily:"'DM Sans',sans-serif" };
const s = {
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
  recipeCardContent: { padding:"10px 12px 12px", display:"flex", flexDirection:"column", gap:5, flex:1, justifyContent:"space-between" },
  recipeCardName: { fontSize:14, fontWeight:700, color:"#f4e4c4", fontFamily:"'Lora',Georgia,serif", lineHeight:1.2 },
  recipeCardTime: { fontSize:11, color:"#9a7f60", fontFamily:"'DM Sans',sans-serif" },
  recipeCardTimes: { display:"flex", gap:8, flexWrap:"wrap" },
  recipeTime: { fontSize:11, color:"#9a7f60", fontFamily:"'DM Sans',sans-serif" },
  recipeCardDesc: { fontSize:12, color:"#9a7f60", fontFamily:"'DM Sans',sans-serif", lineHeight:1.4, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" },
  recipeCardBottom: { display:"flex", alignItems:"center", justifyContent:"space-between" },
  recipeCardTags: { display:"flex", gap:4, flexWrap:"wrap", flex:1 },
  recipeCardLink: { fontSize:14, flexShrink:0 },

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
  ingredientRow: { display:"flex", alignItems:"center", gap:8, padding:"9px 12px", background:"#241e16", borderRadius:9 },
  ingredientDot: { width:5, height:5, borderRadius:"50%", background:"#c8a878", flexShrink:0 },
  ingredientAmt: { fontSize:13, fontWeight:700, color:"#f4c97a", fontFamily:"'DM Sans',sans-serif", minWidth:50 },
  ingredientName: { fontSize:14, color:"#f0e0c0", fontFamily:"'DM Sans',sans-serif" },

  stepList: { display:"flex", flexDirection:"column", gap:10 },
  stepRow: { display:"flex", gap:12, alignItems:"flex-start" },
  stepNum: { width:26, height:26, borderRadius:"50%", background:"#3a2e22", color:"#c8a878", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontFamily:"'DM Sans',sans-serif", marginTop:2 },
  stepText: { fontSize:14, color:"#e0d0b8", fontFamily:"'DM Sans',sans-serif", lineHeight:1.6, flex:1 },

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
  .new-recipe-btn:hover { opacity: 0.9; }
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
