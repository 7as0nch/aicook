// 通用类型定义

// Kratos 错误信封：后端业务错误统一格式
export interface ApiError {
  code: number;        // HTTP 状态码（200/400/401/...）
  reason: string;      // 业务错误原因（如 USER_NOT_FOUND）
  message: string;     // 可展示给用户的中文消息
  metadata?: Record<string, string>;
}

// 分页通用入参/出参
export interface PageRequest {
  limit?: number;
  before_id?: string | number;
  after_id?: string | number;
}

export interface PageResponse<T> {
  items: T[];
  has_more?: boolean;
  next_cursor?: string;
}

// 业务实体的"瘦身"通用字段
export interface BaseEntity {
  id: string | number;
  created_at?: string;
  updated_at?: string;
}
