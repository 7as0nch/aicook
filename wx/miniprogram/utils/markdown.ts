// 轻量 Markdown → rich-text nodes 转换器。
// 只支持 AI 回复常见的子集：标题、加粗/斜体、行内代码、代码块、无序/有序列表、
// 引用、分隔线、链接（渲染为带下划线文本，小程序内不可跳外链）。
// 设计取舍：流式输出期间用纯文本渲染（性能），流结束后一次性转换（chat.store 调用）。

interface RichNode {
  name?: string;
  attrs?: Record<string, string>;
  children?: RichNode[];
  type?: 'text';
  text?: string;
}

const BASE_TEXT = 'font-size:27rpx;line-height:1.7;color:inherit;word-break:break-all;';
const CODE_INLINE = 'font-family:monospace;font-size:24rpx;background:rgba(0,0,0,0.06);border-radius:6rpx;padding:2rpx 8rpx;';
const CODE_BLOCK = 'display:block;font-family:monospace;font-size:23rpx;background:rgba(0,0,0,0.05);border-radius:12rpx;padding:16rpx;margin:8rpx 0;white-space:pre-wrap;word-break:break-all;';

// 行内语法：**bold** / *italic* / `code` / [text](url)
function parseInline(text: string): RichNode[] {
  const nodes: RichNode[] = [];
  // 按优先级逐段匹配；剩余部分递归
  const pattern = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/;
  let rest = text;
  for (;;) {
    const m = pattern.exec(rest);
    if (!m) {
      if (rest) nodes.push({ type: 'text', text: rest });
      break;
    }
    if (m.index > 0) nodes.push({ type: 'text', text: rest.slice(0, m.index) });
    if (m[2] !== undefined) {
      nodes.push({ name: 'strong', children: [{ type: 'text', text: m[2] }] });
    } else if (m[4] !== undefined) {
      nodes.push({ name: 'em', children: [{ type: 'text', text: m[4] }] });
    } else if (m[6] !== undefined) {
      nodes.push({ name: 'span', attrs: { style: CODE_INLINE }, children: [{ type: 'text', text: m[6] }] });
    } else if (m[8] !== undefined) {
      // 链接：小程序内不可点外链，渲染为强调文本
      nodes.push({
        name: 'span',
        attrs: { style: 'color:#EF6E00;text-decoration:underline;' },
        children: [{ type: 'text', text: m[8] }],
      });
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return nodes;
}

function blockNode(style: string, children: RichNode[]): RichNode {
  return { name: 'div', attrs: { style }, children };
}

// 把 markdown 文本转为 <rich-text> 的 nodes 数组。
// 解析失败/空输入时返回 null，调用方回退纯文本渲染。
export function markdownToNodes(md: string): RichNode[] | null {
  const text = (md || '').trim();
  if (!text) return null;
  try {
    const lines = text.split('\n');
    const out: RichNode[] = [];
    let listBuf: RichNode[] = [];
    let codeBuf: string[] | null = null;

    const flushList = () => {
      if (listBuf.length) {
        out.push(blockNode('margin:4rpx 0;', listBuf));
        listBuf = [];
      }
    };

    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      // 代码块开关
      if (/^```/.test(line)) {
        if (codeBuf === null) {
          flushList();
          codeBuf = [];
        } else {
          out.push({ name: 'div', attrs: { style: CODE_BLOCK }, children: [{ type: 'text', text: codeBuf.join('\n') }] });
          codeBuf = null;
        }
        continue;
      }
      if (codeBuf !== null) {
        codeBuf.push(raw);
        continue;
      }
      // 标题
      const h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) {
        flushList();
        const level = h[1].length;
        const size = [34, 31, 29, 28][level - 1];
        out.push(blockNode(
          `font-size:${size}rpx;font-weight:600;margin:12rpx 0 6rpx;line-height:1.5;`,
          parseInline(h[2]),
        ));
        continue;
      }
      // 分隔线
      if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
        flushList();
        out.push({ name: 'div', attrs: { style: 'height:2rpx;background:rgba(0,0,0,0.08);margin:12rpx 0;' } });
        continue;
      }
      // 引用
      const q = /^>\s?(.*)$/.exec(line);
      if (q) {
        flushList();
        out.push(blockNode(
          'border-left:6rpx solid rgba(0,0,0,0.12);padding-left:16rpx;color:rgba(0,0,0,0.55);margin:6rpx 0;' + BASE_TEXT,
          parseInline(q[1]),
        ));
        continue;
      }
      // 列表项（无序/有序）
      const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
      const ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
      if (ul || ol) {
        const marker = ul ? '·' : `${(ol as RegExpExecArray)[1]}.`;
        const content = ul ? ul[1] : (ol as RegExpExecArray)[2];
        listBuf.push(blockNode(
          'display:flex;margin:2rpx 0;' + BASE_TEXT,
          [
            { name: 'span', attrs: { style: 'margin-right:10rpx;flex-shrink:0;color:#EF6E00;' }, children: [{ type: 'text', text: marker }] },
            { name: 'span', children: parseInline(content) },
          ],
        ));
        continue;
      }
      flushList();
      // 空行 → 段间距
      if (!line.trim()) {
        out.push({ name: 'div', attrs: { style: 'height:10rpx;' } });
        continue;
      }
      // 普通段落
      out.push(blockNode('margin:2rpx 0;' + BASE_TEXT, parseInline(line)));
    }
    flushList();
    if (codeBuf !== null && codeBuf.length) {
      out.push({ name: 'div', attrs: { style: CODE_BLOCK }, children: [{ type: 'text', text: codeBuf.join('\n') }] });
    }
    return out.length ? out : null;
  } catch (e) {
    console.warn('[markdown] parse fail, fallback to plain text', e);
    return null;
  }
}

// 粗略判断文本是否包含 markdown 语法（没有就不必走 rich-text，纯文本更轻）
export function looksLikeMarkdown(text: string): boolean {
  return /(\*\*|^#{1,4}\s|^\s*[-*+]\s|^\s*\d+[.)]\s|```|^>\s|\[[^\]]+\]\([^)]+\))/m.test(text || '');
}
