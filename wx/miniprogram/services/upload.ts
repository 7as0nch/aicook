// 两步式媒体上传封装
// 流程：
//   1) 调用后端 PrepareMediaUpload 拿到 asset_id + 预签名 upload_url + upload_headers
//   2) 用 wx.uploadFile / wx.request PUT 直传到对象存储
//   3) 调用 CompleteMediaUpload 通知后端上传完成，拿到 MediaAsset
// 注意：OSS PUT 直传必须用 wx.uploadFile 不行（multipart 会破坏签名），需用 wx.getFileSystemManager 读 ArrayBuffer + wx.request PUT。

import { request } from './http';

// 后端返回的预签名头
interface UploadHeaderKV {
  key: string;
  value: string;
}

// PrepareMediaUpload 入参/出参（与 backend/api/aicook/v1/media.proto 对齐）
export interface PrepareUploadReq {
  media_kind: 'image' | 'audio' | 'video' | 'document';
  file_name: string;
  content_type: string;
  size_bytes: number;
}

export interface PrepareUploadResp {
  asset_id: string;
  upload_url: string;
  upload_method?: 'PUT' | 'POST';
  upload_headers?: UploadHeaderKV[];
  expires_in_seconds?: number;
}

// CompleteMediaUpload 出参
export interface MediaAsset {
  id: string;
  url: string;
  media_kind: string;
  content_type: string;
  size_bytes: number;
}

// 选媒体的入参
export interface PickMediaOptions {
  mediaKind: PrepareUploadReq['media_kind'];
  count?: number;          // 默认 1
  sizeType?: ('original' | 'compressed')[];
  sourceType?: ('album' | 'camera')[];
}

// 整体上传结果
export interface UploadResult {
  asset: MediaAsset;
  localPath: string;       // 本地临时路径（用于即时预览）
}

// 选媒体（图片/视频）
export function pickMedia(opts: PickMediaOptions): Promise<WechatMiniprogram.ChooseMediaSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: opts.count ?? 1,
      mediaType: opts.mediaKind === 'video' ? ['video'] : ['image'],
      sizeType: opts.sizeType ?? ['compressed'],
      sourceType: opts.sourceType ?? ['album', 'camera'],
      success: resolve,
      fail: reject,
    });
  });
}

// 单文件上传：从临时路径上传 → 返回 MediaAsset
export async function uploadFile(params: {
  tempFilePath: string;
  mediaKind: PrepareUploadReq['media_kind'];
  contentType: string;
  fileName?: string;
  sizeBytes: number;
}): Promise<MediaAsset> {
  // Step 1: 申请预签名
  const prep = await request<PrepareUploadResp>({
    url: '/api/v1/media/uploads:prepare',
    method: 'POST',
    data: {
      media_kind: params.mediaKind,
      file_name: params.fileName || extractName(params.tempFilePath),
      content_type: params.contentType,
      size_bytes: params.sizeBytes,
    } as PrepareUploadReq,
    loading: '上传中',
    toastError: true,
  });

  // Step 2: PUT 直传 OSS
  await putToOss(params.tempFilePath, prep);

  // Step 3: 通知后端完成
  const asset = await request<MediaAsset>({
    url: `/api/v1/media/uploads/${encodeURIComponent(prep.asset_id)}:complete`,
    method: 'POST',
    data: { asset_id: prep.asset_id },
    loading: false,
  });
  return asset;
}

function extractName(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function readFileAsBuffer(localPath: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: localPath,
      success: (res) => resolve(res.data as ArrayBuffer),
      fail: reject,
    });
  });
}

// 用 wx.request PUT 把 ArrayBuffer 上传到 OSS（不能用 wx.uploadFile，那是 multipart）
async function putToOss(localPath: string, prep: PrepareUploadResp): Promise<void> {
  const buf = await readFileAsBuffer(localPath);
  const header: Record<string, string> = {};
  if (prep.upload_headers) {
    prep.upload_headers.forEach((h) => {
      header[h.key] = h.value;
    });
  }
  await new Promise<void>((resolve, reject) => {
    wx.request({
      url: prep.upload_url,
      method: prep.upload_method ?? 'PUT',
      data: buf,
      header,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`OSS PUT failed: ${res.statusCode}`));
        }
      },
      fail: (err) => reject(new Error(err.errMsg)),
    });
  });
}
