import {
  BookOpen,
  Headphones,
  Keyboard,
  Landmark,
  MessageSquareText,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

export default function Home() {
  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-6 py-10">
      <div className="flex flex-col gap-5">
          <div className="card p-7 dark:card-dark">
            <div className="flex flex-col gap-3">
              <div className="pill w-fit">
                <span>Typing + 6 sections</span>
                <span className="h-1 w-1 rounded-full bg-slate-400" />
                <span>MCQ + Spoken</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Modern assessment experience for hiring great candidates
              </h1>
              <p className="max-w-2xl text-slate-600 dark:text-slate-300">
                Candidates complete the full assessment in one flow. You get a
                consistent score breakdown by section with all answers stored in
                Supabase.
              </p>
            </div>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="card p-6 dark:card-dark">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-500/10 text-rose-700 dark:text-rose-300">
                <Keyboard className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold">Typing Speed & Accuracy</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  1 minute (WPM + accuracy)
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 dark:card-dark">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                <BookOpen className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold">General English</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  25 questions (C1 level)
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 dark:card-dark">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <MessageSquareText className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold">
                  Call Center Protocols
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  10 questions (metrics & SOP)
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 dark:card-dark">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-500/10 text-sky-700 dark:text-sky-300">
                <Landmark className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold">USA Culture</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  5 questions (general)
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 dark:card-dark">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold">Sales & Retention</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  5 questions (objections)
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 dark:card-dark">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-500/10 text-orange-700 dark:text-orange-300">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold">
                  Virtual Fitness Knowledge
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  5 questions (domain)
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 dark:card-dark">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900/10 text-slate-900 dark:text-slate-200">
                <Headphones className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-semibold">Spoken English</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  Pronunciation test
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
  );
}
