import { useState, useEffect, type ImgHTMLAttributes } from 'react'
import { RECIPE_IMAGE_PLACEHOLDER, resolveRecipeImageUrl } from '../../lib/utils/recipeImage'

type Props = {
  src: string | undefined | null
  alt: string
  className?: string
  /** 首屏/轮播当前张用 eager，列表与离屏用 lazy 省流量 */
  loading?: ImgHTMLAttributes<HTMLImageElement>['loading']
  fetchPriority?: ImgHTMLAttributes<HTMLImageElement>['fetchPriority']
  onClick?: ImgHTMLAttributes<HTMLImageElement>['onClick']
}

export function RecipeCoverImg({ src, alt, className, loading = 'lazy', fetchPriority, onClick }: Props) {
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    setBroken(false)
  }, [src])
  const url = broken ? RECIPE_IMAGE_PLACEHOLDER : resolveRecipeImageUrl(src)

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      onError={() => setBroken(true)}
      onClick={onClick}
    />
  )
}
