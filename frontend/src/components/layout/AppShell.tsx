import { AnimatePresence, motion } from 'framer-motion'
import type { PropsWithChildren } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import { useOptionalHomeSearch } from '../../lib/state/home-search'

const navItems = [
  { to: '/', label: '吃啥', icon: 'restaurant', match: 'eat' as const },
  { to: '/recipes/editor', label: '菜谱', icon: 'menu_book', match: 'library' as const },
  { to: '/plan', label: '计划', icon: 'calendar_today', match: 'plan' as const },
  { to: '/plan?tab=shopping', label: '清单', icon: 'shopping_cart', match: 'shopping' as const },
  { to: '/profile', label: '我的', icon: 'person', match: 'profile' as const },
]

interface AppShellProps extends PropsWithChildren {
  pathname: string
  search: string
}

function isNavActive(
  match: (typeof navItems)[number]['match'],
  pathname: string,
  search: string,
): boolean {
  const params = new URLSearchParams(search)
  const tab = params.get('tab')
  if (match === 'eat') {
    return pathname === '/'
  }
  if (match === 'library') {
    return pathname.startsWith('/recipes')
  }
  if (match === 'plan') {
    return pathname === '/plan' && tab !== 'shopping'
  }
  if (match === 'shopping') {
    return pathname === '/plan' && tab === 'shopping'
  }
  if (match === 'profile') {
    return pathname === '/profile'
  }
  return false
}

export function AppShell({ children, pathname, search }: AppShellProps) {
  const navigate = useNavigate()
  const immersive = pathname === '/cooking'
  const homeSearch = useOptionalHomeSearch()
  const showBack = pathname !== '/'
  const showDesktopSearch = pathname === '/' && homeSearch !== null

  return (
    <div className={`min-h-[max(884px,100dvh)] ${immersive ? 'pb-8 md:pb-10' : 'pb-nav md:pb-10'}`}>
      <header className="sticky top-0 z-50 bg-surface dark:bg-stone-950">
        <div className="mx-auto flex w-full max-w-shell items-center justify-between gap-4 px-6 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {showBack ? (
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="tap-highlight-none shrink-0 scale-95 text-primary transition-transform hover:opacity-80 active:scale-90 dark:text-[#86a789]"
                aria-label="返回"
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
            ) : null}
            <h1 className="font-headline truncate text-2xl font-black tracking-tighter text-primary dark:text-[#86a789]">
              {immersive ? '沉浸做菜' : 'The Culinary Architect'}
            </h1>
          </div>

          <div className="hidden items-center gap-6 md:flex">
            {showDesktopSearch ? (
              <div className="flex w-80 items-center rounded-xl bg-surface-container-low px-4 py-2 transition-colors focus-within:bg-primary-fixed">
                <span className="material-symbols-outlined text-outline">search</span>
                <input
                  value={homeSearch.query}
                  onChange={(e) => homeSearch.setQuery(e.target.value)}
                  placeholder="搜索菜谱、食材…"
                  className="ml-2 w-full border-none bg-transparent text-sm font-medium text-on-surface placeholder:text-outline-variant focus:ring-0 focus:outline-none"
                  aria-label="搜索"
                />
              </div>
            ) : null}
            <NavLink
              to="/knowledge"
              className={[
                'tap-highlight-none text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary',
                pathname === '/knowledge' ? 'text-primary' : '',
              ].join(' ')}
            >
              知识库
            </NavLink>
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-primary-container">
              <img
                className="h-full w-full object-cover"
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80"
                alt="用户头像"
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 md:hidden">
            <div className="h-10 w-10 overflow-hidden rounded-full border-2 border-primary-container">
              <img
                className="h-full w-full object-cover"
                src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80"
                alt="用户头像"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-shell px-6 pb-8 pt-4 md:pt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname + search}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.26, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {!immersive ? (
        <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
          <div
            className="rounded-t-3xl border-t border-stone-100 bg-white/80 shadow-[0_-4px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl dark:border-stone-800 dark:bg-stone-900/80"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex w-full items-center justify-around px-4 pt-3">
              {navItems.map((item) => {
                const active = isNavActive(item.match, pathname, search)
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={[
                      'tap-highlight-none flex flex-col items-center justify-center rounded-xl px-4 py-1.5 transition-all duration-300',
                      active
                        ? 'bg-primary-fixed text-primary dark:bg-primary/30 dark:text-primary-fixed'
                        : 'text-stone-400 hover:text-primary dark:text-stone-500 dark:hover:text-[#86a789]',
                    ].join(' ')}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={active ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
                    >
                      {item.icon}
                    </span>
                    <span className="font-label mt-1 text-[11px] font-semibold uppercase tracking-wider">{item.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        </nav>
      ) : null}
    </div>
  )
}
