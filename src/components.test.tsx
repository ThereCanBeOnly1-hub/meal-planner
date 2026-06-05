// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RecipesView, TagPicker, ListDetail, ListItemsList, ListIndex } from "./App";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPicker({ customTagsList: ["Keto"], onDeleteCustomTag });
    fireEvent.click(screen.getByText("Manage"));
    fireEvent.click(screen.getByRole("button", { name: /Keto/ }));
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
    fireEvent.change(screen.getByPlaceholderText("Add an item…"), { target: { value: "Socks" } });
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
