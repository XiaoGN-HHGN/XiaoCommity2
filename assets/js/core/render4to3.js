// ============================================================================
// Xiao 2.1 · 4to3 智能自然光照渲染引擎（背景层集成版）
// 原作：新概念渲染4to3技术/4to3.js
// 集成改造：作为 XiaoCommity2 的第四种视觉渲染模式（render=4to3）
//   - 五层光照管线：L1 基底天光 → L2 大气散射 → L3 虚拟太阳光 → L4 鼠标反光 → L5 文本光影
//   - 三层智能决策：A1 设备自动适配 → A2 自配色池 → A3 伪3D 视差
//   - 三套色板：dark / light / eyecare（与 Xiao 主题协同）
//   - 持久化：localStorage（xiao.render4to3）
// 注意：本模块只作为背景层叠加，不改 body 布局，避免破坏主页面排版
// ============================================================================

(function (X) {
  const R = {
    // ---------- 状态 ----------
    state: {
      enabled: false,          // 是否启用 4to3 渲染
      activeMode: 'dark',     // dark / light / eyecare
      lastNormalTheme: 'dark',
      mouseLight: true,
      sunLight: true,
      mcFont: false,
      glassOpacity: 45,
      blurStrength: 18,
      parallaxStrength: 60,
      perfMode: false,
      deviceTier: 'high'
    },

    // ---------- 默认色池 ----------
    colorPool: {
      dark: [
        'rgba(110, 178, 255, 0.3)',
        'rgba(64, 214, 204, 0.26)',
        'rgba(146, 156, 255, 0.24)'
      ],
      light: [
        'rgba(255, 210, 160, 0.28)',
        'rgba(180, 210, 255, 0.24)',
        'rgba(255, 230, 190, 0.22)',
        'rgba(200, 230, 240, 0.2)'
      ],
      eyecare: [
        'rgba(140, 250, 180, 0.55)',
        'rgba(90, 230, 140, 0.5)',
        'rgba(45, 200, 100, 0.45)',
        'rgba(30, 160, 80, 0.4)',
        'rgba(190, 255, 170, 0.5)',
        'rgba(120, 210, 160, 0.42)',
        'rgba(25, 130, 70, 0.38)'
      ]
    },

    // ---------- DOM 引用 ----------
    el: { l2: null, l3: null, l4: null },

    // ---------- 初始化 ----------
    init() {
      this.el.l2 = document.getElementById('r4to3_l2');
      this.el.l3 = document.getElementById('r4to3_l3');
      this.el.l4 = document.getElementById('r4to3_l4');
      this._loadStorage();

      // 跟随 Xiao 主题：dark→dark, light→light, cyber→dark（赛博用暗底 + 现有 cyber 变量叠加）
      if (X.theme) {
        this.state.activeMode = X.theme.current === 'light' ? 'light' : 'dark';
      }
      this._detectDevice();
      this._applyAll();
      this._bindMouse();
      console.log('[Xiao] 4to3 渲染引擎就绪（当前', (this.state.enabled ? '启用' : '待机'), '）');
    },

    // ---------- 开关 ----------
    enable()  { this.state.enabled = true;  this._applyAll(); this._save(); X.ui && X.ui.toast('4to3 自然光照已开启', 'ok', 1600); },
    disable() { this.state.enabled = false; this._applyAll(); this._save(); X.ui && X.ui.toast('4to3 自然光照已关闭', 'info', 1600); },
    toggle()  { this.state.enabled ? this.disable() : this.enable(); },

    // ---------- 跟随 Xiao 主题切换色板 ----------
    syncTheme(xiaoTheme) {
      // cyber 归到 dark 色板（暗底），light 用 light，dark/默认用 dark
      this.state.activeMode = xiaoTheme === 'light' ? 'light' : 'dark';
      if (this.state.enabled) this._refreshAtmosphere();
    },

    // ============================================================
    // A1 设备自动适配
    // ============================================================
    _detectDevice() {
      const root = document.documentElement;
      const cores = navigator.hardwareConcurrency || 4;
      const memory = navigator.deviceMemory || 4;
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const isLowEnd = cores <= 4 || memory <= 4 || isMobile;

      if (isLowEnd) {
        this.state.deviceTier = 'low';
        root.style.setProperty('--r4to3-spot-blur', '60px');
        root.style.setProperty('--r4to3-anim-speed', '1.5');
        root.style.setProperty('--r4to3-noise-opacity', '0');
      } else if (cores >= 8 && memory >= 8) {
        this.state.deviceTier = 'ultra';
        root.style.setProperty('--r4to3-spot-blur', '100px');
        root.style.setProperty('--r4to3-anim-speed', '1');
        root.style.setProperty('--r4to3-noise-opacity', '0.05');
      } else {
        this.state.deviceTier = 'high';
        root.style.setProperty('--r4to3-spot-blur', '80px');
        root.style.setProperty('--r4to3-anim-speed', '1');
        root.style.setProperty('--r4to3-noise-opacity', '0.03');
      }
    },

    togglePerf() {
      this.state.perfMode = !this.state.perfMode;
      const root = document.documentElement;
      if (this.state.perfMode) {
        root.style.setProperty('--r4to3-spot-blur', '50px');
        root.style.setProperty('--r4to3-anim-speed', '2');
        root.style.setProperty('--r4to3-noise-opacity', '0');
      } else {
        this._detectDevice();
      }
      this._refreshAtmosphere();
      this._save();
    },

    // ============================================================
    // A2 自配色池 API（暴露给控制台/插件）
    // ============================================================
    injectColorPool(customPool) {
      if (!customPool || typeof customPool !== 'object') return;
      if (customPool.dark)   this.colorPool.dark = customPool.dark;
      if (customPool.light)  this.colorPool.light = customPool.light;
      if (customPool.eyecare) this.colorPool.eyecare = customPool.eyecare;
      this._refreshAtmosphere();
    },
    getColorPool() { return JSON.parse(JSON.stringify(this.colorPool)); },

    // ============================================================
    // L2 大气散射光斑
    // ============================================================
    _createSpot(color) {
      const spot = document.createElement('div');
      spot.className = 'r4to3-spot';
      const isLow = this.state.perfMode || this.state.deviceTier === 'low';
      const size = isLow ? 100 + Math.random() * 120 : 140 + Math.random() * 200;
      spot.style.width = size + 'px';
      spot.style.height = size + 'px';
      spot.style.left = (Math.random() * 100) + '%';
      spot.style.top = (Math.random() * 100) + '%';
      spot.style.background = color;
      spot.style.animationDelay = (Math.random() * 6) + 's';
      spot.style.animationDuration = (7 + Math.random() * 7) + 's';
      return spot;
    },

    _refreshAtmosphere() {
      if (!this.el.l2) return;
      this.el.l2.innerHTML = '';
      let count, colors;
      const isLow = this.state.perfMode || this.state.deviceTier === 'low';
      if (this.state.activeMode === 'eyecare') {
        count = isLow ? 4 : 7 + Math.floor(Math.random() * 3);
        colors = this.colorPool.eyecare;
      } else if (this.state.activeMode === 'light') {
        count = isLow ? 2 : 3 + Math.floor(Math.random() * 2);
        colors = this.colorPool.light;
      } else {
        count = isLow ? 1 : 2 + Math.floor(Math.random() * 2);
        colors = this.colorPool.dark;
      }
      for (let i = 0; i < count; i++) {
        this.el.l2.appendChild(this._createSpot(colors[i % colors.length]));
      }
    },

    // ============================================================
    // L3 虚拟太阳光开关
    // ============================================================
    setSunLight(on) { this.state.sunLight = on; if (this.el.l3) this.el.l3.style.opacity = on ? '1' : '0'; this._save(); },

    // ============================================================
    // L4 鼠标反光（缓动跟随）
    // ============================================================
    _bindMouse() {
      let mouseX = window.innerWidth / 2;
      let mouseY = window.innerHeight / 2;
      let curX = mouseX, curY = mouseY;
      let raf = null;

      document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX; mouseY = e.clientY;
        if (this.state.mouseLight && this.state.enabled && !raf) {
          const animate = () => {
            if (!this.state.mouseLight || !this.state.enabled) { raf = null; return; }
            curX += (mouseX - curX) * 0.1;
            curY += (mouseY - curY) * 0.1;
            if (this.el.l4) {
              this.el.l4.style.left = curX + 'px';
              this.el.l4.style.top = curY + 'px';
            }
            if (Math.abs(mouseX - curX) > 0.5 || Math.abs(mouseY - curY) > 0.5) {
              raf = requestAnimationFrame(animate);
            } else {
              raf = null;
            }
          };
          raf = requestAnimationFrame(animate);
        }
      });
    },

    setMouseLight(on) {
      this.state.mouseLight = on;
      if (this.el.l4) this.el.l4.classList.toggle('r4to3-hidden', !on);
      this._save();
    },

    // ============================================================
    // 玻璃通透度 / 模糊 / 视差强度
    // ============================================================
    setGlass(opacity, blur, parallax) {
      if (opacity !== undefined)  this.state.glassOpacity = opacity;
      if (blur !== undefined)     this.state.blurStrength = blur;
      if (parallax !== undefined) this.state.parallaxStrength = parallax;
      const root = document.documentElement;
      root.style.setProperty('--r4to3-glass-opacity', this.state.glassOpacity / 100);
      root.style.setProperty('--r4to3-blur-amount', this.state.blurStrength + 'px');
      root.style.setProperty('--r4to3-parallax-strength', this.state.parallaxStrength / 100);
      this._save();
    },

    // ============================================================
    // 应用全部状态到 DOM
    // ============================================================
    _applyAll() {
      const root = document.documentElement;
      root.dataset.render = this.state.enabled ? '4to3' : 'off';
      root.dataset.r4to3Mode = this.state.activeMode;

      // 玻璃参数
      root.style.setProperty('--r4to3-glass-opacity', this.state.glassOpacity / 100);
      root.style.setProperty('--r4to3-blur-amount', this.state.blurStrength + 'px');
      root.style.setProperty('--r4to3-parallax-strength', this.state.parallaxStrength / 100);

      // 太阳光
      if (this.el.l3) this.el.l3.style.opacity = this.state.sunLight ? '1' : '0';

      // 鼠标光
      if (this.el.l4) this.el.l4.classList.toggle('r4to3-hidden', !this.state.mouseLight);

      // 大气散射
      this._refreshAtmosphere();
    },

    // ============================================================
    // 持久化
    // ============================================================
    _save() {
      try { localStorage.setItem('xiao.render4to3', JSON.stringify(this.state)); } catch (e) {}
    },
    _loadStorage() {
      try {
        const raw = localStorage.getItem('xiao.render4to3');
        if (raw) Object.assign(this.state, JSON.parse(raw));
      } catch (e) {}
    }
  };

  X.render4to3 = R;
})(window.Xiao = window.Xiao || {});
