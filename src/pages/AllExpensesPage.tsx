import { useMemo, useState } from "react";
import { useStore } from "../store";
import { ExpenseList } from "../components/ExpenseList";
import { AddExpenseModal } from "../components/AddExpenseModal";
import { SettleUpModal } from "../components/SettleUpModal";
import { CATEGORIES, CATEGORY_META } from "../utils/categories";
import type { ExpenseCategory } from "../types";

export function AllExpensesPage() {
  const { state, dispatch } = useStore();
  const [addingExpense, setAddingExpense] = useState(false);
  const [settling, setSettling] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | ExpenseCategory>("all");

  const expenses = useMemo(
    () =>
      state.expenses.filter((expense) => {
        const matchesQuery = expense.description.toLowerCase().includes(query.trim().toLowerCase());
        const matchesCategory = category === "all" || expense.category === category;
        return matchesQuery && matchesCategory;
      }),
    [state.expenses, query, category],
  );

  return (
    <>
      <main className="pane pane-wide">
        <div className="pane-header hero-header">
          <div>
            <p className="eyebrow">Transaction Feed</p>
            <h1>All Expenses</h1>
          </div>
          <button className="btn btn-gold" onClick={() => setAddingExpense(true)}>
            Add Expense
          </button>
          <button className="btn btn-plain" onClick={() => setSettling(true)}>
            Settle Up
          </button>
        </div>
        <div className="filter-bar">
          <input
            value={query}
            placeholder="Search expenses"
            onChange={(event) => setQuery(event.target.value)}
          />
          <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
            <option value="all">All Categories</option>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {CATEGORY_META[item].label}
              </option>
            ))}
          </select>
        </div>
        <ExpenseList
          expenses={expenses}
          settlements={state.settlements}
          emptyMessage="No expenses match the current filters."
        />
      </main>
      <aside className="rail">
        <div className="rail-card">
          <h3>Demo Data</h3>
          <p className="muted-copy">
            Reset restores the Portugal 2026 ledger and clears local edits in this browser.
          </p>
          <button
            className="btn btn-plain"
            onClick={() => {
              if (confirm("Reset all data back to the demo state?")) {
                dispatch({ type: "reset" });
              }
            }}
          >
            Reset demo data
          </button>
        </div>
      </aside>
      {addingExpense && <AddExpenseModal onClose={() => setAddingExpense(false)} />}
      {settling && <SettleUpModal onClose={() => setSettling(false)} />}
    </>
  );
}
