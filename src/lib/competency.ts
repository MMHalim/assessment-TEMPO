// Shared English Competency definitions (safe to import from client and server).

export const COMPETENCY_DIMENSIONS = [
  { key: "grammar", label: "Grammar", weight: 15 },
  { key: "vocabulary", label: "Vocabulary", weight: 15 },
  { key: "pronunciation", label: "Pronunciation", weight: 15 },
  { key: "fluency", label: "Fluency", weight: 20 },
  { key: "coherence", label: "Coherence", weight: 10 },
  { key: "accent", label: "Accent & intelligibility", weight: 10 },
  { key: "communication", label: "Communication", weight: 10 },
  { key: "listening", label: "Listening & comprehension", weight: 5 },
  // Shown in the breakdown but not counted in the overall score.
  { key: "confidence", label: "Confidence & delivery", weight: 0 },
] as const;

export type CompetencyDimensionKey = (typeof COMPETENCY_DIMENSIONS)[number]["key"];

export type CompetencyScores = Record<CompetencyDimensionKey, number>;

export type CompetencyReport = {
  scores: CompetencyScores;
  strengths: string[];
  improvements: string[];
  feedback: string;
  model?: string;
};

export type SpeechMetrics = {
  durationSec: number;
  speechSec: number;
  wordCount: number;
  wordsPerMinute: number;
  pauseCount: number;
  longPauseCount: number;
  totalPauseSec: number;
  fillerCount: number;
  repetitionCount: number;
  uniqueWordRatio: number;
  avgLogprob: number | null;
  lowConfidenceSegmentRatio: number | null;
};

export type CompetencyStage = "main" | "followup";

/** Recording length rules, in seconds. */
export const RECORDING_LIMITS: Record<CompetencyStage, { minSec: number; maxSec: number }> = {
  main: { minSec: 60, maxSec: 180 },
  followup: { minSec: 20, maxSec: 120 },
};

/** A main answer below either threshold triggers a follow-up question. */
export const SUFFICIENT_ANSWER = { minSpeechSec: 45, minWords: 80 };

export function computeOverallScore(scores: CompetencyScores): number {
  let total = 0;
  let weights = 0;
  for (const d of COMPETENCY_DIMENSIONS) {
    if (d.weight <= 0) continue;
    total += (scores[d.key] ?? 0) * d.weight;
    weights += d.weight;
  }
  return weights > 0 ? Math.round(total / weights) : 0;
}

// Illustrative bands, not an official CEFR conversion.
export function cefrLevelFor(score: number): string {
  if (score >= 90) return "C2 – Proficient";
  if (score >= 75) return "C1 – Advanced";
  if (score >= 60) return "B2 – Upper Intermediate";
  if (score >= 45) return "B1 – Intermediate";
  if (score >= 30) return "A2 – Elementary";
  return "A1 – Beginner";
}
