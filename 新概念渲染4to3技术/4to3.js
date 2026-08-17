/**
 * 4to3 Intelligent Light Render Engine
 * 五层光照 + 三层智能决策
 * A1 资源自动适配 → A2 自配色池 → A3 伪3D视差
 */
(function () {
    "use strict";

    // ========== DOM ==========
    const root = document.documentElement;
    const body = document.body;
    const wrapCard = document.getElementById("wrapCard");
    const layerL2 = document.getElementById("layerL2");
    const layerL3 = document.getElementById("layerL3");
    const layerL4 = document.getElementById("layerL4");
    const logBox = document.getElementById("logBox");
    const startTimeDom = document.getElementById("startTime");
    const deviceTierDom = document.getElementById("deviceTier");

    const themeBtn = document.getElementById("themeBtn");
    const eyeCareBtn = document.getElementById("eyeCareBtn");
    const mcFontBtn = document.getElementById("mcFontBtn");
    const toggleLightBtn = document.getElementById("toggleLightBtn");
    const sunLightBtn = document.getElementById("sunLightBtn");
    const perfBtn = document.getElementById("perfBtn");
    const clearLogBtn = document.getElementById("clearLogBtn");
    const transSlider = document.getElementById("transSlider");
    const blurSlider = document.getElementById("blurSlider");
    const parallaxSlider = document.getElementById("parallaxSlider");

    // ========== 状态 ==========
    const state = {
        activeMode: "dark",
        lastNormalTheme: "dark",
        mouseLight: true,
        sunLight: true,
        mcFont: false,
        glassOpacity: 45,
        blurStrength: 18,
        parallaxStrength: 60,
        perfMode: false,
        deviceTier: "high"
    };

    // ========== 默认色池 ==========
    const colorPool = {
        dark: [
            "rgba(110, 178, 255, 0.3)",
            "rgba(64, 214, 204, 0.26)",
            "rgba(146, 156, 255, 0.24)"
        ],
        light: [
            "rgba(255, 210, 160, 0.28)",
            "rgba(180, 210, 255, 0.24)",
            "rgba(255, 230, 190, 0.22)",
            "rgba(200, 230, 240, 0.2)"
        ],
        eyecare: [
            "rgba(140, 250, 180, 0.55)",
            "rgba(90, 230, 140, 0.5)",
            "rgba(45, 200, 100, 0.45)",
            "rgba(30, 160, 80, 0.4)",
            "rgba(190, 255, 170, 0.5)",
            "rgba(120, 210, 160, 0.42)",
            "rgba(25, 130, 70, 0.38)"
        ]
    };

    // ========== 日志 ==========
    function addLog(text) {
        const time = new Date().toLocaleTimeString();
        const line = document.createElement("div");
        line.textContent = `[${time}] ${text}`;
        logBox.appendChild(line);
        logBox.scrollTop = logBox.scrollHeight;
    }

    // ========== A1 资源自动适配 ==========
    function detectDevice() {
        const cores = navigator.hardwareConcurrency || 4;
        const memory = navigator.deviceMemory || 4;
        const isMobile = /Mobi|Android/i.test(navigator.userAgent);
        const isLowEnd = cores <= 4 || memory <= 4 || isMobile;

        if (isLowEnd) {
            state.deviceTier = "low";
            root.style.setProperty("--spot-blur", "60px");
            root.style.setProperty("--anim-speed-multiplier", "1.5");
            root.style.setProperty("--noise-opacity", "0");
            root.style.setProperty("--sun-layers", "1");
            root.style.setProperty("--card-3d-enabled", "0");
        } else if (cores >= 8 && memory >= 8) {
            state.deviceTier = "ultra";
            root.style.setProperty("--spot-blur", "100px");
            root.style.setProperty("--anim-speed-multiplier", "1");
            root.style.setProperty("--noise-opacity", "0.05");
            root.style.setProperty("--sun-layers", "2");
            root.style.setProperty("--card-3d-enabled", "1");
        } else {
            state.deviceTier = "high";
            root.style.setProperty("--spot-blur", "80px");
            root.style.setProperty("--anim-speed-multiplier", "1");
            root.style.setProperty("--noise-opacity", "0.03");
            root.style.setProperty("--sun-layers", "2");
            root.style.setProperty("--card-3d-enabled", "1");
        }

        if (deviceTierDom) {
            const names = { low: "低配流畅模式", high: "高配写实模式", ultra: "旗舰极致模式" };
            deviceTierDom.textContent = names[state.deviceTier];
        }
        addLog(`📊 设备检测：${cores} 核 CPU / ${memory}GB 内存 → ${state.deviceTier === "low" ? "低配" : state.deviceTier === "high" ? "高配" : "旗舰"}模式`);
    }

    // ========== 性能模式切换 ==========
    function togglePerfMode() {
        state.perfMode = !state.perfMode;
        if (state.perfMode) {
            root.style.setProperty("--spot-blur", "50px");
            root.style.setProperty("--anim-speed-multiplier", "2");
            root.style.setProperty("--noise-opacity", "0");
            root.style.setProperty("--card-3d-enabled", "0");
            addLog("⚡ 性能模式开启：降低光斑模糊、加速动画、关闭伪3D");
        } else {
            detectDevice();
            addLog("🖥️ 性能模式关闭：恢复自动检测配置");
        }
        refreshAtmosphere();
    }

    // ========== A2 自调配色池端口 ==========
    window.injectColorPool = function (customPool) {
        if (!customPool || typeof customPool !== "object") {
            addLog("❌ 配色池注入失败：数据格式错误");
            return;
        }
        if (customPool.dark) colorPool.dark = customPool.dark;
        if (customPool.light) colorPool.light = customPool.light;
        if (customPool.eyecare) colorPool.eyecare = customPool.eyecare;
        refreshAtmosphere();
        addLog("🎨 自定义配色池注入成功");
    };

    window.getColorPool = function () {
        return JSON.parse(JSON.stringify(colorPool));
    };

    // ========== L2 大气散射 ==========
    function createSpot(color, index) {
        const spot = document.createElement("div");
        spot.className = "spot";
        const isLow = state.perfMode || state.deviceTier === "low";
        const size = isLow ? 100 + Math.random() * 120 : 140 + Math.random() * 200;
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const delay = Math.random() * 6;
        const duration = 7 + Math.random() * 7;
        spot.style.width = size + "px";
        spot.style.height = size + "px";
        spot.style.left = x + "%";
        spot.style.top = y + "%";
        spot.style.background = color;
        spot.style.animationDelay = delay + "s";
        spot.style.animationDuration = duration + "s";
        return spot;
    }

    function refreshAtmosphere() {
        if (!layerL2) return;
        layerL2.innerHTML = "";
        let count, colors;
        const isLow = state.perfMode || state.deviceTier === "low";
        if (state.activeMode === "eyecare") {
            count = isLow ? 4 : 7 + Math.floor(Math.random() * 3);
            colors = colorPool.eyecare;
        } else if (state.activeMode === "light") {
            count = isLow ? 2 : 3 + Math.floor(Math.random() * 2);
            colors = colorPool.light;
        } else {
            count = isLow ? 1 : 2 + Math.floor(Math.random() * 2);
            colors = colorPool.dark;
        }
        for (let i = 0; i < count; i++) {
            layerL2.appendChild(createSpot(colors[i % colors.length], i));
        }
    }

    // ========== 模式切换 ==========
    function applyBodyClass() {
        body.classList.remove("light-mode", "eyecare-mode");
        if (state.activeMode === "light") body.classList.add("light-mode");
        if (state.activeMode === "eyecare") body.classList.add("eyecare-mode");
    }
    function switchMode(newMode) {
        if (newMode === "eyecare" && state.activeMode !== "eyecare") state.lastNormalTheme = state.activeMode;
        if (newMode !== "eyecare") state.lastNormalTheme = newMode;
        state.activeMode = newMode;
        applyBodyClass();
        refreshAtmosphere();
        saveStorage();
    }
    function toggleNormalTheme() {
        if (state.activeMode === "eyecare") {
            state.lastNormalTheme = state.lastNormalTheme === "dark" ? "light" : "dark";
            saveStorage();
            addLog("已切换护眼底层明暗");
            return;
        }
        switchMode(state.activeMode === "dark" ? "light" : "dark");
    }
    function toggleEyeCare() {
        if (state.activeMode === "eyecare") switchMode(state.lastNormalTheme);
        else switchMode("eyecare");
    }

    // ========== MC 字体 ==========
    function setMcFont(enable) {
        state.mcFont = enable;
        body.classList.toggle("mc-font-on", enable);
        saveStorage();
    }

    // ========== L4 鼠标反光 + A3 伪3D ==========
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let currentX = mouseX;
    let currentY = mouseY;

    document.addEventListener("mousemove", (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        // 伪3D卡片倾斜
        if (wrapCard && state.parallaxStrength > 0 && !state.perfMode && state.deviceTier !== "low") {
            const rect = wrapCard.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const deltaX = (mouseX - centerX) / rect.width;
            const deltaY = (mouseY - centerY) / rect.height;
            const strength = state.parallaxStrength / 100;
            const rotateY = deltaX * 8 * strength;
            const rotateX = -deltaY * 8 * strength;
            wrapCard.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        }
    });

    function updateMouseLight() {
        if (!layerL4) return;
        if (state.mouseLight) {
            layerL4.classList.remove("hidden");
            const ease = 0.1;
            const animate = () => {
                if (!state.mouseLight) return;
                currentX += (mouseX - currentX) * ease;
                currentY += (mouseY - currentY) * ease;
                layerL4.style.left = currentX + "px";
                layerL4.style.top = currentY + "px";
                if (Math.abs(mouseX - currentX) > 0.5 || Math.abs(mouseY - currentY) > 0.5) requestAnimationFrame(animate);
            };
            animate();
        } else {
            layerL4.classList.add("hidden");
        }
    }

    // ========== L3 太阳光 ==========
    function updateSunLight() {
        if (layerL3) layerL3.style.opacity = state.sunLight ? "1" : "0";
    }

    // ========== 玻璃参数 ==========
    function applyGlassParams() {
        state.glassOpacity = parseInt(transSlider.value, 10);
        state.blurStrength = parseInt(blurSlider.value, 10);
        state.parallaxStrength = parseInt(parallaxSlider.value, 10);
        root.style.setProperty("--glass-opacity", state.glassOpacity / 100);
        root.style.setProperty("--blur-amount", state.blurStrength + "px");
        root.style.setProperty("--parallax-strength", state.parallaxStrength / 100);
    }

    // ========== 持久化 ==========
    function saveStorage() {
        try { localStorage.setItem("4to3_render_state", JSON.stringify(state)); } catch (e) {}
    }
    function loadStorage() {
        try {
            const raw = localStorage.getItem("4to3_render_state");
            if (raw) Object.assign(state, JSON.parse(raw));
        } catch (e) {}
    }

    // ========== 初始化 ==========
    function init() {
        loadStorage();
        if (startTimeDom) startTimeDom.textContent = new Date().toLocaleString();

        detectDevice();
        if (state.perfMode) {
            root.style.setProperty("--spot-blur", "50px");
            root.style.setProperty("--anim-speed-multiplier", "2");
            root.style.setProperty("--noise-opacity", "0");
        }

        transSlider.value = state.glassOpacity;
        blurSlider.value = state.blurStrength;
        parallaxSlider.value = state.parallaxStrength;
        transSlider.addEventListener("input", () => { applyGlassParams(); saveStorage(); });
        blurSlider.addEventListener("input", () => { applyGlassParams(); saveStorage(); });
        parallaxSlider.addEventListener("input", () => { applyGlassParams(); saveStorage(); });

        themeBtn.addEventListener("click", toggleNormalTheme);
        eyeCareBtn.addEventListener("click", toggleEyeCare);
        mcFontBtn.addEventListener("click", () => setMcFont(!state.mcFont));
        toggleLightBtn.addEventListener("click", () => { state.mouseLight = !state.mouseLight; updateMouseLight(); saveStorage(); });
        sunLightBtn.addEventListener("click", () => { state.sunLight = !state.sunLight; updateSunLight(); saveStorage(); });
        perfBtn.addEventListener("click", togglePerfMode);
        clearLogBtn.addEventListener("click", () => { logBox.innerHTML = ""; addLog("日志已清空"); });

        applyBodyClass();
        applyGlassParams();
        setMcFont(state.mcFont);
        updateSunLight();
        refreshAtmosphere();
        updateMouseLight();

        addLog("✅ 4to3 智能自然光照渲染引擎启动完成");
        addLog("L1→L5 五层光照 + A1 自动适配 + A2 自配色池 + A3 伪3D");
        addLog("💡 控制台可调用 injectColorPool() 注入自定义配色");
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();