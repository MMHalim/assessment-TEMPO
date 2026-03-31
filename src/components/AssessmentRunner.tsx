"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  | { type: "review" }
  | { type: "ready" }
  | { type: "done"; totalScore: number; maxScore: number };

type SelectedChoice = "A" | "B" | "C" | "D";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export default function AssessmentRunner({ attemptId }: Props) {
  const router = useRouter();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [step, setStep] = useState<Step>({ type: "loading" });
  const hasAutoAdvancedOnTimeUpRef = useRef(false);
  const typingAutoFinishRef = useRef(false);

  const [sections, setSections] = useState<AssessmentSection[]>([]);
  const [questionsBySection, setQuestionsBySection] = useState<
    Record<string, AssessmentQuestion[]>
  >({});
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<string>>(
    () => new Set<string>(),
  );

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
  const [typingCompleted, setTypingCompleted] = useState(false);
  const [typingSummary, setTypingSummary] = useState<{
    wpm: number;
    accuracy: number;
    correctChars: number;
    totalCompared: number;
    extraChars: number;
    missingChars: number;
  } | null>(null);

  const spokenRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [spokenIsListening, setSpokenIsListening] = useState(false);
  const [spokenParagraphVisible, setSpokenParagraphVisible] = useState(false);
  const [spokenLiveTranscript, setSpokenLiveTranscript] = useState("");
  const [spokenExpectedWords, setSpokenExpectedWords] = useState<string[]>([]);
  const [spokenMatchedWordCount, setSpokenMatchedWordCount] = useState(0);
  const [spokenError, setSpokenError] = useState<string | null>(null);
  const [spokenReadyToSubmit, setSpokenReadyToSubmit] = useState(false);
  const [spokenScorePercent, setSpokenScorePercent] = useState<number | null>(null);
  const spokenLastTranscriptRef = useRef<string>("");
  const spokenHasFinalizedRef = useRef(false);

  const currentSection = sections[sectionIndex] ?? null;
  const currentQuestions = currentSection
    ? questionsBySection[currentSection.id] ?? []
    : [];
  const currentQuestion = currentQuestions[questionIndex] ?? null;
  const isSpokenQuestion = currentQuestion?.question_type === "spoken";

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

  const findFirstIncomplete = useCallback(
    (answered: Set<string>) => {
      for (let si = 0; si < sections.length; si++) {
        const s = sections[si];
        const slug = (s?.slug ?? "").toLowerCase();
        const title = (s?.title ?? "").toLowerCase();
        const isTyping = slug.includes("typing") || title.includes("typing");
        if (isTyping) {
          if (!typingCompleted) return { sectionIndex: si, questionIndex: 0, step: "typing" as const };
          continue;
        }
        const qs = questionsBySection[s.id] ?? [];
        if (qs.length === 0) continue;
        const qi = qs.findIndex((q) => !answered.has(q.id));
        if (qi !== -1) return { sectionIndex: si, questionIndex: qi, step: "ready" as const };
      }
      return null;
    },
    [questionsBySection, sections, typingCompleted],
  );

  const advanceToNextSectionOrReview = useCallback(async () => {
    const isLastSection = sectionIndex + 1 >= sections.length;
    if (!isLastSection) {
      const nextSectionIndex = sectionIndex + 1;
      setSectionIndex(nextSectionIndex);
      setQuestionIndex(0);
      setSelectedChoice(null);
      setTimeLeft(null);
      hasAutoAdvancedOnTimeUpRef.current = false;

      const nextSectionTimeLimit = sections[nextSectionIndex]?.time_limit_seconds || 600;
      const stateToSave = {
        sectionIndex: nextSectionIndex,
        questionIndex: 0,
        timeLeft: nextSectionTimeLimit,
        lastUpdated: Date.now(),
      };
      sessionStorage.setItem(`assessment_state_${attemptId}`, JSON.stringify(stateToSave));
      return;
    }

    const firstIncomplete = findFirstIncomplete(answeredQuestionIds);
    if (firstIncomplete) {
      setStep({ type: "review" });
      return;
    }

    await finishAssessment();
  }, [attemptId, answeredQuestionIds, findFirstIncomplete, finishAssessment, sectionIndex, sections]);

  // Handle countdown timer
  useEffect(() => {
    if (step.type !== "ready" || timeLeft === null || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, step.type]);

  useEffect(() => {
    if (step.type !== "ready") return;
    if (timeLeft === null) return;
    if (timeLeft > 0) {
      hasAutoAdvancedOnTimeUpRef.current = false;
      return;
    }
    if (hasAutoAdvancedOnTimeUpRef.current) return;
    hasAutoAdvancedOnTimeUpRef.current = true;
    void advanceToNextSectionOrReview();
  }, [advanceToNextSectionOrReview, step.type, timeLeft]);

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

  const isSpokenEnglishSection = useCallback((s: AssessmentSection | null) => {
    if (!s) return false;
    const slug = (s.slug ?? "").toLowerCase();
    const title = (s.title ?? "").toLowerCase();
    return slug.includes("spoken_english") || title.includes("spoken english");
  }, []);

  const isTypingSection = useCallback((s: AssessmentSection | null) => {
    if (!s) return false;
    const slug = (s.slug ?? "").toLowerCase();
    const title = (s.title ?? "").toLowerCase();
    return slug.includes("typing") || title.includes("typing");
  }, []);

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

      const desiredOrder = [
        (s: AssessmentSection) => (s.slug ?? "").toLowerCase() === "general_english" || (s.title ?? "").toLowerCase().includes("general english"),
        (s: AssessmentSection) => (s.slug ?? "").toLowerCase().includes("call_center") || (s.title ?? "").toLowerCase().includes("call center"),
        (s: AssessmentSection) => (s.slug ?? "").toLowerCase().includes("usa") || (s.title ?? "").toLowerCase().includes("usa culture"),
        (s: AssessmentSection) => (s.slug ?? "").toLowerCase().includes("sales") || (s.title ?? "").toLowerCase().includes("sales & retention") || (s.title ?? "").toLowerCase().includes("sales and retention"),
        (s: AssessmentSection) => (s.slug ?? "").toLowerCase().includes("fitness") || (s.title ?? "").toLowerCase().includes("virtual fitness"),
        (s: AssessmentSection) => (s.slug ?? "").toLowerCase().includes("typing") || (s.title ?? "").toLowerCase().includes("typing"),
        (s: AssessmentSection) => (s.slug ?? "").toLowerCase().includes("spoken_english") || (s.title ?? "").toLowerCase().includes("spoken english"),
      ] as const;

      const rankSection = (s: AssessmentSection) => {
        const idx = desiredOrder.findIndex((fn) => fn(s));
        return idx === -1 ? 999 : idx;
      };

      const sortedSections = [...(sectionsData as AssessmentSection[])].sort((a, b) => {
        const ra = rankSection(a);
        const rb = rankSection(b);
        if (ra !== rb) return ra - rb;
        const soA = typeof a.sort_order === "number" ? a.sort_order : 0;
        const soB = typeof b.sort_order === "number" ? b.sort_order : 0;
        return soA - soB;
      });

      const hasTypingSection = sortedSections.some((s) => {
        const slug = (s.slug ?? "").toLowerCase();
        const title = (s.title ?? "").toLowerCase();
        return slug.includes("typing") || title.includes("typing");
      });

      if (!hasTypingSection) {
        const spokenIdx = sortedSections.findIndex((s) => {
          const slug = (s.slug ?? "").toLowerCase();
          const title = (s.title ?? "").toLowerCase();
          return slug.includes("spoken_english") || title.includes("spoken english");
        });

        const insertAt = spokenIdx === -1 ? sortedSections.length : spokenIdx;
        const typingSection: AssessmentSection = {
          id: "__typing__",
          slug: "typing",
          title: "Typing Speed & Accuracy",
          description: null,
          sort_order: 9999,
          time_limit_seconds: 60,
        };
        sortedSections.splice(insertAt, 0, typingSection);
      }

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
          if (startSectionIndex >= sortedSections.length) startSectionIndex = 0;
          // Note: we can't fully validate questionIndex until we build the map, 
          // but we'll use it as a starting point
        } catch (e) {
          console.error("Error restoring saved state", e);
        }
      }

      const { data: answersData, error: answersError } = await supabase
        .from("assessment_attempt_answers")
        .select("question_id")
        .eq("attempt_id", attemptId);
      if (answersError) throw answersError;

      const answered = new Set<string>(
        (answersData ?? []).map((r) => String((r as { question_id: string }).question_id)),
      );
      setAnsweredQuestionIds(answered);

      if (!restoredFromSession) {
        let found = false;
        for (let si = 0; si < sortedSections.length; si++) {
          const section = sortedSections[si] as AssessmentSection;
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

      setSections(sortedSections as AssessmentSection[]);
      setQuestionsBySection(map);
      setSectionIndex(startSectionIndex);
      
      // Ensure question index is valid for the restored section
      const sectionQuestions = map[sortedSections[startSectionIndex].id] || [];
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

      setTypingCompleted(Boolean(typingRow?.completed_at));

      if (!typingRow?.completed_at) {
        const typingIdx = sortedSections.findIndex((s) => {
          const slug = (s.slug ?? "").toLowerCase();
          const title = (s.title ?? "").toLowerCase();
          return slug.includes("typing") || title.includes("typing");
        });
        if (typingIdx !== -1 && startSectionIndex >= typingIdx) {
          setSectionIndex(typingIdx);
          setQuestionIndex(0);
          setSelectedChoice(null);
          setTimeLeft(null);
        }
      }

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

  useEffect(() => {
    if (step.type !== "ready") return;
    if (!currentSection) return;
    if (typingCompleted) return;
    if (!isTypingSection(currentSection) && !isSpokenEnglishSection(currentSection)) return;
    if (!typingParagraph) return;
    setTypingInput("");
    setTypingStartedAtMs(null);
    setTypingTimeLeft(60);
    setTypingStage("idle");
    setTypingSummary(null);
    setStep({ type: "typing" });
  }, [currentSection, isSpokenEnglishSection, isTypingSection, step.type, typingCompleted, typingParagraph]);

  useEffect(() => {
    if (step.type !== "ready") return;
    if (!currentSection) return;
    if (currentQuestions.length > 0) return;
    if (isTypingSection(currentSection)) return;
    void advanceToNextSectionOrReview();
  }, [advanceToNextSectionOrReview, currentQuestions.length, currentSection, isTypingSection, step.type]);

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

  const normalizeSpokenText = useCallback((input: string) => {
    return (input ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  const wordEditDistance = useCallback((a: string[], b: string[]) => {
    const n = a.length;
    const m = b.length;
    if (n === 0) return m;
    if (m === 0) return n;
    const dp: number[] = Array.from({ length: m + 1 }, (_, j) => j);
    for (let i = 1; i <= n; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= m; j++) {
        const temp = dp[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
        prev = temp;
      }
    }
    return dp[m];
  }, []);

  const similarityPercent = useCallback(
    (expected: string, heard: string) => {
      const exp = normalizeSpokenText(expected);
      const got = normalizeSpokenText(heard);
      const a = exp ? exp.split(" ") : [];
      const b = got ? got.split(" ") : [];
      const denom = Math.max(a.length, b.length);
      if (denom === 0) return 0;
      const dist = wordEditDistance(a, b);
      const pct = Math.max(0, Math.min(100, Math.round((1 - dist / denom) * 1000) / 10));
      return pct;
    },
    [normalizeSpokenText, wordEditDistance],
  );

  const countMatchedSpokenWords = useCallback(
    (expectedWords: string[], transcript: string) => {
      if (expectedWords.length === 0) return 0;
      const got = normalizeSpokenText(transcript);
      const gotWords = got ? got.split(" ") : [];
      let i = 0;
      for (const w of gotWords) {
        if (i >= expectedWords.length) break;
        if (w === expectedWords[i]) i += 1;
      }
      return i;
    },
    [normalizeSpokenText],
  );

  const stopSpokenRecognition = useCallback(() => {
    const rec = spokenRecognitionRef.current;
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.stop();
    } catch {
    } finally {
      spokenRecognitionRef.current = null;
      setSpokenIsListening(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      stopSpokenRecognition();
    };
  }, [stopSpokenRecognition]);

  const spokenParagraphText =
    currentQuestion?.question_type === "spoken" ? currentQuestion.prompt : "";

  const spokenRenderTokens = useMemo(() => {
    const text = spokenParagraphText ?? "";
    const parts = text.match(/[A-Za-z0-9']+|[^\w\s]+|\s+/g) ?? (text ? [text] : []);
    let wordIndex = -1;
    return parts.map((p, idx) => {
      const isWord = /^[A-Za-z0-9']+$/.test(p);
      if (isWord) wordIndex += 1;
      return {
        key: idx,
        text: p,
        isWord,
        wordIndex: isWord ? wordIndex : null,
      };
    });
  }, [spokenParagraphText]);

  useEffect(() => {
    if (step.type !== "ready" || !isSpokenQuestion || !currentQuestion) return;
    stopSpokenRecognition();
    const expectedWords = normalizeSpokenText(currentQuestion.prompt).split(" ").filter(Boolean);
    setSpokenExpectedWords(expectedWords);
    setSpokenMatchedWordCount(0);
    setSpokenParagraphVisible(false);
    setSpokenLiveTranscript("");
    setSpokenError(null);
    setSpokenReadyToSubmit(false);
    setSpokenScorePercent(null);
    spokenLastTranscriptRef.current = "";
    spokenHasFinalizedRef.current = false;
    const t = window.setTimeout(() => setSpokenParagraphVisible(true), 50);
    return () => window.clearTimeout(t);
  }, [currentQuestion, isSpokenQuestion, normalizeSpokenText, step.type, stopSpokenRecognition]);

  const buildSpeechRecognition = useCallback((): SpeechRecognitionLike | null => {
    const w = window as unknown as Record<string, unknown>;
    const Ctor =
      (w.SpeechRecognition as unknown) ??
      (w.webkitSpeechRecognition as unknown);
    if (!Ctor) return null;
    try {
      const rec = new (Ctor as new () => SpeechRecognitionLike)();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      return rec;
    } catch {
      return null;
    }
  }, []);

  const finalizeSpokenParagraph = useCallback(
    async (finalText: string) => {
      if (!currentQuestion) return;
      if (spokenHasFinalizedRef.current) return;
      spokenHasFinalizedRef.current = true;
      stopSpokenRecognition();

      const overallPct = similarityPercent(currentQuestion.prompt, finalText);
      setSpokenLiveTranscript(finalText);
      setSpokenMatchedWordCount(countMatchedSpokenWords(spokenExpectedWords, finalText));
      setSpokenScorePercent(overallPct);
      setSpokenReadyToSubmit(true);

      if (overallPct < 60) {
        setSpokenError(`Low match (${overallPct}%). Continue for a better score or submit now.`);
      } else {
        setSpokenError(null);
      }
    },
    [
      countMatchedSpokenWords,
      currentQuestion,
      similarityPercent,
      spokenExpectedWords,
      stopSpokenRecognition,
    ],
  );

  const startSpokenParagraph = useCallback(() => {
    if (!isSpokenQuestion) return;
    if (spokenIsListening) return;
    if (spokenReadyToSubmit) return;
    if (spokenExpectedWords.length === 0) return;

    setSpokenError(null);
    const rec = buildSpeechRecognition();
    if (!rec) {
      setSpokenError("Speech recognition is not supported in this browser. Use Chrome.");
      return;
    }

    spokenRecognitionRef.current = rec;
    setSpokenIsListening(true);
    spokenLastTranscriptRef.current = "";
    spokenHasFinalizedRef.current = false;

    rec.onresult = (ev: unknown) => {
      const e = ev as {
        results?: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }>> & {
          length: number;
        };
      };
      const results = e?.results;
      if (!results || typeof results.length !== "number") return;
      let interim = "";
      let finalText = "";
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const alt = res?.[0];
        const t = alt?.transcript ?? "";
        const isFinal = (res as unknown as { isFinal?: boolean }).isFinal ?? false;
        if (isFinal) finalText += `${t} `;
        else interim += `${t} `;
      }
      const normalizedInterim = normalizeSpokenText(interim);
      const normalizedFinal = normalizeSpokenText(finalText);
      const best = normalizedFinal || normalizedInterim;
      if (!best) return;
      spokenLastTranscriptRef.current = best;
      setSpokenLiveTranscript(best);
      const matched = countMatchedSpokenWords(spokenExpectedWords, best);
      setSpokenMatchedWordCount(matched);
      if (matched >= spokenExpectedWords.length) {
        void finalizeSpokenParagraph(best);
      }
    };

    rec.onerror = () => {
      setSpokenIsListening(false);
      spokenRecognitionRef.current = null;
      setSpokenError("Microphone error. Please allow mic access and try again.");
    };

    rec.onend = () => {
      setSpokenIsListening(false);
      spokenRecognitionRef.current = null;
    };

    try {
      rec.start();
    } catch {
      setSpokenIsListening(false);
      spokenRecognitionRef.current = null;
      setSpokenError("Could not start microphone. Please retry.");
    }
  }, [
    buildSpeechRecognition,
    countMatchedSpokenWords,
    finalizeSpokenParagraph,
    isSpokenQuestion,
    normalizeSpokenText,
    spokenIsListening,
    spokenExpectedWords,
    spokenReadyToSubmit,
  ]);

  const finishSpokenParagraph = useCallback(() => {
    if (!isSpokenQuestion) return;
    if (spokenReadyToSubmit) return;
    const last = spokenLastTranscriptRef.current || spokenLiveTranscript;
    if (!last) {
      setSpokenError("Please read the paragraph out loud before submitting.");
      return;
    }
    void finalizeSpokenParagraph(last);
  }, [finalizeSpokenParagraph, isSpokenQuestion, spokenLiveTranscript, spokenReadyToSubmit]);

  const spokenScorePoints = useMemo(() => {
    if (!currentQuestion || currentQuestion.question_type !== "spoken") return null;
    if (spokenScorePercent === null) return null;
    const pts = currentQuestion.points ?? 0;
    const awarded = Math.round((spokenScorePercent / 100) * pts);
    return Math.max(0, Math.min(pts, awarded));
  }, [currentQuestion, spokenScorePercent]);

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
    setTypingCompleted(true);
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
    if (isTypingSection(currentSection)) {
      setSectionIndex((v) => {
        const next = v + 1;
        if (next >= sections.length) return v;
        return next;
      });
      setQuestionIndex(0);
      setSelectedChoice(null);
    }
    setTimeLeft(null);
    setStep({ type: "ready" });
  }, [currentSection, isTypingSection, sections.length]);

  const skipCurrentSection = useCallback(async () => {
    if (step.type !== "ready") return;
    setIsSaving(true);
    try {
      await advanceToNextSectionOrReview();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to skip section.";
      setStep({ type: "error", message });
    } finally {
      setIsSaving(false);
    }
  }, [advanceToNextSectionOrReview, step.type]);

  const skipTypingTest = useCallback(async () => {
    if (step.type !== "typing") return;
    if (!supabase || !typingParagraph) return;
    if (typingStage === "saving" || typingStage === "done") return;
    setTypingStage("saving");
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
          typed_text: "",
          wpm: 0,
          accuracy: 0,
          correct_chars: 0,
          total_compared: (typingParagraph.text ?? "").length,
          extra_chars: 0,
          missing_chars: (typingParagraph.text ?? "").length,
        },
        { onConflict: "attempt_id" },
      );
    if (error) {
      setStep({ type: "error", message: `Failed to save typing result: ${error.message}` });
      return;
    }
    setTypingTimeLeft(0);
    setTypingSummary({
      wpm: 0,
      accuracy: 0,
      correctChars: 0,
      totalCompared: (typingParagraph.text ?? "").length,
      extraChars: 0,
      missingChars: (typingParagraph.text ?? "").length,
    });
    setTypingCompleted(true);
    setTypingStage("done");
  }, [attemptId, step.type, supabase, typingParagraph, typingStage, typingStartedAtMs]);

  const normalizeTypingText = useCallback((t: string) => {
    return (t ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trimEnd();
  }, []);

  useEffect(() => {
    if (step.type !== "typing") return;
    if (typingStage !== "running") return;
    if (!typingParagraph) return;
    if (typingAutoFinishRef.current) return;
    const expected = normalizeTypingText(typingParagraph.text);
    const typed = normalizeTypingText(typingInput);
    if (!expected) return;
    if (typed !== expected) return;
    typingAutoFinishRef.current = true;
    setTypingTimeLeft(0);
    void finishTyping();
  }, [finishTyping, normalizeTypingText, step.type, typingInput, typingParagraph, typingStage]);

  const saveSpokenAndNext = useCallback(
    async (scoreAwarded: number) => {
      if (!currentSection || !currentQuestion) return;
      if (!supabase) {
        setStep({
          type: "error",
          message: "App is not configured yet. Missing Supabase environment.",
        });
        return;
      }

      setIsSaving(true);
      try {
        const { error: insertError } = await supabase
          .from("assessment_attempt_answers")
          .upsert(
            {
              attempt_id: attemptId,
              question_id: currentQuestion.id,
              selected_choice: null,
              score_awarded: scoreAwarded,
            },
            { onConflict: "attempt_id,question_id" },
          );

        if (insertError) throw insertError;

        const nextAnswered = new Set(answeredQuestionIds);
        nextAnswered.add(currentQuestion.id);
        setAnsweredQuestionIds(nextAnswered);

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
          setTimeLeft(null);
          setIsSaving(false);
          return;
        }

        const firstIncomplete = findFirstIncomplete(nextAnswered);
        if (firstIncomplete) {
          setStep({ type: "review" });
          setIsSaving(false);
          return;
        }

        await finishAssessment();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to save your answer.";
        setStep({ type: "error", message });
        setIsSaving(false);
      }
    },
    [
      attemptId,
      currentQuestion,
      currentQuestions.length,
      currentSection,
      finishAssessment,
      questionIndex,
      answeredQuestionIds,
      findFirstIncomplete,
      sectionIndex,
      sections.length,
      supabase,
    ],
  );

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
    if (currentQuestion.question_type === "spoken") {
      if (!spokenReadyToSubmit || spokenScorePoints === null) return;
      await saveSpokenAndNext(spokenScorePoints);
      return;
    }

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

      const nextAnswered = new Set(answeredQuestionIds);
      nextAnswered.add(currentQuestion.id);
      setAnsweredQuestionIds(nextAnswered);

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

      const firstIncomplete = findFirstIncomplete(nextAnswered);
      if (firstIncomplete) {
        setStep({ type: "review" });
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

  const goToSection = useCallback(
    (targetIndex: number) => {
      const target = sections[targetIndex];
      if (!target) return;

      const qs = questionsBySection[target.id] ?? [];
      const firstUnansweredIndex = qs.findIndex((q) => !answeredQuestionIds.has(q.id));
      const nextQuestionIndex = firstUnansweredIndex === -1 ? 0 : firstUnansweredIndex;

      setSectionIndex(targetIndex);
      setQuestionIndex(nextQuestionIndex);
      setSelectedChoice(null);
      setTimeLeft(null);
      hasAutoAdvancedOnTimeUpRef.current = false;

      const nextSectionTimeLimit = target.time_limit_seconds || 600;
      const stateToSave = {
        sectionIndex: targetIndex,
        questionIndex: nextQuestionIndex,
        timeLeft: nextSectionTimeLimit,
        lastUpdated: Date.now(),
      };
      sessionStorage.setItem(`assessment_state_${attemptId}`, JSON.stringify(stateToSave));

      if (isTypingSection(target) && !typingCompleted) {
        setTypingInput("");
        setTypingStartedAtMs(null);
        setTypingTimeLeft(60);
        setTypingStage("idle");
        setTypingSummary(null);
        setStep({ type: "typing" });
        return;
      }

      setStep({ type: "ready" });
    },
    [answeredQuestionIds, attemptId, isTypingSection, questionsBySection, sections, typingCompleted],
  );

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
            <div
              className={[
                "text-lg font-mono font-bold",
                typingStage === "running"
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-slate-500 dark:text-slate-300",
              ].join(" ")}
            >
              {timerText}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="card p-5 dark:card-dark">
            <div className="text-xs font-semibold text-slate-500">Sections</div>
            <div className="mt-4 grid gap-2">
              {sections.map((s, idx) => {
                const active = idx === sectionIndex;
                const slug = (s.slug ?? "").toLowerCase();
                const title = (s.title ?? "").toLowerCase();
                const isTyping = slug.includes("typing") || title.includes("typing");
                const qs = questionsBySection[s.id] ?? [];
                const done = isTyping
                  ? typingCompleted
                  : qs.length === 0
                    ? true
                    : qs.every((q) => answeredQuestionIds.has(q.id));
                const icon = done ? (
                  <CircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                ) : active ? (
                  <CircleDashed className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                ) : (
                  <CircleDashed className="h-4 w-4 text-slate-400" />
                );

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goToSection(idx)}
                    className={[
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition hover:border-slate-300 dark:hover:border-white/20",
                      active
                        ? "border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                        : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5",
                    ].join(" ")}
                  >
                    {icon}
                    <div className="flex-1">
                      <div className="font-semibold">{s.title}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="card p-7 dark:card-dark">
            <div className="flex flex-col gap-2">
              <div className="pill w-fit">Typing Test</div>
              <h1 className="text-2xl font-bold tracking-tight">Typing speed & accuracy</h1>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                The timer starts when you press any key.
              </p>
              {typingStage === "saving" && (
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-4">
              <div
                className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 whitespace-pre-wrap leading-7 select-none"
                onCopy={(e) => e.preventDefault()}
                onContextMenu={(e) => e.preventDefault()}
              >
                {typingParagraph ? typingParagraph.text : "Loading…"}
              </div>

              <textarea
                className="min-h-[180px] w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                value={typingInput}
                onChange={(e) => setTypingInput(e.target.value)}
                onPaste={(e) => e.preventDefault()}
                onDrop={(e) => e.preventDefault()}
                onKeyDown={() => {
                  if (typingStage !== "idle") return;
                  const now = Date.now();
                  setTypingStartedAtMs(now);
                  setTypingTimeLeft(60);
                  setTypingStage("running");
                  typingAutoFinishRef.current = false;
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

              <div className="flex items-center justify-between gap-3">
                <button
                  className="btn border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={skipTypingTest}
                  disabled={typingStage === "saving" || typingStage === "done"}
                >
                  Skip typing test
                </button>
                <button
                  className="btn btn-primary h-11 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={continueToEnglish}
                  disabled={typingStage !== "done"}
                >
                  Continue <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
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

  if (step.type === "review") {
    const incompleteSections = sections
      .map((s, idx) => {
        const slug = (s.slug ?? "").toLowerCase();
        const title = (s.title ?? "").toLowerCase();
        const isTyping = slug.includes("typing") || title.includes("typing");
        const qs = questionsBySection[s.id] ?? [];
        const done = isTyping
          ? typingCompleted
          : qs.length === 0
            ? true
            : qs.every((q) => answeredQuestionIds.has(q.id));

        const remaining =
          isTyping || qs.length === 0 ? 0 : qs.filter((q) => !answeredQuestionIds.has(q.id)).length;

        return { s, idx, done, remaining };
      })
      .filter((x) => !x.done);

    const canSubmit = incompleteSections.length === 0;
    const nextIncomplete = incompleteSections[0] ?? null;

    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Assessment
            </div>
            <div className="text-lg font-bold tracking-tight">Review & submit</div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="card p-5 dark:card-dark">
            <div className="text-xs font-semibold text-slate-500">Sections</div>
            <div className="mt-4 grid gap-2">
              {sections.map((s, idx) => {
                const active = idx === sectionIndex;
                const slug = (s.slug ?? "").toLowerCase();
                const title = (s.title ?? "").toLowerCase();
                const isTyping = slug.includes("typing") || title.includes("typing");
                const qs = questionsBySection[s.id] ?? [];
                const done = isTyping
                  ? typingCompleted
                  : qs.length === 0
                    ? true
                    : qs.every((q) => answeredQuestionIds.has(q.id));
                const icon = done ? (
                  <CircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                ) : active ? (
                  <CircleDashed className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                ) : (
                  <CircleDashed className="h-4 w-4 text-slate-400" />
                );

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goToSection(idx)}
                    className={[
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition hover:border-slate-300 dark:hover:border-white/20",
                      active
                        ? "border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                        : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5",
                    ].join(" ")}
                  >
                    {icon}
                    <div className="flex-1">
                      <div className="font-semibold">{s.title}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="card p-7 dark:card-dark">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <div className="pill w-fit">Review</div>
                <h1 className="text-2xl font-bold tracking-tight">Complete skipped sections</h1>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Some sections are still incomplete. Click any section on the left to continue.
                </p>
              </div>
            </div>

            {incompleteSections.length > 0 ? (
              <div className="mt-6 grid gap-3">
                {incompleteSections.map(({ s, idx, remaining }) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goToSection(idx)}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                  >
                    <div className="font-semibold">{s.title}</div>
                    {remaining > 0 && (
                      <div className="text-xs font-semibold text-slate-500">
                        {remaining} remaining
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                All sections are complete. You can submit now.
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!nextIncomplete}
                onClick={() => {
                  if (!nextIncomplete) return;
                  goToSection(nextIncomplete.idx);
                }}
              >
                Go to next incomplete
              </button>
              <button
                type="button"
                className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canSubmit || isSaving}
                onClick={() => void finishAssessment()}
              >
                Submit
              </button>
            </div>
          </section>
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
              const slug = (s.slug ?? "").toLowerCase();
              const title = (s.title ?? "").toLowerCase();
              const isTyping = slug.includes("typing") || title.includes("typing");
              const qs = questionsBySection[s.id] ?? [];
              const done = isTyping
                ? typingCompleted
                : qs.length === 0
                  ? true
                  : qs.every((q) => answeredQuestionIds.has(q.id));
              const icon = done ? (
                <CircleCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
              ) : active ? (
                <CircleDashed className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
              ) : (
                <CircleDashed className="h-4 w-4 text-slate-400" />
              );

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goToSection(idx)}
                  className={[
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition hover:border-slate-300 dark:hover:border-white/20",
                    active
                      ? "border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                      : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5",
                  ].join(" ")}
                >
                  {icon}
                  <div className="flex-1">
                    <div className="font-semibold">{s.title}</div>
                  </div>
                </button>
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

              {currentQuestion.question_type === "mcq" && (
                <div className="text-xl font-bold tracking-tight">
                  {currentQuestion.prompt}
                </div>
              )}

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
                <div className="flex flex-col gap-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                    Read the paragraph out loud. Words will highlight as you say them.
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
                    <div
                      className={[
                        "text-lg font-semibold leading-8 transition-all duration-500",
                        spokenParagraphVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
                      ].join(" ")}
                    >
                      {spokenRenderTokens.length === 0 ? (
                        "Loading…"
                      ) : (
                        <span>
                          {spokenRenderTokens.map((t) => {
                            if (!t.isWord) return <span key={t.key}>{t.text}</span>;
                            const idx = t.wordIndex ?? 0;
                            const isDone = idx < spokenMatchedWordCount;
                            const isCurrent = idx === spokenMatchedWordCount && spokenIsListening;
                            const className = [
                              "rounded px-1 py-0.5 transition-colors",
                              isDone
                                ? "bg-emerald-500/15 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-100"
                                : isCurrent
                                  ? "bg-amber-500/15 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100"
                                  : "text-slate-900 dark:text-slate-100",
                            ].join(" ");
                            return (
                              <span key={t.key} className={className}>
                                {t.text}
                              </span>
                            );
                          })}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        className="btn btn-primary h-11 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={spokenIsListening || spokenReadyToSubmit || spokenExpectedWords.length === 0}
                        onClick={startSpokenParagraph}
                      >
                        {spokenIsListening ? "Listening…" : "Start"}
                      </button>
                      <button
                        type="button"
                        className="btn border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                        disabled={!spokenIsListening}
                        onClick={stopSpokenRecognition}
                      >
                        Stop
                      </button>
                      <button
                        type="button"
                        className="btn border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                        disabled={spokenReadyToSubmit || !spokenLiveTranscript}
                        onClick={finishSpokenParagraph}
                      >
                        Finish
                      </button>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500 dark:text-slate-300">
                      <div>Progress</div>
                      <div>
                        {spokenMatchedWordCount}/{spokenExpectedWords.length} words
                      </div>
                    </div>

                    {(spokenLiveTranscript || spokenError) && (
                      <div className="mt-4 grid gap-2">
                        {spokenLiveTranscript && (
                          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:bg-black/20 dark:text-slate-200">
                            {spokenLiveTranscript}
                          </div>
                        )}
                        {spokenError && (
                          <div className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
                            {spokenError}
                          </div>
                        )}
                      </div>
                    )}

                    {spokenReadyToSubmit && spokenScorePercent !== null && (
                      <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            Pronunciation score
                          </div>
                          <div className="text-sm font-bold text-indigo-600 dark:text-indigo-300">
                            {spokenScorePercent}%
                          </div>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                          <div
                            className="h-full rounded-full bg-indigo-600 dark:bg-indigo-400"
                            style={{ width: `${spokenScorePercent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <button
                  className="btn border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={skipCurrentSection}
                  disabled={isSaving}
                >
                  Skip section
                </button>
                <button
                  className="btn btn-primary h-11 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  onClick={saveAndNext}
                  disabled={
                    isSaving ||
                    (currentQuestion.question_type === "mcq" && !selectedChoice) ||
                    (currentQuestion.question_type === "spoken" &&
                      (!spokenReadyToSubmit || spokenScorePoints === null))
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
