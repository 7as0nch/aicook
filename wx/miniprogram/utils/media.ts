// 媒体类型工具（TS 侧），与 utils/media.wxs 的 isVideo 保持一致。
// 封面/图集支持图片或 ≤10s 短视频；长视频走 recipe.video_url（不限时长）。

const VIDEO_EXTS = ['mp4', 'mov', 'm4v', 'webm', 'quicktime'];

// 按 URL 后缀判断是否视频（忽略预签名 query / fragment）
export function isVideo(url?: string): boolean {
  if (!url) return false;
  let u = url;
  const q = u.indexOf('?');
  if (q >= 0) u = u.slice(0, q);
  const h = u.indexOf('#');
  if (h >= 0) u = u.slice(0, h);
  const dot = u.lastIndexOf('.');
  if (dot < 0) return false;
  return VIDEO_EXTS.indexOf(u.slice(dot + 1).toLowerCase()) >= 0;
}

// 封面图集允许上传的媒体类型（全局可配；wx.chooseMedia 的 mediaType 取值）。
// 默认图片 + 短视频；若某处只允许图片，传 ['image'] 即可。
export const GALLERY_MEDIA_TYPES: ('image' | 'video')[] = ['image', 'video'];

// 封面/图集视频的时长上限（秒）；超过请改用 recipe.video_url 长视频。
export const COVER_VIDEO_MAX_SECONDS = 10;
