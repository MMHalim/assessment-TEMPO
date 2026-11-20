// Server-only: uses GROQ_API_KEY. Import this only from API routes.
import {
  COMPETENCY_DIMENSIONS,
  type CompetencyReport,
  type CompetencyScores,
  type SpeechMetrics,
} from "@/lib/competency";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const TRANSCRIBE_MODEL = process.env.GROQ_TRANSCRIBE_MODEL || "whisper-large-v3";
const ANALYSIS_MODEL = process.env.GROQ_ANALYSIS_MODEL || "openai/gpt-oss-120b";
const FAST_MODEL = process.env.GROQ_FAST_MODEL || "openai/gpt-oss-20b";

// Whisper tends to drop filler words; a prompt written with fillers makes it keep them.
const FILLER_PROMPT = "Umm, so, uh, I think, like, hmm... let me see, I mean, the thing is, uh, yeah.";

const FILLERS = new Set(["um", "umm", "uh", "uhh", "uhm", "er", "erm", "ah", "ahh", "hmm", "hm", "mm", "mmm"]);
const PAUSE_SEC = 0.7;
const LONG_PAUSE_SEC = 2;

export class CompetencyAiError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

function getApiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new CompetencyAiError("GROQ_API_KEY is not set on the server.", 500);
  return key;
}

async function groqError(res: Response, what: string): Promise<CompetencyAiError> {
  const text = await res.text().catch(() => "");
  console.error(`Groq ${what} failed (${res.status}):`, text.slice(0, 500));
  if (res.status === 429) {
    return new CompetencyAiError(
      "The analysis service is busy right now. Please wait a minute and try again.",
      429,
    );
  }
  if (res.status === 413) {
    return new CompetencyAiError("The recording is too large.", 413);
  }
  return new CompetencyAiError(`Speech analysis failed (${what}). Please try again.`, 502);
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

type WhisperWord = { word: string; start: number; end: number };
type WhisperSegment = { start: number; end: number; text: string; avg_logprob?: number; no_speech_prob?: number };
type WhisperResponse = {
  text?: string;
  duration?: number;
  words?: WhisperWord[];
  segments?: WhisperSegment[];
};

export type Transcription = { text: string; metrics: SpeechMetrics };

export async function transcribeRecording(audio: File): Promise<Transcription> {
  const form = new FormData();
  form.append("file", audio, audio.name || "recording.webm");
  form.append("model", TRANSCRIBE_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  form.append("language", "en");
  form.append("temperature", "0");
  form.append("prompt", FILLER_PROMPT);

  const res = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getApiKey()}` },
    body: form,
  });
  if (!res.ok) throw await groqError(res, "transcription");

  const data = (await res.json()) as WhisperResponse;
  const segments = (data.segments ?? []).filter((s) => (s.no_speech_prob ?? 0) < 0.8);
  const text = segments.length > 0 ? segments.map((s) => s.text.trim()).join(" ").trim() : "";
  return { text, metrics: computeMetrics(data, segments) };
}

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z']/g, "");
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function computeMetrics(data: WhisperResponse, segments: WhisperSegment[]): SpeechMetrics {
  const words = (data.words ?? []).filter((w) => normalizeWord(w.word));
  const durationSec = data.duration ?? 0;

  let pauseCount = 0;
  let longPauseCount = 0;
  let totalPauseSec = 0;
  let repetitionCount = 0;
  let fillerCount = 0;
  const contentWords: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = normalizeWord(words[i].word);
    if (FILLERS.has(w)) fillerCount++;
    else contentWords.push(w);

    if (i > 0) {
      const gap = words[i].start - words[i - 1].end;
      if (gap >= PAUSE_SEC) {
        pauseCount++;
        totalPauseSec += gap;
        if (gap >= LONG_PAUSE_SEC) longPauseCount++;
      }
      if (w && w === normalizeWord(words[i - 1].word) && !FILLERS.has(w)) repetitionCount++;
    }
  }

  const span = words.length > 0 ? words[words.length - 1].end - words[0].start : 0;
  const speechSec = Math.max(0, span - totalPauseSec);
  const wordCount = contentWords.length;
  const wordsPerMinute = span > 0 ? (wordCount / span) * 60 : 0;
  const uniqueWordRatio = wordCount > 0 ? new Set(contentWords).size / wordCount : 0;

  const logprobs = segments.map((s) => s.avg_logprob).filter((v): v is number => typeof v === "number");
  const avgLogprob = logprobs.length > 0 ? logprobs.reduce((a, b) => a + b, 0) / logprobs.length : null;
  const lowConfidenceSegmentRatio =
    logprobs.length > 0 ? logprobs.filter((v) => v < -0.6).length / logprobs.length : null;

  return {
    durationSec: round(durationSec),
    speechSec: round(speechSec),
    wordCount,
    wordsPerMinute: Math.round(wordsPerMinute),
    pauseCount,
    longPauseCount,
    totalPauseSec: round(totalPauseSec),
    fillerCount,
    repetitionCount,
    uniqueWordRatio: round(uniqueWordRatio, 2),
    avgLogprob: avgLogprob === null ? null : round(avgLogprob, 3),
    lowConfidenceSegmentRatio: lowConfidenceSegmentRatio === null ? null : round(lowConfidenceSegmentRatio, 2),
  };
}

// ---------------------------------------------------------------------------
// LLM helpers
// ---------------------------------------------------------------------------

async function chatJson(model: string, system: string, user: string, maxTokens: number): Promise<unknown> {
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getApiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw await groqError(res, "analysis");

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* fall through */
      }
    }
    throw new CompetencyAiError("The analysis returned an unreadable result. Please try again.", 502);
  }
}

type Topic = { title: string; description: string | null };

function topicText(topic: Topic): string {
  return topic.description ? `${topic.title} — ${topic.description}` : topic.title;
}

export async function generateFollowUpQuestion(topic: Topic, transcript: string): Promise<string> {
  const system =
    "You are an English speaking examiner. The candidate gave a short or off-topic answer. " +
    "Write ONE open follow-up question (max 25 words) that invites them to speak for about a minute on the topic, " +
    "building on what they said when possible. Use simple, clear English. " +
    'Respond with JSON: {"question": string}.';
  const user = `Topic: ${topicText(topic)}\n\nCandidate's answer (transcript):\n${transcript || "(nothing intelligible was said)"}`;
  const out = (await chatJson(FAST_MODEL, system, user, 1500)) as { question?: unknown };
  const q = typeof out?.question === "string" ? out.question.trim() : "";
  return q || `Could you tell me more about "${topic.title}"? Please give an example from your own experience.`;
}

// ---------------------------------------------------------------------------
// Full analysis
// ---------------------------------------------------------------------------

const RUBRIC = `Score each dimension from 0 to 100 using these criteria:
- grammar: sentence structure; tenses and verb conjugation; prepositions and articles; subject-verb agreement.
- vocabulary: range; word choice accuracy; diversity; use of advanced expressions and idioms.
- pronunciation: individual sounds; word pronunciation; syllable stress; intonation and rhythm.
- fluency: speaking pace; unnecessary pauses; hesitation and repetition.
- coherence: logical flow and organization; ability to develop ideas.
- accent: accent characteristics; clarity of speech; ease of understanding; consistency of pronunciation.
- communication: expressing opinions; supporting arguments with examples; clarity of explanations; communicating complex ideas.
- listening: relevance of the response to the topic; if a follow-up question was asked, how well the candidate understood it and responded appropriately.
- confidence: speech consistency; natural delivery; self-correction; verbal confidence indicators.

Score bands: 0-29 beginner, 30-44 elementary, 45-59 intermediate, 60-74 upper intermediate, 75-89 advanced, 90-100 proficient.

Evidence rules:
- You only have an automatic transcript plus measured speech metrics, not the audio.
- Use the metrics for fluency and confidence: words per minute (natural conversational English is roughly 110-160), pauses, long pauses (2s+), fillers, repetitions.
- For pronunciation and accent, use transcription confidence (avg_logprob closer to 0 is clearer; below about -0.6 suggests unclear speech; lowConfidenceSegmentRatio is the share of unclear stretches) and signs of mis-recognised words (nonsense words, words that do not fit the context). When evidence is weak, stay near the level implied by the rest of the performance instead of guessing extremes.
- The transcript may lack punctuation; do not penalise punctuation.
- Be fair and consistent. Very short answers cannot show advanced range, so cap range-based dimensions accordingly.`;

export type AnalysisInput = {
  topic: Topic;
  main: { transcript: string; metrics: SpeechMetrics };
  followUp?: { question: string; transcript: string; metrics: SpeechMetrics } | null;
  /** When true, the model also judges whether the main answer addressed the topic. */
  canAskFollowUp: boolean;
};

export type AnalysisResult = {
  addressesTopic: boolean;
  followUpQuestion: string | null;
  report: CompetencyReport;
};

function toStringList(v: unknown, max = 5): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, max);
}

function parseScores(v: unknown): CompetencyScores | null {
  if (!v || typeof v !== "object") return null;
  const raw = v as Record<string, unknown>;
  const out = {} as CompetencyScores;
  for (const d of COMPETENCY_DIMENSIONS) {
    const n = Number(raw[d.key]);
    if (!Number.isFinite(n)) return null;
    out[d.key] = Math.max(0, Math.min(100, Math.round(n)));
  }
  return out;
}

export async function analyzeSpeech(input: AnalysisInput): Promise<AnalysisResult> {
  const keys = COMPETENCY_DIMENSIONS.map((d) => `"${d.key}": number`).join(", ");
  const system = `You are an experienced English speaking examiner assessing a job candidate's spoken English.

${RUBRIC}

Respond with JSON only, in this shape:
{
  "addresses_topic": boolean,
  "followup_question": string | null,
  "scores": { ${keys} },
  "strengths": string[3],
  "improvements": string[3],
  "feedback": string
}
- strengths / improvements: short, specific sentences about this candidate.
- feedback: 2-4 sentences summarising the candidate's spoken English, written in the third person ("The candidate ...").
- ${
    input.canAskFollowUp
      ? 'addresses_topic: false only if the answer clearly does not talk about the topic. If false, set followup_question to ONE open question (max 25 words) that brings the candidate back to the topic; otherwise null.'
      : "addresses_topic: true, followup_question: null (no more follow-ups are allowed)."
  }`;

  const parts = [
    `Topic: ${topicText(input.topic)}`,
    `\nMain answer metrics: ${JSON.stringify(input.main.metrics)}`,
    `Main answer transcript:\n${input.main.transcript}`,
  ];
  if (input.followUp) {
    parts.push(
      `\nFollow-up question asked by the examiner: ${input.followUp.question}`,
      `Follow-up answer metrics: ${JSON.stringify(input.followUp.metrics)}`,
      `Follow-up answer transcript:\n${input.followUp.transcript || "(nothing intelligible was said)"}`,
    );
  }
  const user = parts.join("\n");

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = (await chatJson(ANALYSIS_MODEL, system, user, 6000)) as Record<string, unknown>;
      const scores = parseScores(out.scores);
      const feedback = typeof out.feedback === "string" ? out.feedback.trim() : "";
      if (!scores || !feedback) {
        lastError = new CompetencyAiError("The analysis returned an incomplete result. Please try again.", 502);
        continue;
      }
      const addressesTopic = out.addresses_topic !== false;
      const q = typeof out.followup_question === "string" ? out.followup_question.trim() : "";
      return {
        addressesTopic,
        followUpQuestion: input.canAskFollowUp && !addressesTopic && q ? q : null,
        report: {
          scores,
          strengths: toStringList(out.strengths),
          improvements: toStringList(out.improvements),
          feedback,
          model: ANALYSIS_MODEL,
        },
      };
    } catch (e) {
      lastError = e;
      if (e instanceof CompetencyAiError && e.status === 429) break;
    }
  }
  throw lastError instanceof Error ? lastError : new CompetencyAiError("Speech analysis failed.", 502);
}
