"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { Loader2, Trash2, XCircle, CheckCircle2, Info } from "lucide-react";
import DateRangeTimeline from "@/components/DateRangeTimeline";
import type { AssessmentSection, AssessmentQuestion, Attempt } from "@/lib/assessmentTypes";

export default function AdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "results" | "sections" | "questions" | "candidates" | "attempts" | "password" | "typing"
  >("results");
  const [supabase] = useState(getSupabaseBrowserClient());

  const [sections, setSections] = useState<AssessmentSection[]>([]);
  const [editedTimers, setEditedTimers] = useState<Record<string, number>>({});
  const [isSavingTimer, setIsSavingTimer] = useState<Record<string, boolean>>({});
  
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [editedQuestions, setEditedQuestions] = useState<Record<string, Partial<AssessmentQuestion>>>({});
  const [isSavingQuestion, setIsSavingQuestion] = useState<Record<string, boolean>>({});
  const [isUploadingCSV, setIsUploadingCSV] = useState(false);
  const [isClearingQuestions, setIsClearingQuestions] = useState(false);
  const [showClearQuestionsWarning, setShowClearQuestionsWarning] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [candidates, setCandidates] = useState<any[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [empDBData, setEmpDBData] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [attemptAnswers, setAttemptAnswers] = useState<any[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [typingParagraphs, setTypingParagraphs] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [typingResults, setTypingResults] = useState<any[]>([]);
  const [newTypingParagraphText, setNewTypingParagraphText] = useState("");
  const [isSavingTypingParagraph, setIsSavingTypingParagraph] = useState(false);
  const [isDeletingTypingParagraph, setIsDeletingTypingParagraph] = useState<Record<string, boolean>>({});
  const [isTogglingTypingParagraph, setIsTogglingTypingParagraph] = useState<Record<string, boolean>>({});
  
  const [minDate, setMinDate] = useState<Date>(new Date());
  const [totalDays, setTotalDays] = useState<number>(0);
  

  

  useEffect(() => {
    if (empDBData.length === 0) return;
    
    let minT = Infinity;
    let maxT = -Infinity;
    
    empDBData.forEach(emp => {
      if (emp.Timestamp) {
        const dateStr = String(emp.Timestamp);
        let d = new Date(dateStr);
        if (isNaN(d.getTime())) {
          const parts = dateStr.split(" ")[0].split("/");
          if (parts.length === 3) d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
        if (!isNaN(d.getTime())) {
          const dNormalized = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
          if (dNormalized < minT) minT = dNormalized;
          if (dNormalized > maxT) maxT = dNormalized;
        }
      }
    });

    if (minT !== Infinity && maxT !== -Infinity) {
      const minD = new Date(minT);
      const maxD = new Date(maxT);
      setMinDate(minD);
      
      let days = 0;
      let cur = new Date(minD.getFullYear(), minD.getMonth(), minD.getDate());
      while (cur.getTime() < maxD.getTime()) {
        days++;
        cur = new Date(minD.getFullYear(), minD.getMonth(), minD.getDate() + days);
      }
      setTotalDays(days);
    }
  }, [empDBData]);

  const [isLoading, setIsLoading] = useState(true);
  const [deleteAttemptId, setDeleteAttemptId] = useState<string | null>(null);
  const [adminPwdInput, setAdminPwdInput] = useState("");
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [authError, setAuthError] = useState("");
  const [alertMessage, setAlertMessage] = useState<{ title: string; message: string; type: "error" | "success" | "info" } | null>(null);

  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [selectedStartISO, setSelectedStartISO] = useState<string | null>(null);
  const [selectedEndISO, setSelectedEndISO] = useState<string | null>(null);

  

  const isEmpInFilter = (emp: Record<string, unknown>) => {
    if (!emp.Timestamp) return false;
    const dateStr = String(emp.Timestamp);
    let d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      const parts = dateStr.split(" ")[0].split("/");
      if (parts.length === 3) d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    if (isNaN(d.getTime())) return false;
    const dn = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (!selectedStartISO || !selectedEndISO) return true;
    const s = new Date(selectedStartISO);
    const e = new Date(selectedEndISO);
    const sn = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
    const en = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
    return dn >= sn && dn <= en;
  };

  const filteredEmpDBData = empDBData.filter(isEmpInFilter);
  const filteredEmpEmails = new Set(filteredEmpDBData.map(e => e.Email_Address).concat(filteredEmpDBData.map(e => e.Email)));

  const isAttemptInFilter = (att: Attempt) => {
    if (!selectedStartISO || !selectedEndISO) return true;
    const d = new Date(att.started_at);
    if (isNaN(d.getTime())) return false;
    const dn = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const s = new Date(selectedStartISO);
    const e = new Date(selectedEndISO);
    const sn = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
    const en = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
    return dn >= sn && dn <= en;
  };
  
  // Filter attempts based on whether the candidate is in the filtered empDB
  const filteredAttempts = attempts.filter(att => {
    if (!isAttemptInFilter(att)) return false;
    if (totalDays === 0) return true;
    const cand = candidates.find(c => c.email === att.candidate_email);
    const emailToMatch = cand?.email || att.candidate_email;
    return filteredEmpEmails.has(emailToMatch);
  });
  
  const groupedAttempts = (() => {
    const answerCounts = new Map<string, number>();
    for (const a of attemptAnswers) {
      const id = String((a as { attempt_id?: unknown }).attempt_id ?? "");
      if (!id) continue;
      answerCounts.set(id, (answerCounts.get(id) ?? 0) + 1);
    }
    const byEmail = new Map<string, Attempt>();
    for (const a of filteredAttempts) {
      const key = String(a.candidate_email || "").trim().toLowerCase();
      if (!key) continue;
      const existing = byEmail.get(key);
      if (!existing) {
        byEmail.set(key, a);
        continue;
      }
      const existingCount = answerCounts.get(existing.id) ?? 0;
      const nextCount = answerCounts.get(a.id) ?? 0;
      const existingT = new Date(existing.started_at).getTime();
      const nextT = new Date(a.started_at).getTime();
      if (nextCount > existingCount || (nextCount === existingCount && nextT > existingT)) {
        byEmail.set(key, a);
      }
    }
    return Array.from(byEmail.values());
  })();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    if (!supabase) return;

    try {
      const [secRes, qRes, attRes, candRes, ansRes, typingParRes, typingRes] = await Promise.all([
        supabase.from("assessment_sections").select("*").order("sort_order"),
        supabase.from("assessment_questions").select("*").order("sort_order"),
        supabase.from("assessment_attempts").select("*").order("started_at", { ascending: false }),
        fetch("/api/admin/candidates").then((r) => r.json()),
        supabase.from("assessment_attempt_answers").select("*, assessment_questions(section_id, points)"),
        supabase.from("typing_paragraphs").select("*").order("created_at", { ascending: false }),
        supabase.from("typing_test_results").select("*"),
      ]);

      if (secRes.data) setSections(secRes.data);
      if (qRes.data) setQuestions(qRes.data);
      if (attRes.data) setAttempts(attRes.data);
      if (candRes.ok) {
        setCandidates(candRes.candidates);
        setEmpDBData(
          (candRes.candidates as Array<{ email: string; timestamp: string; source?: string | null }>).map((c) => ({
            Email_Address: c.email,
            Email: c.email,
            Timestamp: c.timestamp,
            How_did_you_hear_about_the_Job_post_offer: c.source ?? null,
          })),
        );
      }
      if (ansRes.data) setAttemptAnswers(ansRes.data);
      if (typingParRes.data) setTypingParagraphs(typingParRes.data);
      if (typingRes.data) setTypingResults(typingRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    const authed = sessionStorage.getItem("admin_authed");
    if (authed === "true") {
      setAuthorized(true);
      setShowAuthPrompt(false);
      void loadData();
    } else {
      setShowAuthPrompt(true);
    }
    
    return () => {
      sessionStorage.removeItem("admin_authed");
    };
  }, [loadData]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPwdInput }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; valid?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setAuthError(json?.error || "Failed to verify password");
        return;
      }
      if (!json.valid) {
        setAuthError("Incorrect password");
        return;
      }
      sessionStorage.setItem("admin_authed", "true");
      setShowAuthPrompt(false);
      setAuthorized(true);
      setAuthError("");
      void loadData();
    } catch {
      setAuthError("Failed to verify password");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordCurrent || !passwordNew || !passwordConfirm) {
      setAlertMessage({ title: "Error", message: "Please fill all password fields.", type: "error" });
      return;
    }
    if (passwordNew !== passwordConfirm) {
      setAlertMessage({ title: "Error", message: "New password and confirm password do not match.", type: "error" });
      return;
    }
    setIsChangingPassword(true);
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: passwordCurrent, newPassword: passwordNew }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setAlertMessage({ title: "Error", message: json?.error || "Failed to change password.", type: "error" });
        return;
      }
      setPasswordCurrent("");
      setPasswordNew("");
      setPasswordConfirm("");
      setAlertMessage({ title: "Success", message: "Admin password updated.", type: "success" });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleTimerChange = (id: string, value: string) => {
    const newTime = parseInt(value);
    if (isNaN(newTime)) return;
    
    setEditedTimers(prev => ({ ...prev, [id]: newTime }));
  };

  async function updateSectionTimer(id: string) {
    if (!supabase) return;
    
    const newTime = editedTimers[id];
    if (newTime === undefined) return;
    
    setIsSavingTimer(prev => ({ ...prev, [id]: true }));
    
    try {
      const { error } = await supabase.from("assessment_sections").update({ time_limit_seconds: newTime }).eq("id", id);
      
      if (error) {
        console.error("Error saving timer:", error);
        setAlertMessage({ title: "Error", message: `Failed to save timer: ${error.message}`, type: "error" });
        return;
      }
      
      setSections((prev) => prev.map((s) => (s.id === id ? { ...s, time_limit_seconds: newTime } : s)));
      // Remove from edited timers once saved successfully
      setEditedTimers(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingTimer(prev => ({ ...prev, [id]: false }));
    }
  }

  const typingByAttemptId = (() => {
    const map = new Map<string, { wpm: number | null; accuracy: number | null }>();
    for (const r of typingResults) {
      const attemptId = String((r as { attempt_id?: unknown }).attempt_id ?? "");
      if (!attemptId) continue;
      const wpmRaw = (r as { wpm?: unknown }).wpm;
      const accRaw = (r as { accuracy?: unknown }).accuracy;
      const wpm = typeof wpmRaw === "number" ? wpmRaw : wpmRaw === null ? null : Number(wpmRaw);
      const accuracy = typeof accRaw === "number" ? accRaw : accRaw === null ? null : Number(accRaw);
      map.set(attemptId, {
        wpm: Number.isFinite(wpm) ? wpm : null,
        accuracy: Number.isFinite(accuracy) ? accuracy : null,
      });
    }
    return map;
  })();

  const generalEnglishSectionId = sections.find((s) => s.slug === "general_english")?.id ?? null;

  const getEnglishLevelLabel = (correctCount: number) => {
    if (correctCount >= 20) return "C1/C2";
    if (correctCount >= 16) return "B2";
    return "B1-";
  };

  async function addTypingParagraph() {
    if (!supabase) return;
    const text = newTypingParagraphText.trim();
    if (!text) {
      setAlertMessage({ title: "Error", message: "Please enter a paragraph.", type: "error" });
      return;
    }
    setIsSavingTypingParagraph(true);
    try {
      const { data, error } = await supabase
        .from("typing_paragraphs")
        .insert({ text, active: true })
        .select("*")
        .single();
      if (error) throw error;
      setTypingParagraphs((prev) => [data, ...prev]);
      setNewTypingParagraphText("");
      setAlertMessage({ title: "Success", message: "Paragraph added.", type: "success" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to add paragraph.";
      setAlertMessage({ title: "Error", message: msg, type: "error" });
    } finally {
      setIsSavingTypingParagraph(false);
    }
  }

  async function toggleTypingParagraph(id: string, nextActive: boolean) {
    if (!supabase) return;
    setIsTogglingTypingParagraph((prev) => ({ ...prev, [id]: true }));
    try {
      const { error } = await supabase
        .from("typing_paragraphs")
        .update({ active: nextActive })
        .eq("id", id);
      if (error) throw error;
      setTypingParagraphs((prev) => prev.map((p) => (p.id === id ? { ...p, active: nextActive } : p)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update paragraph.";
      setAlertMessage({ title: "Error", message: msg, type: "error" });
    } finally {
      setIsTogglingTypingParagraph((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function deleteTypingParagraph(id: string) {
    if (!supabase) return;
    setIsDeletingTypingParagraph((prev) => ({ ...prev, [id]: true }));
    try {
      const { error } = await supabase.from("typing_paragraphs").delete().eq("id", id);
      if (error) throw error;
      setTypingParagraphs((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to delete paragraph.";
      setAlertMessage({ title: "Error", message: msg, type: "error" });
    } finally {
      setIsDeletingTypingParagraph((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function deleteAttempt() {
    if (!supabase || !deleteAttemptId) return;
    
    try {
      const { error } = await supabase.from("assessment_attempts").delete().eq("id", deleteAttemptId);
      
      if (error) {
        console.error("Error deleting attempt:", error);
        setAlertMessage({ title: "Error", message: `Failed to reset attempt: ${error.message}. This might be due to missing RLS policies.`, type: "error" });
        return;
      }
      
      setAttempts((prev) => prev.filter((a) => a.id !== deleteAttemptId));
      setDeleteAttemptId(null);
    } catch (e) {
      console.error(e);
      setAlertMessage({ title: "Error", message: "An unexpected error occurred while resetting the attempt.", type: "error" });
    }
  }

  async function updateQuestionPrompt(id: string) {
    if (!supabase) return;
    
    const edits = editedQuestions[id];
    if (!edits) return;

    setIsSavingQuestion(prev => ({ ...prev, [id]: true }));
    
    try {
      const { error } = await supabase.from("assessment_questions").update(edits).eq("id", id);
      
      if (error) {
        console.error("Error saving question:", error);
        setAlertMessage({ title: "Error", message: `Failed to save question: ${error.message}`, type: "error" });
        return;
      }
      
      setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...edits } : q)));
      setEditedQuestions(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingQuestion(prev => ({ ...prev, [id]: false }));
    }
  }

  const handleQuestionEdit = (id: string, field: keyof AssessmentQuestion, value: string | number) => {
    setEditedQuestions(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value
      }
    }));
  };

  const downloadQuestionsCSV = () => {
    if (questions.length === 0) {
      setAlertMessage({ title: "Info", message: "No questions to download.", type: "info" });
      return;
    }
    
    // Header row
    const headers = ["section_slug", "question_type", "prompt", "choice_a", "choice_b", "choice_c", "choice_d", "correct_choice", "points", "sort_order"];
    
    // Create map of section id to slug
    const sectionMap: Record<string, string> = {};
    sections.forEach(s => { sectionMap[s.id] = s.slug; });
    
    const csvContent = [
      headers.join(","),
      ...questions.map(q => {
        return [
          sectionMap[q.section_id] || "",
          q.question_type || "mcq",
          `"${(q.prompt || "").replace(/"/g, '""')}"`,
          `"${(q.choice_a || "").replace(/"/g, '""')}"`,
          `"${(q.choice_b || "").replace(/"/g, '""')}"`,
          `"${(q.choice_c || "").replace(/"/g, '""')}"`,
          `"${(q.choice_d || "").replace(/"/g, '""')}"`,
          q.correct_choice || "",
          q.points || 1,
          q.sort_order || 0
        ].join(",");
      })
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `assessment_questions_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearAllQuestions = async () => {
    if (!supabase) return;
    
    // Download first as requested
    downloadQuestionsCSV();
    
    setIsClearingQuestions(true);
    try {
      // In Supabase, delete all rows
      const { error } = await supabase.from("assessment_questions").delete().neq("id", "00000000-0000-0000-0000-000000000000"); // trick to delete all
      if (error) throw error;
      
      setQuestions([]);
      setShowClearQuestionsWarning(false);
    } catch (e) {
      console.error("Error clearing questions:", e);
      setAlertMessage({ title: "Error", message: "Failed to clear questions. Check RLS policies.", type: "error" });
    } finally {
      setIsClearingQuestions(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;
    
    setIsUploadingCSV(true);
    
    try {
      const text = await file.text();
      // Simple CSV parsing (this handles basic quotes but a robust library like PapaParse is better for production)
      const rows = text.split("\n").filter(row => row.trim() !== "");
      if (rows.length <= 1) {
        throw new Error("CSV file is empty or only contains headers.");
      }
      
      const headers = rows[0].split(",").map(h => h.trim().toLowerCase());
      const sectionMap: Record<string, string> = {}; // slug -> id
      sections.forEach(s => { sectionMap[s.slug] = s.id; });
      
      const newQuestions = [];
      
      // Parse rows
      for (let i = 1; i < rows.length; i++) {
        // Regex to match CSV values that might be enclosed in quotes
        const match = rows[i].match(/(?:\"([^\"]*(?:\"\"[^\"]*)*)\")|([^\",]+)/g);
        if (!match) continue;
        
        const values = match.map(val => {
          let v = val.trim();
          if (v.startsWith('"') && v.endsWith('"')) {
            v = v.substring(1, v.length - 1).replace(/""/g, '"');
          }
          return v;
        });
        
        const q: Record<string, string | number | null> = {};
        headers.forEach((h, idx) => {
          if (idx < values.length) q[h] = values[idx] === "" ? null : values[idx];
        });
        
        // Map section_slug to section_id
        if (q.section_slug && sectionMap[q.section_slug]) {
          q.section_id = sectionMap[q.section_slug];
          delete q.section_slug;
          newQuestions.push(q);
        }
      }
      
      if (newQuestions.length === 0) {
        throw new Error("No valid questions found in CSV. Check section_slug matches.");
      }
      
      const { error } = await supabase.from("assessment_questions").insert(newQuestions);
      if (error) throw error;
      
      // Reload questions
      const { data } = await supabase.from("assessment_questions").select("*").order("sort_order");
      if (data) setQuestions(data);
      
      setAlertMessage({ title: "Success", message: `Successfully uploaded ${newQuestions.length} questions.`, type: "success" });
      
    } catch (err: unknown) {
      console.error("Upload error:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setAlertMessage({ title: "Error", message: `Failed to upload questions: ${errorMessage}`, type: "error" });
    } finally {
      setIsUploadingCSV(false);
      if (e.target) e.target.value = ''; // Reset file input
    }
  };

  if (showAuthPrompt) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-10">
        <div className="card p-7 dark:card-dark">
          <div className="flex flex-col gap-2 mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Admin Access</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Please enter the administrator password to view this page.
            </p>
          </div>
          <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
            <div>
              <input
                type="password"
                className={`h-12 rounded-xl border bg-white px-4 text-sm outline-none focus:border-slate-400 dark:bg-white/5 w-full ${authError ? "border-rose-500" : "border-slate-200 dark:border-white/10"}`}
                placeholder="Enter Admin Password"
                value={adminPwdInput}
                onChange={(e) => {
                  setAdminPwdInput(e.target.value);
                  setAuthError("");
                }}
                autoFocus
              />
              {authError && (
                <p className="text-rose-500 text-sm mt-2 px-1">{authError}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => router.push("/")}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Login
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  if (!authorized) return null;

  return (
    <>
      {alertMessage && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900 dark:border dark:border-white/10 text-center">
            <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
              alertMessage.type === 'error' ? 'bg-rose-100 dark:bg-rose-500/10' : 
              alertMessage.type === 'success' ? 'bg-emerald-100 dark:bg-emerald-500/10' : 
              'bg-blue-100 dark:bg-blue-500/10'
            }`}>
               {alertMessage.type === 'error' && <XCircle className="h-6 w-6 text-rose-600 dark:text-rose-400" />}
               {alertMessage.type === 'success' && <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />}
               {alertMessage.type === 'info' && <Info className="h-6 w-6 text-blue-600 dark:text-blue-400" />}
            </div>
            <h3 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">
              {alertMessage.title}
            </h3>
            <p className="mb-6 text-sm text-slate-600 dark:text-slate-300">
              {alertMessage.message}
            </p>
            <button
              onClick={() => setAlertMessage(null)}
              className="btn btn-primary w-full justify-center"
            >
              Okay
            </button>
          </div>
        </div>
      )}
      {showClearQuestionsWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900 dark:border dark:border-white/10">
            <div className="flex items-center gap-3 mb-4 text-rose-600 dark:text-rose-400">
              <Trash2 className="h-6 w-6" />
              <h2 className="text-xl font-bold">Clear All Questions</h2>
            </div>
            <p className="text-slate-600 dark:text-slate-300 mb-6">
              Are you sure you want to delete all questions? This action cannot be undone. A CSV backup will be downloaded automatically before clearing.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowClearQuestionsWarning(false)}
                disabled={isClearingQuestions}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-700 flex items-center gap-2 disabled:opacity-50"
                onClick={handleClearAllQuestions}
                disabled={isClearingQuestions}
              >
                {isClearingQuestions ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, Download & Clear"}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteAttemptId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900 dark:border dark:border-white/10">
            <div className="flex items-center gap-3 mb-4 text-rose-600 dark:text-rose-400">
              <Trash2 className="h-6 w-6" />
              <h2 className="text-xl font-bold">Reset Attempt</h2>
            </div>
            <p className="text-slate-600 dark:text-slate-300 mb-6">
              Are you sure you want to reset and delete this attempt? This action cannot be undone and will permanently remove the candidate&apos;s answers and score.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteAttemptId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-700"
                onClick={deleteAttempt}
              >
                Yes, Reset
              </button>
            </div>
          </div>
        </div>
      )}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        
        <div className="flex gap-4 border-b border-slate-200 dark:border-white/10 pb-2">
          {(
            ["results", "typing", "sections", "questions", "candidates", "attempts", "password"] as const
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`capitalize font-semibold ${activeTab === tab ? "text-indigo-600 border-b-2 border-indigo-600" : "text-slate-500"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2"><Loader2 className="animate-spin" /> Loading...</div>
        ) : (
          <div className="card p-6 dark:card-dark overflow-auto">
            {activeTab === "results" && (
              <div className="flex flex-col gap-8">
                <div>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <h2 className="text-xl font-bold">Results Dashboard</h2>
                    
                    <div className="flex flex-col gap-3 bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/10 w-full md:w-[520px]">
                      <DateRangeTimeline
                        minDate={minDate}
                        maxDate={new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate() + totalDays)}
                        storageKey="admin_date_filter"
                        onChange={(s, e) => {
                          setSelectedStartISO(s);
                          setSelectedEndISO(e);
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border border-slate-200 dark:border-white/10 rounded-xl p-4">
                      <h3 className="font-semibold mb-4 text-slate-700 dark:text-slate-300">Candidates by Source</h3>
                      <div className="flex flex-col gap-3 h-[250px]">
                        {(() => {
                          const sourceCounts = filteredEmpDBData.reduce((acc, curr) => {
                            const source = curr.How_did_you_hear_about_the_Job_post_offer || 'Unknown';
                            acc[source] = (acc[source] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>);
                          
                          const chartData = Object.entries(sourceCounts)
                            .map(([source, count]) => ({ name: source, count: count as number }))
                            .sort((a, b) => b.count - a.count);
                            
                          if (chartData.length === 0) return <p className="text-sm text-slate-500">No source data available.</p>;

                          const total = chartData.reduce((sum, row) => sum + row.count, 0);
                          const max = Math.max(...chartData.map((row) => row.count));

                          return (
                            <div className="grid gap-4">
                              {chartData.slice(0, 8).map((row) => {
                                const pctOfMax = max === 0 ? 0 : Math.round((row.count / max) * 100);
                                const pctOfTotal = total === 0 ? 0 : Math.round((row.count / total) * 100);
                                return (
                                  <div key={row.name} className="grid grid-cols-[140px_1fr_72px] items-center gap-3">
                                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                      {row.name}
                                    </div>
                                    <div className="h-9 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-teal-400"
                                        style={{ width: `${pctOfMax}%` }}
                                      />
                                    </div>
                                    <div className="text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                                      {row.count} ({pctOfTotal}%)
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Overall Stats */}
                    <div className="border border-slate-200 dark:border-white/10 rounded-xl p-4 flex flex-col justify-center items-center text-center gap-4">
                       <h3 className="font-semibold text-slate-700 dark:text-slate-300">Candidates</h3>
                       <p className="text-5xl font-bold text-indigo-600 dark:text-indigo-400">{groupedAttempts.length}</p>
                       <p className="text-sm text-slate-500">Unique candidates</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold mb-4">Candidate Scores</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b dark:border-white/10">
                          <th className="py-2 px-2">Candidate</th>
                          <th className="py-2 px-2">Email</th>
                          <th className="py-2 px-2">Date</th>
                          <th className="py-2 px-2">Typing WPM</th>
                          <th className="py-2 px-2">Typing Accuracy</th>
                          {sections.map(s => (
                             <th key={s.id} className="py-2 px-2 whitespace-nowrap" title={s.title}>{s.title}</th>
                          ))}
                          <th className="py-2 px-2 font-bold text-indigo-600 dark:text-indigo-400">Total Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedAttempts.map(attempt => {
                          const cand = candidates.find(c => c.email === attempt.candidate_email);
                          const email = cand?.email || attempt.candidate_email || empDBData.find(e => e.Email_Address === attempt.candidate_email || e.Email === attempt.candidate_email)?.Email_Address || 'Unknown';
                          const typing = typingByAttemptId.get(attempt.id);
                          
                          // Calculate scores per section
                          const attemptAns = attemptAnswers.filter(a => a.attempt_id === attempt.id);
                          const scoresBySection: Record<string, number> = {};
                          let totalScore = 0;
                          
                          attemptAns.forEach(ans => {
                            const question = ans.assessment_questions;
                            if (!question) return;
                            
                            // Simple scoring: if they answered, give points (in a real app, check correct_choice)
                            // Note: For a real app we'd join with questions to check correct_choice. 
                            // Here we assume points are awarded if answer exists for simplicity, or we can look up from questions state
                            const qData = questions.find(q => q.id === ans.question_id);
                            const isCorrect = qData?.question_type === 'mcq' ? ans.selected_choice === qData.correct_choice : true; // Assuming spoken is auto-correct for now or manually graded
                            
                            if (isCorrect) {
                              const points = question.points || 1;
                              scoresBySection[question.section_id] = (scoresBySection[question.section_id] || 0) + points;
                              totalScore += points;
                            }
                          });

                          const generalEnglishStats = (() => {
                            if (!generalEnglishSectionId) return null;
                            let answered = 0;
                            let correct = 0;
                            for (const ans of attemptAns) {
                              const qData = questions.find(q => q.id === ans.question_id);
                              if (!qData) continue;
                              if (qData.section_id !== generalEnglishSectionId) continue;
                              if (qData.question_type !== "mcq") continue;
                              if (!ans.selected_choice) continue;
                              answered += 1;
                              if (ans.selected_choice === qData.correct_choice) correct += 1;
                            }
                            return { answered, correct };
                          })();

                          return (
                            <tr key={attempt.id} className="border-b dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                              <td className="py-2 px-2">{cand?.name || 'Unknown'}</td>
                              <td className="py-2 px-2">{email}</td>
                              <td className="py-2 px-2">{new Date(attempt.started_at).toLocaleDateString()}</td>
                              <td className="py-2 px-2">{typing?.wpm ?? "-"}</td>
                              <td className="py-2 px-2">{typing?.accuracy !== null && typing?.accuracy !== undefined ? `${typing.accuracy}%` : "-"}</td>
                              {sections.map(s => (
                                <td key={s.id} className="py-2 px-2">
                                  {(() => {
                                    const score = scoresBySection[s.id] || 0;
                                    if (s.id !== generalEnglishSectionId) return score;
                                    if (!generalEnglishStats || generalEnglishStats.answered === 0) return score;
                                    return `${score} (${getEnglishLevelLabel(generalEnglishStats.correct)})`;
                                  })()}
                                </td>
                              ))}
                              <td className="py-2 px-2 font-bold text-indigo-600 dark:text-indigo-400">{totalScore}</td>
                            </tr>
                          );
                        })}
                        {groupedAttempts.length === 0 && (
                          <tr>
                            <td colSpan={sections.length + 6} className="py-4 text-center text-slate-500">No assessment attempts yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "sections" && (
              <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold">Sections & Timers</h2>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b dark:border-white/10">
                      <th className="py-2">Title</th>
                      <th className="py-2">Time Limit (seconds)</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((s) => {
                      const currentTimer = editedTimers[s.id] !== undefined ? editedTimers[s.id] : (s.time_limit_seconds || 600);
                      const isChanged = editedTimers[s.id] !== undefined && editedTimers[s.id] !== s.time_limit_seconds;
                      const isSaving = isSavingTimer[s.id];
                      
                      return (
                        <tr key={s.id} className="border-b dark:border-white/5">
                          <td className="py-2">{s.title}</td>
                          <td className="py-2">
                            <input 
                              type="number" 
                              value={currentTimer}
                              onChange={(e) => handleTimerChange(s.id, e.target.value)}
                              className="border p-1 rounded dark:bg-black dark:border-white/20 w-24"
                            />
                          </td>
                          <td className="py-2">
                            <button
                              onClick={() => updateSectionTimer(s.id)}
                              disabled={!isChanged || isSaving}
                              className="btn btn-primary py-1 px-3 text-sm h-auto disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "questions" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">Questions Editor</h2>
                  <div className="flex gap-2">
                    <button onClick={downloadQuestionsCSV} className="btn btn-secondary py-1 px-3 text-sm">Download CSV</button>
                    <div>
                      <input type="file" id="csv-upload" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={isUploadingCSV} />
                      <label htmlFor="csv-upload" className="btn btn-secondary py-1 px-3 text-sm cursor-pointer inline-flex items-center gap-2">
                        {isUploadingCSV ? <Loader2 className="w-4 h-4 animate-spin" /> : "Upload CSV"}
                      </label>
                    </div>
                    <button onClick={() => setShowClearQuestionsWarning(true)} className="btn bg-rose-600 text-white hover:bg-rose-700 py-1 px-3 text-sm">Clear All</button>
                  </div>
                </div>
                <p className="text-sm text-slate-500">Edit question prompts below. For full choice/answer editing, use the Supabase dashboard for now.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead>
                      <tr className="border-b dark:border-white/10">
                        <th className="py-2 px-2">Section</th>
                        <th className="py-2 px-2">Prompt</th>
                        <th className="py-2 px-2">Choices (A/B/C/D)</th>
                        <th className="py-2 px-2">Correct</th>
                        <th className="py-2 px-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {questions.map((q) => {
                        const edits = editedQuestions[q.id] || {};
                        const isChanged = Object.keys(edits).length > 0;
                        const isSaving = isSavingQuestion[q.id];
                        
                        return (
                          <tr key={q.id} className="border-b dark:border-white/5">
                            <td className="py-2 px-2 whitespace-normal min-w-[150px]">{sections.find(s=>s.id === q.section_id)?.title}</td>
                            <td className="py-2 px-2">
                              <textarea
                                value={edits.prompt !== undefined ? edits.prompt : q.prompt}
                                onChange={(e) => handleQuestionEdit(q.id, 'prompt', e.target.value)}
                                className="w-full min-w-[200px] p-1 border rounded dark:bg-black dark:border-white/20 min-h-[40px]"
                              />
                            </td>
                            <td className="py-2 px-2">
                              {q.question_type === 'mcq' ? (
                                <div className="flex flex-col gap-1 text-xs">
                                  <input value={edits.choice_a ?? q.choice_a ?? ''} onChange={(e) => handleQuestionEdit(q.id, 'choice_a', e.target.value)} placeholder="A" className="border p-1 rounded dark:bg-black dark:border-white/20" />
                                  <input value={edits.choice_b ?? q.choice_b ?? ''} onChange={(e) => handleQuestionEdit(q.id, 'choice_b', e.target.value)} placeholder="B" className="border p-1 rounded dark:bg-black dark:border-white/20" />
                                  <input value={edits.choice_c ?? q.choice_c ?? ''} onChange={(e) => handleQuestionEdit(q.id, 'choice_c', e.target.value)} placeholder="C" className="border p-1 rounded dark:bg-black dark:border-white/20" />
                                  <input value={edits.choice_d ?? q.choice_d ?? ''} onChange={(e) => handleQuestionEdit(q.id, 'choice_d', e.target.value)} placeholder="D" className="border p-1 rounded dark:bg-black dark:border-white/20" />
                                </div>
                              ) : "Spoken"}
                            </td>
                            <td className="py-2 px-2">
                               {q.question_type === 'mcq' ? (
                                  <select value={edits.correct_choice ?? q.correct_choice ?? ''} onChange={(e) => handleQuestionEdit(q.id, 'correct_choice', e.target.value)} className="border p-1 rounded dark:bg-black dark:border-white/20">
                                    <option value="">-</option>
                                    <option value="A">A</option>
                                    <option value="B">B</option>
                                    <option value="C">C</option>
                                    <option value="D">D</option>
                                  </select>
                               ) : "-"}
                            </td>
                            <td className="py-2 px-2">
                              <button
                                onClick={() => updateQuestionPrompt(q.id)}
                                disabled={!isChanged || isSaving}
                                className="btn btn-primary py-1 px-3 text-xs h-auto disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "candidates" && (
              <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold">Candidates (from empDB)</h2>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b dark:border-white/10">
                      <th className="py-2">Name</th>
                      <th className="py-2">Email (Confirm Email)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c, i) => (
                      <tr key={i} className="border-b dark:border-white/5">
                        <td className="py-2">{c.name}</td>
                        <td className="py-2">{c.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "attempts" && (
              <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold">Attempts & Results</h2>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b dark:border-white/10">
                      <th className="py-2">Name</th>
                      <th className="py-2">Email</th>
                      <th className="py-2">Score</th>
                      <th className="py-2">Typing</th>
                      <th className="py-2">Started</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((a) => (
                      <tr key={a.id} className="border-b dark:border-white/5">
                        <td className="py-2">{a.candidate_name}</td>
                        <td className="py-2">{a.candidate_email}</td>
                        <td className="py-2">{a.total_score !== null ? `${a.total_score} / ${a.max_score}` : "In Progress"}</td>
                        <td className="py-2">
                          {(() => {
                            const t = typingByAttemptId.get(a.id);
                            if (!t || (t.wpm === null && t.accuracy === null)) return "—";
                            if (t.wpm !== null && t.accuracy !== null) return `${t.wpm} WPM • ${t.accuracy}%`;
                            if (t.wpm !== null) return `${t.wpm} WPM`;
                            return `${t.accuracy}%`;
                          })()}
                        </td>
                        <td className="py-2">{new Date(a.started_at).toLocaleString()}</td>
                        <td className="py-2">
                          <button onClick={() => setDeleteAttemptId(a.id)} className="text-red-500 hover:text-red-700 flex items-center gap-1">
                            <Trash2 className="w-4 h-4" /> Reset
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "typing" && (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <h2 className="text-xl font-bold">Typing Test Paragraphs</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Add multiple paragraphs. The assessment shuffles between active ones.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="flex flex-col gap-3">
                    <textarea
                      value={newTypingParagraphText}
                      onChange={(e) => setNewTypingParagraphText(e.target.value)}
                      className="min-h-[120px] w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
                      placeholder="Paste a paragraph here…"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="btn btn-primary disabled:opacity-50"
                        disabled={isSavingTypingParagraph}
                        onClick={addTypingParagraph}
                      >
                        {isSavingTypingParagraph ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add paragraph"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b dark:border-white/10">
                        <th className="py-2 pr-4">Active</th>
                        <th className="py-2 pr-4">Paragraph</th>
                        <th className="py-2 pr-4">Created</th>
                        <th className="py-2 pr-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {typingParagraphs.map((p) => (
                        <tr key={p.id} className="border-b dark:border-white/5">
                          <td className="py-2 pr-4">
                            <button
                              type="button"
                              className={[
                                "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                                p.active
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : "bg-slate-500/10 text-slate-700 dark:text-slate-300",
                              ].join(" ")}
                              onClick={() => toggleTypingParagraph(p.id, !p.active)}
                              disabled={!!isTogglingTypingParagraph[p.id]}
                            >
                              {isTogglingTypingParagraph[p.id] ? "Saving…" : p.active ? "Yes" : "No"}
                            </button>
                          </td>
                          <td className="py-2 pr-4 max-w-[740px]">
                            <div className="line-clamp-3 whitespace-pre-wrap text-slate-800 dark:text-slate-100">
                              {p.text}
                            </div>
                          </td>
                          <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                            {p.created_at ? new Date(p.created_at).toLocaleString() : "—"}
                          </td>
                          <td className="py-2 pr-4">
                            <button
                              type="button"
                              className="text-rose-600 hover:text-rose-700 disabled:opacity-50"
                              onClick={() => deleteTypingParagraph(p.id)}
                              disabled={!!isDeletingTypingParagraph[p.id]}
                            >
                              {isDeletingTypingParagraph[p.id] ? "Deleting…" : "Delete"}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {typingParagraphs.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-500">
                            No paragraphs yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "password" && (
              <div className="flex flex-col gap-5 max-w-xl">
                <h2 className="text-xl font-bold">Change Admin Password</h2>
                <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Current Password</label>
                    <input
                      type="password"
                      className="h-12 rounded-xl border bg-white px-4 text-sm outline-none focus:border-slate-400 dark:bg-white/5 w-full border-slate-200 dark:border-white/10"
                      value={passwordCurrent}
                      onChange={(e) => setPasswordCurrent(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">New Password</label>
                    <input
                      type="password"
                      className="h-12 rounded-xl border bg-white px-4 text-sm outline-none focus:border-slate-400 dark:bg-white/5 w-full border-slate-200 dark:border-white/10"
                      value={passwordNew}
                      onChange={(e) => setPasswordNew(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Confirm New Password</label>
                    <input
                      type="password"
                      className="h-12 rounded-xl border bg-white px-4 text-sm outline-none focus:border-slate-400 dark:bg-white/5 w-full border-slate-200 dark:border-white/10"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" className="btn btn-primary disabled:opacity-50" disabled={isChangingPassword}>
                      {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
