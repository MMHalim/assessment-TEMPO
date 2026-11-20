"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import CompetencyReport from "@/components/CompetencyReport";
import type { CompetencyReport as Report, SpeechMetrics } from "@/lib/competency";

type Topic = { id: string; title: string; description: string | null; active: boolean; created_at: string };

type Attempt = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  topic_title: string | null;
  status: "started" | "followup" | "completed";
  transcript: string | null;
  metrics: SpeechMetrics | null;
  followup_question: string | null;
  followup_transcript: string | null;
  followup_metrics: SpeechMetrics | null;
  report: Report | null;
  overall_score: number | null;
  cefr_level: string | null;
  started_at: string;
  completed_at: string | null;
};

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white";

const STATUS_LABEL: Record<Attempt["status"], string> = {
  started: "In progress",
  followup: "Waiting for follow-up",
  completed: "Completed",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => null)) as ({ ok: boolean; error?: string } & T) | null;
  if (!res.ok || !body?.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body;
}

export default function CompetencyAdmin() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [busyTopic, setBusyTopic] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Record<string, { title: string; description: string }>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [openReport, setOpenReport] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [t, a] = await Promise.all([
        api<{ topics: Topic[] }>("/api/admin/competency/topics"),
        api<{ attempts: Attempt[] }>("/api/admin/competency/attempts"),
      ]);
      setTopics(t.topics);
      setAttempts(a.attempts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load English Competency data.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addTopic() {
    if (!newTitle.trim()) {
      setError("Topic title is required.");
      return;
    }
    setIsAdding(true);
    setError(null);
    try {
      const { topic } = await api<{ topic: Topic }>("/api/admin/competency/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle, description: newDescription }),
      });
      setTopics((prev) => [...prev, topic]);
      setNewTitle("");
      setNewDescription("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add topic.");
    } finally {
      setIsAdding(false);
    }
  }

  async function patchTopic(id: string, patch: Partial<Pick<Topic, "title" | "description" | "active">>) {
    setBusyTopic((p) => ({ ...p, [id]: true }));
    setError(null);
    try {
      const { topic } = await api<{ topic: Topic }>("/api/admin/competency/topics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      setTopics((prev) => prev.map((t) => (t.id === id ? topic : t)));
      setEditing((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update topic.");
    } finally {
      setBusyTopic((p) => ({ ...p, [id]: false }));
    }
  }

  async function deleteTopic(id: string) {
    setBusyTopic((p) => ({ ...p, [id]: true }));
    setError(null);
    try {
      await api(`/api/admin/competency/topics?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setTopics((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete topic.");
    } finally {
      setBusyTopic((p) => ({ ...p, [id]: false }));
      setConfirmDelete(null);
    }
  }

  const filteredAttempts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return attempts;
    return attempts.filter(
      (a) => a.candidate_name.toLowerCase().includes(q) || a.candidate_email.toLowerCase().includes(q),
    );
  }, [attempts, search]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {/* Topics */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold">English Competency Topics</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Candidates choose one active topic and speak about it. Inactive topics are hidden from candidates.
          </p>
        </div>

        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <input
            className={inputClass}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Topic title, e.g. “A trip you will never forget”"
          />
          <textarea
            className="min-h-[72px] w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Optional guidance shown under the title, e.g. “Where did you go, what happened, and why do you remember it?”"
          />
          <div className="flex justify-end">
            <button type="button" className="btn btn-primary disabled:opacity-50" onClick={addTopic} disabled={isAdding}>
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add topic
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b dark:border-white/10">
                <th className="py-2 pr-4">Active</th>
                <th className="py-2 pr-4">Topic</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => {
                const edit = editing[t.id];
                const busy = !!busyTopic[t.id];
                return (
                  <tr key={t.id} className="border-b align-top dark:border-white/5">
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => patchTopic(t.id, { active: !t.active })}
                        className={[
                          "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                          t.active
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "bg-slate-500/10 text-slate-700 dark:text-slate-300",
                        ].join(" ")}
                      >
                        {t.active ? "Yes" : "No"}
                      </button>
                    </td>
                    <td className="w-full py-3 pr-4">
                      {edit ? (
                        <div className="grid gap-2">
                          <input
                            className={inputClass}
                            value={edit.title}
                            onChange={(e) => setEditing((p) => ({ ...p, [t.id]: { ...edit, title: e.target.value } }))}
                          />
                          <textarea
                            className="min-h-[60px] w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
                            value={edit.description}
                            onChange={(e) =>
                              setEditing((p) => ({ ...p, [t.id]: { ...edit, description: e.target.value } }))
                            }
                          />
                        </div>
                      ) : (
                        <>
                          <div className="font-semibold">{t.title}</div>
                          {t.description ? (
                            <div className="text-slate-600 dark:text-slate-300">{t.description}</div>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4">
                      {edit ? (
                        <div className="flex gap-3">
                          <button
                            type="button"
                            className="font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                            disabled={busy}
                            onClick={() => patchTopic(t.id, { title: edit.title, description: edit.description })}
                          >
                            {busy ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="text-slate-500 hover:text-slate-700"
                            onClick={() =>
                              setEditing((p) => {
                                const next = { ...p };
                                delete next[t.id];
                                return next;
                              })
                            }
                          >
                            Cancel
                          </button>
                        </div>
                      ) : confirmDelete === t.id ? (
                        <div className="flex gap-3">
                          <button
                            type="button"
                            className="font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                            disabled={busy}
                            onClick={() => deleteTopic(t.id)}
                          >
                            {busy ? "Deleting…" : "Yes, delete"}
                          </button>
                          <button
                            type="button"
                            className="text-slate-500 hover:text-slate-700"
                            onClick={() => setConfirmDelete(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-3">
                          <button
                            type="button"
                            className="text-indigo-600 hover:text-indigo-700"
                            onClick={() =>
                              setEditing((p) => ({ ...p, [t.id]: { title: t.title, description: t.description ?? "" } }))
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-rose-600 hover:text-rose-700"
                            onClick={() => setConfirmDelete(t.id)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {topics.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-slate-500">
                    No topics yet. Candidates can’t start the test until you add one.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Results */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold">English Competency Results</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {attempts.filter((a) => a.status === "completed").length} completed · {attempts.length} total. To let a
              candidate retake the test, use the Reset tab.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              className={`${inputClass} sm:w-64`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email…"
            />
            <button type="button" className="btn btn-secondary" onClick={() => void load()} aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b dark:border-white/10">
                <th className="py-2 pr-4">Candidate</th>
                <th className="py-2 pr-4">Topic</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Score</th>
                <th className="py-2 pr-4">Level</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {filteredAttempts.map((a) => {
                const isOpen = openReport === a.id;
                return (
                  <Fragment key={a.id}>
                    <tr className="border-b dark:border-white/5">
                      <td className="py-3 pr-4">
                        <div className="font-semibold">{a.candidate_name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{a.candidate_email}</div>
                      </td>
                      <td className="py-3 pr-4">{a.topic_title ?? "—"}</td>
                      <td className="py-3 pr-4">{STATUS_LABEL[a.status]}</td>
                      <td className="py-3 pr-4 font-semibold tabular-nums">
                        {a.overall_score !== null ? `${a.overall_score}/100` : "—"}
                      </td>
                      <td className="py-3 pr-4">{a.cefr_level ?? "—"}</td>
                      <td className="whitespace-nowrap py-3 pr-4 text-slate-600 dark:text-slate-300">
                        {new Date(a.completed_at ?? a.started_at).toLocaleString()}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {a.report ? (
                          <button
                            type="button"
                            className="font-semibold text-indigo-600 hover:text-indigo-700"
                            onClick={() => setOpenReport(isOpen ? null : a.id)}
                          >
                            {isOpen ? "Hide" : "View report"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {isOpen && a.report ? (
                      <tr>
                        <td colSpan={7} className="py-4">
                          <CompetencyReport
                            report={a.report}
                            overallScore={a.overall_score ?? 0}
                            cefrLevel={a.cefr_level ?? ""}
                            subtitle={`${a.candidate_name} · ${a.topic_title ?? ""}`}
                            transcript={a.transcript}
                            metrics={a.metrics}
                            followUpQuestion={a.followup_question}
                            followUpTranscript={a.followup_transcript}
                            followUpMetrics={a.followup_metrics}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {filteredAttempts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-slate-500">
                    No results yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
