import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

type ConfirmOptions = {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  tone?: 'default' | 'danger'
}

type ConfirmState = ConfirmOptions & {
  open: boolean
}

type FeedbackContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

const initialState: ConfirmState = {
  open: false,
  title: '',
  description: '',
  confirmText: '确认',
  cancelText: '取消',
  tone: 'default',
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const resolverRef = useRef<((value: boolean) => void) | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState>(initialState)

  const closeConfirm = useCallback((value: boolean) => {
    resolverRef.current?.(value)
    resolverRef.current = null
    setConfirmState(initialState)
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => {
    setConfirmState({
      open: true,
      title: options.title,
      description: options.description ?? '',
      confirmText: options.confirmText ?? '确认',
      cancelText: options.cancelText ?? '取消',
      tone: options.tone ?? 'default',
    })
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const value = useMemo<FeedbackContextValue>(() => ({ confirm }), [confirm])

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {confirmState.open ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <button
            type="button"
            aria-label="关闭确认弹层"
            className="absolute inset-0 cursor-default"
            onClick={() => closeConfirm(false)}
          />
          <div className="relative w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">{confirmState.title}</h3>
            {confirmState.description ? (
              <p className="mt-2 text-sm leading-6 text-gray-500">{confirmState.description}</p>
            ) : null}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => closeConfirm(false)}
                className="flex-1 rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700"
              >
                {confirmState.cancelText}
              </button>
              <button
                type="button"
                onClick={() => closeConfirm(true)}
                className={`flex-1 rounded-2xl px-4 py-3 text-sm font-semibold text-white ${
                  confirmState.tone === 'danger' ? 'bg-red-500' : 'bg-gray-900'
                }`}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const context = useContext(FeedbackContext)
  if (!context) {
    throw new Error('useFeedback must be used within FeedbackProvider')
  }
  return context
}
