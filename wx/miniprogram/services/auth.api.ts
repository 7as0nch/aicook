// AuthService 接口封装（与 backend/api/aicook/v1/auth.proto 对齐）
import { request } from './http';
import type { AuthReply, HouseholdSummary, Int64Like, UserProfile } from '../types/api';

export interface RegisterReq {
  username: string;
  password: string;
  display_name: string;
  phone?: string;
  email?: string;
  household_name?: string;
}

export interface LoginReq {
  username: string;
  password: string;
}

export interface UpdateProfileReq {
  display_name?: string;
  avatar_asset_id?: Int64Like;
}

export interface GetMeReply {
  user: UserProfile;
  current_household: HouseholdSummary;
  households?: HouseholdSummary[];
}

export interface WxLoginReq {
  code: string;
  nickname?: string;
  avatar_url?: string;
}

export const authApi = {
  wxLogin(data: WxLoginReq) {
    return request<AuthReply>({
      url: '/api/v1/auth/wx-login',
      method: 'POST',
      data,
      auth: 'none',
      loading: '登录中',
    });
  },

  register(data: RegisterReq) {
    return request<AuthReply>({
      url: '/api/v1/auth/register',
      method: 'POST',
      data,
      auth: 'none',
      loading: '注册中',
    });
  },

  login(data: LoginReq) {
    return request<AuthReply>({
      url: '/api/v1/auth/login',
      method: 'POST',
      data,
      auth: 'none',
      loading: '登录中',
    });
  },

  getMe() {
    return request<GetMeReply>({
      url: '/api/v1/auth/me',
      method: 'GET',
      toastError: false,
    });
  },

  updateProfile(data: UpdateProfileReq) {
    return request<GetMeReply>({
      url: '/api/v1/auth/profile',
      method: 'PATCH',
      data,
      loading: '保存中',
    });
  },

  listMyHouseholds() {
    return request<{ households: HouseholdSummary[] }>({
      url: '/api/v1/auth/households',
      method: 'GET',
    });
  },

  switchHousehold(household_id: Int64Like) {
    return request<AuthReply>({
      url: '/api/v1/auth/switch-household',
      method: 'POST',
      data: { household_id },
      loading: '切换中',
    });
  },
};
