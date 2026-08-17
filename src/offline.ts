import type { AppState, MutationCommand } from "./types";
import { applyFinancialMutation } from "./domain";

const DATABASE_NAME = "splitwiser-private-v3";
const STORE_NAME = "accounts";

export interface OfflineAccountRecord {
  accountId: string;
  revision: number;
  state: AppState;
  outbox: MutationCommand[];
  updatedAt: number;
}

export function replayOfflineOutbox(state: AppState, commands: MutationCommand[], actorPersonId: string): AppState {
  return commands.reduce(
    (current, command) => applyFinancialMutation(current, command.mutation, actorPersonId, command.createdAt),
    state,
  );
}

export function cancelQueuedExpenseCreate(commands: MutationCommand[], commandId: string): { commands: MutationCommand[]; expenseId: string | null } {
  const command = commands.find((item) => item.id === commandId);
  if (!command || command.mutation.type !== "addExpense") return { commands, expenseId: null };
  return { commands: commands.filter((item) => item.id !== commandId), expenseId: command.mutation.expense.id };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "accountId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage could not be opened."));
  });
}

async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = operation(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Offline storage request failed."));
    });
  } finally {
    database.close();
  }
}

export async function loadOfflineAccount(accountId: string): Promise<OfflineAccountRecord | null> {
  return (await transaction("readonly", (store) => store.get(accountId))) ?? null;
}

export async function saveOfflineAccount(record: OfflineAccountRecord): Promise<void> {
  await transaction("readwrite", (store) => store.put(record));
}

export async function clearOfflineAccount(accountId: string): Promise<void> {
  await transaction("readwrite", (store) => store.delete(accountId));
}
