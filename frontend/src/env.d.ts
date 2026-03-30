/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Prefix of image URLs from API that the browser cannot load (e.g. http://minio:9000) */
  readonly VITE_IMAGE_URL_REPLACE_FROM?: string
  /** Replacement origin/prefix (e.g. http://127.0.0.1:9000) */
  readonly VITE_IMAGE_URL_REPLACE_TO?: string
  /** When API returns `bucket/object` only, prepend this MinIO public base (no trailing slash), e.g. http://127.0.0.1:9000 */
  readonly VITE_MEDIA_PUBLIC_BASE?: string
  /** Set to "true" to skip dev rewrite of http://127.0.0.1:9000 → /minio proxy */
  readonly VITE_DISABLE_MINIO_DEV_PROXY?: string
}
