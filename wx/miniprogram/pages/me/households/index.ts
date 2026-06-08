// 厨房管理（设计稿 08）
// 当前厨房卡 + 分享 + 切换其它厨房 + 厨房成员（预留）
import { createStoreBindings } from 'mobx-miniprogram-bindings';
import { authStore } from '../../../store/auth.store';
import { householdApi } from '../../../services/household.api';
import type { HouseholdSummary, HouseholdMemberDetail, Int64Like } from '../../../types/api';

interface OtherHousehold {
  id: Int64Like;
  name: string;
  emoji: string;
  memberLabel: string;
  meRole: string;
}

interface MemberRow {
  id: string;
  emoji: string;
  name: string;
  role: string;        // 显示标签：管理员 / 成员
  isOwner: boolean;
}

const MEMBER_EMOJI_POOL = ['🐱', '👩', '👨', '🧒', '👵', '👴', '👶'];

Page({
  data: {
    current: null as HouseholdSummary | null,
    others: [] as OtherHousehold[],
    members: [] as MemberRow[],
    memberCount: 0,
    memberPreview: '暂无成员',
    shareCode: '',
  },

  onLoad() {
    const self = this as unknown as { storeBindings?: { destroyStoreBindings: () => void } };
    self.storeBindings = createStoreBindings(this, {
      store: authStore,
      fields: ['currentHousehold', 'households'] as const,
      actions: [] as const,
    });
    this.rebuild();
    void this.loadMembers();
  },

  async loadMembers() {
    const current = authStore.currentHousehold;
    if (!current?.id) return;
    try {
      const res = await householdApi.listMembers(current.id);
      const list = (res.members || []).map((m: HouseholdMemberDetail, i: number): MemberRow => ({
        id: String(m.id),
        emoji: m.emoji || MEMBER_EMOJI_POOL[i % MEMBER_EMOJI_POOL.length],
        name: m.display_name || `成员${i + 1}`,
        role: m.role === 'owner' || m.role === 'admin' ? '管理员' : '成员',
        isOwner: m.role === 'owner' || m.role === 'admin',
      }));
      const previewNames = list.slice(0, 2).map(m => m.name).join('、');
      const previewText = list.length
        ? (list.length > 2 ? `${previewNames} 等 ${list.length} 位成员` : `${previewNames} · ${list.length} 位成员`)
        : '暂无成员';
      this.setData({ members: list, memberCount: list.length, memberPreview: previewText });
    } catch {
      // 兜底
      this.setData({
        members: [{ id: '1', emoji: '🐱', name: '我', role: '管理员', isOwner: true }],
        memberCount: 1,
        memberPreview: '只有你 1 位成员',
      });
    }
  },

  onUnload() {
    const self = this as unknown as { storeBindings?: { destroyStoreBindings: () => void } };
    self.storeBindings?.destroyStoreBindings();
  },

  rebuild() {
    const current = authStore.currentHousehold;
    const all = authStore.households || [];
    const others: OtherHousehold[] = all
      .filter(h => current && String(h.id) !== String(current.id))
      .map((h, i) => ({
        id: h.id,
        name: h.name || '未命名厨房',
        emoji: i % 2 === 0 ? '🏠' : '🏡',
        memberLabel: `${i + 1} 位成员 · 你是成员`,
        meRole: '成员',
      }));
    this.setData({ current, others });
  },

  async onShareTap() {
    try {
      const res = await householdApi.createShareCode();
      const code = res.household?.share_code || '';
      this.setData({ shareCode: code });
      if (code) {
        wx.setClipboardData({
          data: code,
          success: () => wx.showToast({ title: '分享码已复制', icon: 'success' }),
        });
      }
    } catch {
      wx.showToast({ title: '生成失败', icon: 'none' });
    }
  },

  async onSwitchTap(e: WechatMiniprogram.BaseEvent) {
    const id = (e.currentTarget as unknown as { dataset: { id: string } }).dataset.id;
    if (!id) return;
    try {
      await authStore.switchHousehold(id);
      wx.showToast({ title: '已切换', icon: 'success' });
      this.rebuild();
      setTimeout(() => wx.reLaunch({ url: '/pages/home/index/index' }), 500);
    } catch {
      wx.showToast({ title: '切换失败', icon: 'none' });
    }
  },

  onCreate() {
    wx.showModal({
      title: '新建厨房',
      placeholderText: '为新厨房起个名字',
      editable: true,
      success: async (res) => {
        if (!res.confirm || !res.content) return;
        try {
          await householdApi.createHousehold(res.content.trim());
          await authStore.refreshMe();
          this.rebuild();
          wx.showToast({ title: '已创建', icon: 'success' });
        } catch {
          wx.showToast({ title: '创建失败', icon: 'none' });
        }
      },
    });
  },

  onJoin() {
    wx.showModal({
      title: '加入厨房',
      placeholderText: '请输入分享码',
      editable: true,
      success: async (res) => {
        if (!res.confirm || !res.content) return;
        const code = res.content.trim();
        try {
          await householdApi.getKitchenByShareCode(code);
          await householdApi.importSharedRecipes(code, []);
          await authStore.refreshMe();
          this.rebuild();
          wx.showToast({ title: '已加入', icon: 'success' });
        } catch {
          wx.showToast({ title: '加入失败', icon: 'none' });
        }
      },
    });
  },

  onBack() {
    wx.navigateBack({ delta: 1 }).catch(() => wx.switchTab({ url: '/pages/me/index/index' }));
  },
});
