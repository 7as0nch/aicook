import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowLeft, Play, Pause, RotateCcw, Check } from 'lucide-react'
import { getRecipeDetail } from '../../lib/api/client'
import { mapDetailToUiRecipe, type UiRecipe } from '../../lib/mappers/recipe'
import { useAI } from '../contexts/AIContext'
import { RecipeCoverImg } from '../components/RecipeCoverImg'

const R = 88
const CIRC = 2 * Math.PI * R

function formatStepTotalSeconds(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`
  }
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分钟`
  }
  return `${seconds} 秒`
}

export default function CookingMode() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { setPageContext } = useAI()
  const [recipe, setRecipe] = useState<UiRecipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [timerRunning, setTimerRunning] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError('')
    void getRecipeDetail(id)
      .then((detail) => {
        if (!cancelled) {
          setRecipe(mapDetailToUiRecipe(detail))
          setCurrentStepIndex(0)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const step = recipe?.steps[currentStepIndex]

  useEffect(() => {
    if (recipe && step) {
      setPageContext({
        type: 'cooking',
        recipe: recipe.title,
        stepNo: currentStepIndex + 1,
        stepText: step.text,
      })
    }
    return () => setPageContext(null)
  }, [recipe, step, currentStepIndex, setPageContext])

  const stepDuration = step?.time && step.time > 0 ? step.time : 0

  useEffect(() => {
    setTimerRunning(false)
    if (stepDuration > 0) {
      setTimeLeft(stepDuration)
    } else {
      setTimeLeft(null)
    }
  }, [currentStepIndex, stepDuration])

  useEffect(() => {
    if (!timerRunning) return
    const idTimer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 0) return 0
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(idTimer)
  }, [timerRunning])

  useEffect(() => {
    if (timeLeft === 0 && timerRunning) {
      setTimerRunning(false)
    }
  }, [timeLeft, timerRunning])

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-black text-white">
        加载中…
      </div>
    )
  }

  if (error || !recipe || !step) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-black p-8 text-white">
        <p className="text-center opacity-80">{error || '找不到菜谱'}</p>
        <button type="button" className="rounded-xl bg-white/10 px-4 py-2" onClick={() => navigate(-1)}>
          返回
        </button>
      </div>
    )
  }

  const nextStep = () => {
    if (currentStepIndex < recipe.steps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1)
    } else {
      navigate(-1)
    }
  }

  const prevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const isLastStep = currentStepIndex === recipe.steps.length - 1
  const total = stepDuration > 0 ? stepDuration : 1
  const progress = timeLeft !== null && total > 0 ? Math.min(1, Math.max(0, timeLeft / total)) : 0
  const dashOffset = CIRC * (1 - progress)

  const heroSrc = step.mediaUrl || recipe.cover

  return (
    <div className="relative flex h-[100dvh] flex-col bg-black text-white">
      <div className="z-10 flex shrink-0 items-center justify-between p-4 pt-4">
        <button type="button" onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-sm font-medium opacity-60">
          步骤 {currentStepIndex + 1} / {recipe.steps.length}
        </div>
        <div className="w-10" />
      </div>

      <div className="relative z-0 mx-auto w-full max-w-md shrink-0 px-6 pb-2 pt-2">
        <div className="aspect-video w-full overflow-hidden rounded-2xl opacity-90">
          <RecipeCoverImg
            key={`${currentStepIndex}-${heroSrc ?? ''}`}
            src={heroSrc}
            alt={recipe.title}
            className="h-full w-full object-cover"
            loading="eager"
            fetchPriority="high"
          />
        </div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center overflow-y-auto overflow-x-hidden px-4 py-2 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStepIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="flex w-full max-w-full flex-col items-center"
          >
            <h2 className="mb-2 w-full max-w-full whitespace-pre-line break-words text-xl font-bold leading-snug">{step.text}</h2>

            {step.hint ? (
              <div className="mb-2 flex w-full max-w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs text-orange-300">
                <span className="shrink-0">💡</span>
                <span className="break-words text-left">{step.hint}</span>
              </div>
            ) : null}

            {stepDuration > 0 && timeLeft !== null ? (
              <div className="mt-2 flex flex-col items-center">
                <p className="mb-1 text-[10px] text-white/50">本步需时 {formatStepTotalSeconds(stepDuration)}</p>
                <div className="relative flex h-28 w-28 items-center justify-center">
                  <svg className="absolute h-full w-full -rotate-90 transform" viewBox="0 0 192 192" aria-hidden>
                    <circle cx="96" cy="96" r={R} className="stroke-white/10" strokeWidth="6" fill="none" />
                    <circle
                      cx="96"
                      cy="96"
                      r={R}
                      className="stroke-orange-500"
                      strokeWidth="6"
                      fill="none"
                      strokeDasharray={CIRC}
                      strokeDashoffset={dashOffset}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="flex flex-col items-center">
                    <div className="text-2xl font-light tabular-nums">{formatTime(timeLeft)}</div>
                    {timeLeft === 0 ? <span className="mt-0.5 text-[10px] font-medium text-orange-300">时间到</span> : null}
                  </div>
                </div>
                <div className="mt-4 flex gap-6">
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setTimerRunning(!timerRunning)}
                      disabled={timeLeft === 0}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 disabled:opacity-40"
                    >
                      {timerRunning ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                    </button>
                    <span className="text-[10px] text-white/60">{timerRunning ? '暂停' : '开始'}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setTimeLeft(stepDuration)
                        setTimerRunning(false)
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                    <span className="text-[10px] text-white/60">重置</span>
                  </div>
                </div>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="z-10 flex shrink-0 items-center gap-4 p-4 pb-4">
        <button
          type="button"
          onClick={prevStep}
          disabled={currentStepIndex === 0}
          className="h-12 rounded-2xl bg-white/10 px-6 text-sm font-medium transition-opacity disabled:opacity-30"
        >
          上一步
        </button>
        <button type="button" onClick={nextStep} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-orange-500 text-base font-bold">
          {isLastStep ? (
            <>
              完成 <Check className="h-5 w-5" />
            </>
          ) : (
            '下一步'
          )}
        </button>
      </div>
    </div>
  )
}
