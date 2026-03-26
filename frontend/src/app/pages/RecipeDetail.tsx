import { ArrowLeft, Clock, ChefHat, Users, Plus, Play, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { motion, AnimatePresence } from 'motion/react'
import { getRecipeDetail } from '../../lib/api/client'
import { mapDetailToUiRecipe, type UiRecipe } from '../../lib/mappers/recipe'
import { useMealPlanStore } from '../../lib/state/meal-plan'
import { RecipeCoverImg } from '../components/RecipeCoverImg'

export default function RecipeDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const assignMeal = useMealPlanStore((s) => s.assignMeal)
  const [recipe, setRecipe] = useState<UiRecipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showMenu, setShowMenu] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError('')
    void getRecipeDetail(id)
      .then((detail) => {
        if (!cancelled) setRecipe(mapDetailToUiRecipe(detail))
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

  if (loading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center p-8 text-gray-500">
        加载中…
      </div>
    )
  }

  if (error || !recipe) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-600">{error || '找不到菜谱'}</p>
        <button type="button" className="mt-4 text-orange-600" onClick={() => navigate(-1)}>
          返回
        </button>
      </div>
    )
  }

  function addToPlan() {
    assignMeal('monday', 'dinner', recipe.id, recipe.title)
    navigate('/plan')
  }

  const handleDelete = () => {
    if (window.confirm('确定要删除这个菜谱吗？')) {
      alert('删除功能开发中...')
      // navigate(-1)
    }
  }

  const handleEdit = () => {
    alert('编辑功能开发中...')
    setShowMenu(false)
  }

  return (
    <div className="relative min-h-[100dvh] bg-white pb-24">
      <div className="absolute left-0 right-0 top-0 z-20 flex items-start justify-between p-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-md"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-md"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>

          <AnimatePresence>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 top-12 z-40 w-32 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg"
                >
                  <button
                    type="button"
                    onClick={handleEdit}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <Pencil className="h-4 w-4" /> 编辑
                  </button>
                  <div className="h-px w-full bg-gray-100" />
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" /> 删除
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="h-72 w-full">
        <RecipeCoverImg src={recipe.cover} alt={recipe.title} className="h-full w-full object-cover" />
      </div>

      <div className="relative z-10 -mt-6 space-y-6 rounded-t-3xl bg-white p-5">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {recipe.tags.map((tag) => (
              <span key={tag} className="rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600">
                {tag}
              </span>
            ))}
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">{recipe.title}</h1>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-gray-50 p-4">
          <div className="flex flex-col items-center gap-1">
            <Clock className="h-5 w-5 text-gray-400" />
            <span className="text-xs font-medium text-gray-600">{recipe.time} 分钟</span>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="flex flex-col items-center gap-1">
            <ChefHat className="h-5 w-5 text-gray-400" />
            <span className="text-xs font-medium text-gray-600">难度 {recipe.difficulty}</span>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="flex flex-col items-center gap-1">
            <Users className="h-5 w-5 text-gray-400" />
            <span className="text-xs font-medium text-gray-600">{recipe.servings} 人份</span>
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">食材清单</h2>
            <span className="text-xs text-gray-400">按 {recipe.servings} 人份</span>
          </div>
          <div className="space-y-3">
            {recipe.ingredients.map((ing, idx) => (
              <div key={`${ing.name}-${idx}`} className="flex items-center justify-between border-b border-gray-100 py-2 last:border-0">
                <span className="font-medium text-gray-800">{ing.name}</span>
                <span className="text-sm text-gray-500">{ing.amount}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-lg font-bold">烹饪步骤 ({recipe.steps.length})</h2>
          <div className="space-y-4">
            {recipe.steps.map((step, idx) => (
              <div key={idx} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                    {idx + 1}
                  </div>
                  {idx !== recipe.steps.length - 1 ? <div className="my-1 h-full w-px bg-gray-100" /> : null}
                </div>
                <div className="pb-4 pt-0.5 text-sm leading-relaxed text-gray-700">{step.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 flex gap-3 border-t border-gray-100 bg-white p-4">
        <button
          type="button"
          onClick={addToPlan}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-orange-50 py-3.5 font-bold text-orange-600"
        >
          <Plus className="h-5 w-5" />
          加入计划
        </button>
        <Link
          to={`/cook/${recipe.id}`}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-orange-500 py-3.5 font-bold text-white shadow-lg shadow-orange-500/30"
        >
          <Play className="h-5 w-5 fill-current" />
          开始做菜
        </Link>
      </div>
    </div>
  )
}
