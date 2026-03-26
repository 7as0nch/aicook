import { Search, Filter, Plus, FileText, Image as ImageIcon, Link as LinkIcon, PenTool, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion, AnimatePresence } from 'motion/react'
import { listRecipes } from '../../lib/api/client'
import { mapCardToUiRecipe, type UiRecipe } from '../../lib/mappers/recipe'
import { RecipeCoverImg } from '../components/RecipeCoverImg'

export default function Recipes() {
  const navigate = useNavigate()
  const [recipes, setRecipes] = useState<UiRecipe[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAddMenu, setShowAddMenu] = useState(false)

  useEffect(() => {
    let cancelled = false
    void listRecipes(48)
      .then((cards) => {
        if (!cancelled) setRecipes(cards.map(mapCardToUiRecipe))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return recipes
    return recipes.filter((r) => {
      const blob = `${r.title} ${r.tags.join(' ')}`.toLowerCase()
      return blob.includes(q)
    })
  }, [query, recipes])

  return (
    <div className="space-y-4 p-4">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-gray-50 pb-4 pt-2">
        <h1 className="text-2xl font-bold text-gray-900">菜谱库</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowAddMenu(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white transition-transform active:scale-95"
          >
            <Plus className="h-5 w-5" />
          </button>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 bg-white shadow-sm">
            <Filter className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索所有菜谱..."
          className="w-full rounded-2xl border-none bg-white py-3 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>

      {loading ? (
        <p className="text-center text-gray-400">加载中…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((recipe) => (
            <Link
              key={recipe.id}
              to={`/recipes/${recipe.id}`}
              className="flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
            >
              <div className="h-32 bg-gray-200">
                <RecipeCoverImg src={recipe.cover} alt={recipe.title} className="h-full w-full object-cover" />
              </div>
              <div className="p-3">
                <h3 className="mb-1 line-clamp-2 text-sm font-bold leading-snug text-gray-900">{recipe.title}</h3>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{recipe.time}分钟</span>
                  <span>⭐ {recipe.difficulty}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Add Recipe Bottom Sheet */}
      <AnimatePresence>
        {showAddMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddMenu(false)}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 z-[101] rounded-t-3xl bg-white p-6 shadow-2xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">添加新菜谱</h3>
                <button
                  type="button"
                  onClick={() => setShowAddMenu(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/recipes/editor')}
                  className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-gray-50 px-2 py-6 transition-colors hover:bg-gray-100"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                  <div className="text-center">
                    <div className="mb-1 text-[14px] font-bold text-gray-900">图片识别</div>
                    <div className="text-[11px] text-gray-500">AI解析图片菜谱</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => alert('功能开发中...')}
                  className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-gray-50 px-2 py-6 transition-colors hover:bg-gray-100"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm">
                    <LinkIcon className="h-5 w-5" />
                  </div>
                  <div className="text-center">
                    <div className="mb-1 text-[14px] font-bold text-gray-900">网页提取</div>
                    <div className="text-[11px] text-gray-500">粘贴链接提取</div>
                  </div>
                </button>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => navigate('/recipes/editor')}
                  className="flex w-full items-center gap-4 rounded-2xl bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm">
                    <PenTool className="h-5 w-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-[14px] font-bold text-gray-900">手动录入</div>
                    <div className="text-[12px] text-gray-500">自己写下独特秘方</div>
                  </div>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
