"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

type DateRangeTimelineProps = {
  minDate: Date;
  maxDate: Date;
  initialStart?: Date;
  initialEnd?: Date;
  storageKey?: string;
  onChange?: (startISO: string, endISO: string) => void;
  className?: string;
  timeZone?: string;
  constrainToBounds?: boolean;
};

type DateRange = {
  start: Date;
  end: Date;
};

type DraftRange = {
  start: Date | null;
  end: Date | null;
};

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return { year, month, day };
}

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function normalizeDateInTimeZone(date: Date, timeZone: string) {
  const { year, month, day } = getDatePartsInTimeZone(date, timeZone);
  return new Date(year, month - 1, day);
}

function parseISODate(dateText: string) {
  const parts = dateText.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return new Date(dateText);
  }

  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function clampDate(date: Date, minDate: Date, maxDate: Date) {
  const value = normalizeDate(date).getTime();
  const min = normalizeDate(minDate).getTime();
  const max = normalizeDate(maxDate).getTime();
  if (value < min) return normalizeDate(minDate);
  if (value > max) return normalizeDate(maxDate);
  return normalizeDate(date);
}

function sortRange(start: Date, end: Date): DateRange {
  const normalizedStart = normalizeDate(start);
  const normalizedEnd = normalizeDate(end);
  return normalizedStart.getTime() <= normalizedEnd.getTime()
    ? { start: normalizedStart, end: normalizedEnd }
    : { start: normalizedEnd, end: normalizedStart };
}

function normalizeRange(start: Date, end: Date, minDate: Date, maxDate: Date): DateRange {
  const clampedStart = clampDate(start, minDate, maxDate);
  const clampedEnd = clampDate(end, minDate, maxDate);
  return sortRange(clampedStart, clampedEnd);
}

function isSameDay(a: Date | null, b: Date | null) {
  if (!a || !b) return false;
  return normalizeDate(a).getTime() === normalizeDate(b).getTime();
}

function toISO(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function DateRangeTimeline({
  minDate,
  maxDate,
  initialStart,
  initialEnd,
  storageKey = "date_range_timeline",
  onChange,
  className,
  timeZone,
  constrainToBounds = true,
}: DateRangeTimelineProps) {
  const resolvedTimeZone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const minDay = useMemo(
    () => (timeZone ? normalizeDateInTimeZone(minDate, resolvedTimeZone) : normalizeDate(minDate)),
    [minDate, resolvedTimeZone, timeZone],
  );
  const maxDay = useMemo(
    () => (timeZone ? normalizeDateInTimeZone(maxDate, resolvedTimeZone) : normalizeDate(maxDate)),
    [maxDate, resolvedTimeZone, timeZone],
  );
  const safeRange = useMemo(
    () =>
      minDay.getTime() <= maxDay.getTime()
        ? { min: minDay, max: maxDay }
        : { min: maxDay, max: minDay },
    [maxDay, minDay],
  );

  const dayLabelFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...(timeZone ? { timeZone: resolvedTimeZone } : {}),
      }),
    [resolvedTimeZone, timeZone],
  );
  const monthLabelFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en", {
        month: "short",
        year: "numeric",
        ...(timeZone ? { timeZone: resolvedTimeZone } : {}),
      }),
    [resolvedTimeZone, timeZone],
  );

  const getDefaultRange = useCallback(() => {
    if (initialStart && initialEnd) {
      return constrainToBounds
        ? normalizeRange(initialStart, initialEnd, safeRange.min, safeRange.max)
        : sortRange(initialStart, initialEnd);
    }
    return { start: safeRange.min, end: safeRange.max };
  }, [constrainToBounds, initialEnd, initialStart, safeRange.max, safeRange.min]);

  const readStoredRange = useCallback(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem(storageKey);
    if (!saved) return null;

    try {
      const parsed = JSON.parse(saved) as { start?: string; end?: string };
      if (!parsed.start || !parsed.end) return null;
      return constrainToBounds
        ? normalizeRange(parseISODate(parsed.start), parseISODate(parsed.end), safeRange.min, safeRange.max)
        : sortRange(parseISODate(parsed.start), parseISODate(parsed.end));
    } catch {
      return null;
    }
  }, [constrainToBounds, safeRange.max, safeRange.min, storageKey]);

  const [isOpen, setIsOpen] = useState(false);
  const [appliedRange, setAppliedRange] = useState<DateRange>(() => getDefaultRange());
  const [draftRange, setDraftRange] = useState<DraftRange>(() => {
    const initial = getDefaultRange();
    return { start: initial.start, end: initial.end };
  });
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => startOfMonth(getDefaultRange().start));
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const next = readStoredRange() ?? getDefaultRange();
    setAppliedRange(next);
    setDraftRange({ start: next.start, end: next.end });
    setVisibleMonth(startOfMonth(next.start));
  }, [getDefaultRange, readStoredRange]);

  useEffect(() => {
    if (!onChange) return;
    onChange(toISO(appliedRange.start), toISO(appliedRange.end));
  }, [appliedRange, onChange]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setDraftRange({ start: appliedRange.start, end: appliedRange.end });
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setDraftRange({ start: appliedRange.start, end: appliedRange.end });
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [appliedRange.end, appliedRange.start, isOpen]);

  const displayedRange = useMemo(() => {
    if (!draftRange.start || !draftRange.end) return null;
    return constrainToBounds
      ? normalizeRange(draftRange.start, draftRange.end, safeRange.min, safeRange.max)
      : sortRange(draftRange.start, draftRange.end);
  }, [constrainToBounds, draftRange.end, draftRange.start, safeRange.max, safeRange.min]);

  const hasChanges = useMemo(() => {
    if (!displayedRange) return false;
    return (
      displayedRange.start.getTime() !== appliedRange.start.getTime() ||
      displayedRange.end.getTime() !== appliedRange.end.getTime()
    );
  }, [appliedRange.end, appliedRange.start, displayedRange]);

  const applyRange = useCallback(
    (range: DateRange) => {
      setAppliedRange(range);
      setDraftRange({ start: range.start, end: range.end });
      if (typeof window !== "undefined") {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            start: toISO(range.start),
            end: toISO(range.end),
          }),
        );
      }
      setIsOpen(false);
    },
    [storageKey],
  );

  const applyDraftRange = () => {
    if (!displayedRange) return;
    applyRange(displayedRange);
  };

  const setPresetRange = (range: DateRange) => {
    setDraftRange({ start: range.start, end: range.end });
    setVisibleMonth(startOfMonth(range.start));
  };

  const today = useMemo(
    () => {
      const normalizedToday = timeZone ? normalizeDateInTimeZone(new Date(), resolvedTimeZone) : normalizeDate(new Date());
      return constrainToBounds ? clampDate(normalizedToday, safeRange.min, safeRange.max) : normalizedToday;
    },
    [constrainToBounds, resolvedTimeZone, safeRange.max, safeRange.min, timeZone],
  );
  const presets = useMemo(
    () => [
      { label: "Today", range: { start: today, end: today } },
      {
        label: "Last 7 days",
        range: constrainToBounds
          ? normalizeRange(addDays(today, -6), today, safeRange.min, safeRange.max)
          : sortRange(addDays(today, -6), today),
      },
      {
        label: "Last 30 days",
        range: constrainToBounds
          ? normalizeRange(addDays(today, -29), today, safeRange.min, safeRange.max)
          : sortRange(addDays(today, -29), today),
      },
      {
        label: "This month",
        range: constrainToBounds
          ? normalizeRange(new Date(today.getFullYear(), today.getMonth(), 1), today, safeRange.min, safeRange.max)
          : sortRange(new Date(today.getFullYear(), today.getMonth(), 1), today),
      },
      {
        label: "Last month",
        range: constrainToBounds
          ? normalizeRange(
              new Date(today.getFullYear(), today.getMonth() - 1, 1),
              new Date(today.getFullYear(), today.getMonth(), 0),
              safeRange.min,
              safeRange.max,
            )
          : sortRange(new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0)),
      },
      { label: "All dates", range: { start: safeRange.min, end: safeRange.max } },
    ],
    [constrainToBounds, safeRange.max, safeRange.min, today],
  );

  const firstVisibleMonth = startOfMonth(visibleMonth);
  const secondVisibleMonth = addMonths(firstVisibleMonth, 1);
  const minMonth = startOfMonth(safeRange.min);
  const maxMonth = startOfMonth(safeRange.max);
  const canGoPrev = !constrainToBounds || firstVisibleMonth.getTime() > minMonth.getTime();
  const canGoNext = !constrainToBounds || secondVisibleMonth.getTime() < maxMonth.getTime();

  const renderMonth = (monthDate: Date) => {
    const monthStart = startOfMonth(monthDate);
    const gridStart = addDays(monthStart, -monthStart.getDay());
    const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
    const activeStart = draftRange.start ? normalizeDate(draftRange.start) : null;
    const activeEnd = draftRange.end ? normalizeDate(draftRange.end) : null;

    return (
      <div className="flex min-w-0 flex-1 flex-col gap-4" key={monthStart.toISOString()}>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => canGoPrev && setVisibleMonth(addMonths(firstVisibleMonth, -1))}
            disabled={!canGoPrev}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-lg font-semibold text-slate-900 dark:text-white">{monthLabelFormatter.format(monthStart)}</div>
          <button
            type="button"
            onClick={() => canGoNext && setVisibleMonth(addMonths(firstVisibleMonth, 1))}
            disabled={!canGoNext}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-y-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
          {WEEKDAY_LABELS.map((label) => (
            <div key={`${monthStart.toISOString()}-${label}`}>{label}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {days.map((day) => {
            const normalizedDay = normalizeDate(day);
            const isOutsideMonth = normalizedDay.getMonth() !== monthStart.getMonth();
            const isDisabled =
              constrainToBounds &&
              (normalizedDay.getTime() < safeRange.min.getTime() || normalizedDay.getTime() > safeRange.max.getTime());
            const isStart = isSameDay(normalizedDay, activeStart);
            const isEnd = isSameDay(normalizedDay, activeEnd);
            const isSingleDay = isStart && isEnd;
            const isInRange =
              activeStart &&
              activeEnd &&
              normalizedDay.getTime() >= activeStart.getTime() &&
              normalizedDay.getTime() <= activeEnd.getTime();

            return (
              <div
                key={normalizedDay.toISOString()}
                className={`px-1 py-0.5 ${isInRange && !isSingleDay ? "bg-indigo-100/80 dark:bg-indigo-500/20" : ""} ${
                  isStart && !isSingleDay ? "rounded-l-xl" : ""
                } ${isEnd && !isSingleDay ? "rounded-r-xl" : ""}`}
              >
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    if (isDisabled) return;
                    if (!draftRange.start || (draftRange.start && draftRange.end)) {
                      setDraftRange({ start: normalizedDay, end: null });
                      return;
                    }

                    if (normalizedDay.getTime() < draftRange.start.getTime()) {
                      setDraftRange({ start: normalizedDay, end: draftRange.start });
                      return;
                    }

                    setDraftRange({ start: draftRange.start, end: normalizedDay });
                  }}
                  className={`grid h-10 w-full place-items-center rounded-xl text-sm font-medium transition ${
                    isStart || isEnd
                      ? "bg-slate-900 text-white dark:bg-indigo-400 dark:text-slate-950"
                      : isInRange
                        ? "text-indigo-900 dark:text-indigo-100"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                  } ${isOutsideMonth ? "text-slate-300 dark:text-slate-500" : ""} ${
                    isDisabled ? "cursor-not-allowed opacity-40 hover:bg-transparent" : ""
                  }`}
                >
                  {normalizedDay.getDate()}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const appliedRangeLabel = `${dayLabelFormatter.format(appliedRange.start)} -> ${dayLabelFormatter.format(appliedRange.end)}`;
  const draftStatusLabel = !draftRange.start
    ? "Pick a start date"
    : !draftRange.end
      ? `Start: ${dayLabelFormatter.format(draftRange.start)} - pick an end date`
      : `${dayLabelFormatter.format(draftRange.start)} -> ${dayLabelFormatter.format(draftRange.end)}`;

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Filter by Date Range</label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDraftRange({ start: appliedRange.start, end: appliedRange.end });
              setVisibleMonth(startOfMonth(appliedRange.start));
              setIsOpen((current) => !current);
            }}
            className="inline-flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
          >
            <CalendarDays className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
            <span>{appliedRangeLabel}</span>
            <ChevronDown className={`h-4 w-4 transition ${isOpen ? "rotate-180" : ""}`} />
          </button>

          <button
            type="button"
            onClick={() => applyRange({ start: safeRange.min, end: safeRange.max })}
            className="btn btn-secondary min-h-11"
          >
            Reset
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-3 w-full min-w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-950 md:w-[760px]">
          <div className="grid gap-0 md:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="border-b border-slate-200 p-5 dark:border-white/10 md:border-b-0 md:border-r">
              <div className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Quick Range</div>
              <div className="flex flex-col gap-2">
                {presets.map((preset) => {
                  const isActive =
                    draftRange.start &&
                    draftRange.end &&
                    draftRange.start.getTime() === preset.range.start.getTime() &&
                    draftRange.end.getTime() === preset.range.end.getTime();

                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setPresetRange(preset.range)}
                      className={`rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                        isActive
                          ? "bg-slate-900 text-white dark:bg-indigo-400 dark:text-slate-950"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="p-5">
              <div className="mb-4 text-sm font-medium text-slate-500 dark:text-slate-300">{draftStatusLabel}</div>
              <div className="grid gap-6 lg:grid-cols-2">
                {renderMonth(firstVisibleMonth)}
                {renderMonth(secondVisibleMonth)}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 dark:border-white/10 md:flex-row md:items-center md:justify-between">
            <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 dark:bg-white/5 dark:text-slate-300">
              {displayedRange
                ? `${dayLabelFormatter.format(displayedRange.start)} -> ${dayLabelFormatter.format(displayedRange.end)}`
                : draftStatusLabel}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftRange({ start: appliedRange.start, end: appliedRange.end });
                  setIsOpen(false);
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyDraftRange}
                disabled={!displayedRange || !hasChanges}
                className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Apply Range
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
