// ============================================================================
// Xiao 2.0 · 核心层 · 骨架屏
// 职责：返回暗色骨架屏 HTML 字符串（.skeleton 类，灰色脉冲动画由 style.css 定义）
//   1. chat()   聊天消息骨架（5 条交替左右）
//   2. card()   作品卡片骨架
//   3. row()    列表行骨架
//   4. list(n)  n 行列表骨架
//   5. lines(n) n 行文本骨架
// ============================================================================
(function (X) {
  const skeleton = {
    /** 聊天消息骨架（5 条交替左右） */
    chat() {
      let html = '<div class="skeleton-chat-list">';
      for (let i = 0; i < 5; i++) {
        const left = i % 2 === 0;
        html += '<div class="skeleton-msg ' + (left ? 'left' : 'right') + '">'
          + (left ? '<div class="skeleton avatar"></div>' : '')
          + '<div class="skeleton-msg-body">'
            + '<div class="skeleton line w40"></div>'
            + '<div class="skeleton line w80"></div>'
            + '<div class="skeleton line w60"></div>'
          + '</div>'
        + '</div>';
      }
      html += '</div>';
      return html;
    },

    /** 作品卡片骨架 */
    card() {
      return '<div class="skeleton-card">'
        + '<div class="skeleton cover"></div>'
        + '<div class="skeleton line w70"></div>'
        + '<div class="skeleton line w40"></div>'
        + '<div class="skeleton line w90"></div>'
      + '</div>';
    },

    /** 列表行骨架 */
    row() {
      return '<div class="skeleton-row">'
        + '<div class="skeleton avatar"></div>'
        + '<div class="skeleton-row-body">'
          + '<div class="skeleton line w50"></div>'
          + '<div class="skeleton line w80"></div>'
        + '</div>'
      + '</div>';
    },

    /**
     * n 行列表骨架
     * @param {number} n 默认 5
     */
    list(n = 5) {
      let html = '<div class="skeleton-list">';
      for (let i = 0; i < n; i++) html += this.row();
      html += '</div>';
      return html;
    },

    /**
     * n 行文本骨架
     * @param {number} n 默认 3
     */
    lines(n = 3) {
      let html = '<div class="skeleton-lines">';
      for (let i = 0; i < n; i++) {
        // 最后一行短一些，模拟自然段落
        const w = i === n - 1 ? 'w60' : 'w100';
        html += '<div class="skeleton line ' + w + '"></div>';
      }
      html += '</div>';
      return html;
    }
  };

  X.skeleton = skeleton;
})(window.Xiao = window.Xiao || {});
