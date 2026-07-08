import { useState } from "react";
import { useStore } from "../store";
import { ExpenseList } from "../components/ExpenseList";
import { AddExpenseModal } from "../components/AddExpenseModal";
import { SettleUpModal } from "../components/SettleUpModal";

export function AllExpensesPage() {
  const { state, dispatch } = useStore();
  const [addingExpense, setAddingExpense] = useState(false);
  const [settling, setSettling] = useState(false);

  return (
    <>
      <main className="pane">
        <div className="pane-header">
          <h1>All expenses</h1>
          <button className="btn btn-orange" onClick={() => setAddingExpense(true)}>
            Add an expense
          </button>
          <button className="btn btn-teal" onClick={() => setSettling(true)}>
            Settle up
          </button>
        </div>
        <ExpenseList
          expenses={state.expenses}
          settlements={state.settlements}
          emptyMessage="No expenses yet. Add your first one!"
        />
      </main>
      <aside className="rail">
        <div className="rail-card">
          <h3>Demo data</h3>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
            This app starts with sample friends, groups, and expenses so you can explore.
            Reset restores the original demo data.
          </div>
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
