/** 是否可用 getUserMedia（实时取景）；不可用时应降级为系统相机/相册 file input。 */
export function canUseGetUserMedia(): boolean {
  if (typeof navigator === 'undefined') return false
  return Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function')
}

export type BarcodeDetectorLike = {
  detect: (image: HTMLVideoElement | HTMLImageElement | ImageBitmap) => Promise<Array<{ rawValue?: string }>>
}

type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike

export function canUseBarcodeDetector(): boolean {
  if (typeof window === 'undefined') return false
  return typeof (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector === 'function'
}

export function createQrCodeDetector(): BarcodeDetectorLike | null {
  if (!canUseBarcodeDetector()) return null
  const ctor = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector
  return new ctor({ formats: ['qr_code'] })
}

export async function detectQrCodeFromImageFile(file: File): Promise<string | null> {
  const detector = createQrCodeDetector()
  if (!detector) return null

  const url = URL.createObjectURL(file)
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('load'))
      image.src = url
    })
    const codes = await detector.detect(image)
    return codes.find((item) => item.rawValue?.trim())?.rawValue?.trim() ?? null
  } finally {
    URL.revokeObjectURL(url)
  }
}
