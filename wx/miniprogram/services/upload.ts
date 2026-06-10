// 两步式媒体上传封装
// 流程：
//   1) mediaApi.prepareUpload 拿到 asset_id + 预签名 upload_url + upload_headers
//   2) wx.request PUT 直传到对象存储
//   3) mediaApi.completeUpload 通知后端上传完成，拿到 MediaAsset
// 注意：OSS PUT 直传不能用 wx.uploadFile（multipart 会破坏签名），
// 需用 wx.getFileSystemManager 读 ArrayBuffer + wx.request PUT。
// 上传相关类型统一定义在 services/media.api.ts，本文件不再重复声明。

import { UPLOAD_TIMEOUT_MS } from './http';
import { mediaApi } from './media.api';
import type { PrepareUploadReq, PrepareUploadReply } from './media.api';
import type { MediaAsset } from '../types/api';

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
  const prep = await mediaApi.prepareUpload(
    {
      media_kind: params.mediaKind,
      file_name: params.fileName || extractName(params.tempFilePath),
      content_type: params.contentType,
      size_bytes: params.sizeBytes,
    },
    { loading: '上传中', toastError: true },
  );

  // Step 2: PUT 直传 OSS
  await putToOss(params.tempFilePath, prep);

  // Step 3: 通知后端完成
  // 注意：proto CompleteMediaUploadReply 把 MediaAsset 套在 { asset: {...} } 里，
  // 不要把整个 response 当成 MediaAsset 用（会拿到 undefined.id → 后续序列化成 "undefined" 字符串）。
  const reply = await mediaApi.completeUpload(prep.asset_id);
  if (!reply?.asset?.id) {
    throw new Error('upload complete: missing asset.id');
  }
  return reply.asset;
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
async function putToOss(localPath: string, prep: PrepareUploadReply): Promise<void> {
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
      method: 'PUT',
      data: buf,
      header,
      timeout: UPLOAD_TIMEOUT_MS,
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
