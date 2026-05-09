// 登录态 Store
// 职责：存放 token / 当前用户 / 当前家庭 / 我的家庭列表；提供 login/register/logout/switchHousehold/refreshMe 动作。
// 持久化：写到 wx.storage(STORAGE_KEYS.AUTH)；冷启动 app.ts onLaunch 调用 restoreFromStorage()。
import { observable, action } from 'mobx-miniprogram';
import { authApi, LoginReq, RegisterReq, UpdateProfileReq } from '../services/auth.api';
import { persistAuth, clearAuth as clearAuthStorage, getCurrentToken } from '../services/http';
import { getItem, STORAGE_KEYS } from '../utils/storage';
import { emit, EVENTS } from '../utils/eventbus';
import type { AuthReply, HouseholdSummary, Int64Like, UserProfile } from '../types/api';

interface PersistedAuth {
  token?: string;
  user?: UserProfile;
  current_household?: HouseholdSummary;
  current_household_id?: Int64Like;
}

interface AuthStore {
  token: string;
  user: UserProfile | null;
  currentHousehold: HouseholdSummary | null;
  households: HouseholdSummary[];
  loading: boolean;
  readonly isLoggedIn: boolean;
  readonly currentHouseholdId: Int64Like | undefined;
  restoreFromStorage(): void;
  persist(): void;
  login(req: LoginReq): Promise<AuthReply>;
  register(req: RegisterReq): Promise<AuthReply>;
  refreshMe(): Promise<void>;
  switchHousehold(household_id: Int64Like): Promise<void>;
  updateProfile(req: UpdateProfileReq): Promise<void>;
  logout(): void;
}

export const authStore: AuthStore = observable({
  token: '' as string,
  user: null as UserProfile | null,
  currentHousehold: null as HouseholdSummary | null,
  households: [] as HouseholdSummary[],
  loading: false as boolean,

  get isLoggedIn(): boolean {
    return !!this.token && !!this.user;
  },

  get currentHouseholdId(): Int64Like | undefined {
    return this.currentHousehold?.id;
  },

  restoreFromStorage: action(function (this: AuthStore) {
    const saved = getItem<PersistedAuth>(STORAGE_KEYS.AUTH);
    if (!saved) return;
    this.token = saved.token || '';
    this.user = saved.user || null;
    this.currentHousehold = saved.current_household || null;
  }),

  persist(this: AuthStore) {
    persistAuth({
      token: this.token || undefined,
      current_household_id: this.currentHousehold?.id,
    });
    try {
      wx.setStorageSync(STORAGE_KEYS.AUTH, {
        token: this.token,
        user: this.user,
        current_household: this.currentHousehold,
        current_household_id: this.currentHousehold?.id,
      });
    } catch (e) {
      console.warn('[authStore] persist fail', e);
    }
  },

  login: action(async function (this: AuthStore, req: LoginReq) {
    this.loading = true;
    try {
      const reply = await authApi.login(req);
      this.token = reply.token;
      this.user = reply.user;
      this.currentHousehold = reply.current_household;
      this.households = reply.households || [];
      this.persist();
      emit(EVENTS.AUTH_LOGIN, reply.user);
      return reply;
    } finally {
      this.loading = false;
    }
  }),

  register: action(async function (this: AuthStore, req: RegisterReq) {
    this.loading = true;
    try {
      const reply = await authApi.register(req);
      this.token = reply.token;
      this.user = reply.user;
      this.currentHousehold = reply.current_household;
      this.households = reply.households || [];
      this.persist();
      emit(EVENTS.AUTH_LOGIN, reply.user);
      return reply;
    } finally {
      this.loading = false;
    }
  }),

  refreshMe: action(async function (this: AuthStore) {
    if (!getCurrentToken()) return;
    const reply = await authApi.getMe();
    this.user = reply.user;
    this.currentHousehold = reply.current_household;
    this.households = reply.households || [];
    this.persist();
  }),

  switchHousehold: action(async function (this: AuthStore, household_id: Int64Like) {
    const reply = await authApi.switchHousehold(household_id);
    this.token = reply.token;
    this.user = reply.user;
    this.currentHousehold = reply.current_household;
    this.households = reply.households || this.households;
    this.persist();
    emit(EVENTS.HOUSEHOLD_SWITCHED, reply.current_household);
  }),

  updateProfile: action(async function (this: AuthStore, req: UpdateProfileReq) {
    const reply = await authApi.updateProfile(req);
    this.user = reply.user;
    this.persist();
  }),

  logout: action(function (this: AuthStore) {
    this.token = '';
    this.user = null;
    this.currentHousehold = null;
    this.households = [];
    clearAuthStorage();
    emit(EVENTS.AUTH_LOGOUT);
  }),
}) as AuthStore;
