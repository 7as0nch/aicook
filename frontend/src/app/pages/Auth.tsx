import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'

import { consumeAuthExpiredReason, isAuthenticated, loginWithPassword, registerWithPassword } from '../../lib/api/client'

export default function Auth() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    username: '',
    password: '',
    display_name: '',
    household_name: '',
  })

  useEffect(() => {
    const expiredReason = consumeAuthExpiredReason()
    if (expiredReason) {
      setError(expiredReason || '登录状态已失效，请重新登录')
    }
  }, [])

  if (isAuthenticated()) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (mode === 'login') {
        await loginWithPassword(form.username, form.password)
      } else {
        await registerWithPassword(form)
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center overflow-hidden bg-gray-50 px-5 py-5">
      <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-sm flex-col justify-center space-y-4">
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-orange-500">AICook Account</p>
          <h1 className="text-[28px] font-black tracking-tight text-gray-900">
            {mode === 'login' ? '登录你的厨房' : '创建你的厨房'}
          </h1>
          <p className="text-[13px] leading-5 text-gray-500">登录后可切换厨房、导入分享菜谱，并让标签与 AI 数据按家庭隔离。</p>
        </div>

        <div className="grid grid-cols-2 rounded-full bg-gray-100 p-1 text-sm font-semibold">
          <button
            type="button"
            className={`rounded-full py-2 ${mode === 'login' ? 'bg-orange-500 text-white' : 'text-gray-500'}`}
            onClick={() => setMode('login')}
          >
            登录
          </button>
          <button
            type="button"
            className={`rounded-full py-2 ${mode === 'register' ? 'bg-orange-500 text-white' : 'text-gray-500'}`}
            onClick={() => setMode('register')}
          >
            注册
          </button>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-gray-700">用户名</span>
          <input
            value={form.username}
            onChange={(e) => setForm((current) => ({ ...current, username: e.target.value }))}
            className="w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2.5 text-sm outline-none transition placeholder:text-gray-300 focus:border-orange-400"
            placeholder="例如 homechef"
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-gray-700">密码</span>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
            className="w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2.5 text-sm outline-none transition placeholder:text-gray-300 focus:border-orange-400"
            placeholder="至少 6 位"
            required
          />
        </label>

        {mode === 'register' ? (
          <>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-gray-700">展示名</span>
              <input
                value={form.display_name}
                onChange={(e) => setForm((current) => ({ ...current, display_name: e.target.value }))}
                className="w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2.5 text-sm outline-none transition placeholder:text-gray-300 focus:border-orange-400"
                placeholder="例如 家庭大厨"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-gray-700">厨房名称</span>
              <input
                value={form.household_name}
                onChange={(e) => setForm((current) => ({ ...current, household_name: e.target.value }))}
                className="w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2.5 text-sm outline-none transition placeholder:text-gray-300 focus:border-orange-400"
                placeholder="例如 周末小厨房"
              />
            </label>
          </>
        ) : null}

        {error ? <p className="border-l-2 border-red-300 pl-3 text-[13px] text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition disabled:opacity-60"
        >
          {busy ? '处理中...' : mode === 'login' ? '登录并进入' : '注册并进入'}
        </button>
      </form>
    </div>
  )
}
