/** Inline SVG placeholder when cover URL is missing or fails to load. */
export const RECIPE_IMAGE_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect fill="#e5e7eb" width="800" height="600"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-family="system-ui,sans-serif" font-size="20">暂无图片</text></svg>`,
  )

function rewriteKnownBadHosts(absoluteUrl: string): string {
  const from = import.meta.env.VITE_IMAGE_URL_REPLACE_FROM?.trim()
  const to = import.meta.env.VITE_IMAGE_URL_REPLACE_TO?.trim()
  if (from && to && absoluteUrl.startsWith(from)) {
    return to + absoluteUrl.slice(from.length)
  }
  return absoluteUrl
}

/**
 * In dev, route typical local MinIO URLs through Vite `/minio` proxy (see vite.config.ts).
 * External hosts (e.g. Unsplash, CDN) are left unchanged.
 */
function devProxyLocalMinioIfNeeded(absoluteUrl: string): string {
  if (!import.meta.env.DEV || typeof window === 'undefined') return absoluteUrl
  if (import.meta.env.VITE_DISABLE_MINIO_DEV_PROXY === 'true') return absoluteUrl

  try {
    const u = new URL(absoluteUrl)
    const localMinio =
      (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && u.port === '9000'
    if (!localMinio) return absoluteUrl
    return `${window.location.origin}/minio${u.pathname}${u.search}`
  } catch {
    return absoluteUrl
  }
}

/**
 * Optional: API returns only `bucket/object` — prepend public MinIO base (no trailing slash).
 * Example: VITE_MEDIA_PUBLIC_BASE=http://127.0.0.1:9000
 */
function prependMediaBaseIfBucketKey(raw: string): string {
  const base = import.meta.env.VITE_MEDIA_PUBLIC_BASE?.trim().replace(/\/$/, '')
  if (!base) return raw
  if (/^https?:\/\//i.test(raw) || raw.startsWith('//') || raw.startsWith('/')) return raw
  if (!raw.includes('/')) return raw
  const looksLikeBucketKey = /^[a-z0-9][a-z0-9._-]*\/.+/i.test(raw)
  if (!looksLikeBucketKey) return raw
  return `${base}/${raw}`
}

/**
 * Resolve recipe/step image URL for `<img src>`:
 * - **External** `https?://` (e.g. Unsplash): use as-is (after optional Docker-host rewrite).
 * - **Local MinIO** `http://127.0.0.1:9000/...` or `localhost:9000`: in dev, rewritten to same-origin `/minio/...` (Vite proxy).
 * - **Protocol-relative** `//`: current page scheme.
 * - **App-relative** `/path`: current origin (e.g. API static route).
 * - **bucket/object** + `VITE_MEDIA_PUBLIC_BASE`: full MinIO URL.
 *
 * Docker-only host fix: `VITE_IMAGE_URL_REPLACE_FROM` / `VITE_IMAGE_URL_REPLACE_TO`.
 */
export function resolveRecipeImageUrl(url: string | undefined | null): string {
  let raw = (url ?? '').trim()
  if (!raw) return RECIPE_IMAGE_PLACEHOLDER

  raw = prependMediaBaseIfBucketKey(raw)

  if (/^https?:\/\//i.test(raw)) {
    const rewritten = rewriteKnownBadHosts(raw)
    return devProxyLocalMinioIfNeeded(rewritten)
  }

  if (raw.startsWith('//')) {
    if (typeof window === 'undefined') return `https:${raw}`
    return `${window.location.protocol}${raw}`
  }

  if (raw.startsWith('/')) {
    if (typeof window !== 'undefined') return `${window.location.origin}${raw}`
    return raw
  }

  return raw
}
