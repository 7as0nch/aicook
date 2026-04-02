import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/** 挂到 document.body，避免被祖先 overflow/transform 裁剪导致 fixed 蒙版盖不满视口 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const [container] = useState(() => {
    if (typeof document === 'undefined') return null
    const el = document.createElement('div')
    el.setAttribute('data-aicook-modal-portal', '')
    return el
  })

  useEffect(() => {
    if (!container) return
    document.body.appendChild(container)
    return () => {
      document.body.removeChild(container)
    }
  }, [container])

  if (!container) return null
  return createPortal(children, container)
}
