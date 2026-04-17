import { Suspense, lazy, type ComponentType, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router'

import { isAuthenticated } from '../lib/api/client'

const LazyAIAssistant = lazy(() => import('./components/AIAssistant'))
const LazyLayout = lazy(() => import('./components/Layout'))
const LazyRecipeShareImport = lazy(() => import('./pages/RecipeShareImport'))
const LazyCookingMode = lazy(() => import('./pages/CookingMode'))

function loadPage<T extends { default: ComponentType<any> }>(
  importer: () => Promise<T>,
) {
  return async () => {
    const module = await importer()
    return { Component: module.default }
  }
}

function RequireAuth({ children }: { children: ReactNode }) {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/auth" replace />
}

function AppRoot() {
  const shouldMountAssistant = isAuthenticated()
  return (
    <>
      <Outlet />
      {shouldMountAssistant ? (
        <Suspense fallback={null}>
          <LazyAIAssistant />
        </Suspense>
      ) : null}
    </>
  )
}

export const router = createBrowserRouter([
  {
    element: <AppRoot />,
    children: [
      { path: '/auth', lazy: loadPage(() => import('./pages/Auth')) },
      {
        path: '/',
        element: (
          <RequireAuth>
            <Suspense fallback={<RoutePending />}>
              <LazyLayout />
            </Suspense>
          </RequireAuth>
        ),
        children: [
          { index: true, lazy: loadPage(() => import('./pages/Home')) },
          { path: 'recipes', lazy: loadPage(() => import('./pages/Recipes')) },
          { path: 'recipes/editor', lazy: loadPage(() => import('./pages/RecipeWorkbench')) },
          { path: 'recipes/:id/edit', lazy: loadPage(() => import('./pages/RecipeEdit')) },
          { path: 'recipes/:id', lazy: loadPage(() => import('./pages/RecipeDetail')) },
          { path: 'plan', lazy: loadPage(() => import('./pages/Plan')) },
          { path: 'shop', lazy: loadPage(() => import('./pages/Shop')) },
          { path: 'profile', lazy: loadPage(() => import('./pages/Profile')) },
          { path: 'profile/preferences', lazy: loadPage(() => import('./pages/Preferences')) },
          { path: 'profile/knowledge-base', lazy: loadPage(() => import('./pages/KnowledgeBase')) },
        ],
      },
      {
        path: '/share/recipe/:shareCode',
        element: (
          <RequireAuth>
            <Suspense fallback={<RoutePending />}>
              <LazyRecipeShareImport />
            </Suspense>
          </RequireAuth>
        ),
      },
      {
        path: '/cook/:id',
        element: (
          <RequireAuth>
            <Suspense fallback={<RoutePending />}>
              <LazyCookingMode />
            </Suspense>
          </RequireAuth>
        ),
      },
    ],
  },
])

function RoutePending() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 text-sm font-medium text-gray-500">
      页面加载中…
    </div>
  )
}
