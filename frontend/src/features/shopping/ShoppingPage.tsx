import { Navigate } from 'react-router-dom'

/** @deprecated Route uses `<Navigate />`; kept for any direct imports. */
export function ShoppingPage() {
  return <Navigate to="/plan?tab=shopping" replace />
}
