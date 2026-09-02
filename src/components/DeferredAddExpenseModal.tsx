import { lazy, Suspense, useEffect, useState } from "react";
import type { AddExpenseModalProps } from "./AddExpenseModal";
import { Modal } from "./Modal";

let addExpenseModule: ReturnType<typeof loadAddExpenseModule> | undefined;

function loadAddExpenseModule() {
  return import("./AddExpenseModal").then((module) => ({ default: module.AddExpenseModal }));
}

function getAddExpenseModule() {
  addExpenseModule ??= loadAddExpenseModule();
  return addExpenseModule;
}

const LazyAddExpenseModal = lazy(getAddExpenseModule);

export function preloadAddExpenseModal() {
  void getAddExpenseModule();
}

function PreparingExpenseDialog({ onClose }: Pick<AddExpenseModalProps, "onClose">) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(true), 150);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  return (
    <Modal
      title="Preparing expense form"
      description="The expense form is loading."
      closeOnBackdrop={false}
      onClose={onClose}
    >
      <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
        Preparing expense form…
      </div>
    </Modal>
  );
}

export function DeferredAddExpenseModal(props: AddExpenseModalProps) {
  return (
    <Suspense fallback={<PreparingExpenseDialog onClose={props.onClose} />}>
      <LazyAddExpenseModal {...props} />
    </Suspense>
  );
}
