import { Outlet, NavLink, useLocation } from 'react-router'
import { Home, BookOpen, CalendarDays, User, Camera, X, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { toast } from 'sonner'
import { useAI } from '../contexts/AIContext'
import { ModalPortal } from './ModalPortal'
import { canUseGetUserMedia } from '../../lib/nativeCamera'

export default function Layout() {
  const location = useLocation()
  const { openAI, setPageContext } = useAI()
  const recipesFullBleed = location.pathname === '/recipes'
  const navItemsLeft = [
    { name: '首页', path: '/', icon: Home },
    { name: '菜谱', path: '/recipes', icon: BookOpen },
  ]
  const navItemsRight = [
    { name: '计划', path: '/plan', icon: CalendarDays },
    { name: '我的', path: '/profile', icon: User },
  ]

  const nativeCameraInputRef = useRef<HTMLInputElement>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [captured, setCaptured] = useState<{ blob: Blob; url: string } | null>(null)
  const [cameraKey, setCameraKey] = useState(0)
  const [videoReady, setVideoReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const v = videoRef.current
    if (v) v.srcObject = null
  }, [])

  /** 与 AI 聊天抽屉「相机」一致：系统相机/相册选择后写入快捷拍照会话 */
  function pushQuickCaptureFile(file: File) {
    const previewUrl = URL.createObjectURL(file)
    setPageContext({
      type: 'quick_capture',
      captureIntent: 'auto',
      forceNewSession: true,
      pendingFiles: [{ file, kind: 'image', previewUrl }],
    })
    toast.success('图片已加入厨艺 AI，将使用新会话进行识别')
    openAI()
  }

  function handleNativeCameraFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    pushQuickCaptureFile(file)
  }

  useEffect(() => {
    if (!showCamera || captured) return
    setVideoReady(false)
    let cancelled = false
    void (async () => {
      if (!canUseGetUserMedia()) {
        setShowCamera(false)
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
        }
      } catch {
        toast.info('无法打开实时相机，已切换为系统相机/相册（与聊天内「相机」相同）')
        nativeCameraInputRef.current?.click()
        setShowCamera(false)
      }
    })()
    return () => {
      cancelled = true
      stopStream()
    }
  }, [showCamera, captured, cameraKey, stopStream])

  function openFabCamera() {
    if (!canUseGetUserMedia()) {
      toast.info('当前环境不支持实时取景，已切换为系统相机/相册（与聊天内「相机」相同）')
      nativeCameraInputRef.current?.click()
      return
    }
    setCaptured(null)
    setCameraKey((k) => k + 1)
    setShowCamera(true)
  }

  function closeCameraModal() {
    stopStream()
    if (captured?.url) URL.revokeObjectURL(captured.url)
    setCaptured(null)
    setShowCamera(false)
  }

  function takeSnapshot() {
    const video = videoRef.current
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      toast.error('相机未就绪，请稍候再试')
      return
    }
    const w = video.videoWidth
    const h = video.videoHeight
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      toast.error('无法捕获画面')
      return
    }
    ctx.drawImage(video, 0, 0, w, h)
    stopStream()
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error('拍照失败')
          return
        }
        const url = URL.createObjectURL(blob)
        setCaptured({ blob, url })
      },
      'image/jpeg',
      0.92,
    )
  }

  function retake() {
    if (captured?.url) URL.revokeObjectURL(captured.url)
    setCaptured(null)
    setCameraKey((k) => k + 1)
  }

  function confirmUpload() {
    if (!captured) return
    const file = new File([captured.blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
    if (captured.url) URL.revokeObjectURL(captured.url)
    setCaptured(null)
    setShowCamera(false)
    pushQuickCaptureFile(file)
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-gray-50 font-sans text-gray-800">
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleNativeCameraFileChange}
      />
      <main className={clsx('min-h-0 flex-1 pb-20', recipesFullBleed ? 'flex flex-col overflow-hidden' : 'overflow-y-auto')}>
        <Outlet />
      </main>

      <nav className="safe-area-bottom fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white">
        <div className="relative flex h-16 items-center justify-around px-2">
          {navItemsLeft.map((item) => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => clsx('flex h-full w-full flex-col items-center justify-center space-y-1 transition-colors', isActive ? 'text-orange-500' : 'text-gray-400 hover:text-gray-600')}>
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </NavLink>
          ))}

          <div className="flex h-full w-full flex-col items-center justify-center">
            <button
              type="button"
              onClick={openFabCamera}
              aria-label="拍照并发送到厨艺 AI"
              className="absolute -top-3 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg shadow-orange-500/40 transition-transform active:scale-95"
            >
              <Camera size={28} strokeWidth={2} />
            </button>
          </div>

          {navItemsRight.map((item) => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => clsx('flex h-full w-full flex-col items-center justify-center space-y-1 transition-colors', isActive ? 'text-orange-500' : 'text-gray-400 hover:text-gray-600')}>
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {showCamera ? (
        <ModalPortal>
          <div className="fixed inset-0 z-[300] flex flex-col bg-black/90">
            <div className="flex items-center justify-between px-4 py-3 text-white">
              <span className="text-sm font-semibold">{captured ? '确认照片' : '拍照'}</span>
              <button type="button" onClick={closeCameraModal} className="rounded-full p-2 hover:bg-white/10" aria-label="关闭">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="min-h-0 flex-1 px-4 pb-4">
              {!captured ? (
                <video
                  ref={videoRef}
                  className="h-full w-full rounded-2xl bg-black object-cover"
                  playsInline
                  muted
                  autoPlay
                  onLoadedData={() => setVideoReady(true)}
                />
              ) : (
                <img src={captured.url} alt="预览" className="h-full max-h-[60dvh] w-full rounded-2xl object-contain" />
              )}
            </div>

            <div className="safe-area-bottom flex gap-3 border-t border-white/10 bg-black/80 px-4 py-4">
              {!captured ? (
                <>
                  <button type="button" onClick={closeCameraModal} className="flex-1 rounded-2xl bg-white/10 py-3.5 text-sm font-semibold text-white">
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={takeSnapshot}
                    disabled={!videoReady}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-orange-500 py-3.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    <Camera className="h-5 w-5" />
                    拍照
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={retake} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/10 py-3.5 text-sm font-semibold text-white">
                    <RotateCcw className="h-5 w-5" />
                    重拍
                  </button>
                  <button type="button" onClick={confirmUpload} className="flex-1 rounded-2xl bg-orange-500 py-3.5 text-sm font-bold text-white">
                    确认上传
                  </button>
                </>
              )}
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  )
}
