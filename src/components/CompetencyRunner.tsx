"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Mic, MessageCircleQuestion, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RECORDING_LIMITS, type CompetencyStage } from "@/lib/competency";

type Topic = { id: string; title: string; description: string | null };

type AttemptState = {
  id: string;
  candidateName: string;
  topicTitle: string | null;
  topicDescription: string | null;
  followUpQuestion: string | null;
  stage: "topic" | "record_main" | "record_followup" | "done";
};

type View =
  | { kind: "loading" }
  | { kind: "fatal"; message: string }
  | { kind: "topic" }
  | { kind: "ready"; stage: CompetencyStage }
  | { kind: "recording"; stage: CompetencyStage }
  | { kind: "analyzing"; stage: CompetencyStage }
  | { kind: "done" };

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

function extensionFor(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type Props = {
  /** The main assessment attempt id (the competency attempt reuses it). */
  attemptId: string;
  /** Called when the candidate returns to the assessment menu after submitting. */
  onComplete: () => void;
};

export default function CompetencyRunner({ attemptId, onComplete }: Props) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [topic, setTopic] = useState<{ title: string; description: string | null } | null>(null);
  const [followUpQuestion, setFollowUpQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSavingTopic, setIsSavingTopic] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  // ---- initial load -------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const init = await fetch(`/api/competency/attempt/${attemptId}/init`, { method: "POST" });
        const initBody = (await init.json().catch(() => null)) as { ok: boolean; error?: string } | null;
        if (cancelled) return;
        if (!initBody?.ok) {
          setView({ kind: "fatal", message: initBody?.error ?? "Could not start English Competency." });
          return;
        }
        const res = await fetch(`/api/competency/attempt/${attemptId}`);
        const body = (await res.json().catch(() => null)) as
          | { ok: true; attempt: AttemptState }
          | { ok: false; error: string }
          | null;
        if (cancelled) return;
        if (!body || !body.ok) {
          setView({ kind: "fatal", message: body && "error" in body ? body.error : "Could not load this test." });
          return;
        }
        const a = body.attempt;
        if (a.topicTitle) setTopic({ title: a.topicTitle, description: a.topicDescription });
        if (a.stage === "done") return setView({ kind: "done" });
        if (a.stage === "record_followup") {
          setFollowUpQuestion(a.followUpQuestion);
          return setView({ kind: "ready", stage: "followup" });
        }
        if (a.stage === "record_main") return setView({ kind: "ready", stage: "main" });

        const tRes = await fetch("/api/competency/topics");
        const tBody = (await tRes.json().catch(() => null)) as { ok: boolean; topics?: Topic[]; error?: string } | null;
        if (cancelled) return;
        if (!tBody?.ok) {
          setView({ kind: "fatal", message: tBody?.error ?? "Could not load topics." });
          return;
        }
        setTopics(tBody.topics ?? []);
        setView({ kind: "topic" });
      } catch {
        if (!cancelled) setView({ kind: "fatal", message: "Could not load this test. Please refresh the page." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  // ---- recording helpers --------------------------------------------------

  const stopMeters = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopMeters();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      releaseMic();
    };
  }, [releaseMic, stopMeters]);

  const isBusy = view.kind === "recording" || view.kind === "analyzing";
  useEffect(() => {
    if (!isBusy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isBusy]);

  const upload = useCallback(
    async (stage: CompetencyStage, blob: Blob) => {
      setView({ kind: "analyzing", stage });
      try {
        const form = new FormData();
        form.append("stage", stage);
        form.append("audio", new File([blob], `answer.${extensionFor(blob.type)}`, { type: blob.type }));
        const res = await fetch(`/api/competency/attempt/${attemptId}/recording`, { method: "POST", body: form });
        const body = (await res.json().catch(() => null)) as
          | { ok: true; next: "followup"; question: string }
          | { ok: true; next: "done" }
          | { ok: false; error: string }
          | null;

        if (!body || !body.ok) {
          setError(body && "error" in body ? body.error : "Something went wrong. Please record your answer again.");
          setView({ kind: "ready", stage });
          return;
        }
        if (body.next === "followup") {
          setFollowUpQuestion(body.question);
          setView({ kind: "ready", stage: "followup" });
          return;
        }
        setView({ kind: "done" });
      } catch {
        setError("Network error. Please check your connection and record your answer again.");
        setView({ kind: "ready", stage });
      }
    },
    [attemptId],
  );

  const finishRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const startRecording = useCallback(
    async (stage: CompetencyStage) => {
      setError(null);
      if (typeof window !== "undefined" && !window.isSecureContext) {
        // Browsers only allow the microphone on https:// (or localhost).
        setError("Microphone access needs a secure (https://) link. Please open this test using the https:// address.");
        return;
      }
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setError("Your browser does not support audio recording. Please use the latest Chrome, Edge, Firefox or Safari.");
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotFoundError" || name === "OverconstrainedError"
            ? "No microphone was found. Please connect a microphone or headset and try again."
            : name === "NotReadableError" || name === "AbortError"
              ? "Your microphone is being used by another app (for example Teams, Zoom or a call). Please close it and try again."
              : "We need access to your microphone. Please allow microphone access for this site in your browser settings and try again.",
        );
        return;
      }
      streamRef.current = stream;

      // Keep phone screens awake: a sleeping screen cuts the microphone on Android.
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } })
          .wakeLock;
        if (wl) wakeLockRef.current = await wl.request("screen");
      } catch {
        /* not supported or denied; recording still works */
      }

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stopMeters();
        releaseMic();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        if (blob.size === 0) {
          setError("Nothing was recorded. Please check your microphone and try again.");
          setView({ kind: "ready", stage });
          return;
        }
        void upload(stage, blob);
      };

      // Live input level, so the candidate can see the mic is working.
      try {
        const Ctor =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) {
          const ctx = new Ctor();
          audioCtxRef.current = ctx;
          if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          ctx.createMediaStreamSource(stream).connect(analyser);
          const buf = new Uint8Array(analyser.fftSize);
          const tick = () => {
            analyser.getByteTimeDomainData(buf);
            let sum = 0;
            for (const v of buf) sum += ((v - 128) / 128) ** 2;
            setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
            rafRef.current = requestAnimationFrame(tick);
          };
          tick();
        }
      } catch {
        /* the meter is optional */
      }

      const { maxSec } = RECORDING_LIMITS[stage];
      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        const secs = (Date.now() - startedAtRef.current) / 1000;
        setElapsed(secs);
        if (secs >= maxSec) finishRecording();
      }, 250);

      recorder.start(1000);
      setView({ kind: "recording", stage });
    },
    [finishRecording, releaseMic, stopMeters, upload],
  );

  // ---- topic selection ----------------------------------------------------

  async function confirmTopic() {
    if (!selectedTopicId) {
      setError("Please choose a topic.");
      return;
    }
    setError(null);
    setIsSavingTopic(true);
    try {
      const res = await fetch(`/api/competency/attempt/${attemptId}/topic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: selectedTopicId }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; topic: { title: string; description: string | null } }
        | { ok: false; error: string }
        | null;
      if (!body || !body.ok) {
        setError(body && "error" in body ? body.error : "Could not save your topic.");
        return;
      }
      setTopic(body.topic);
      setView({ kind: "ready", stage: "main" });
    } finally {
      setIsSavingTopic(false);
    }
  }

  // ---- render -------------------------------------------------------------

  const errorBox = error ? (
    <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error}</span>
    </div>
  ) : null;

  const topicCard = topic ? (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-white/5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Your topic</div>
      <div className="mt-1 text-lg font-semibold">{topic.title}</div>
      {topic.description ? (
        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{topic.description}</div>
      ) : null}
    </div>
  ) : null;

  let content: React.ReactNode = null;

  if (view.kind === "loading") {
    content = (
      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  } else if (view.kind === "fatal") {
    content = (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{view.message}</p>
      </div>
    );
  } else if (view.kind === "topic") {
    content = (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="pill w-fit">English Competency · Step 1 of 2</div>
          <h1 className="text-2xl font-bold tracking-tight">Choose a topic</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Pick the topic you feel most comfortable talking about. You can’t change it after you continue.
          </p>
        </div>
        {topics.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 p-5 text-sm text-slate-600 dark:border-white/10 dark:text-slate-300">
            No topics are available right now. Please contact the host.
          </div>
        ) : (
          <div className="grid gap-3">
            {topics.map((t) => {
              const active = t.id === selectedTopicId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTopicId(t.id)}
                  className={[
                    "rounded-2xl border p-4 text-left transition",
                    active
                      ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/30 dark:bg-indigo-500/10"
                      : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20",
                  ].join(" ")}
                >
                  <div className="font-semibold">{t.title}</div>
                  {t.description ? (
                    <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t.description}</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
        {errorBox}
        <button
          type="button"
          className="btn btn-primary h-12 w-full disabled:cursor-not-allowed disabled:opacity-60"
          onClick={confirmTopic}
          disabled={isSavingTopic || !selectedTopicId}
        >
          {isSavingTopic ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Continue <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  } else if (view.kind === "ready") {
    const { minSec, maxSec } = RECORDING_LIMITS[view.stage];
    const isFollowUp = view.stage === "followup";
    content = (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="pill w-fit">{isFollowUp ? "English Competency · Follow-up question" : "English Competency · Step 2 of 2"}</div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isFollowUp ? "One more question" : "Before you start"}
          </h1>
        </div>

        {isFollowUp && followUpQuestion ? (
          <div className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-500/30 dark:bg-indigo-500/10">
            <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-300" />
            <div className="text-base font-medium">{followUpQuestion}</div>
          </div>
        ) : (
          topicCard
        )}

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <div className="font-semibold">Please read before you start</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Stay calm and take a breath. There are no trick questions.</li>
            <li>Speak clearly at a natural pace, in a quiet place, close to your microphone.</li>
            <li>
              Speak for at least {minSec >= 60 ? `${minSec / 60} minute` : `${minSec} seconds`}. The{" "}
              <strong>Finish</strong> button unlocks after that, and recording stops automatically at{" "}
              {formatClock(maxSec)}.
            </li>
            <li>Your browser will ask for microphone access. Please allow it.</li>
            <li>Keep this page open while recording. Don’t switch apps or lock your phone.</li>
          </ul>
        </div>

        {errorBox}

        <button type="button" className="btn btn-primary h-12 w-full" onClick={() => void startRecording(view.stage)}>
          <Mic className="h-4 w-4" /> {error ? "Record again" : "Start"}
        </button>
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">Press Start whenever you’re ready.</p>
      </div>
    );
  } else if (view.kind === "recording") {
    const { minSec, maxSec } = RECORDING_LIMITS[view.stage];
    const canFinish = elapsed >= minSec;
    const progress = Math.min(1, elapsed / maxSec);
    content = (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="pill w-fit">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> Recording
        </div>
        <div className="w-full">
          {view.stage === "followup" && followUpQuestion ? (
            <div className="text-base font-medium">{followUpQuestion}</div>
          ) : (
            <div className="text-lg font-semibold">{topic?.title}</div>
          )}
        </div>

        <div className="relative grid h-32 w-32 place-items-center">
          <div
            className="absolute inset-0 rounded-full bg-rose-500/20 transition-transform duration-75"
            style={{ transform: `scale(${0.7 + level * 0.6})` }}
          />
          <div className="relative grid h-20 w-20 place-items-center rounded-full bg-rose-600 text-white shadow-lg">
            <Mic className="h-8 w-8" />
          </div>
        </div>

        <div className="w-full max-w-sm">
          <div className="flex justify-between text-sm tabular-nums text-slate-600 dark:text-slate-300">
            <span>{formatClock(elapsed)}</span>
            <span>{formatClock(maxSec)}</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div className="h-full rounded-full bg-rose-500" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary h-12 w-full max-w-sm disabled:cursor-not-allowed disabled:opacity-50"
          onClick={finishRecording}
          disabled={!canFinish}
        >
          <Square className="h-4 w-4" /> Finish
        </button>
        {!canFinish ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Keep talking. You can finish in {Math.ceil(minSec - elapsed)}s.
          </p>
        ) : null}
      </div>
    );
  } else if (view.kind === "analyzing") {
    content = (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600 dark:text-indigo-300" />
        <h1 className="text-xl font-bold tracking-tight">Analysing your recording…</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">This usually takes 10–30 seconds. Please don’t close this page.</p>
      </div>
    );
  } else if (view.kind === "done") {
    content = (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
        <h1 className="text-2xl font-bold tracking-tight">Thank you!</h1>
        <p className="max-w-md text-sm text-slate-600 dark:text-slate-300">
          Your English Competency answer was submitted successfully.
        </p>
        <button type="button" className="btn btn-primary h-11" onClick={onComplete}>
          Back to assessments <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <div className="card p-7 dark:card-dark">{content}</div>
    </main>
  );
}
