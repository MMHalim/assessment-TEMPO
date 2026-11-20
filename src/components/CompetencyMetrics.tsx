"use client";

import { AlertCircle, CheckCircle2, MinusCircle } from "lucide-react";
import { useState } from "react";
import type { SpeechMetrics } from "@/lib/competency";

type Status = "good" | "ok" | "attention";

type Tile = {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  /** Plain-English explanation of what the metric measures. */
  measures: string;
  status?: { level: Status; label: string };
  /** 0..1, drawn as a thin meter under the value. */
  meter?: number;
};

const STATUS_STYLE: Record<Status, { icon: typeof CheckCircle2; iconClass: string; chip: string }> = {
  good: {
    icon: CheckCircle2,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/10",
  },
  ok: {
    icon: MinusCircle,
    iconClass: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-500/10",
  },
  attention: {
    icon: AlertCircle,
    iconClass: "text-rose-600 dark:text-rose-400",
    chip: "bg-rose-500/10",
  },
};

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function per100(count: number, words: number): number {
  return words > 0 ? Math.round((count / words) * 1000) / 10 : 0;
}

function buildTiles(m: SpeechMetrics): Tile[] {
  const tiles: Tile[] = [];

  const speechShare = m.durationSec > 0 ? m.speechSec / m.durationSec : 0;
  tiles.push({
    label: "Speaking time",
    measures: "How long the candidate actually spoke, leaving out silences and long pauses, compared with the full recording length.",
    value: clock(m.speechSec),
    unit: `of ${clock(m.durationSec)}`,
    hint: `${Math.round(speechShare * 100)}% of the recording was speech`,
    meter: speechShare,
  });

  tiles.push({
    label: "Words spoken",
    measures: "The total number of words in the answer. Longer answers give a more reliable score; answers under about 80 words trigger a follow-up question.",
    value: String(m.wordCount),
    unit: "words",
    hint: "Not counting filler words",
  });

  const wpm = m.wordsPerMinute;
  tiles.push({
    label: "Speaking pace",
    measures: "Words per minute while talking. Very slow speech can signal hesitation; very fast speech can make it harder to understand.",
    value: String(wpm),
    unit: "wpm",
    hint: "Natural conversation: 110–160 wpm",
    status:
      wpm < 90
        ? { level: "attention", label: "Slow" }
        : wpm < 110
          ? { level: "ok", label: "Slightly slow" }
          : wpm <= 160
            ? { level: "good", label: "Natural" }
            : wpm <= 180
              ? { level: "ok", label: "Slightly fast" }
              : { level: "attention", label: "Fast" },
  });

  const pauseShare = m.speechSec + m.totalPauseSec > 0 ? m.totalPauseSec / (m.speechSec + m.totalPauseSec) : 0;
  tiles.push({
    label: "Pauses",
    measures: "Silences of 0.7 seconds or more between words. Frequent or long pauses usually mean the candidate is searching for words.",
    value: String(m.pauseCount),
    unit: m.pauseCount === 1 ? "pause" : "pauses",
    hint: `${m.longPauseCount} long (2s+) · ${Math.round(m.totalPauseSec)}s paused (${Math.round(pauseShare * 100)}%)`,
    status:
      pauseShare < 0.15
        ? { level: "good", label: "Smooth" }
        : pauseShare <= 0.3
          ? { level: "ok", label: "Some hesitation" }
          : { level: "attention", label: "Frequent" },
  });

  const fillerRate = per100(m.fillerCount, m.wordCount);
  tiles.push({
    label: "Filler words",
    measures: "Sounds like “um”, “uh” and “er” used to fill gaps. A few are natural in conversation; many suggest hesitation.",
    value: String(m.fillerCount),
    unit: m.fillerCount === 1 ? "filler" : "fillers",
    hint: `${fillerRate} per 100 words (um, uh, er…)`,
    status:
      fillerRate < 3
        ? { level: "good", label: "Few" }
        : fillerRate <= 6
          ? { level: "ok", label: "Some" }
          : { level: "attention", label: "Many" },
  });

  const repRate = per100(m.repetitionCount, m.wordCount);
  tiles.push({
    label: "Repetitions",
    measures: "The same word said twice in a row, like “I I think”. Often a sign of hesitation or self-correction.",
    value: String(m.repetitionCount),
    unit: m.repetitionCount === 1 ? "repeat" : "repeats",
    hint: `${repRate} per 100 words (e.g. “the the”)`,
    status:
      repRate < 2
        ? { level: "good", label: "Few" }
        : repRate <= 4
          ? { level: "ok", label: "Some" }
          : { level: "attention", label: "Many" },
  });

  const variety = Math.round(m.uniqueWordRatio * 100);
  tiles.push({
    label: "Vocabulary variety",
    measures: "How many different words were used compared with the total. Higher means a wider vocabulary; it naturally drops a little in longer answers.",
    value: `${variety}%`,
    unit: "unique",
    hint: "Unique ÷ total words (naturally lower in long answers)",
    status:
      variety >= 50
        ? { level: "good", label: "Varied" }
        : variety >= 40
          ? { level: "ok", label: "Moderate" }
          : { level: "attention", label: "Repetitive" },
  });

  if (m.avgLogprob !== null) {
    const clarity = Math.round(Math.exp(m.avgLogprob) * 100);
    const unclear = m.lowConfidenceSegmentRatio !== null ? Math.round(m.lowConfidenceSegmentRatio * 100) : null;
    tiles.push({
      label: "Speech clarity",
    measures: "How confidently the speech-to-text engine recognised the words. Low clarity can point to unclear pronunciation, a strong accent, or a noisy microphone.",
      value: `${clarity}%`,
      unit: "confidence",
      hint:
        unclear !== null
          ? `How sure the transcriber was · ${unclear}% of passages unclear`
          : "How sure the transcriber was",
      status:
        clarity >= 75
          ? { level: "good", label: "Clear" }
          : clarity >= 55
            ? { level: "ok", label: "Mostly clear" }
            : { level: "attention", label: "Unclear" },
    });
  }

  return tiles;
}

function MetricTile({ tile }: { tile: Tile }) {
  const s = tile.status ? STATUS_STYLE[tile.status.level] : null;
  const Icon = s?.icon;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {tile.label}
        </div>
        {tile.status && s && Icon ? (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 ${s.chip}`}
          >
            <Icon className={`h-3.5 w-3.5 ${s.iconClass}`} aria-hidden />
            {tile.status.label}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{tile.value}</span>
        {tile.unit ? <span className="text-sm text-slate-500 dark:text-slate-400">{tile.unit}</span> : null}
      </div>
      {tile.meter !== undefined ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-slate-500 dark:bg-slate-300"
            style={{ width: `${Math.max(0, Math.min(1, tile.meter)) * 100}%` }}
          />
        </div>
      ) : null}
      <div className="text-xs font-medium leading-snug text-slate-600 dark:text-slate-300">{tile.hint}</div>
      <p className="mt-auto border-t border-slate-200 pt-2 text-xs leading-relaxed text-slate-500 dark:border-white/10 dark:text-slate-400">
        {tile.measures}
      </p>
    </div>
  );
}

export default function CompetencyMetrics({
  metrics,
  followUpMetrics,
}: {
  metrics: SpeechMetrics | null | undefined;
  followUpMetrics?: SpeechMetrics | null;
}) {
  const [which, setWhich] = useState<"main" | "followup">("main");
  if (!metrics) return null;

  const active = which === "followup" && followUpMetrics ? followUpMetrics : metrics;
  const tiles = buildTiles(active);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Speech metrics</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Measured from the recording’s word timings.</p>
        </div>
        {followUpMetrics ? (
          <div className="inline-flex rounded-xl border border-slate-200 p-1 text-sm dark:border-white/10" role="tablist">
            {(
              [
                ["main", "Main answer"],
                ["followup", "Follow-up answer"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={which === key}
                onClick={() => setWhich(key)}
                className={[
                  "rounded-lg px-3 py-1.5 font-semibold transition",
                  which === key
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <MetricTile key={t.label} tile={t} />
        ))}
      </div>
    </div>
  );
}
