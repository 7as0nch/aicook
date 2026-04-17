import { useCallback, useEffect, useRef, useState } from "react";
import { Settings, LogOut, Database, ChevronRight, Home, RefreshCcw, Plus, Download, X, Camera } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import QRCode from "antd/es/qr-code";

import {
  clearAuthSession,
  createHousehold,
  createShareCode,
  getAuthSession,
  getMe,
  switchHousehold,
  previewSharedKitchen,
  importSharedRecipes,
  createKitchenTag,
  updateProfile,
  uploadMedia,
  type AuthSession,
  type UpdateProfilePatch,
} from "../../lib/api/client";
import { mapCardToUiRecipe, type UiRecipe } from "../../lib/mappers/recipe";
import { ModalPortal } from "../components/ModalPortal";
import { canUseBarcodeDetector, createQrCodeDetector, detectQrCodeFromImageFile } from "../../lib/nativeCamera";
import { resolveShareScanTarget } from "../../lib/shareScan";
import { toast } from "sonner";

export default function Profile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [session, setSession] = useState<AuthSession | null>(getAuthSession());
  const [busy, setBusy] = useState(false);
  const [newKitchenName, setNewKitchenName] = useState("");
  const [message, setMessage] = useState("");

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState("");
  const [avatarObjectUrl, setAvatarObjectUrl] = useState<string | null>(null);
  const [pendingAvatarAssetId, setPendingAvatarAssetId] = useState<string | null>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCodeInput, setShareCodeInput] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [sharePreview, setSharePreview] = useState<{ household: { name: string }; recipes: UiRecipe[] } | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);

  const [showKitchensModal, setShowKitchensModal] = useState(false);

  const [showScanModal, setShowScanModal] = useState(false);
  const [scanError, setScanError] = useState("");
  type ScanUiMode = "loading" | "live" | "album_only" | "none";
  const [scanUiMode, setScanUiMode] = useState<ScanUiMode>("loading");
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanRafRef = useRef<number | null>(null);
  const scanStreamRef = useRef<MediaStream | null>(null);
  const scanQrFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getMe()
      .then(setSession)
      .catch(() => setSession(getAuthSession()));
  }, []);

  useEffect(() => {
    if (searchParams.get("sheet") !== "account") return;
    setShowAccountModal(true);
    const next = new URLSearchParams(searchParams);
    next.delete("sheet");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const code = searchParams.get("share")?.trim();
    if (!code) return;
    setShareCodeInput(code);
    setShowShareModal(true);
    const next = new URLSearchParams(searchParams);
    next.delete("share");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!showAccountModal) return;
    const s = getAuthSession();
    setDraftDisplayName(s?.user.display_name ?? s?.user.username ?? "");
    setPendingAvatarAssetId(null);
    setAvatarObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [showAccountModal]);

  useEffect(() => {
    return () => {
      if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
    };
  }, [avatarObjectUrl]);

  const current = session?.current_household;
  const profileInitial = (session?.user.display_name || session?.user.username || '?').trim().charAt(0).toUpperCase() || '?';

  async function refreshProfile() {
    const latest = await getMe();
    setSession(latest);
    return latest;
  }

  async function handleSwitch(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const next = await switchHousehold(id);
      setSession(next);
      setMessage("已切换到新的厨房上下文");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "切换失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateKitchen() {
    if (!newKitchenName.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      await createHousehold(newKitchenName.trim());
      setNewKitchenName("");
      await refreshProfile();
      setMessage("新厨房已创建，可在下方切换");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleShareCode() {
    setBusy(true);
    setMessage("");
    try {
      const household = await createShareCode();
      await refreshProfile();
      setMessage(`当前厨房分享码：${household.share_code || "未生成"}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "生成分享码失败");
    } finally {
      setBusy(false);
    }
  }

  async function handlePreviewShare() {
    if (!shareCodeInput.trim()) return;
    setPreviewBusy(true);
    setPreviewError("");
    try {
      const preview = await previewSharedKitchen(shareCodeInput.trim());
      setSharePreview({
        household: { name: preview.household.name },
        recipes: preview.recipes.map(mapCardToUiRecipe),
      });
      setSelectedImportIds(preview.recipes.slice(0, 3).map((item) => item.id));
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "预览失败");
      setSharePreview(null);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleImportSelected() {
    if (!sharePreview || selectedImportIds.length === 0) return;
    setPreviewBusy(true);
    setPreviewError("");
    try {
      const tagName = sharePreview.household.name || "分享导入";
      await createKitchenTag(tagName).catch(() => undefined);
      await importSharedRecipes({
        share_code: shareCodeInput.trim(),
        recipe_ids: selectedImportIds,
        kitchen_tag_name: tagName,
      });
      setSharePreview(null);
      setShareCodeInput("");
      setShowShareModal(false);
      setMessage(`成功导入 ${selectedImportIds.length} 个菜谱`);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setPreviewBusy(false);
    }
  }

  const handleScannedText = useCallback(
    (raw: string) => {
      const target = resolveShareScanTarget(raw, window.location.origin, window.location.hostname);
      setScanError("");
      if (target.kind === "recipe") {
        setShowScanModal(false);
        navigate(`/share/recipe/${target.shareCode}`);
        return;
      }
      if (target.kind === "kitchen" || target.kind === "code") {
        setShowScanModal(false);
        setShareCodeInput(target.shareCode);
        setShowShareModal(true);
        return;
      }
      setScanError("未识别到有效的厨房或菜谱分享链接");
    },
    [navigate],
  );

  useEffect(() => {
    if (!showScanModal) {
      setScanUiMode("loading");
      return;
    }
    setScanError("");
    if (!canUseBarcodeDetector()) {
      setScanUiMode("none");
      return;
    }
    let cancelled = false;
    setScanUiMode("loading");
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        scanStreamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setScanUiMode("live");
      } catch {
        if (!cancelled) {
          setScanUiMode("album_only");
          setScanError("无法打开摄像头，请从相册选择含二维码的图片（与不支持实时相机时相同逻辑）");
          toast.info("已切换为从相册选择二维码截图");
        }
      }
    })();
    return () => {
      cancelled = true;
      if (scanRafRef.current != null) {
        cancelAnimationFrame(scanRafRef.current);
        scanRafRef.current = null;
      }
      const stream = scanStreamRef.current;
      scanStreamRef.current = null;
      stream?.getTracks().forEach((tr) => tr.stop());
      const v = videoRef.current;
      if (v) v.srcObject = null;
    };
  }, [showScanModal]);

  useEffect(() => {
    if (!showScanModal || scanUiMode !== "live") return;
    const detector = createQrCodeDetector();
    if (!detector) return;
    let cancelled = false;
    const loop = async () => {
      const video = videoRef.current;
      if (cancelled || !video) return;
      try {
        const codes = await detector.detect(video);
        const hit = codes.find((c) => c.rawValue?.trim());
        if (hit?.rawValue) {
          handleScannedText(hit.rawValue);
          return;
        }
      } catch {
        /* ignore frame */
      }
      scanRafRef.current = requestAnimationFrame(() => void loop());
    };
    void loop();
    return () => {
      cancelled = true;
      if (scanRafRef.current != null) {
        cancelAnimationFrame(scanRafRef.current);
        scanRafRef.current = null;
      }
    };
  }, [showScanModal, scanUiMode, handleScannedText]);

  async function handleScanQrImageFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !canUseBarcodeDetector()) return;
    setScanError("");
    try {
      const raw = await detectQrCodeFromImageFile(file);
      if (raw) {
        handleScannedText(raw);
      } else {
        setScanError("未在图片中识别到二维码，请换一张清晰的截图");
      }
    } catch {
      setScanError("图片加载或识别失败，请重试");
    }
  }


  async function handleAccountSave() {
    const patch: UpdateProfilePatch = {
      display_name: draftDisplayName.trim(),
    };
    if (pendingAvatarAssetId !== null) {
      patch.avatar_asset_id = pendingAvatarAssetId;
    }
    setAccountBusy(true);
    setMessage('');
    try {
      const next = await updateProfile(patch);
      setSession(next);
      setPendingAvatarAssetId(null);
      setAvatarObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setShowAccountModal(false);
      setMessage('账户资料已更新');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败');
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleRemoveAvatar() {
    setAccountBusy(true);
    setMessage("");
    try {
      const next = await updateProfile({ avatar_asset_id: null });
      setSession(next);
      setPendingAvatarAssetId(null);
      setAvatarObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setMessage("已移除头像");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "操作失败");
    } finally {
      setAccountBusy(false);
    }
  }

  async function onAvatarFileChange(f: FileList | null) {
    const file = f?.[0];
    if (!file) return;
    setAvatarObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setAccountBusy(true);
    setMessage("");
    try {
      const asset = await uploadMedia(file, "images");
      setPendingAvatarAssetId(asset.id);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "头像上传失败");
      setPendingAvatarAssetId(null);
      setAvatarObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } finally {
      setAccountBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-4 pb-24">
      <button
        type="button"
        onClick={() => setShowAccountModal(true)}
        aria-label="编辑账户资料与头像"
        className="w-full rounded-3xl border border-gray-100 bg-white p-5 text-left shadow-sm transition-colors active:bg-gray-50"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-2xl font-bold text-orange-500">
            {session?.user.avatar_url ? (
              <img src={session.user.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span>{profileInitial}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gray-900">{session?.user.display_name || session?.user.username || "未登录"}</h1>
            <p className="mt-1 text-sm text-gray-500">
              当前厨房：{current?.name || "暂无"} {current?.share_code ? `· 分享码 ${current.share_code}` : ""}
            </p>
            <p className="mt-2 text-xs font-medium text-orange-500">点击编辑资料、头像或切换厨房</p>
          </div>
        </div>
      </button>
      {message ? <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">{message}</p> : null}

      <ModalPortal>
        <AnimatePresence>
          {showAccountModal ? (
            <>
              <motion.div
                key="account-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setAvatarObjectUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return null;
                  });
                  setPendingAvatarAssetId(null);
                  setShowAccountModal(false);
                }}
                className="fixed inset-0 z-[200] min-h-[100dvh] w-full bg-black/40 backdrop-blur-sm"
              />
              <motion.div
                key="account-sheet"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed left-4 right-4 top-1/2 z-[201] max-h-[85vh] -translate-y-1/2 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
              >
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">账户与资料</h3>
                <button
                  type="button"
                  onClick={() => {
                    setAvatarObjectUrl((prev) => {
                      if (prev) URL.revokeObjectURL(prev);
                      return null;
                    });
                    setPendingAvatarAssetId(null);
                    setShowAccountModal(false);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex flex-col items-center gap-3">
                <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-3xl font-bold text-orange-500">
                  {avatarObjectUrl ? (
                    <img src={avatarObjectUrl} alt="" className="h-full w-full object-cover" />
                  ) : session?.user.avatar_url ? (
                    <img src={session.user.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span>{profileInitial}</span>
                  )}
                  {accountBusy ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs font-medium text-white">…</div>
                  ) : null}
                </div>
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onAvatarFileChange(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => avatarFileRef.current?.click()}
                  disabled={accountBusy}
                  className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  上传头像
                </button>
                {(session?.user.avatar_url || pendingAvatarAssetId) && (
                  <button
                    type="button"
                    onClick={() => void handleRemoveAvatar()}
                    disabled={accountBusy}
                    className="text-xs font-medium text-red-600 disabled:opacity-50"
                  >
                    移除头像
                  </button>
                )}
              </div>

              <label className="mt-6 block text-xs font-bold uppercase tracking-wider text-gray-400">昵称</label>
              <input
                value={draftDisplayName}
                onChange={(e) => setDraftDisplayName(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-gray-900"
                placeholder="显示名称"
                autoComplete="nickname"
              />

              <button
                type="button"
                onClick={() => void handleAccountSave()}
                disabled={accountBusy || !draftDisplayName.trim()}
                className="mt-6 w-full rounded-2xl bg-gray-900 py-3.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {accountBusy ? "保存中…" : "保存"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setAvatarObjectUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return null;
                  });
                  setPendingAvatarAssetId(null);
                  setShowAccountModal(false);
                  setShowKitchensModal(true);
                }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 py-3.5 text-sm font-bold text-orange-700"
              >
                <Home className="h-4 w-4" />
                切换厨房 / 管理厨房
              </button>
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>
      </ModalPortal>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            setScanError("");
            setShowScanModal(true);
          }}
          className="flex w-full items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 transition-colors active:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50">
              <Camera className="h-4 w-4 text-orange-500" />
            </div>
            <span className="font-medium text-gray-800">扫一扫</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </button>
        <button 
          onClick={() => setShowKitchensModal(true)} 
          className="flex w-full items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 transition-colors active:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50">
              <Home className="h-4 w-4 text-orange-500" />
            </div>
            <span className="font-medium text-gray-800">我的厨房</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </button>
        {[
          { icon: Settings, label: "家庭偏好设置", path: "/profile/preferences" },
          { icon: Database, label: "AI 知识库", path: "/profile/knowledge-base" },
        ].map((item) => (
          <Link key={item.path} to={item.path} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 transition-colors active:bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50">
                <item.icon className="h-4 w-4 text-orange-500" />
              </div>
              <span className="font-medium text-gray-800">{item.label}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </Link>
        ))}
        <button 
          onClick={() => setShowShareModal(true)} 
          className="flex w-full items-center justify-between rounded-2xl border border-gray-100 bg-white p-4 transition-colors active:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50">
              <Download className="h-4 w-4 text-orange-500" />
            </div>
            <span className="font-medium text-gray-800">输入分享码导入</span>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => void refreshProfile()} className="flex items-center justify-center gap-2 rounded-2xl bg-gray-100 py-3 text-sm font-semibold text-gray-700">
          <RefreshCcw className="h-4 w-4" />
          刷新资料
        </button>
        <button
          type="button"
          onClick={() => {
            clearAuthSession();
            navigate("/auth", { replace: true });
          }}
          className="flex items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </div>

      <ModalPortal>
        <AnimatePresence>
          {showKitchensModal ? (
            <>
              <motion.div
                key="kitchens-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowKitchensModal(false)}
                className="fixed inset-0 z-[200] min-h-[100dvh] w-full bg-black/40 backdrop-blur-sm"
              />
              <motion.div
                key="kitchens-sheet"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed left-4 right-4 top-1/2 z-[201] max-h-[80vh] -translate-y-1/2 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
              >
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">我的厨房</h3>
                <button onClick={() => setShowKitchensModal(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-500">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold uppercase tracking-[0.22em] text-orange-500">My Kitchens</h2>
                  <button type="button" onClick={() => void handleShareCode()} disabled={busy} className="text-xs font-semibold text-gray-500">
                    生成分享码
                  </button>
                </div>
                <div className="space-y-2">
                  {(session?.households ?? []).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        void handleSwitch(item.id)
                        setShowKitchensModal(false)
                      }}
                      disabled={busy}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${
                        current?.id === item.id ? "border-orange-200 bg-orange-50" : "border-gray-100 bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
                          <Home className="h-4 w-4 text-gray-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{item.name}</p>
                          <p className="text-xs text-gray-400">{item.share_code || "未生成分享码"}</p>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-gray-500">{current?.id === item.id ? "当前" : "切换"}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newKitchenName}
                    onChange={(e) => setNewKitchenName(e.target.value)}
                    placeholder="新厨房名称"
                    className="flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none"
                  />
                  <button type="button" onClick={() => void handleCreateKitchen()} disabled={busy || !newKitchenName.trim()} className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>
      </ModalPortal>

      {/* Share Modal */}
      <ModalPortal>
        <AnimatePresence>
          {showShareModal ? (
            <>
              <motion.div
                key="share-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowShareModal(false)}
                className="fixed inset-0 z-[200] min-h-[100dvh] w-full bg-black/40 backdrop-blur-sm"
              />
              <motion.div
                key="share-sheet"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed left-4 right-4 top-1/2 z-[201] max-h-[85vh] -translate-y-1/2 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
              >
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">导入菜谱</h3>
                <button onClick={() => setShowShareModal(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-500">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="rounded-3xl bg-gray-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">我的厨房二维码</p>
                      <p className="mt-1 text-xs text-gray-500">家人可扫码或输入分享码导入当前厨房菜谱。</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleShareCode()}
                      disabled={busy}
                      className="rounded-full bg-gray-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      生成分享码
                    </button>
                  </div>
                  {session?.current_household?.share_code ? (
                    <div className="mt-4 flex flex-col items-center gap-3">
                      <QRCode
                        value={`${window.location.origin}/profile?share=${session.current_household.share_code}`}
                        size={148}
                        bordered={false}
                      />
                      <p className="text-sm font-semibold text-gray-900">分享码：{session.current_household.share_code}</p>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-gray-500">点击上面的按钮即可生成厨房分享码。</p>
                  )}
                </div>
                <p className="text-sm text-gray-500">输入朋友分享的厨房代码，将他们的独家秘方直接导入到你的菜谱库中。</p>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={shareCodeInput}
                    onChange={(e) => setShareCodeInput(e.target.value)}
                    placeholder="例如：KITCHEN-8A9B2" 
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-center font-mono text-[15px] tracking-widest transition-all focus:border-gray-900 focus:outline-none"
                  />
                  <button 
                    onClick={() => void handlePreviewShare()} 
                    disabled={previewBusy || !shareCodeInput.trim()} 
                    className="rounded-xl bg-gray-900 px-4 py-3.5 font-bold text-white transition-colors disabled:bg-gray-300 disabled:opacity-50"
                  >
                    预览
                  </button>
                </div>

                {previewError ? <p className="text-sm text-red-500">{previewError}</p> : null}
                
                {sharePreview ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm font-semibold text-gray-800">来自「{sharePreview.household.name}」的可导入菜谱</p>
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {sharePreview.recipes.map((recipe) => (
                        <label key={recipe.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedImportIds.includes(recipe.id)}
                            onChange={(e) =>
                              setSelectedImportIds((current) =>
                                e.target.checked ? [...current, recipe.id] : current.filter((id) => id !== recipe.id),
                              )
                            }
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-900">{recipe.title}</p>
                            <p className="text-xs text-gray-500">{recipe.time} 分钟</p>
                          </div>
                        </label>
                      ))}
                    </div>
                    <button 
                      type="button" 
                      onClick={() => void handleImportSelected()} 
                      disabled={previewBusy || selectedImportIds.length === 0} 
                      className="w-full rounded-xl bg-orange-500 px-4 py-3.5 font-bold text-white transition-colors disabled:bg-gray-300 disabled:opacity-50"
                    >
                      选择导入到我的厨房
                    </button>
                  </div>
                ) : null}
              </div>
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>
      </ModalPortal>

      <ModalPortal>
        <AnimatePresence>
          {showScanModal ? (
            <>
              <motion.div
                key="scan-scrim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowScanModal(false)}
                className="fixed inset-0 z-[200] min-h-[100dvh] w-full bg-black/40 backdrop-blur-sm"
              />
              <motion.div
                key="scan-sheet"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed left-4 right-4 top-1/2 z-[201] max-h-[85vh] -translate-y-1/2 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
              >
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">扫一扫</h3>
                  <button
                    type="button"
                    onClick={() => setShowScanModal(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-50 text-gray-500"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="mb-3 text-xs text-gray-500">将二维码对准取景框；支持菜谱分享链接与厨房分享链接。</p>
                <input
                  ref={scanQrFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleScanQrImageFile(e)}
                />
                {scanUiMode === "loading" ? (
                  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-gray-100 text-sm text-gray-500">正在准备相机…</div>
                ) : null}
                {scanUiMode !== "none" && scanUiMode !== "album_only" ? (
                  <video
                    ref={videoRef}
                    className={
                      scanUiMode === "live"
                        ? "aspect-[4/3] w-full rounded-2xl bg-black object-cover"
                        : "sr-only h-0 w-0 overflow-hidden opacity-0"
                    }
                    playsInline
                    muted
                  />
                ) : null}
                {scanUiMode === "album_only" ? (
                  <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-sm text-gray-700">无法使用实时取景，请从相册选择含二维码的截图（与不支持摄像头时相同）。</p>
                    <button
                      type="button"
                      onClick={() => scanQrFileInputRef.current?.click()}
                      className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white"
                    >
                      从相册选择图片
                    </button>
                  </div>
                ) : null}
                {scanUiMode === "none" ? (
                  <div className="space-y-3 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                    <p className="text-sm text-amber-900">当前浏览器不支持原生扫码 API，请使用「输入分享码导入」或换用 Chrome / Edge。</p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowScanModal(false);
                        setShowShareModal(true);
                      }}
                      className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white"
                    >
                      去输入分享码导入
                    </button>
                  </div>
                ) : null}
                {scanError ? <p className="mt-3 text-sm text-red-500">{scanError}</p> : null}
                <button
                  type="button"
                  onClick={() => setShowScanModal(false)}
                  className="mt-4 w-full rounded-xl bg-gray-100 py-3 text-sm font-semibold text-gray-700"
                >
                  关闭
                </button>
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>
      </ModalPortal>
    </div>
  );
}



