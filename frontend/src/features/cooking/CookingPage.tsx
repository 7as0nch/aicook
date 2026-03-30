import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { VoiceHoldButton } from '../../components/media/VoiceHoldButton'
import { getRecipeDetail } from '../../lib/api/client'
import { useAIWorkspaceStore } from '../../lib/state/ai-workspace'
import { useCookingStore } from '../../lib/state/cooking'

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function CookingPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const recipeId = searchParams.get('recipe') ?? ''
  const { detail, stepIndex, setDetail, setRecipe, nextStep, previousStep, goToStep } = useCookingStore()
  const { setSelection, openQuote } = useAIWorkspaceStore()
  const [remaining, setRemaining] = useState(0)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (detail || !recipeId) return
    void getRecipeDetail(recipeId).then((payload) => {
      setRecipe(recipeId, payload)
      setDetail(payload)
    })
  }, [detail, recipeId, setDetail, setRecipe])

  const activeStep = detail?.steps[stepIndex]
  const total = activeStep?.timer_seconds || 0
  const progress = useMemo(() => {
    if (!total) return 0
    return Math.min(1, Math.max(0, 1 - remaining / total))
  }, [remaining, total])

  useEffect(() => {
    setRemaining(activeStep?.timer_seconds || 0)
    setRunning(false)
  }, [activeStep?.id, activeStep?.timer_seconds])

  useEffect(() => {
    if (!running || remaining <= 0) return
    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer)
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [remaining, running])

  if (!detail || !activeStep) {
    return <div className="h-[60vh] animate-pulse rounded-3xl bg-surface-container-low" />
  }

  const circumference = 2 * Math.PI * 58
  const dashOffset = circumference * (1 - progress)
  const stepLabel = String(activeStep.step_no).padStart(2, '0')

  function openQuoteWith(text: string, source: string) {
    setSelection(
      {
        selected_text: text,
        selection_source: source,
        surrounding_text: `${activeStep.title}\n${activeStep.description}`,
        scene: 'cooking',
      },
      { x: window.innerWidth / 2, y: window.scrollY + 120 },
    )
    openQuote()
  }

  return (
    <div className="relative min-h-[calc(100dvh-5rem)] pb-24">
      <div className="mb-10 flex flex-col items-center md:mb-12">
        <span className="step-progress-glow mb-4 rounded-full bg-primary-fixed px-6 py-2 font-headline text-lg font-bold tracking-tight text-on-primary-fixed-variant">
          第 {stepIndex + 1} / {detail.steps.length} 步
        </span>
        <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-surface-container-high">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${((stepIndex + 1) / detail.steps.length) * 100}%` }}
          />
        </div>
      </div>

      <section className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="relative order-2 lg:order-1 lg:col-span-5">
          <div className="aspect-square overflow-hidden rounded-[2.5rem] bg-surface-container-low shadow-xl transition-transform duration-700 lg:-rotate-2 lg:hover:rotate-0">
            <img
              src={
                activeStep.media_url ||
                detail.recipe.cover_image_url ||
                'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1200&q=80'
              }
              alt={activeStep.title || detail.recipe.title}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-6 -right-2 rounded-full border border-white/20 bg-white/80 p-6 shadow-2xl backdrop-blur-xl dark:bg-stone-900/80 md:bottom-12 md:-right-8">
            <div className="relative flex h-32 w-32 items-center justify-center">
              <svg className="h-32 w-32 -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-surface-container-high" />
                <circle
                  cx="64"
                  cy="64"
                  r="58"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="text-tertiary transition-all duration-700"
                />
              </svg>
              <div className="absolute flex flex-col items-center text-center">
                <span className="font-headline text-3xl font-black tracking-tighter text-on-surface">{formatTime(remaining)}</span>
                <span className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  {running ? '计时中' : '待开始'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 flex flex-col justify-center lg:order-2 lg:col-span-7">
          <div className="relative mb-6">
            <span className="pointer-events-none absolute -left-4 -top-8 select-none font-headline text-[100px] font-black leading-none text-surface-container opacity-40 md:-top-12 md:text-[120px]">
              {stepLabel}
            </span>
            <h1 className="font-headline relative z-10 text-display-sm font-extrabold leading-none tracking-tighter text-on-surface md:text-display-lg">
              {activeStep.title || `步骤 ${activeStep.step_no}`}
            </h1>
          </div>
          <p
            className="font-body max-w-2xl text-lg leading-relaxed text-on-surface-variant md:text-xl"
            data-selection-source={`cooking-step-${activeStep.recipe_id}-${activeStep.step_no}`}
          >
            {activeStep.description}
          </p>

          <div className="no-scrollbar mt-8 flex gap-4 overflow-x-auto pb-2">
            {detail.ingredients.slice(0, 6).map((ingredient) => (
              <div
                key={ingredient.id}
                className="flex shrink-0 items-center gap-3 rounded-xl bg-surface-container-lowest px-4 py-3 shadow-sm"
              >
                <span className="material-symbols-outlined text-primary">restaurant</span>
                <span className="font-label font-semibold text-on-surface">
                  {ingredient.name}
                  {ingredient.amount_text ? `（${ingredient.amount_text}）` : ''}
                </span>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-12 grid w-full max-w-3xl grid-cols-2 gap-4 md:gap-6">
            <button
              type="button"
              className="flex items-center justify-center gap-3 rounded-2xl bg-surface-container-low py-5 font-headline text-lg font-bold text-primary transition-all hover:bg-surface-container active:scale-95 md:py-6 md:text-xl"
              onClick={() => previousStep()}
            >
              <span className="material-symbols-outlined">chevron_left</span>
              上一步
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-3 rounded-2xl bg-primary py-5 font-headline text-lg font-bold text-on-primary shadow-lg shadow-primary/20 transition-all hover:opacity-90 active:scale-95 md:py-6 md:text-xl"
              onClick={() => nextStep(detail.steps.length)}
            >
              下一步
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3 border-t border-outline-variant/20 pt-8">
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-outline-variant/30 bg-white px-5 py-3 shadow-sm transition-all hover:shadow-md active:scale-95 dark:bg-stone-900"
              onClick={() => openQuoteWith(activeStep.ai_hint || activeStep.description, `cooking-hint-${activeStep.step_no}`)}
            >
              <span className="material-symbols-outlined text-tertiary">psychology</span>
              <span className="font-label font-bold text-on-surface">帮我，助手</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-outline-variant/30 bg-white px-5 py-3 shadow-sm transition-all hover:shadow-md active:scale-95 dark:bg-stone-900"
              onClick={() => openQuoteWith(activeStep.end_condition || activeStep.description, `cooking-done-${activeStep.step_no}`)}
            >
              <span className="material-symbols-outlined text-secondary">done_all</span>
              <span className="font-label font-bold text-on-surface">好了吗？</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-outline-variant/30 bg-white px-5 py-3 shadow-sm transition-all hover:shadow-md active:scale-95 dark:bg-stone-900"
              onClick={() => openQuoteWith('这一步需要加水吗？', 'cooking-water')}
            >
              <span className="material-symbols-outlined text-primary">water_drop</span>
              <span className="font-label font-bold text-on-surface">要加水吗？</span>
            </button>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              className="rounded-full border border-outline-variant/40 px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low"
              onClick={() => setRunning((c) => !c)}
            >
              {running ? '暂停计时' : '开始计时'}
            </button>
            <button
              type="button"
              className="rounded-full border border-outline-variant/40 px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low"
              onClick={() => setRemaining(total)}
            >
              重置
            </button>
            <button
              type="button"
              className="rounded-full border border-outline-variant/40 px-4 py-2 text-sm font-semibold text-primary hover:bg-surface-container-low"
              onClick={() => navigate(`/recipes/${detail.recipe.id}`)}
            >
              返回详情
            </button>
          </div>
        </div>
      </section>

      <section className="mt-10 hidden md:block">
        <p className="mb-3 text-center text-xs font-bold uppercase tracking-wider text-on-surface-variant">步骤跳转</p>
        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
          {detail.steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={[
                'min-w-36 shrink-0 rounded-2xl px-4 py-3 text-left transition-colors',
                index === stepIndex ? 'bg-primary text-on-primary' : 'border border-outline-variant/30 bg-surface-container-low text-on-surface',
              ].join(' ')}
              onClick={() => goToStep(index)}
            >
              <p className="text-xs font-bold uppercase tracking-wide opacity-80">步骤 {step.step_no}</p>
              <p className="font-headline mt-1 text-base font-bold">{step.title || `步骤 ${step.step_no}`}</p>
            </button>
          ))}
        </div>
      </section>

      <div className="fixed bottom-28 right-6 z-40 md:bottom-8 md:right-8">
        <VoiceHoldButton
          compact
          className="h-16 w-16 justify-center rounded-full border-0 bg-tertiary p-0 text-on-tertiary shadow-2xl transition-transform hover:scale-105 active:scale-90"
          onTranscribed={(text) => {
            setSelection(
              {
                selected_text: text,
                selection_source: 'cooking-voice',
                surrounding_text: activeStep.description,
                scene: 'cooking',
              },
              { x: window.innerWidth / 2, y: window.scrollY + 180 },
            )
            openQuote()
          }}
        />
      </div>

      <style>{`
        .step-progress-glow { box-shadow: 0 0 20px rgba(74, 101, 74, 0.12); }
      `}</style>
    </div>
  )
}
