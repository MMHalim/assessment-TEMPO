"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DateRangeTimelineProps = {
  minDate: Date;
  maxDate: Date;
  initialStart?: Date;
  initialEnd?: Date;
  storageKey?: string;
  onChange?: (startISO: string, endISO: string) => void;
  className?: string;
};

export default function DateRangeTimeline({
  minDate,
  maxDate,
  initialStart,
  initialEnd,
  storageKey = "date_range_timeline",
  onChange,
  className,
}: DateRangeTimelineProps) {
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const dayFmt = useMemo(() => new Intl.DateTimeFormat("en", { month: "short" }), []);
  const monthYearFmt = useMemo(() => new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }), []);

  const minY = minDate.getFullYear();
  const minM = minDate.getMonth();
  const minD = minDate.getDate();
  const maxY = maxDate.getFullYear();
  const maxM = maxDate.getMonth();
  const maxD = maxDate.getDate();

  const minTime = useMemo(() => new Date(minY, minM, minD).getTime(), [minY, minM, minD]);
  const maxTime = useMemo(() => new Date(maxY, maxM, maxD).getTime(), [maxY, maxM, maxD]);
  const totalDays = useMemo(() => Math.max(0, Math.round((maxTime - minTime) / 86400000)), [minTime, maxTime]);
  const getDateFromOffset = useCallback(
    (offset: number) => new Date(minY, minM, minD + offset),
    [minY, minM, minD],
  );

  const getOffsetFromDate = useCallback(
    (d: Date) => {
      const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const diff = Math.round((target - minTime) / 86400000);
      if (diff < 0) return 0;
      if (diff > totalDays) return totalDays;
      return diff;
    },
    [minTime, totalDays],
  );

  const toISO = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  };
  const labelFor = (d: Date) => `${d.getDate()}-${dayFmt.format(d)}-${d.getFullYear()}`;

  const [range, setRange] = useState<[number, number]>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (saved) {
      try {
        const obj = JSON.parse(saved) as { start: string; end: string };
        if (obj?.start && obj?.end) {
          const s = getOffsetFromDate(new Date(obj.start));
          const e = getOffsetFromDate(new Date(obj.end));
          return [Math.min(s, e), Math.max(s, e)];
        }
      } catch {}
    }
    if (initialStart && initialEnd) {
      const s = getOffsetFromDate(initialStart);
      const e = getOffsetFromDate(initialEnd);
      return [Math.min(s, e), Math.max(s, e)];
    }
    return [0, totalDays];
  });
  const rangeRef = useRef(range);
  useEffect(() => {
    rangeRef.current = range;
  }, [range]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const readSaved = () => {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return null;
      try {
        const obj = JSON.parse(saved) as { start: string; end: string };
        if (!obj?.start || !obj?.end) return null;
        const s = getOffsetFromDate(new Date(obj.start));
        const e = getOffsetFromDate(new Date(obj.end));
        return [Math.min(s, e), Math.max(s, e)] as [number, number];
      } catch {
        return null;
      }
    };

    const clampRange = (r: [number, number]) => {
      const s = Math.min(totalDays, Math.max(0, r[0]));
      const e = Math.min(totalDays, Math.max(0, r[1]));
      return [Math.min(s, e), Math.max(s, e)] as [number, number];
    };

    const saved = readSaved();
    const next =
      saved ??
      (initialStart && initialEnd
        ? clampRange([getOffsetFromDate(initialStart), getOffsetFromDate(initialEnd)])
        : ([0, totalDays] as [number, number]));

    const clamped = clampRange(next);
    const [cs, ce] = rangeRef.current;
    if (clamped[0] !== cs || clamped[1] !== ce) {
      setRange(clamped);
      setHasUnsaved(false);
    }
  }, [storageKey, totalDays, minY, minM, minD, maxY, maxM, maxD, getOffsetFromDate, initialStart, initialEnd]);

  useEffect(() => {
    const s = getDateFromOffset(range[0]);
    const e = getDateFromOffset(range[1]);
    const ss = toISO(s);
    const ee = toISO(e);
    if (onChange) onChange(ss, ee);
  }, [range, getDateFromOffset, onChange]);

  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const timelineCellPx = 140;
  const padPx = 80;
  const daysCount = totalDays + 1;
  const trackWidth = daysCount * timelineCellPx + padPx * 2;
  const timelineRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const onScroll = () => setScrollLeft(el.scrollLeft);
    const ro = new ResizeObserver(() => setViewportWidth(el.clientWidth));
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(el);
    setViewportWidth(el.clientWidth);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const dragRef = useRef<null | { type: "start" | "end" | "range"; originX: number; originStart: number; originEnd: number }>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const el = timelineRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const edge = 36;
        if (e.clientX < rect.left + edge) el.scrollLeft -= 12;
        if (e.clientX > rect.right - edge) el.scrollLeft += 12;
      }
      const dx = e.clientX - drag.originX;
      const delta = Math.round(dx / timelineCellPx);
      const span = drag.originEnd - drag.originStart;
      if (drag.type === "start") {
        const nextStart = clamp(drag.originStart + delta, 0, drag.originEnd);
        setRange([nextStart, drag.originEnd]);
        setHasUnsaved(true);
        return;
      }
      if (drag.type === "end") {
        const nextEnd = clamp(drag.originEnd + delta, drag.originStart, totalDays);
        setRange([drag.originStart, nextEnd]);
        setHasUnsaved(true);
        return;
      }
      const nextStart = clamp(drag.originStart + delta, 0, totalDays - span);
      const nextEnd = nextStart + span;
      setRange([nextStart, nextEnd]);
      setHasUnsaved(true);
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [totalDays]);

  const beginDrag = (type: "start" | "end" | "range", e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const [s, en] = rangeRef.current;
    dragRef.current = { type, originX: e.clientX, originStart: s, originEnd: en };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const scrollByDays = (days: number) => {
    const el = timelineRef.current;
    if (!el) return;
    el.scrollBy({ left: days * timelineCellPx, behavior: "smooth" });
  };

  const visibleStart = clamp(Math.floor((scrollLeft - padPx) / timelineCellPx) - 2, 0, Math.max(0, daysCount - 1));
  const visibleEnd = clamp(
    Math.ceil((scrollLeft + viewportWidth - padPx) / timelineCellPx) + 2,
    0,
    Math.max(0, daysCount - 1),
  );
  const visibleMid = clamp(
    Math.round((scrollLeft + viewportWidth / 2 - padPx) / timelineCellPx),
    0,
    Math.max(0, daysCount - 1),
  );
  const visibleMonthYear = monthYearFmt.format(getDateFromOffset(visibleMid));

  const startDate = getDateFromOffset(range[0]);
  const endDate = getDateFromOffset(range[1]);
  const xForOffset = (offset: number) => padPx + offset * timelineCellPx;

  const saveRange = () => {
    const s = toISO(startDate);
    const e = toISO(endDate);
    localStorage.setItem(storageKey, JSON.stringify({ start: s, end: e }));
    setHasUnsaved(false);
  };

  return (
    <div className={`select-none ${className ?? ""}`}>
      <div className="flex justify-between items-center gap-3">
        <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Filter by Date Range:</label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">DAYS</span>
          <button
            type="button"
            onClick={saveRange}
            disabled={!hasUnsaved}
            className="btn btn-primary py-1 px-3 text-xs h-auto disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
      <div className="flex justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-2 mb-2">
        <span>{labelFor(startDate)}</span>
        <span className="text-slate-500 dark:text-slate-400">{visibleMonthYear}</span>
        <span>{labelFor(endDate)}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => scrollByDays(-7)}
          className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
        >
          ‹
        </button>
        <div
          ref={timelineRef}
          className="relative h-[96px] flex-1 overflow-x-auto overflow-y-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-black/20"
        >
          <div className="relative h-full" style={{ width: trackWidth }}>
            <div
              className="absolute left-0 right-0 top-9 h-6 rounded bg-slate-200/70 dark:bg-white/10"
              style={{
                backgroundImage: `repeating-linear-gradient(to right, rgba(148,163,184,0.7) 0px, rgba(148,163,184,0.7) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) ${timelineCellPx}px)`,
                backgroundPosition: `${padPx}px 0px`,
              }}
            />
            <div
              className="absolute top-9 h-6 rounded bg-gradient-to-b from-indigo-400/60 to-indigo-600/80 dark:from-indigo-400/40 dark:to-indigo-600/60 shadow-sm cursor-grab active:cursor-grabbing z-10 touch-none"
              style={{
                left: xForOffset(range[0]),
                width: Math.max((range[1] - range[0]) * timelineCellPx, 6),
              }}
              onPointerDown={(e) => beginDrag("range", e)}
            />
            <div
              className="absolute top-8 h-8 w-4 -translate-x-1/2 rounded bg-indigo-700 dark:bg-indigo-400 cursor-ew-resize z-20 flex items-center justify-center touch-none"
              style={{ left: xForOffset(range[0]) }}
              onPointerDown={(e) => beginDrag("start", e)}
              title={labelFor(startDate)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="h-1 w-1 rounded-full bg-white/90" />
                <span className="h-1 w-1 rounded-full bg-white/90" />
                <span className="h-1 w-1 rounded-full bg-white/90" />
              </div>
            </div>
            <div
              className="absolute top-8 h-8 w-4 -translate-x-1/2 rounded bg-indigo-700 dark:bg-indigo-400 cursor-ew-resize z-20 flex items-center justify-center touch-none"
              style={{ left: xForOffset(range[1]) }}
              onPointerDown={(e) => beginDrag("end", e)}
              title={labelFor(endDate)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="h-1 w-1 rounded-full bg-white/90" />
                <span className="h-1 w-1 rounded-full bg-white/90" />
                <span className="h-1 w-1 rounded-full bg-white/90" />
              </div>
            </div>
            {Array.from({ length: Math.max(0, visibleEnd - visibleStart + 1) }).map((_, idx) => {
              const i = visibleStart + idx;
              const d = getDateFromOffset(i);
              return (
                <div
                  key={i}
                  className="absolute top-2 -translate-x-1/2 text-[11px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap"
                  style={{ left: xForOffset(i) }}
                >
                  {labelFor(d)}
                </div>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => scrollByDays(7)}
          className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
        >
          ›
        </button>
      </div>
    </div>
  );
}
