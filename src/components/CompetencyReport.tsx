"use client";

import CompetencyMetrics from "@/components/CompetencyMetrics";
import { COMPETENCY_DIMENSIONS, type CompetencyReport as Report, type SpeechMetrics } from "@/lib/competency";

function tone(score: number) {
  if (score >= 75) return { text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
  if (score >= 60) return { text: "text-sky-600 dark:text-sky-400", bar: "bg-sky-500", pill: "bg-sky-500/10 text-sky-700 dark:text-sky-300" };
  if (score >= 45) return { text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500", pill: "bg-amber-500/10 text-amber-700 dark:text-amber-300" };
  return { text: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500", pill: "bg-rose-500/10 text-rose-700 dark:text-rose-300" };
}

export type CompetencyReportProps = {
  report: Report;
  overallScore: number;
  cefrLevel: string;
  subtitle?: string;
  transcript?: string | null;
  metrics?: SpeechMetrics | null;
  followUpQuestion?: string | null;
  followUpTranscript?: string | null;
  followUpMetrics?: SpeechMetrics | null;
};

export default function CompetencyReport({
  report,
  overallScore,
  cefrLevel,
  subtitle,
  transcript,
  metrics,
  followUpQuestion,
  followUpTranscript,
  followUpMetrics,
}: CompetencyReportProps) {
  const overallTone = tone(overallScore);

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-black/30">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-6 dark:border-white/10">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          English speaking assessment
        </div>
        <div className={`text-4xl font-bold tabular-nums ${overallTone.text}`}>{overallScore}/100</div>
        <div className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${overallTone.pill}`}>{cefrLevel}</div>
        {subtitle ? <div className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</div> : null}
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Performance breakdown</h3>
        {COMPETENCY_DIMENSIONS.map((d) => {
          const score = report.scores[d.key] ?? 0;
          const t = tone(score);
          return (
            <div key={d.key} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">
                  {d.label}
                  <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                    {d.weight > 0 ? `${d.weight}%` : "not weighted"}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{score}/100</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${score}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {metrics ? (
        <div className="border-t border-slate-200 pt-6 dark:border-white/10">
          <CompetencyMetrics metrics={metrics} followUpMetrics={followUpMetrics} />
        </div>
      ) : null}

      <div className="flex flex-col gap-5 border-t border-slate-200 pt-6 dark:border-white/10">
        {report.strengths.length > 0 ? (
          <div>
            <h3 className="text-lg font-semibold">Strengths</h3>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-slate-700 dark:text-slate-200">
              {report.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {report.improvements.length > 0 ? (
          <div>
            <h3 className="text-lg font-semibold">Areas for improvement</h3>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-slate-700 dark:text-slate-200">
              {report.improvements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div>
          <h3 className="text-lg font-semibold">AI-generated feedback</h3>
          <p className="mt-2 leading-relaxed text-slate-700 dark:text-slate-200">{report.feedback}</p>
        </div>
      </div>

      {transcript ? (
        <details className="rounded-xl border border-slate-200 p-4 text-sm dark:border-white/10">
          <summary className="cursor-pointer font-semibold">Transcript</summary>
          <div className="mt-3 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <div className="font-semibold">Main answer</div>
              <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{transcript}</p>
            </div>
            {followUpQuestion ? (
              <div className="flex flex-col gap-1">
                <div className="font-semibold">Follow-up: {followUpQuestion}</div>
                <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-200">{followUpTranscript || "—"}</p>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Pronunciation and accent are estimated from the automatic transcript, not measured from the audio. CEFR levels
        use illustrative score bands, not an official CEFR conversion.
      </p>
    </div>
  );
}
