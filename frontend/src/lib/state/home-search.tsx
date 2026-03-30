import { createContext, type Dispatch, type PropsWithChildren, type SetStateAction, useContext, useMemo, useState } from 'react'

type HomeSearchContextValue = {
  query: string
  setQuery: Dispatch<SetStateAction<string>>
}

const HomeSearchContext = createContext<HomeSearchContextValue | null>(null)

export function HomeSearchProvider({ children }: PropsWithChildren) {
  const [query, setQuery] = useState('')
  const value = useMemo(() => ({ query, setQuery }), [query, setQuery])
  return <HomeSearchContext.Provider value={value}>{children}</HomeSearchContext.Provider>
}

export function useHomeSearch() {
  const ctx = useContext(HomeSearchContext)
  if (!ctx) {
    throw new Error('useHomeSearch must be used within HomeSearchProvider')
  }
  return ctx
}

export function useOptionalHomeSearch(): HomeSearchContextValue | null {
  return useContext(HomeSearchContext)
}
