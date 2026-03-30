import { ArrowLeft, ImagePlus, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { getRecipeDetail, updateRecipe, uploadMedia, type RecipeDetail } from '../../lib/api/client'
import { RecipeCoverImg } from '../components/RecipeCoverImg'

type IngForm = { group_name: string; name: string; amount_text: string; preparation: string }
type StepForm = { title: string; description: string; media_urls: string[] }

export default function RecipeEdit() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [totalMinutes, setTotalMinutes] = useState(30)
  const [difficulty, setDifficulty] = useState(2)
  const [cover, setCover] = useState('')
  const [gallery, setGallery] = useState<string[]>([])
  const [scenarioTags, setScenarioTags] = useState('')
  const [flavorTags, setFlavorTags] = useState('')
  const [servings, setServings] = useState(2)
  const [ingredients, setIngredients] = useState<IngForm[]>([])
  const [steps, setSteps] = useState<StepForm[]>([])

  function applyDetail(d: RecipeDetail) {
    const r = d.recipe
    setTitle(r.title ?? '')
    setSummary(r.summary ?? '')
    setCategory(r.category ?? '')
    setStatus((r.status === 'published' ? 'published' : 'draft') as 'draft' | 'published')
    setTotalMinutes(Math.max(1, r.total_minutes || 1))
    setDifficulty(Math.min(5, Math.max(1, r.difficulty || 2)))
    setCover(r.cover_image_url ?? '')
    setGallery(Array.isArray(r.gallery_image_urls) ? r.gallery_image_urls.filter(Boolean) : [])
    setScenarioTags((r.scenario_tags ?? []).join(' '))
    setFlavorTags((r.flavor_tags ?? []).join(' '))
    const meta = r.metadata
    const s = meta && typeof meta.servings === 'number' ? meta.servings : 2
    setServings(typeof s === 'number' && !Number.isNaN(s) ? s : 2)
    setIngredients(
      [...d.ingredients]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({
          group_name: i.group_name ?? '',
          name: i.name,
          amount_text: i.amount_text ?? '',
          preparation: i.preparation ?? '',
        })),
    )
    setSteps(
      [...d.steps]
        .sort((a, b) => a.step_no - b.step_no)
        .map((st) => {
          const urls = st.media_urls?.length
            ? st.media_urls
            : st.media_url
              ? [st.media_url]
              : []
          return {
            title: st.title ?? '',
            description: st.description ?? '',
            media_urls: urls.map((u) => u.trim()).filter(Boolean),
          }
        }),
    )
  }

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError('')
    void getRecipeDetail(id)
      .then((d) => {
        if (!cancelled) applyDetail(d)
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

  async function uploadKind(file: File) {
    const asset = await uploadMedia(file, 'images')
    return asset.storage_url
  }

  async function submit(nextStatus: 'draft' | 'published') {
    if (!id || !title.trim()) {
      window.alert('请填写标题')
      return
    }
    const ings = ingredients.filter((i) => i.name.trim())
    if (!ings.length) {
      window.alert('至少保留一条食材')
      return
    }
    const st = steps.filter((x) => x.description.trim())
    if (!st.length) {
      window.alert('至少保留一步骤')
      return
    }
    setSaving(true)
    try {
      await updateRecipe(id, {
        title: title.trim(),
        summary: summary.trim(),
        cover_image_url: cover.trim(),
        gallery_image_urls: gallery.filter(Boolean),
        category: category.trim() || '家常菜',
        status: nextStatus,
        total_minutes: totalMinutes,
        difficulty,
        scenario_tags: scenarioTags.split(/\s+/).filter(Boolean),
        flavor_tags: flavorTags.split(/\s+/).filter(Boolean),
        metadata: { servings },
        ingredients: ings.map((i) => ({
          group_name: i.group_name,
          name: i.name.trim(),
          amount_text: i.amount_text,
          preparation: i.preparation,
        })),
        steps: st.map((s) => ({
          title: s.title,
          description: s.description.trim(),
          media_urls: s.media_urls.filter(Boolean),
        })),
      })
      navigate(`/recipes/${id}`)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40dvh] items-center justify-center text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center text-gray-600">
        {error}
        <button type="button" className="mt-4 block w-full text-orange-600" onClick={() => navigate(-1)}>
          返回
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-gray-50 pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-200 bg-white px-3 py-3">
        <button type="button" onClick={() => navigate(-1)} className="rounded-full p-2 hover:bg-gray-100">
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <h1 className="flex-1 text-center text-base font-bold text-gray-900">编辑菜谱</h1>
        <span className="w-9" />
      </header>

      <div className="space-y-4 p-4">
        <label className="block text-sm font-medium text-gray-700">
          标题
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          简介
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-gray-700">
            分类
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            人份
            <input
              type="number"
              min={1}
              value={servings}
              onChange={(e) => setServings(Number(e.target.value) || 2)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-gray-700">
            时长(分钟)
            <input
              type="number"
              min={1}
              value={totalMinutes}
              onChange={(e) => setTotalMinutes(Number(e.target.value) || 1)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            难度 1–5
            <input
              type="number"
              min={1}
              max={5}
              value={difficulty}
              onChange={(e) => setDifficulty(Math.min(5, Math.max(1, Number(e.target.value) || 2)))}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="block text-sm font-medium text-gray-700">
          场景标签（空格分隔）
          <input
            value={scenarioTags}
            onChange={(e) => setScenarioTags(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          口味标签（空格分隔）
          <input
            value={flavorTags}
            onChange={(e) => setFlavorTags(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          />
        </label>

        <section className="rounded-2xl border border-gray-100 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">封面与相册</span>
            <label className="flex cursor-pointer items-center gap-1 text-xs text-orange-600">
              <Upload className="h-4 w-4" />
              上传
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? [])
                  e.target.value = ''
                  for (const f of files) {
                    try {
                      const url = await uploadKind(f)
                      setGallery((g) => [...g, url])
                      setCover((c) => c || url)
                    } catch (err) {
                      window.alert(err instanceof Error ? err.message : '上传失败')
                    }
                  }
                }}
              />
            </label>
          </div>
          <p className="mb-2 text-xs text-gray-400">首张可作为封面；可在下方相册删除，封面请单独设 URL 或保留首张。</p>
          <label className="text-xs text-gray-500">
            封面 URL
            <input
              value={cover}
              onChange={(e) => setCover(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {gallery.map((url, i) => (
              <div key={`${url}-${i}`} className="relative h-20 w-28 overflow-hidden rounded-lg border border-gray-100">
                <RecipeCoverImg
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                  loading={i === 0 ? 'eager' : 'lazy'}
                  fetchPriority={i === 0 ? 'high' : 'low'}
                />
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white"
                  onClick={() => {
                    setGallery((g) => g.filter((_, j) => j !== i))
                    if (cover === url) setCover('')
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="absolute bottom-1 left-1 rounded bg-white/90 px-1.5 text-[10px] text-gray-800"
                  onClick={() => setCover(url)}
                >
                  设封面
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">食材</span>
            <button
              type="button"
              className="text-orange-600"
              onClick={() => setIngredients((x) => [...x, { group_name: '', name: '', amount_text: '', preparation: '' }])}
            >
              <Plus className="inline h-4 w-4" /> 添加
            </button>
          </div>
          <div className="space-y-2">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex flex-wrap gap-2 rounded-xl bg-gray-50 p-2">
                <input
                  placeholder="名称"
                  value={ing.name}
                  onChange={(e) => {
                    const v = [...ingredients]
                    v[idx] = { ...v[idx], name: e.target.value }
                    setIngredients(v)
                  }}
                  className="min-w-[100px] flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                />
                <input
                  placeholder="用量"
                  value={ing.amount_text}
                  onChange={(e) => {
                    const v = [...ingredients]
                    v[idx] = { ...v[idx], amount_text: e.target.value }
                    setIngredients(v)
                  }}
                  className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                />
                <button type="button" className="text-red-500" onClick={() => setIngredients((x) => x.filter((_, j) => j !== idx))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">步骤</span>
            <button
              type="button"
              className="text-orange-600"
              onClick={() => setSteps((x) => [...x, { title: '', description: '', media_urls: [] }])}
            >
              <Plus className="inline h-4 w-4" /> 添加
            </button>
          </div>
          <div className="space-y-4">
            {steps.map((step, idx) => (
              <div key={idx} className="rounded-xl border border-gray-100 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">步骤 {idx + 1}</span>
                  <button type="button" className="text-red-500" onClick={() => setSteps((x) => x.filter((_, j) => j !== idx))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <input
                  placeholder="小标题（可选）"
                  value={step.title}
                  onChange={(e) => {
                    const v = [...steps]
                    v[idx] = { ...v[idx], title: e.target.value }
                    setSteps(v)
                  }}
                  className="mb-2 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                />
                <textarea
                  placeholder="做法描述"
                  value={step.description}
                  onChange={(e) => {
                    const v = [...steps]
                    v[idx] = { ...v[idx], description: e.target.value }
                    setSteps(v)
                  }}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {step.media_urls.map((url, j) => (
                    <div key={`${url}-${j}`} className="relative h-16 w-24 overflow-hidden rounded-lg border">
                      <RecipeCoverImg
                        src={url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        fetchPriority="low"
                      />
                      <button
                        type="button"
                        className="absolute right-0.5 top-0.5 rounded bg-black/50 p-0.5 text-white"
                        onClick={() => {
                          const v = [...steps]
                          v[idx] = { ...v[idx], media_urls: v[idx].media_urls.filter((_, k) => k !== j) }
                          setSteps(v)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label className="flex h-16 w-24 cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-400">
                    <ImagePlus className="h-6 w-6" />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={async (e) => {
                        const files = Array.from(e.target.files ?? [])
                        e.target.value = ''
                        const urls: string[] = []
                        for (const f of files) {
                          try {
                            urls.push(await uploadKind(f))
                          } catch (err) {
                            window.alert(err instanceof Error ? err.message : '上传失败')
                          }
                        }
                        if (urls.length) {
                          const v = [...steps]
                          v[idx] = { ...v[idx], media_urls: [...v[idx].media_urls, ...urls] }
                          setSteps(v)
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 flex flex-col gap-2 border-t border-gray-200 bg-white p-3">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit(status)}
            className="flex-1 rounded-2xl bg-gray-900 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit('draft')}
            className="flex-1 rounded-2xl border border-gray-200 py-3 text-sm font-bold text-gray-800 disabled:opacity-50"
          >
            存为草稿
          </button>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit('published')}
          className="w-full rounded-2xl bg-orange-500 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          发布为正式菜谱
        </button>
      </div>
    </div>
  )
}
