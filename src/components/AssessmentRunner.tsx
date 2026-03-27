"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import type {
  AssessmentQuestion,
  AssessmentSection,
} from "@/lib/assessmentTypes";
import {
  ChevronRight,
  CircleCheck,
  CircleDashed,
  Loader2,
} from "lucide-react";

type Props = {
  attemptId: string;
};

type Step =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "typing" }
  | { type: "ready" }
  | { type: "done"; totalScore: number; maxScore: number };

type SelectedChoice = "A" | "B" | "C" | "D";

export default function AssessmentRunner({ attemptId }: Props) {
  const router = useRouter();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [step, setStep] = useState<Step>({ type: "loading" });

  const [sections, setSections] = useState<AssessmentSection[]>([]);
  const [questionsBySection, setQuestionsBySection] = useState<
    Record<string, AssessmentQuestion[]>
  >({});

  const [sectionIndex, setSectionIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<SelectedChoice | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showBackModal, setShowBackModal] = useState(false);

  const [typingParagraph, setTypingParagraph] = useState<{ id: string; text: string } | null>(null);
  const [typingInput, setTypingInput] = useState("");
  const [typingStartedAtMs, setTypingStartedAtMs] = useState<number | null>(null);
  const [typingTimeLeft, setTypingTimeLeft] = useState<number>(60);
  const [typingStage, setTypingStage] = useState<"idle" | "running" | "saving" | "done">("idle");
  const [typingSummary, setTypingSummary] = useState<{
    wpm: number;
    accuracy: number;
    correctChars: number;
    totalCompared: number;
    extraChars: number;
    missingChars: number;
  } | null>(null);

  const currentSection = sections[sectionIndex] ?? null;
  const currentQuestions = currentSection
    ? questionsBySection[currentSection.id] ?? []
    : [];
  const currentQuestion = currentQuestions[questionIndex] ?? null;

  // Save current progress to local storage
  useEffect(() => {
    if (step.type === "ready" && attemptId && timeLeft !== null) {
      const stateToSave = {
        sectionIndex,
        questionIndex,
        timeLeft,
        lastUpdated: Date.now()
      };
      sessionStorage.setItem(`assessment_state_${attemptId}`, JSON.stringify(stateToSave));
    }
  }, [sectionIndex, questionIndex, timeLeft, step.type, attemptId]);

  // Initialize timer when section changes
  useEffect(() => {
    if (step.type === "ready" && currentSection) {
      // Check if we have saved state for this section
      const savedStateStr = sessionStorage.getItem(`assessment_state_${attemptId}`);
      if (savedStateStr) {
        try {
          const savedState = JSON.parse(savedStateStr);
          // Only use saved timer if we're on the same section and it hasn't expired
          if (savedState.sectionIndex === sectionIndex && savedState.timeLeft !== null) {
            // Calculate how much time passed since last save in case of a crash/reload
            const elapsedSeconds = Math.floor((Date.now() - savedState.lastUpdated) / 1000);
            const adjustedTimeLeft = Math.max(0, savedState.timeLeft - elapsedSeconds);
            
            // Only set if we haven't already set the timer for this section
            if (timeLeft === null) {
              setTimeLeft(adjustedTimeLeft);
            }
            return;
          }
        } catch (e) {
          console.error("Error parsing saved state", e);
        }
      }
      
      // If no saved state or different section, use default
      if (timeLeft === null) {
        setTimeLeft(currentSection.time_limit_seconds || 600);
      }
    }
  }, [sectionIndex, step.type, currentSection, attemptId, timeLeft]);

  const finishAssessment = useCallback(async () => {
    if (!supabase) return;
    setIsSaving(true);
    try {
      const { data: scores, error: scoresError } = await supabase
        .from("assessment_attempt_answers")
        .select("score_awarded")
        .eq("attempt_id", attemptId);
      if (scoresError) throw scoresError;

      const totalScore = (scores ?? []).reduce(
        (sum, row) => sum + (row.score_awarded ?? 0),
        0,
      );

      const maxScore = sections.reduce((sum, section) => {
        const qs = questionsBySection[section.id] ?? [];
        return sum + qs.reduce((s, q) => s + (q.points ?? 0), 0);
      }, 0);

      await supabase
        .from("assessment_attempts")
        .update({
          completed_at: new Date().toISOString(),
          total_score: totalScore,
          max_score: maxScore,
        })
        .eq("id", attemptId);

      // Clear the saved state since assessment is complete
      sessionStorage.removeItem(`assessment_state_${attemptId}`);

      setStep({ type: "done", totalScore, maxScore });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to save your answer.";
      setStep({ type: "error", message });
    } finally {
      setIsSaving(false);
    }
  }, [attemptId, sections, questionsBySection, supabase]);

  const handleSectionTimeUp = useCallback(() => {
    const isLastSection = sectionIndex + 1 >= sections.length;
    if (!isLastSection) {
      const nextSectionIndex = sectionIndex + 1;
      setSectionIndex(nextSectionIndex);
      setQuestionIndex(0);
      setSelectedChoice(null);
      // Reset timer to the new section's time limit
      const nextSectionTimeLimit = sections[nextSectionIndex]?.time_limit_seconds || 600;
      setTimeLeft(nextSectionTimeLimit);
      
      // Update session storage for persistence
      const stateToSave = {
        sectionIndex: nextSectionIndex,
        questionIndex: 0,
        timeLeft: nextSectionTimeLimit,
        lastUpdated: Date.now()
      };
      sessionStorage.setItem(`assessment_state_${attemptId}`, JSON.stringify(stateToSave));
    } else {
      void finishAssessment();
    }
  }, [sectionIndex, sections, attemptId, finishAssessment]);

  // Handle countdown timer
  useEffect(() => {
    if (step.type !== "ready" || timeLeft === null || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          handleSectionTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, step.type, handleSectionTimeUp]);

  // Disable back button and show warning modal
  useEffect(() => {
    if (step.type === "ready" || step.type === "typing") {
      history.pushState(null, "", window.location.href);
      const handlePopState = () => {
        history.pushState(null, "", window.location.href);
        setShowBackModal(true);
      };
      window.addEventListener("popstate", handlePopState);
      return () => window.removeEventListener("popstate", handlePopState);
    }
  }, [step.type]);

  const sectionProgress = currentQuestions.length
    ? (questionIndex + 1) / currentQuestions.length
    : 0;

  const load = useCallback(async () => {
    if (!supabase) {
      setStep({
        type: "error",
        message: "App is not configured yet. Missing Supabase environment.",
      });
      return;
    }
    setStep({ type: "loading" });
    try {
      const { data: sectionsData, error: sectionsError } = await supabase
        .from("assessment_sections")
        .select("id, slug, title, description, sort_order, time_limit_seconds")
        .order("sort_order", { ascending: true });
      if (sectionsError) throw sectionsError;

      const { data: questionsData, error: questionsError } = await supabase
        .from("assessment_questions")
        .select(
          "id, section_id, question_type, prompt, choice_a, choice_b, choice_c, choice_d, points, sort_order",
        )
        .order("sort_order", { ascending: true });
      if (questionsError) throw questionsError;

      const map: Record<string, AssessmentQuestion[]> = {};
      for (const q of questionsData as AssessmentQuestion[]) {
        map[q.section_id] = map[q.section_id] ? [...map[q.section_id], q] : [q];
      }

      // Check if attempt exists and is valid
      const { data: attemptData, error: attemptError } = await supabase
        .from("assessment_attempts")
        .select("id, completed_at")
        .eq("id", attemptId)
        .single();

      if (attemptError) {
         throw attemptError;
      }

      if (attemptData?.completed_at) {
        throw new Error("This assessment has already been completed.");
      }

      // Check if we have a saved state to restore
      let startSectionIndex = 0;
      let startQuestionIndex = 0;
      let restoredFromSession = false;
      
      const savedStateStr = sessionStorage.getItem(`assessment_state_${attemptId}`);
      if (savedStateStr) {
        try {
          const savedState = JSON.parse(savedStateStr);
          startSectionIndex = savedState.sectionIndex || 0;
          startQuestionIndex = savedState.questionIndex || 0;
          restoredFromSession = true;
          
          // Ensure indices are within bounds
          if (startSectionIndex >= sectionsData.length) startSectionIndex = 0;
          // Note: we can't fully validate questionIndex until we build the map, 
          // but we'll use it as a starting point
        } catch (e) {
          console.error("Error restoring saved state", e);
        }
      }

      if (!restoredFromSession) {
        const { data: answersData, error: answersError } = await supabase
          .from("assessment_attempt_answers")
          .select("question_id")
          .eq("attempt_id", attemptId);
        if (answersError) throw answersError;

        const answered = new Set<string>((answersData ?? []).map((r) => String((r as { question_id: string }).question_id)));

        let found = false;
        for (let si = 0; si < sectionsData.length; si++) {
          const section = sectionsData[si] as AssessmentSection;
          const qs = map[section.id] ?? [];
          const qi = qs.findIndex((q) => !answered.has(q.id));
          if (qi !== -1) {
            startSectionIndex = si;
            startQuestionIndex = qi;
            found = true;
            break;
          }
        }

        if (!found) {
          startSectionIndex = 0;
          startQuestionIndex = 0;
        }
      }

      setSections(sectionsData as AssessmentSection[]);
      setQuestionsBySection(map);
      setSectionIndex(startSectionIndex);
      
      // Ensure question index is valid for the restored section
      const sectionQuestions = map[sectionsData[startSectionIndex].id] || [];
      if (startQuestionIndex >= sectionQuestions.length) {
        startQuestionIndex = 0;
      }
      setQuestionIndex(startQuestionIndex);
      
      setSelectedChoice(null);

      const { data: typingRow, error: typingRowError } = await supabase
        .from("typing_test_results")
        .select("attempt_id, paragraph_id, completed_at")
        .eq("attempt_id", attemptId)
        .maybeSingle();
      if (typingRowError) throw typingRowError;

      if (!typingRow?.completed_at) {
        let paragraphId = typingRow?.paragraph_id ? String(typingRow.paragraph_id) : "";
        if (!paragraphId) {
          const { data: paragraphs, error: paragraphsError } = await supabase
            .from("typing_paragraphs")
            .select("id, text")
            .eq("active", true);
          if (paragraphsError) throw paragraphsError;
          const list = (paragraphs ?? []) as Array<{ id: string; text: string }>;
          if (list.length === 0) {
            const defaultText =
              "Type this paragraph as accurately and quickly as you can. The timer is 1 minute and starts when you press any key. Focus on accuracy first, then speed.";

            const { data: seeded, error: seedError } = await supabase
              .from("typing_paragraphs")
              .insert({ text: defaultText, active: true })
              .select("id, text")
              .single();

            if (seedError || !seeded) {
              throw new Error(
                "Typing test is not configured yet. Please add at least 1 active paragraph in Admin → typing, then retry.",
              );
            }

            paragraphId = String(seeded.id);
            const { error: upsertTypingError } = await supabase
              .from("typing_test_results")
              .upsert(
                {
                  attempt_id: attemptId,
                  paragraph_id: paragraphId,
                },
                { onConflict: "attempt_id" },
              );
            if (upsertTypingError) throw upsertTypingError;
          } else {
            const chosen = list[Math.floor(Math.random() * list.length)];
            paragraphId = chosen.id;
            const { error: upsertTypingError } = await supabase
              .from("typing_test_results")
              .upsert(
                {
                  attempt_id: attemptId,
                  paragraph_id: paragraphId,
                },
                { onConflict: "attempt_id" },
              );
            if (upsertTypingError) throw upsertTypingError;
          }
        }

        const { data: paragraphRow, error: paragraphError } = await supabase
          .from("typing_paragraphs")
          .select("id, text")
          .eq("id", paragraphId)
          .single();
        if (paragraphError) throw paragraphError;

        setTypingParagraph({ id: String(paragraphRow.id), text: String(paragraphRow.text) });
        setTypingInput("");
        setTypingStartedAtMs(null);
        setTypingTimeLeft(60);
        setTypingStage("idle");
        setTypingSummary(null);
        setStep({ type: "typing" });
        return;
      }

      setStep({ type: "ready" });
    } catch (e: unknown) {
      console.error("Assessment load error:", e);
      const rawMessage =
        e && typeof e === "object" && "message" in e
          ? String(e.message)
          : "Failed to load assessment.";

      const normalized = rawMessage.toLowerCase();
      if (
        (normalized.includes("typing_test_results") ||
          normalized.includes("typing_paragraphs")) &&
        normalized.includes("does not exist")
      ) {
        setStep({
          type: "error",
          message:
            "Typing test tables are missing in Supabase. Create public.typing_paragraphs and public.typing_test_results, then reload.",
        });
        return;
      }

      setStep({ type: "error", message: `Error loading: ${rawMessage}` });
    }
  }, [supabase, attemptId]);

  useEffect(() => {
    setSupabase(getSupabaseBrowserClient());
  }, []);

  useEffect(() => {
    if (!supabase) return;
    void load();
  }, [load, supabase]);

  const computeTypingSummary = useCallback((source: string, typed: string) => {
    const s = source ?? "";
    const t = typed ?? "";
    const minLen = Math.min(s.length, t.length);
    let correct = 0;
    for (let i = 0; i < minLen; i++) {
      if (s[i] === t[i]) correct++;
    }
    const extra = Math.max(0, t.length - s.length);
    const missing = Math.max(0, s.length - t.length);
    const totalCompared = Math.max(s.length, t.length);
    const accuracy = totalCompared === 0 ? 0 : Math.round((correct / totalCompared) * 1000) / 10;
    const wpm = Math.max(0, Math.round(t.length / 5));
    return { wpm, accuracy, correctChars: correct, totalCompared, extraChars: extra, missingChars: missing };
  }, []);

  const finishTyping = useCallback(async () => {
    if (!supabase || !typingParagraph) return;
    if (typingStage === "saving" || typingStage === "done") return;
    setTypingStage("saving");
    const summary = computeTypingSummary(typingParagraph.text, typingInput);
    const nowIso = new Date().toISOString();
    const startedIso = typingStartedAtMs ? new Date(typingStartedAtMs).toISOString() : nowIso;
    const { error } = await supabase
      .from("typing_test_results")
      .upsert(
        {
          attempt_id: attemptId,
          paragraph_id: typingParagraph.id,
          started_at: startedIso,
          completed_at: nowIso,
          typed_text: typingInput,
          wpm: summary.wpm,
          accuracy: summary.accuracy,
          correct_chars: summary.correctChars,
          total_compared: summary.totalCompared,
          extra_chars: summary.extraChars,
          missing_chars: summary.missingChars,
        },
        { onConflict: "attempt_id" },
      );
    if (error) {
      setStep({ type: "error", message: `Failed to save typing result: ${error.message}` });
      return;
    }
    setTypingSummary(summary);
    setTypingStage("done");
  }, [
    attemptId,
    computeTypingSummary,
    supabase,
    typingInput,
    typingParagraph,
    typingStage,
    typingStartedAtMs,
  ]);

  useEffect(() => {
    if (step.type !== "typing") return;
    if (typingStage !== "running") return;
    if (typingTimeLeft <= 0) return;
    const timer = setInterval(() => {
      setTypingTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [step.type, typingStage, typingTimeLeft]);

  useEffect(() => {
    if (step.type !== "typing") return;
    if (typingStage !== "running") return;
    if (typingTimeLeft !== 0) return;
    void finishTyping();
  }, [finishTyping, step.type, typingStage, typingTimeLeft]);

  const continueToEnglish = useCallback(() => {
    setTimeLeft(null);
    setStep({ type: "ready" });
  }, []);

  async function saveAndNext() {
    if (!currentSection || !currentQuestion) return;

    if (!supabase) {
      setStep({
        type: "error",
        message: "App is not configured yet. Missing Supabase environment.",
      });
      return;
    }

    if (currentQuestion.question_type === "mcq" && !selectedChoice) return;

    setIsSaving(true);
    try {
      const payload =
        currentQuestion.question_type === "mcq"
          ? { selected_choice: selectedChoice }
          : { selected_choice: null };

      const { error: insertError } = await supabase
        .from("assessment_attempt_answers")
        .upsert(
          {
            attempt_id: attemptId,
            question_id: currentQuestion.id,
            ...payload,
          },
          { onConflict: "attempt_id,question_id" },
        );

      if (insertError) throw insertError;

      const isLastQuestion = questionIndex + 1 >= currentQuestions.length;
      if (!isLastQuestion) {
        setQuestionIndex((v) => v + 1);
        setSelectedChoice(null);
        setIsSaving(false);
        return;
      }

      const isLastSection = sectionIndex + 1 >= sections.length;
      if (!isLastSection) {
        setSectionIndex((v) => v + 1);
        setQuestionIndex(0);
        setSelectedChoice(null);
        setTimeLeft(null); // Reset timer for the next section
        setIsSaving(false);
        return;
      }

      await finishAssessment();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to save your answer.";
      setStep({ type: "error", message });
      setIsSaving(false);
    }
  }

  if (step.type === "loading") {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="card p-7 dark:card-dark">
          <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading assessment…
          </div>
        </div>
      </main>
    );
  }

  if (step.type === "typing") {
    const mm = Math.floor(typingTimeLeft / 60)
      .toString()
      .padStart(2, "0");
    const ss = (typingTimeLeft % 60).toString().padStart(2, "0");
    const timerText = typingStage === "idle" ? "01:00" : `${mm}:${ss}`;

    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="card p-7 dark:card-dark">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <div className="pill w-fit">Typing Test</div>
              <h1 className="text-2xl font-bold tracking-tight">Typing speed & accuracy</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                The timer starts when you press any key.
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div
                className={[
                  "text-2xl font-mono font-bold",
                  typingStage === "running"
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-slate-500 dark:text-slate-300",
                ].join(" ")}
              >
                {timerText}
              </div>
              {typingStage === "saving" && (
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 whitespace-pre-wrap leading-7">
              {typingParagraph ? typingParagraph.text : "Loading…"}
            </div>

            <textarea
              className="min-h-[180px] w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
              value={typingInput}
              onChange={(e) => setTypingInput(e.target.value)}
              onKeyDown={() => {
                if (typingStage !== "idle") return;
                const now = Date.now();
                setTypingStartedAtMs(now);
                setTypingTimeLeft(60);
                setTypingStage("running");
                if (!supabase || !typingParagraph) return;
                void supabase
                  .from("typing_test_results")
                  .upsert(
                    {
                      attempt_id: attemptId,
                      paragraph_id: typingParagraph.id,
                      started_at: new Date(now).toISOString(),
                    },
                    { onConflict: "attempt_id" },
                  );
              }}
              disabled={typingStage === "saving" || typingStage === "done"}
              placeholder="Start typing here…"
            />

            {typingStage === "done" && typingSummary && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs font-semibold text-slate-500">WPM</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{typingSummary.wpm}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
                  <div className="text-xs font-semibold text-slate-500">Accuracy</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                    {typingSummary.accuracy}%
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end">
              <button
                className="btn btn-primary h-11 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={continueToEnglish}
                disabled={typingStage !== "done"}
              >
                Continue to English <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {showBackModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:border dark:border-white/10 dark:bg-slate-900">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Are you sure you want to go back?</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                The assessment will be skipped and your progress may be lost.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowBackModal(false)}
                  className="btn border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  No, continue
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowBackModal(false);
                    router.push("/");
                  }}
                  className="btn bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600"
                >
                  Yes, skip
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  if (step.type === "error") {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="card p-7 dark:card-dark">
          <div className="text-sm font-semibold text-rose-700 dark:text-rose-200">
            Something went wrong
          </div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {step.message}
          </div>
          <button
            className="btn btn-secondary mt-6 w-fit"
            onClick={load}
            type="button"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (step.type === "done") {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="card p-7 dark:card-dark">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="pill w-fit">Completed</div>
              <h1 className="text-2xl font-bold tracking-tight">
                Assessment submitted
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Your results have been saved.
              </p>
            </div>
            <div className="grid place-items-center rounded-2xl bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-300">
              <CircleCheck className="h-6 w-6" />
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
              <div className="text-xs font-semibold text-slate-500">
                Total score
              </div>
              <div className="mt-1 text-2xl font-bold">
                {step.totalScore} / {step.maxScore}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
              <div className="text-xs font-semibold text-slate-500">
                Sections
              </div>
              <div className="mt-1 text-2xl font-bold">{sections.length}</div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Assessment
          </div>
          <div className="text-lg font-bold tracking-tight">
            {currentSection ? currentSection.title : "Loading…"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {timeLeft !== null && (
            <div className="text-lg font-mono font-bold text-rose-600 dark:text-rose-400">
              {Math.floor(timeLeft / 60)
                .toString()
                .padStart(2, "0")}
              :{(timeLeft % 60).toString().padStart(2, "0")}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="card p-5 dark:card-dark">
          <div className="text-xs font-semibold text-slate-500">Sections</div>
          <div className="mt-4 grid gap-2">
            {sections.map((s, idx) => {
              const active = idx === sectionIndex;
              const done = idx < sectionIndex;
              const icon = done ? (
                <CircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
              ) : active ? (
                <CircleDashed className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
              ) : (
                <CircleDashed className="h-4 w-4 text-slate-400" />
              );

              return (
                <div
                  key={s.id}
                  className={[
                    "flex items-center gap-3 rounded-xl border px-3 py-2 text-sm",
                    active
                      ? "border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                      : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5",
                  ].join(" ")}
                >
                  {icon}
                  <div className="flex-1">
                    <div className="font-semibold">{s.title}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="card p-7 dark:card-dark">
          {!currentQuestion ? (
            <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading questions…
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between gap-4">
                <div className="pill">
                  Q {questionIndex + 1} / {currentQuestions.length}
                </div>
                <div className="text-xs font-semibold text-slate-500">
                  {Math.round(sectionProgress * 100)}%
                </div>
              </div>

              <div className="text-xl font-bold tracking-tight">
                {currentQuestion.prompt}
              </div>

              {currentQuestion.question_type === "mcq" ? (
                <div className="grid gap-3">
                  {(
                    [
                      ["A", currentQuestion.choice_a],
                      ["B", currentQuestion.choice_b],
                      ["C", currentQuestion.choice_c],
                      ["D", currentQuestion.choice_d],
                    ] as const
                  ).map(([letter, text]) => {
                    if (!text) return null;
                    const selected = selectedChoice === letter;
                    return (
                      <button
                        key={letter}
                        type="button"
                        className={[
                          "flex items-start gap-3 rounded-2xl border px-4 py-4 text-left transition",
                          selected
                            ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                            : "border-slate-200 bg-white hover:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20",
                        ].join(" ")}
                        onClick={() => setSelectedChoice(letter)}
                      >
                        <div
                          className={[
                            "grid h-8 w-8 place-items-center rounded-xl text-xs font-bold",
                            selected
                              ? "bg-white/15 text-white dark:bg-black/10 dark:text-slate-900"
                              : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200",
                          ].join(" ")}
                        >
                          {letter}
                        </div>
                        <div className="text-sm font-semibold leading-6">
                          {text}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  Spoken English section is ready in the data model. Add your
                  pronunciation prompts to the question bank and collect audio in
                  the next iteration.
                </div>
              )}

              <div className="flex items-center justify-end">
                <button
                  className="btn btn-primary h-11 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={saveAndNext}
                  disabled={
                    isSaving ||
                    (currentQuestion.question_type === "mcq" && !selectedChoice)
                  }
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      Next <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Back Button Warning Modal */}
      {showBackModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:border dark:border-white/10 dark:bg-slate-900">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Are you sure you want to go back?
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              The assessment will be skipped and your progress may be lost.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowBackModal(false)}
                className="btn border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                No, continue
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBackModal(false);
                  router.push("/");
                }}
                className="btn bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600"
              >
                Yes, skip
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
