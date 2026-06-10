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
  tags: string[];      // 该成员的口味偏好标签
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
    // 当前登录用户在该家庭里是不是 owner，决定 ActionSheet 是否提供「添加成员」
    iAmOwner: false,
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
        tags: Array.isArray((m as HouseholdMemberDetail & { flavor_tags?: string[] }).flavor_tags)
          ? ((m as HouseholdMemberDetail & { flavor_tags?: string[] }).flavor_tags || []).slice(0, 4)
          : [],
      }));
      // 找出当前登录用户对应的 member，判断是否 owner
      const myUserId = String((authStore.user as { id?: string | number } | null)?.id || '');
      const iAmOwner = !!myUserId && (res.members || []).some(
        (m: HouseholdMemberDetail) => String(m.user_id) === myUserId && m.role === 'owner',
      );
      const previewNames = list.slice(0, 2).map(m => m.name).join('、');
      const previewText = list.length
        ? (list.length > 2 ? `${previewNames} 等 ${list.length} 位成员` : `${previewNames} · ${list.length} 位成员`)
        : '暂无成员';
      this.setData({ members: list, memberCount: list.length, memberPreview: previewText, iAmOwner });
    } catch {
      // 兜底（前端假设当前用户就是 owner，毕竟通常能进这个页面的就是 owner）
      this.setData({
        members: [{ id: '1', emoji: '🐱', name: '我', role: '管理员', isOwner: true, tags: [] }],
        memberCount: 1,
        memberPreview: '只有你 1 位成员',
        iAmOwner: true,
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

  // 底部 + 按钮：让用户选「添加成员」（仅 owner）/「新建另一个厨房」（所有人）
  onCreate() {
    if (this.data.iAmOwner) {
      wx.showActionSheet({
        itemList: ['添加成员（家人）', '新建另一个厨房'],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.promptAddMember();
          } else if (res.tapIndex === 1) {
            this.promptCreateHousehold();
          }
        },
      });
    } else {
      // 非 owner 没有「添加成员」权限，直接进入新建厨房流程
      this.promptCreateHousehold();
    }
  },

  // 添加虚拟成员（owner only）
  promptAddMember() {
    const householdId = (authStore.currentHousehold as { id?: Int64Like } | null)?.id;
    if (!householdId) {
      wx.showToast({ title: '未找到当前家庭', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '添加家人',
      placeholderText: '请输入家人名字，如「妈妈」「儿子」',
      editable: true,
      success: async (res) => {
        if (!res.confirm || !res.content) return;
        const name = res.content.trim();
        if (!name) return;
        try {
          await householdApi.addMember(householdId, name);
          await this.loadMembers();
          wx.showToast({ title: '已添加', icon: 'success' });
        } catch (e) {
          const msg = (e as { message?: string })?.message || '添加失败';
          wx.showToast({ title: msg, icon: 'none' });
        }
      },
    });
  },

  promptCreateHousehold() {
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

  // 成员行点击：弹 ActionSheet
  //   - 任意人：可以「编辑口味偏好」（后端 owner OR 本人；非自己的会 403，FE 不预先隐藏）
  //   - 仅当前登录用户是 owner，且目标成员不是 owner，才显示「移除成员」
  onMemberTap(e: WechatMiniprogram.BaseEvent) {
    const ds = (e.currentTarget as unknown as { dataset: { id: string; name: string; isOwner: boolean } }).dataset;
    const targetIsOwner = ds.isOwner;
    const canRemove = this.data.iAmOwner && !targetIsOwner;
    const itemList = canRemove ? ['编辑口味偏好', '移除成员'] : ['编辑口味偏好'];
    wx.showActionSheet({
      itemList,
      success: (res) => {
        if (res.tapIndex === 0) {
          // 跳口味偏好编辑页，带上 member_id
          wx.navigateTo({
            url: `/pages/me/preferences/index?member_id=${encodeURIComponent(ds.id)}&member_name=${encodeURIComponent(ds.name)}`,
          });
        } else if (res.tapIndex === 1 && canRemove) {
          wx.showModal({
            title: '移除成员',
            content: `确定将「${ds.name}」从厨房移除吗？`,
            confirmText: '移除',
            confirmColor: '#E5604A',
            success: async (m) => {
              if (!m.confirm) return;
              try {
                await householdApi.removeMember(ds.id);
                await this.loadMembers();
                wx.showToast({ title: '已移除', icon: 'success' });
              } catch (err) {
                const msg = (err as { message?: string })?.message || '移除失败';
                wx.showToast({ title: msg, icon: 'none' });
              }
            },
          });
        }
      },
    });
  },
});
