// VoiceService 接口封装
import { request } from './http';

export interface TranscribeReply {
  text: string;
  confidence?: number;
  segments?: Array<{ start_ms: number; end_ms: number; text: string }>;
}

export const voiceApi = {
  transcribe(asset_id: string) {
    return request<TranscribeReply>({
      url: '/api/v1/media/transcriptions',
      method: 'POST',
      data: { asset_id },
      loading: '识别中',
    });
  },
};
