// MediaService 接口封装（PrepareUpload + CompleteUpload）
// 上传业务流程见 services/upload.ts；本文件是上传相关类型与原始接口的唯一定义点。
// 对应 proto：backend/api/aicook/v1/media.proto + common.proto 的 MediaAsset
import { request } from './http';
import type { Int64Like, MediaAsset } from '../types/api';

// 对应 common.proto UploadHeader
export interface UploadHeader {
  key: string;
  value: string;
}

// 对应 media.proto PrepareMediaUploadRequest
export interface PrepareUploadReq {
  media_kind: 'image' | 'audio' | 'video' | 'document';
  file_name: string;
  content_type: string;
  size_bytes: number;
}

// 对应 media.proto PrepareMediaUploadReply（注意：proto 没有 upload_method/expires_in_seconds，
// 直传固定用 PUT；asset_id 是 int64，protojson 序列化为字符串）
export interface PrepareUploadReply {
  asset_id: Int64Like;
  object_key?: string;
  upload_url: string;
  upload_headers?: UploadHeader[];
}

// 透传给 request() 的少量展示选项
export interface MediaCallOptions {
  loading?: boolean | string;
  toastError?: boolean;
}

export const mediaApi = {
  prepareUpload(data: PrepareUploadReq, opts: MediaCallOptions = {}) {
    return request<PrepareUploadReply>({
      url: '/api/v1/media/uploads:prepare',
      method: 'POST',
      data,
      loading: opts.loading ?? false,
      toastError: opts.toastError ?? false,
    });
  },

  completeUpload(asset_id: Int64Like, opts: MediaCallOptions = {}) {
    // int64 一律以字符串进 URL/body，protojson 兼容且不丢精度
    const id = String(asset_id);
    return request<{ asset: MediaAsset }>({
      url: `/api/v1/media/uploads/${encodeURIComponent(id)}:complete`,
      method: 'POST',
      data: { asset_id: id },
      loading: opts.loading ?? false,
      toastError: opts.toastError ?? false,
    });
  },
};
