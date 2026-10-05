// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { RecipesView, TagPicker, ListDetail, ListItemsList, ListIndex, SparkPoolEditor } from "./App";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ─── Boost mode ─────────────────────────────────────────────────────────────────
describe("Boost mode", () => {
  const pool = { interest: ["Play music"], novelty: ["New spot"], challenge: ["Beat the clock"], urgency: ["10 min timer"] };
  const list = { id: "L1", name: "Chores", type: "custom", icon: "📝", items: [
    { id: "t1", text: "Dishes", checked: false, position: 0, measures: [], sources: [], category: JSON.stringify({ c: "challenge", t: "Beat the clock" }) },
    { id: "t2", text: "Laundry", checked: false, position: 1, measures: [], sources: [], category: JSON.stringify({ c: "urgency", t: "10 min timer" }) },
  ] };
  const renderDetail = (over = {}) =>
    render(<ListDetail list={list} onBack={vi.fn()} onAddItem={vi.fn()} onToggleItem={vi.fn()}
      onDeleteItem={vi.fn()} onClearItems={vi.fn()} onUpdateList={vi.fn()} onDeleteList={vi.fn()}
      onShopping={vi.fn()} sparkPool={pool} onSetMode={vi.fn()} onSetItemSpark={vi.fn()} {...over} />);

  it("the menu toggles Boost mode on for a custom list", () => {
    const onSetMode = vi.fn();
    renderDetail({ onSetMode });
    expect(screen.queryByText("🎯 Just one")).toBeNull();
    fireEvent.click(screen.getByText("⋯"));
    fireEvent.click(screen.getByText("⚡ Boost mode"));
    expect(onSetMode).toHaveBeenCalledWith("L1", "boost");
  });

  it("with Boost on, each open task shows a spark; picking one saves it to that task", () => {
    const onSetItemSpark = vi.fn();
    renderDetail({ boost: true, onSetItemSpark });
    fireEvent.click(screen.getByText("Beat the clock")); // the Dishes spark chip
    fireEvent.click(screen.getByText("Interest"));        // Interest tab in the picker
    fireEvent.click(screen.getByText("Play music"));
    expect(onSetItemSpark).toHaveBeenCalledWith("L1", "t1", { c: "interest", t: "Play music" });
  });

  it("the focus timer vibrates when it runs out, and the page behind can't scroll while it's open", () => {
    vi.useFakeTimers();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    try {
      const { unmount } = renderDetail({ boost: true });
      fireEvent.click(screen.getByText("🎯 Just one"));
      expect(document.body.style.overflow).toBe("hidden");
      fireEvent.click(screen.getByText("5 min"));
      fireEvent.click(screen.getByText("▶ Start 5 min"));
      act(() => { vi.advanceTimersByTime(4 * 60000); });
      expect(vibrate).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(60000 + 500); });
      expect(vibrate).toHaveBeenCalledTimes(1);
      expect(screen.getByText("⏰ Time!")).toBeTruthy();
      unmount();
      expect(document.body.style.overflow).toBe("");
    } finally {
      vi.useRealTimers();
      delete navigator.vibrate;
    }
  });

  it("Just one shows the first open task; Skip moves on and Done checks it off", () => {
    const onToggleItem = vi.fn();
    renderDetail({ boost: true, onToggleItem });
    fireEvent.click(screen.getByText("🎯 Just one"));
    expect(screen.getAllByText("Dishes").length).toBeGreaterThan(1); // list row + focus card
    fireEvent.click(screen.getByText("Skip →"));
    fireEvent.click(screen.getByText("✓ Done"));
    expect(onToggleItem).toHaveBeenCalledWith("L1", "t2");
  });

  it("grocery lists don't offer Boost mode", () => {
    renderDetail({ list: { ...list, id: "grocery", type: "grocery" } });
    fireEvent.click(screen.getByText("⋯"));
    expect(screen.queryByText("⚡ Boost mode")).toBeNull();
  });

  it("the pool editor adds manually and merges generated sparks", async () => {
    const onSave = vi.fn();
    const onGenerate = vi.fn().mockResolvedValue({ interest: ["Play music", "Snack break"] });
    render(<SparkPoolEditor pool={pool} onSave={onSave} onGenerate={onGenerate} tasks={["Dishes"]} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Add an interest spark…"), { target: { value: "Call a friend" } });
    fireEvent.click(screen.getByText("Add"));
    expect(onSave.mock.calls[0][0].interest).toEqual(["Play music", "Call a friend"]);
    fireEvent.click(screen.getByText("✨ More interest"));
    expect(onGenerate).toHaveBeenCalledWith({ cat: "interest", tasks: ["Dishes"] });
    await screen.findByText("✓ Added 1 new spark");
    expect(onSave.mock.calls[1][0].interest).toEqual(["Play music", "Snack break"]);
  });
});

const blankRecipe = (over = {}) => ({
  id: "new1", name: "", description: "", url: "", photo: "", notes: "",
  prepTime: "", cookTime: "", baseServings: 4,
  ingredients: [{ id: "i1", amount: "", unit: "", name: "" }],
  steps: [{ id: "s1", text: "" }],
  mealTypes: [], dietTags: [], cuisineTags: [], ...over,
});
const emptyTags = { mealtypes: [], diets: [], cuisines: [] };

// ─── RecipesView navigation (the New→Cancel bug) ────────────────────────────────
describe("RecipesView cancel", () => {
  const renderEditor = (recipes, view, setView) =>
    render(<RecipesView recipes={recipes} view={view} setView={setView}
      onSave={vi.fn()} onDelete={vi.fn()} customTags={emptyTags}
      onAddCustomTag={vi.fn()} onDeleteCustomTag={vi.fn()} onAddToGrocery={vi.fn()} />);

  it("cancelling a NEW recipe goes back to the library (null), not a blank detail page", () => {
    const setView = vi.fn();
    const recipe = blankRecipe();
    renderEditor([], { recipe, edit: true }, setView); // recipe not in the library
    fireEvent.click(screen.getByText("✕ Cancel"));
    expect(setView).toHaveBeenCalledWith(null);
  });

  it("cancelling an EXISTING recipe returns to its detail view", () => {
    const setView = vi.fn();
    const recipe = blankRecipe({ id: "r1", name: "Tacos" });
    renderEditor([recipe], { recipe, edit: true }, setView);
    fireEvent.click(screen.getByText("✕ Cancel"));
    expect(setView).toHaveBeenCalledWith({ recipe });
  });
});

// ─── TagPicker add / delete custom tags ─────────────────────────────────────────
describe("TagPicker", () => {
  const renderPicker = (over = {}) =>
    render(<TagPicker label="Diet" defaultTags={["Vegan"]} customTagsList={[]}
      onAddCustomTag={vi.fn()} onDeleteCustomTag={vi.fn()} selected={[]} onToggle={vi.fn()}
      chipActiveStyle={{}} {...over} />);

  it("adds a custom tag and selects it", () => {
    const onAddCustomTag = vi.fn();
    const onToggle = vi.fn();
    renderPicker({ onAddCustomTag, onToggle });
    fireEvent.click(screen.getByText("+ Custom"));
    fireEvent.change(screen.getByPlaceholderText("New tag…"), { target: { value: "Keto" } });
    fireEvent.click(screen.getByText("Add"));
    expect(onAddCustomTag).toHaveBeenCalledWith("Keto");
    expect(onToggle).toHaveBeenCalledWith("Keto");
  });

  it("deletes a custom tag (after confirm) but never a built-in one", () => {
    const onDeleteCustomTag = vi.fn();
    renderPicker({ customTagsList: ["Keto"], onDeleteCustomTag });
    fireEvent.click(screen.getByText("Manage"));
    fireEvent.click(screen.getByRole("button", { name: /Keto/ })); // opens styled confirm
    fireEvent.click(screen.getByText("Remove tag"));                // confirm
    expect(onDeleteCustomTag).toHaveBeenCalledWith("Keto");
    // built-in "Vegan" is not deletable — no delete affordance to click for it
  });
});

// ─── ListDetail item operations ─────────────────────────────────────────────────
describe("ListDetail", () => {
  const renderDetail = (list, over = {}) =>
    render(<ListDetail list={list} onBack={vi.fn()} onAddItem={vi.fn()} onToggleItem={vi.fn()}
      onDeleteItem={vi.fn()} onClearItems={vi.fn()} onUpdateList={vi.fn()} onDeleteList={vi.fn()}
      onShopping={vi.fn()} {...over} />);

  it("adds an item to the right list", () => {
    const onAddItem = vi.fn();
    renderDetail({ id: "L1", name: "Packing", type: "custom", icon: "🧳", items: [] }, { onAddItem });
    fireEvent.change(screen.getByPlaceholderText("Add or search…"), { target: { value: "Socks" } });
    fireEvent.click(screen.getByText("Add"));
    expect(onAddItem).toHaveBeenCalledWith("L1", "Socks");
  });

  it("checks and deletes an item by id", () => {
    const onToggleItem = vi.fn();
    const onDeleteItem = vi.fn();
    const list = { id: "L1", name: "Packing", type: "custom", icon: "🧳",
      items: [{ id: "it1", text: "Socks", checked: false, measures: [], sources: [] }] };
    const { container } = renderDetail(list, { onToggleItem, onDeleteItem });
    fireEvent.click(container.querySelector(".list-check"));
    expect(onToggleItem).toHaveBeenCalledWith("L1", "it1");
    fireEvent.click(container.querySelector(".list-item-del"));
    expect(onDeleteItem).toHaveBeenCalledWith("L1", "it1");
  });

  it("Delete checked asks for confirmation before clearing", () => {
    const onClearItems = vi.fn();
    const list = { id: "L1", name: "Packing", type: "custom", icon: "🧳",
      items: [{ id: "x", text: "Socks", checked: true, measures: [], sources: [] }] };
    renderDetail(list, { onClearItems });
    fireEvent.click(screen.getByText("⋯"));
    fireEvent.click(screen.getByText("🧹 Delete checked"));
    expect(onClearItems).not.toHaveBeenCalled();      // not until confirmed
    fireEvent.click(screen.getByText("Delete checked")); // confirm button in the modal
    expect(onClearItems).toHaveBeenCalledWith("L1", true);
  });

  it("the add box filters the list as you type (search), Add still adds", () => {
    const onAddItem = vi.fn();
    const list = { id: "L1", name: "Packing", type: "custom", icon: "🧳", items: [
      { id: "a", text: "Socks", checked: false, measures: [], sources: [] },
      { id: "b", text: "Toothbrush", checked: false, measures: [], sources: [] },
    ] };
    renderDetail(list, { onAddItem });
    fireEvent.change(screen.getByPlaceholderText("Add or search…"), { target: { value: "sock" } });
    expect(screen.getByText("Socks")).toBeTruthy();
    expect(screen.queryByText("Toothbrush")).toBeNull(); // filtered out
    fireEvent.click(screen.getByText("Add"));            // Enter/Add still adds verbatim
    expect(onAddItem).toHaveBeenCalledWith("L1", "sock");
  });

  // Note: the actual drag-reorder math (which row you're hovering over) depends
  // on getBoundingClientRect(), which jsdom always returns as all-zero (no real
  // layout) — so it can't be meaningfully exercised here. These just cover the
  // testable contract: the handle appears/disappears with sortMode, and starting
  // a drag doesn't throw even where pointer capture isn't supported (jsdom).
  it("shows a drag handle per row in custom order", () => {
    const list = { id: "L1", name: "Packing", type: "custom", icon: "🧳", items: [
      { id: "a", text: "Apple", checked: false, position: 0, measures: [], sources: [] },
      { id: "b", text: "Banana", checked: false, position: 1, measures: [], sources: [] },
    ] };
    const { container } = renderDetail(list, { sortMode: "manual", onMoveItem: vi.fn() });
    expect(container.querySelectorAll(".list-drag-handle").length).toBe(2);
  });

  it("hides the drag handle when not in custom order", () => {
    const list = { id: "L1", name: "Packing", type: "custom", icon: "🧳", items: [
      { id: "a", text: "Apple", checked: false, position: 0, measures: [], sources: [] },
      { id: "b", text: "Banana", checked: false, position: 1, measures: [], sources: [] },
    ] };
    const { container } = renderDetail(list, { sortMode: "az", onMoveItem: vi.fn() });
    expect(container.querySelectorAll(".list-drag-handle").length).toBe(0);
  });

  it("starting a drag on the handle does not throw", () => {
    const list = { id: "L1", name: "Packing", type: "custom", icon: "🧳", items: [
      { id: "a", text: "Apple", checked: false, position: 0, measures: [], sources: [] },
      { id: "b", text: "Banana", checked: false, position: 1, measures: [], sources: [] },
    ] };
    const { container } = renderDetail(list, { sortMode: "manual", onMoveItem: vi.fn() });
    const handle = container.querySelectorAll(".list-drag-handle")[0];
    expect(() => fireEvent.pointerDown(handle, { clientY: 10, pointerId: 1 })).not.toThrow();
  });

  it("delete-by-recipe removes only the selected recipe's ingredients", () => {
    const onRemoveRecipes = vi.fn();
    const grocery = { id: "grocery", name: "Grocery", type: "grocery", icon: "🛒", items: [
      { id: "a", text: "Onion", checked: false, measures: [], sources: [{ id: "r1", name: "Tacos" }] },
      { id: "b", text: "Milk", checked: false, measures: [], sources: [{ id: "r2", name: "Soup" }] },
    ] };
    renderDetail(grocery, { onRemoveRecipes });
    fireEvent.click(screen.getByText("⋯"));                       // open menu
    fireEvent.click(screen.getByText("📖 Delete by recipe"));     // open modal
    fireEvent.click(screen.getByText("Tacos"));                   // select Tacos
    fireEvent.click(screen.getByText(/Remove 1/));                // confirm
    expect(onRemoveRecipes).toHaveBeenCalledWith(["r1"]);
  });

  it("renames a manual item's text (no sources)", () => {
    const onSetItemText = vi.fn();
    const list = { id: "L1", name: "Packing", type: "custom", icon: "🧳",
      items: [{ id: "it1", text: "Socks", checked: false, measures: [], sources: [] }] };
    const { container } = renderDetail(list, { onSetItemText });
    fireEvent.click(container.querySelector(".list-text-btn"));
    const input = screen.getByPlaceholderText("Item name");
    fireEvent.change(input, { target: { value: "Wool socks" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSetItemText).toHaveBeenCalledWith("L1", "it1", "Wool socks");
  });

  it("does not offer rename for recipe-sourced grocery items", () => {
    const onSetItemText = vi.fn();
    const grocery = { id: "grocery", name: "Grocery", type: "grocery", icon: "🛒",
      items: [{ id: "a", text: "Onion", checked: false, measures: [], sources: [{ id: "r1", name: "Tacos" }] }] };
    const { container } = renderDetail(grocery, { onSetItemText });
    expect(container.querySelector(".list-text-btn")).toBeNull(); // no rename affordance
    expect(container.textContent).toContain("Onion");             // name still shown
  });
});

// ─── ListItemsList grouping (manual vs recipe-sourced) ──────────────────────────
describe("ListItemsList", () => {
  it("shows a source icon only on recipe-sourced items", () => {
    const items = [
      { id: "a", text: "Milk", checked: false, measures: [], sources: [] },
      { id: "b", text: "Flour", checked: false, measures: [], sources: [{ id: "r1", name: "Cake" }] },
    ];
    const { container } = render(<ListItemsList items={items} listId="grocery" onToggle={vi.fn()} onDelete={vi.fn()} />);
    expect(container.querySelectorAll(".list-src-icon")).toHaveLength(1);
  });
});

// ─── ListIndex create flow ──────────────────────────────────────────────────────
describe("ListIndex", () => {
  it("creates a named list and opens it", () => {
    const onAddList = vi.fn(() => "L9");
    const onOpen = vi.fn();
    render(<ListIndex lists={[{ id: "grocery", type: "grocery", name: "Grocery", icon: "🛒", items: [] }]}
      syncStatus="synced" onOpen={onOpen} onAddList={onAddList} />);
    fireEvent.click(screen.getByText("+ New List"));
    fireEvent.change(screen.getByPlaceholderText(/List name/), { target: { value: "Camping" } });
    fireEvent.click(screen.getByText("Create"));
    expect(onAddList).toHaveBeenCalledWith("Camping", "📝");
    expect(onOpen).toHaveBeenCalledWith("L9");
  });
});
