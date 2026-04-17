export type ShareScanTarget =
  | { kind: 'recipe'; shareCode: string }
  | { kind: 'kitchen'; shareCode: string }
  | { kind: 'code'; shareCode: string }
  | { kind: 'invalid' }

export function resolveShareScanTarget(raw: string, currentOrigin: string, currentHostname: string): ShareScanTarget {
  const text = raw.trim()
  if (!text) return { kind: 'invalid' }

  try {
    let url: URL
    if (text.startsWith('http://') || text.startsWith('https://')) {
      url = new URL(text)
    } else if (text.startsWith('/')) {
      url = new URL(text, currentOrigin)
    } else {
      throw new Error('not url')
    }

    const sameHost = url.hostname === currentHostname
    if (sameHost) {
      const recipeMatch = url.pathname.match(/\/share\/recipe\/([^/]+)/)
      if (recipeMatch?.[1]) {
        return { kind: 'recipe', shareCode: decodeURIComponent(recipeMatch[1]) }
      }

      const kitchenShare = url.searchParams.get('share')?.trim()
      if (kitchenShare && (url.pathname === '/profile' || url.pathname.endsWith('/profile'))) {
        return { kind: 'kitchen', shareCode: kitchenShare }
      }
    }
  } catch {
    // 非 URL 时继续走纯分享码兜底。
  }

  if (/^[A-Za-z0-9_.-]{4,64}$/.test(text)) {
    return { kind: 'code', shareCode: text }
  }

  return { kind: 'invalid' }
}
