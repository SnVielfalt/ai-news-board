// NAIS のアニメーション（DESIGN.md §7）。どれも「動きを減らす」設定では最終状態をすぐ出す。
// 時間とイージングは Material 3 の値。自動で始まる動きは5秒以内に止まる（WCAG 2.2.2）。
(() => {
  "use strict";
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DECEL = "cubic-bezier(0.05, 0.7, 0.1, 1)";
  const ACCEL = "cubic-bezier(0.3, 0, 0.8, 0.15)";
  const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const cssVar = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();
  const ICON = '<path class="o-arc" d="M150 360 C150 250 210 190 256 190 C302 190 362 250 362 360" fill="none" stroke="#7db4dc" stroke-width="28" stroke-linecap="round"/>' +
               '<circle class="o-dot" cx="256" cy="150" r="34" fill="#c9a64a"/>' +
               '<path class="o-line" d="M120 400 H392" stroke="#f3f4f1" stroke-width="22" stroke-linecap="round"/>';

  // ---- オープニング（1セッション1回、タップで飛ばせる） ----
  function opening() {
    return new Promise((resolve) => {
      let seen = false;
      try { seen = sessionStorage.getItem("nais-opening") === "1"; sessionStorage.setItem("nais-opening", "1"); } catch (e) {}
      if (seen || reduce()) { resolve(); return; }
      const ov = document.createElement("div");
      ov.className = "opening";
      ov.innerHTML = `<div class="o-mark"><svg viewBox="0 0 512 512" aria-hidden="true">${ICON}</svg></div><div class="o-word" aria-label="NAIS">${"NAIS".split("").map((c, i) => `<span style="--i:${i}">${c}</span>`).join("")}</div><div class="o-sub">News on AI for Science</div>`;
      document.body.append(ov);
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        const a = ov.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.06)" }], { duration: 380, easing: ACCEL, fill: "forwards" });
        a.onfinish = () => { ov.remove(); resolve(); };
      };
      ov.addEventListener("click", finish);
      setTimeout(finish, 1700);
    });
  }

  // ---- ヘッダーの背景：らせん（ジェネラティブ）。約5秒回って止まる ----
  function helix(canvas) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, devicePixelRatio || 1);
    let W = 0, H = 0;
    const size = () => { const r = canvas.getBoundingClientRect(); W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size();
    const color = cssVar("--accent") || "#1f5f8b";
    const gold = "#c9a64a";
    const draw = (phase) => {
      ctx.clearRect(0, 0, W, H);
      const N = 26, cx = W * 0.78, R = Math.min(46, W * 0.12), top = -10, step = (H + 20) / N, k = 0.42;
      const pts = [];
      for (let i = 0; i < N; i++) {
        const y = top + i * step;
        for (let s = 0; s < 2; s++) {
          const a = phase + i * k + s * Math.PI;
          pts.push({ x: cx + R * Math.sin(a), y, z: Math.cos(a), s, i });
        }
      }
      // 横木（らせんの段）
      ctx.lineWidth = 1;
      for (let i = 0; i < N; i += 2) {
        const p = pts[i * 2], q = pts[i * 2 + 1];
        ctx.strokeStyle = color; ctx.globalAlpha = 0.06;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      // 点（奥は小さく薄く、手前は大きく濃く）
      pts.sort((a, b) => a.z - b.z).forEach((p) => {
        const d = (p.z + 1) / 2;
        ctx.globalAlpha = 0.06 + d * 0.22;
        ctx.fillStyle = p.s ? gold : color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 + d * 3.2, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    };
    if (reduce()) { draw(0.6); return; }
    const t0 = performance.now(), DUR = 5000;
    let phase = 0, last = t0;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / DUR);
      const speed = 0.0032 * (1 - easeOut(t));          // だんだん遅くなって止まる
      phase += speed * (now - last); last = now;
      draw(phase);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    addEventListener("resize", () => { size(); draw(phase); }, { passive: true });
  }

  // ---- 数字のカウントアップ ----
  function countUp(el, delay = 0) {
    if (!el || el.dataset.counted) return;
    el.dataset.counted = "1";
    const text = el.textContent;
    const m = /(\d[\d,]*(?:\.\d+)?)/.exec(text);
    if (!m || reduce()) return;
    const raw = m[1], target = parseFloat(raw.replace(/,/g, ""));
    if (!isFinite(target) || target === 0) return;
    const dec = (raw.split(".")[1] || "").length, comma = raw.includes(",");
    const pre = text.slice(0, m.index), post = text.slice(m.index + raw.length);
    const fmt = (v) => { let s = v.toFixed(dec); if (comma) { const [a, b] = s.split("."); s = a.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (b ? "." + b : ""); } return s; };
    const DUR = 1100; let t0 = null;
    el.textContent = pre + fmt(0) + post;
    const tick = (now) => {
      if (t0 === null) t0 = now + delay;
      const t = Math.max(0, Math.min(1, (now - t0) / DUR));
      el.textContent = pre + fmt(target * easeOut(t)) + post;
      if (t < 1) requestAnimationFrame(tick); else el.textContent = text;
    };
    requestAnimationFrame(tick);
  }

  // ---- 図：画面に入ったら数字を数え、棒を伸ばす ----
  function observeVisuals(root) {
    if (!root || reduce() || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((ents) => {
      ents.filter((e) => e.isIntersecting).forEach((e) => {
        io.unobserve(e.target);
        const v = e.target;
        v.querySelectorAll(".stat-hero .stat-value").forEach((el) => countUp(el));
        v.querySelectorAll(".stat-side dt").forEach((el, i) => countUp(el, 120 + i * 80));
        v.querySelectorAll(".bar-fill").forEach((el, i) => {
          const w = el.style.width; el.style.transition = "none"; el.style.width = "0%";
          requestAnimationFrame(() => requestAnimationFrame(() => {
            el.style.transition = `width 800ms ${DECEL} ${i * 90}ms`; el.style.width = w;
          }));
        });
      });
    }, { threshold: 0.35 });
    root.querySelectorAll(".vis").forEach((v) => io.observe(v));
  }

  // ---- ベルを揺らす ----
  function ring(btn) {
    const svg = btn && btn.querySelector("svg"); if (!svg || reduce()) return;
    svg.animate([{ transform: "rotate(0)" }, { transform: "rotate(18deg)" }, { transform: "rotate(-15deg)" }, { transform: "rotate(10deg)" }, { transform: "rotate(-6deg)" }, { transform: "rotate(0)" }],
      { duration: 900, easing: "ease-in-out", transformOrigin: "50% 10%" });
  }

  // ---- 粒がはじける ----
  function burst(el, colors = ["#2f8a52", "#c9a64a", "#7db4dc", "#e08aa6"]) {
    if (!el || reduce()) return;
    const r = el.getBoundingClientRect(); const cx = r.left + r.width * 0.2, cy = r.top + r.height / 2;
    for (let i = 0; i < 12; i++) {
      const p = document.createElement("span"); p.className = "fx-dot";
      p.style.left = cx + "px"; p.style.top = cy + "px"; p.style.background = colors[i % colors.length];
      document.body.append(p);
      const ang = (Math.PI * 2 * i) / 12 + Math.random() * 0.4, dist = 26 + Math.random() * 22;
      const a = p.animate([{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(0.3)`, opacity: 0 }],
        { duration: 650 + Math.random() * 200, easing: DECEL, fill: "forwards" });
      a.onfinish = () => p.remove();
    }
  }

  // ---- 絵文字が浮かぶ ----
  function floatEmoji(el, emoji) {
    if (!el || reduce()) return;
    const r = el.getBoundingClientRect();
    const s = document.createElement("span"); s.className = "fx-float"; s.textContent = emoji;
    s.style.left = (r.left + 14) + "px"; s.style.top = (r.top + r.height / 2) + "px";
    document.body.append(s);
    const a = s.animate([{ transform: "translate(-50%,-50%) scale(0.8)", opacity: 0 }, { transform: "translate(-50%,-90%) scale(1.3)", opacity: 1, offset: 0.3 }, { transform: "translate(-50%,-260%) scale(1.5)", opacity: 0 }],
      { duration: 900, easing: DECEL, fill: "forwards" });
    a.onfinish = () => s.remove();
  }

  window.NAISFX = { reduce, opening, helix, countUp, observeVisuals, ring, burst, floatEmoji, SPRING };
})();
