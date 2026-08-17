// ============================================================================
// Xiao 2.0 · 首页模块（静态展示社区介绍）
// ============================================================================
(function (X) {
  const home = {
    render() {
      return `
        <section class="home-hero">
          <h1 class="hero-title">${X.t('home.hero')}</h1>
          <p class="hero-tag">${X.t('app.tagline')}</p>
          <p class="hero-intro">${X.t('home.intro')}</p>
          <button class="btn primary lg" id="home_start">${X.t('home.start')}</button>
        </section>
        <section class="home-features">
          <h2>${X.t('home.features')}</h2>
          <ul class="feature-list">
            <li>${X.t('home.feat1')}</li>
            <li>${X.t('home.feat2')}</li>
            <li>${X.t('home.feat3')}</li>
            <li>${X.t('home.feat4')}</li>
            <li>${X.t('home.feat5')}</li>
            <li>${X.t('home.feat6')}</li>
            <li>${X.t('home.feat7')}</li>
            <li>${X.t('home.feat8')}</li>
            <li>${X.t('home.feat9')}</li>
            <li>${X.t('home.feat10')}</li>
            <li>${X.t('home.feat11')}</li>
            <li>${X.t('home.feat12')}</li>
          </ul>
        </section>
      `;
    },
    afterRender() {
      const btn = X.utils.$('#home_start');
      if (btn) btn.addEventListener('click', () => X.router.go('chat'));
    }
  };
  X.modules = X.modules || {};
  X.modules.home = home;
  X.router.register('home', { render: () => home.render(), afterRender: () => home.afterRender() });
})(window.Xiao = window.Xiao || {});
