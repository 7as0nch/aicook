import { ArrowLeft, Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { importRecipeShare, previewRecipeShare, type RecipeSharePreview } from '../../lib/api/client'
import { mapDetailToUiRecipe } from '../../lib/mappers/recipe'
import { RecipeCoverImg } from '../components/RecipeCoverImg'
import { toast } from 'sonner'

export default function RecipeShareImport() {
  const navigate = useNavigate()
  const { shareCode = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<RecipeSharePreview | null>(null)

  useEffect(() => {
    if (!shareCode) return
    let cancelled = false
    setLoading(true)
    void previewRecipeShare(shareCode)
      .then((payload) => {
        if (!cancelled) setPreview(payload)
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : '加载分享失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [shareCode])

  const recipe = preview ? mapDetailToUiRecipe(preview.detail) : null

  async function handleImport() {
    if (!shareCode) return
    setBusy(true)
    try {
      const imported = await importRecipeShare(shareCode)
      toast.success('菜谱已导入到当前厨房')
      navigate(`/recipes/${imported.id}`, { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入失败')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 text-gray-500">加载分享内容…</div>
  }

  if (!recipe) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
        <p className="text-gray-600">分享内容不存在或已失效</p>
        <button type="button" onClick={() => navigate('/recipes')} className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white">返回菜谱库</button>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={() => navigate(-1)} className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">分享菜谱预览</h1>
          <p className="text-xs text-gray-400">分享码：{preview?.share.share_code}</p>
        </div>
      </div>

      <div className="space-y-5 p-4">
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="aspect-4/3 w-full bg-gray-100">
            <RecipeCoverImg src={recipe.cover} alt={recipe.title} className="h-full w-full object-cover" loading="eager" fetchPriority="high" />
          </div>
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap gap-2">
              {recipe.tags.map((tag) => <span key={tag} className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-600">{tag}</span>)}
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900">{recipe.title}</h2>
            <p className="text-sm leading-6 text-gray-500">{recipe.summary || '家人分享的一道菜，导入后可继续编辑和安排进周计划。'}</p>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-gray-900">食材预览</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {recipe.ingredients.map((item, index) => <span key={`${item.name}-${index}`} className="rounded-full border border-gray-100 bg-gray-50 px-3 py-1.5 text-xs text-gray-700">{item.name}{item.amount ? ` · ${item.amount}` : ''}</span>)}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-100 bg-white p-4">
        <button type="button" disabled={busy} onClick={() => void handleImport()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 py-4 text-sm font-bold text-white disabled:opacity-50">
          <Download className="h-4 w-4" />
          {busy ? '导入中…' : '导入到我的厨房'}
        </button>
      </div>
    </div>
  )
}
