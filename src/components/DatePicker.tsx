import { useEffect, useMemo, useRef, useState } from "react";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDate(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null;
  return date;
}

function formatValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sameDay(a: Date, b: Date | null): boolean {
  if (!b) return false;
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function Chevron({ direction }: { direction: "left" | "right" | "down" }) {
  const path = direction === "left"
    ? "m15 18-6-6 6-6"
    : direction === "right"
      ? "m9 6 6 6-6 6"
      : "m6 9 6 6 6-6";
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 3v4M17 3v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  placeholder = "Select date",
  dialogLabel = "Choose expense date",
  clearable = false,
  inline = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  dialogLabel?: string;
  clearable?: boolean;
  inline?: boolean;
}) {
  const selected = useMemo(() => parseDate(value), [value]);
  const minimum = useMemo(() => parseDate(min), [min]);
  const maximum = useMemo(() => parseDate(max), [max]);
  const initialMonth = selected ?? minimum ?? new Date();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const today = new Date();

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const focusDate = selected ?? minimum ?? new Date();
    setVisibleMonth(new Date(focusDate.getFullYear(), focusDate.getMonth(), 1));
  }, [minimum, open, selected]);

  useEffect(() => {
    if (!open || !inline) return;
    const frame = window.requestAnimationFrame(() => {
      popoverRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inline, open]);

  const days = useMemo(() => {
    const startOffset = visibleMonth.getDay();
    const count = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: startOffset }, () => null),
      ...Array.from({ length: count }, (_, index) => new Date(
        visibleMonth.getFullYear(),
        visibleMonth.getMonth(),
        index + 1,
      )),
    ];
  }, [visibleMonth]);

  const displayDate = selected
    ? new Intl.DateTimeFormat("en-CA", {
        weekday: "short",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(selected)
    : placeholder;
  const monthLabel = new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
  }).format(visibleMonth);

  function moveMonth(offset: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function choose(date: Date) {
    onChange(formatValue(date));
    setOpen(false);
  }

  function isUnavailable(date: Date) {
    return Boolean(
      (minimum && date < minimum)
      || (maximum && date > maximum),
    );
  }

  return (
    <div className={`date-picker ${inline ? "date-picker-inline" : ""}`} ref={rootRef}>
      <button
        id={id}
        type="button"
        className="date-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarGlyph />
        <span className={selected ? undefined : "date-picker-placeholder"}>{displayDate}</span>
        <span className={`date-picker-chevron ${open ? "open" : ""}`}><Chevron direction="down" /></span>
      </button>
      {open && (
        <div ref={popoverRef} className="date-picker-popover" role="dialog" aria-label={dialogLabel}>
          <header>
            <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}><Chevron direction="left" /></button>
            <strong>{monthLabel}</strong>
            <button type="button" aria-label="Next month" onClick={() => moveMonth(1)}><Chevron direction="right" /></button>
          </header>
          <div className="date-picker-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day}>{day.slice(0, 1)}</span>)}
          </div>
          <div className="date-picker-days">
            {days.map((day, index) => day ? (
              <button
                key={formatValue(day)}
                type="button"
                className={`${sameDay(day, selected) ? "selected" : ""} ${sameDay(day, today) ? "today" : ""}`}
                aria-label={new Intl.DateTimeFormat("en-CA", { dateStyle: "full" }).format(day)}
                aria-pressed={sameDay(day, selected)}
                disabled={isUnavailable(day)}
                onClick={() => choose(day)}
              >
                {day.getDate()}
              </button>
            ) : <span key={`empty-${index}`} />)}
          </div>
          <footer className={clearable && selected ? "has-clear" : undefined}>
            {clearable && selected && <button type="button" onClick={() => { onChange(""); setOpen(false); }}>Clear</button>}
            <button type="button" disabled={isUnavailable(today)} onClick={() => choose(today)}>Today</button>
          </footer>
        </div>
      )}
    </div>
  );
}
