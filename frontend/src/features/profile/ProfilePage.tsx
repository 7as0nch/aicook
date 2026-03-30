import { Link } from 'react-router-dom'

export function ProfilePage() {
  return (
    <div className="space-y-8">
      <section className="rounded-[2.4rem] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-md)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <img
            src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80"
            alt="用户头像"
            className="h-24 w-24 rounded-full object-cover ring-4 ring-[var(--primary-soft)]"
          />
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--accent-strong)]">Profile</p>
            <h2 className="mt-2 font-headline text-4xl font-black tracking-tight">家庭厨房指挥台</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--text-soft)]">
              这里先保留首版占位，但已经把常用入口和状态总结放进来，方便后续继续扩展偏好、账号和设备配置。
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface-soft)] p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">Recipes</p>
          <h3 className="mt-2 font-headline text-3xl font-black tracking-tight">菜谱与导入</h3>
          <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">支持手动录入、图片识别、HowToCook 导入和 AI 整理。</p>
        </article>
        <article className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface-soft)] p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">Knowledge</p>
          <h3 className="mt-2 font-headline text-3xl font-black tracking-tight">知识沉淀</h3>
          <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">把做菜经验、引用片段和教程文档收进家庭知识库。</p>
        </article>
        <article className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface-soft)] p-5">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--text-muted)]">Execution</p>
          <h3 className="mt-2 font-headline text-3xl font-black tracking-tight">执行体验</h3>
          <p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">移动端优先、支持语音输入、全局引用问 AI 和沉浸式做菜模式。</p>
        </article>
      </section>

      <section className="rounded-[2rem] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-md)]">
        <h3 className="font-headline text-2xl font-black tracking-tight">快速入口</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link to="/recipes/editor" className="rounded-full bg-[var(--primary)] px-4 py-3 text-sm font-bold text-white">
            去菜谱工作台
          </Link>
          <Link to="/knowledge" className="rounded-full bg-[var(--surface-soft)] px-4 py-3 text-sm font-bold text-[var(--text)]">
            去知识库
          </Link>
          <Link to="/plan" className="rounded-full bg-[var(--surface-soft)] px-4 py-3 text-sm font-bold text-[var(--text)]">
            去周计划
          </Link>
        </div>
      </section>
    </div>
  )
}
