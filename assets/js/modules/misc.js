// ============================================================================
// Xiao 2.0 · 杂项模块
// 视频入口占位 + 联系我们（B 站跳转） + 举报通用入口
// ============================================================================
(function (X) {
  const BILIBILI_URL = 'https://space.bilibili.com/';

  const misc = {
    /** 视频页占位 */
    videoRender() {
      return `
        <section class="video-page">
          <h1>🎬 ${X.t('video.title')}</h1>
          <p class="badge dev">${X.t('video.dev')}</p>
          <div class="video-placeholder">${X.t('video.placeholder')}</div>
        </section>
      `;
    },
    videoAfterRender() {},

    /** 联系我们：跳 B 站 */
    contact() {
      X.ui.modal({
        title: X.t('misc.contact'),
        body: `<div class="contact-body">
          <p>${X.t('misc.contactUrl')}</p>
          <a class="btn primary" href="${BILIBILI_URL}" target="_blank" rel="noopener">📺 Bilibili</a>
        </div>`
      });
    },

    /** 通用举报弹窗 */
    async report({ targetType, targetId, targetName }) {
      if (!X.auth.requireLogin()) return;
      const reason = await X.ui.prompt({
        title: '举报' + (targetName ? ' · ' + targetName : ''),
        label: '举报原因（必填）',
        placeholder: '请填写具体原因',
        multiline: true,
        confirmText: '提交举报',
        validate: v => v ? null : X.t('err.required')
      });
      if (!reason) return;
      try {
        await X.store.addReport({
          reporterId: X.auth.currentUser().id,
          targetType, targetId,
          reason
        });
        X.ui.toast('举报已提交，等待管理员审核', 'ok');
      } catch (e) {
        X.ui.toast('举报失败：' + (e.message || ''), 'err');
      }
    }
  };

  X.modules = X.modules || {};
  X.modules.misc = misc;
  X.router.register('video', {
    render: () => misc.videoRender(),
    afterRender: () => misc.videoAfterRender()
  });
})(window.Xiao = window.Xiao || {});
