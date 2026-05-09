// MediaService 接口封装（PrepareUpload + CompleteUpload）
// 上传业务流程见 services/upload.ts；本文件只暴露原始接口。
import { request } from './http';
import type { MediaAsset } from '../types/api';

export interface UploadHeader {
  key: string;
  value: string;
}

export interface PrepareUploadReq {
  media_kind: 'image' | 'audio' | 'video' | 'document';
  file_name: string;
  content_type: string;
  size_bytes: number;
}

export interface PrepareUploadReply {
  asset_id: string;
  upload_url: string;
  upload_method?: 'PUT' | 'POST';
  upload_headers?: UploadHeader[];
  expires_in_seconds?: number;
}

export const mediaApi = {
  prepareUpload(data: PrepareUploadReq) {
    return request<PrepareUploadReply>({
      url: '/api/v1/media/uploads:prepare',
      method: 'POST',
      data,
      toastError: false,
    });
  },

  completeUpload(asset_id: string) {
    return request<{ asset: MediaAsset }>({
      url: `/api/v1/media/uploads/${encodeURIComponent(asset_id)}:complete`,
      method: 'POST',
      data: { asset_id },
      toastError: false,
    });
  },
};
