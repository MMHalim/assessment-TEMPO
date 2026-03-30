"use client";

import { ArrowRight, ChevronDown, Loader2, Mail, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type CandidateOption = {
  name: string;
  timestamp: string;
  submitted: boolean;
};

export default function StartPage() {
  const router = useRouter();
  const [candidateEmail, setCandidateEmail] = useState("");
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [nameFilter, setNameFilter] = useState("");
  const [isNameMenuOpen, setIsNameMenuOpen] = useState(false);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameMenuRef = useRef<HTMLDivElement | null>(null);
  const nameSearchRef = useRef<HTMLInputElement | null>(null);

  const normalizedFilter = nameFilter.trim().toLowerCase();
  const filteredCandidates = normalizedFilter
    ? candidates.filter((c) => {
        const name = c.name.toLowerCase();
        return name.includes(normalizedFilter) || c.timestamp.includes(nameFilter.trim());
      })
    : candidates;

  const selectedCandidate = selectedKey
    ? candidates.find((c) => `${c.timestamp}::${c.name}` === selectedKey) ?? null
    : null;

  const visibleCandidates =
    selectedCandidate &&
    !filteredCandidates.some((c) => `${c.timestamp}::${c.name}` === selectedKey)
      ? [selectedCandidate, ...filteredCandidates]
      : filteredCandidates;

  useEffect(() => {
    if (!isNameMenuOpen) return;
    const t = window.setTimeout(() => nameSearchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isNameMenuOpen]);

  useEffect(() => {
    if (!isNameMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = nameMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setIsNameMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsNameMenuOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isNameMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    async function loadCandidates() {
      setIsLoadingCandidates(true);
      try {
        const res = await fetch("/api/empdb/candidates");
        if (!res.ok) throw new Error("Failed to load candidates");
        const body = (await res.json()) as
          | { ok: true; candidates: CandidateOption[] }
          | { ok: false; error: string };

        if (cancelled) return;

        if (!body.ok) {
          setError(body.error);
          setCandidates([]);
          return;
        }

        const sorted = [...body.candidates].sort((a, b) =>
          a.timestamp.localeCompare(b.timestamp),
        );
        setCandidates(sorted);
      } catch (e) {
        if (cancelled) return;
        const message =
          e instanceof Error ? e.message : "Failed to load candidates";
        setError(message);
      } finally {
        if (!cancelled) setIsLoadingCandidates(false);
      }
    }

    void loadCandidates();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleStart() {
    setError(null);

    const selected = candidates.find(
      (c) => `${c.timestamp}::${c.name}` === selectedKey,
    );

    const name = selected?.name?.trim() ?? "";
    const timestamp = selected?.timestamp?.trim() ?? "";
    const email = candidateEmail.trim().toLowerCase();

    if (!name) {
      setError("Please select your name from the list.");
      return;
    }

    if (selected?.submitted) {
      setError("You already submitted this assessment.");
      return;
    }

    if (!timestamp) {
      setError("Missing candidate reference.");
      return;
    }

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/assessment/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, timestamp, email }),
      });

      const body = (await res.json().catch(() => null)) as
        | { ok: true; attemptId: string }
        | { ok: false; error: string }
        | null;

      if (!res.ok || !body || !("ok" in body) || !body.ok) {
        const message =
          body && "error" in body && typeof body.error === "string"
            ? body.error
            : "Failed to start assessment.";
        throw new Error(message);
      }

      router.push(`/assessment/${body.attemptId}`);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to start assessment.";
      setError(message);
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="card p-7 dark:card-dark">
          <div className="flex flex-col gap-2">
            <div className="pill w-fit">Candidate details</div>
            <h1 className="text-2xl font-bold tracking-tight">
              Start your assessment
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Enter your details to begin. Your answers are saved automatically.
            </p>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="grid gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <UserCheck className="h-4 w-4" />
                Select your name
              </div>
              <div className="relative" ref={nameMenuRef}>
                <button
                  type="button"
                  disabled={isLoadingCandidates}
                  onClick={() => setIsNameMenuOpen((v) => !v)}
                  className="flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left text-sm outline-none focus:border-slate-400 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white"
                >
                  <span className="truncate">
                    {selectedCandidate
                      ? `${selectedCandidate.name} — ${selectedCandidate.timestamp}`
                      : isLoadingCandidates
                        ? "Loading…"
                        : "Select your name"}
                  </span>
                  <ChevronDown
                    className={[
                      "h-4 w-4 shrink-0 text-slate-500 dark:text-slate-300 transition-transform",
                      isNameMenuOpen ? "rotate-180" : "",
                    ].join(" ")}
                  />
                </button>

                {isNameMenuOpen && (
                  <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-white/5 dark:backdrop-blur-xl">
                    <div className="border-b border-slate-200 p-3 dark:border-white/10">
                      <input
                        ref={nameSearchRef}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-black/20 dark:text-white"
                        value={nameFilter}
                        onChange={(e) => setNameFilter(e.target.value)}
                        placeholder="Search…"
                      />
                    </div>
                    <div className="max-h-72 overflow-auto p-2 dark:bg-black/10">
                      {visibleCandidates.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-300">
                          No matches
                        </div>
                      ) : (
                        visibleCandidates.map((c) => {
                          const key = `${c.timestamp}::${c.name}`;
                          const active = key === selectedKey;
                          const disabled = c.submitted;
                          return (
                            <button
                              key={key}
                              type="button"
                              disabled={disabled}
                              onClick={() => {
                                if (disabled) return;
                                setSelectedKey(key);
                                setIsNameMenuOpen(false);
                              }}
                              className={[
                                "w-full rounded-xl px-3 py-2 text-left text-sm",
                                disabled
                                  ? "cursor-not-allowed text-slate-400 dark:text-slate-500"
                                  : active
                                    ? "bg-indigo-600 text-white"
                                    : "text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10",
                              ].join(" ")}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="truncate">
                                  {c.name} — {c.timestamp}
                                </span>
                                {disabled ? (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                                    Submitted
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </label>

            <label className="grid gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <Mail className="h-4 w-4" />
                Confirm your email (security)
              </div>
              <input
                className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/5"
                value={candidateEmail}
                onChange={(e) => setCandidateEmail(e.target.value)}
                placeholder="Type the same email used in the application form"
                autoComplete="email"
              />
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Access is granted only if it matches the email in empDB.
              </div>
            </label>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              If you don’t see your name, check with the host.
            </div>

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                {error}
              </div>
            ) : null}

            <button
              className="btn btn-primary h-12 w-full disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleStart}
              disabled={isSubmitting || isLoadingCandidates}
              type="button"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Starting…
                </>
              ) : (
                <>
                  Begin <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
    </main>
  );
}
