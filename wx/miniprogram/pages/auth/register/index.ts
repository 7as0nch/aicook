// 注册页
import { authStore } from '../../../store/auth.store';

type Field = 'username' | 'password' | 'password2' | 'display_name' | 'household_name';

// 字段校验：返回错误文案，空串表示通过
function validate(field: Field, value: string, data: { password: string }): string {
  switch (field) {
    case 'username':
      if (!value) return '请输入用户名';
      if (!/^[A-Za-z0-9_]{4,20}$/.test(value)) return '用户名需 4-20 位字母/数字/下划线';
      return '';
    case 'password':
      if (!value) return '请输入密码';
      if (value.length < 8) return '密码至少 8 位';
      return '';
    case 'password2':
      if (!value) return '请再次输入密码';
      if (value !== data.password) return '两次输入的密码不一致';
      return '';
    case 'display_name':
      if (!value) return '请输入昵称';
      return '';
    default:
      return '';
  }
}

Page({
  data: {
    username: '',
    password: '',
    password2: '',
    display_name: '',
    household_name: '',
    // 内联错误提示（key 与字段同名）
    errors: {} as Partial<Record<Field, string>>,
    loading: false,
  },

  onBack() {
    wx.navigateBack({ delta: 1 }).catch(() => wx.reLaunch({ url: '/pages/auth/login/index' }));
  },

  onInput(e: WechatMiniprogram.Input) {
    const field = e.currentTarget.dataset.field as Field;
    this.setData({ [field]: e.detail.value });
    // 输入时清除该字段的错误提示
    if (this.data.errors[field]) {
      this.setData({ [`errors.${field}`]: '' });
    }
  },

  // 失焦即校验，错误内联展示
  onBlurValidate(e: WechatMiniprogram.InputBlur) {
    const field = (e.currentTarget as unknown as { dataset: { field: Field } }).dataset.field;
    const value = (e.detail.value || '').trim();
    this.setData({ [`errors.${field}`]: validate(field, value, { password: this.data.password }) });
  },

  async onSubmit() {
    if (this.data.loading) return;
    const username = this.data.username.trim();
    const password = this.data.password;
    const password2 = this.data.password2;
    const display_name = this.data.display_name.trim();
    const household_name = this.data.household_name.trim();

    // 提交前全量校验
    const errors: Partial<Record<Field, string>> = {};
    errors.username = validate('username', username, { password });
    errors.password = validate('password', password, { password });
    errors.password2 = validate('password2', password2, { password });
    errors.display_name = validate('display_name', display_name, { password });
    const firstError = Object.values(errors).find(Boolean);
    this.setData({ errors });
    if (firstError) {
      wx.showToast({ title: firstError, icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      await authStore.register({ username, password, display_name, household_name });
      wx.reLaunch({ url: '/pages/home/index/index' });
    } catch (e) {
      console.warn('[register] failed', e);
    } finally {
      this.setData({ loading: false });
    }
  },
});
