export type AssessmentSection = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  sort_order: number;
  time_limit_seconds: number;
};

export type AssessmentQuestionType = "mcq" | "spoken";

export type AssessmentQuestion = {
  id: string;
  section_id: string;
  question_type: AssessmentQuestionType;
  prompt: string;
  choice_a: string | null;
  choice_b: string | null;
  choice_c: string | null;
  choice_d: string | null;
  correct_choice?: string | null;
  points: number;
  sort_order: number;
};

export type Attempt = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  started_at: string;
  completed_at: string | null;
  total_score: number | null;
  max_score: number | null;
};
