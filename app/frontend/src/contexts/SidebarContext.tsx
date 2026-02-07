import { createContext, useContext } from 'react'

interface SidebarContextValue {
  toggleSidebar: () => void
}

export const SidebarContext = createContext<SidebarContextValue | null>(null)

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within SidebarContext')
  return ctx
}
