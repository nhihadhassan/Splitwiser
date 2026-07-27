import { useMemo, useState } from "react";
import { useStore } from "../store";
import { ExpenseList } from "../components/ExpenseList";
import { AddExpenseModal } from "../components/AddExpenseModal";
import { SettleUpModal } from "../components/SettleUpModal";
import { CloudSyncPanel } from "../components/CloudSyncPanel";
import { CATEGORIES, CATEGORY_META } from "../utils/categories";
import type { ExpenseCategory } from "../types";

export function AllExpensesPage() {
  const { state } = useStore();
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
          <button className="btn btn-primary" onClick={() => setAddingExpense(true)}>
            Add Expense
          </button>
          <button className="btn btn-secondary" onClick={() => setSettling(true)}>
            Settle Up
          </button>
        </div>
        <div className="filter-bar">
          <label className="sr-only" htmlFor="expense-search">Search expenses</label>
          <input
            id="expense-search"
            type="search"
            value={query}
            placeholder="Search expenses"
            onChange={(event) => setQuery(event.target.value)}
          />
          <label className="sr-only" htmlFor="expense-category-filter">Filter by category</label>
          <select
            id="expense-category-filter"
            value={category}
            onChange={(event) => setCategory(event.target.value as typeof category)}
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {CATEGORY_META[item].label}
              </option>
            ))}
          </select>
        </div>
        <CloudSyncPanel />
        <ExpenseList
          expenses={expenses}
          settlements={state.settlements}
          emptyMessage="No expenses match the current filters."
          showCategory
          showNotes
        />
      </main>
      {addingExpense && <AddExpenseModal onClose={() => setAddingExpense(false)} />}
      {settling && <SettleUpModal onClose={() => setSettling(false)} />}
    </>
  );
}
