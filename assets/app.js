// 理論研究者のAIニュース掲示板 — 表示ロジック
// 中身は config.json と issues/*.json。デザインの基準は DESIGN.md。
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const S = { config: null, index: null, issues: {}, current: null, filter: "all", openMemo: null };

  // ---------- 小道具 ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const str = (v) => (typeof v === "string" ? v : "");
  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u)) ? u : null;
  // 日付は「2026年11月10日（火）」の形で出す
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const fmtDate = (d) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(d)); if (!m) return str(d);
    const wd = WD[new Date(+m[1], +m[2] - 1, +m[3]).getDay()];
    return `${+m[1]}年${+m[2]}月${+m[3]}日（${wd}）`;
  };
  const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const getJSON = async (path) => { const r = await fetch(path, { cache: "no-cache" }); if (!r.ok) throw new Error(path + " " + r.status); return r.json(); };
  const notice = (msg) => $("issueHead").replaceChildren(h("div", { class: "notice" }, msg));
  const FX = () => window.NAISFX || null;
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tags = () => (S.config && S.config.tags) || {};
  const cats = () => (S.config && S.config.categories) || {};
  const site = () => (S.config && S.config.site) || {};
  const itemsOf = (d) => (Array.isArray(d && d.items) ? d.items : []);
  const keyOf = (it) => `${S.current.id}__${str(it.id)}`;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  };

  // アイコン（線画SVG）
  const ICONS = {
    share: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    memo: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    phones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z" fill="currentColor" stroke="none"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'
  };
  function icon(name) {
    const t = document.createElement("template");
    t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
    return t.content.firstChild;
  }
  let toastTimer = null;
  function toast(msg) {
    let el = $("toast");
    if (!el) { el = h("div", { class: "toast", id: "toast", role: "status" }); document.body.append(el); }
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.classList.remove("show"); }, 2400);
  }

  // ---------- 設定の反映 ----------
  function applyStyles() {
    const t = Object.entries(tags()).map(([k, x]) =>
      `.tag.t-${k}{color:${x.color || "inherit"}}@media (prefers-color-scheme: dark){.tag.t-${k}{color:${x.colorDark || x.color || "inherit"}}}`).join("");
    const c = Object.entries(cats()).map(([, x], i) =>
      `.c-${i}{--cat:${x.color || "var(--muted)"}}@media (prefers-color-scheme: dark){.c-${i}{--cat:${x.colorDark || x.color || "var(--muted)"}}}`).join("");
    document.head.append(h("style", null, t + c));
  }
  function catClass(name) {
    const i = Object.keys(cats()).indexOf(name); const c = cats()[name];
    return (i >= 0 ? `c-${i}` : "c-none") + " pat-" + ((c && c.pattern) || "dots");
  }
  function applySite() {
    const s = site();
    if (s.title) $("siteTitle").textContent = s.title;
    // 先頭の「NAIS」だけをアプリ名として少し強く見せる
    // 「・」で区切った単位でだけ改行する（途中で折り返さない）
    const parts = str(s.kicker).split(/\s*・\s*/).filter(Boolean);
    $("kicker").replaceChildren(...parts.map((p, i) => {
      const m = i === 0 && /^(NAIS)(.*)$/.exec(p);
      return h("span", { class: "k-part" }, ...(m ? [h("span", { class: "brand" }, m[1]), m[2]] : [p]));
    }));
    $("siteDesc").textContent = str(s.description);
  }

  // ---------- 更新バッジ ----------
  const FRESH_DAYS = 7;
  function daysAgo(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(ymd)); if (!m) return null;
    const then = new Date(+m[1], +m[2] - 1, +m[3]); const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((now - then) / 86400000);
  }
  function relDay(n) { return n <= 0 ? "今日更新" : n === 1 ? "昨日更新" : `${n}日前に更新`; }
  function renderUpdated() {
    const list = (S.index && S.index.issues) || [];
    const upd = str(S.index && S.index.updated) || (list[0] && list[0].published);
    const n = daysAgo(upd); const el = $("updated");
    if (n === null || !el) return;
    const fresh = n <= FRESH_DAYS;
    el.hidden = false; el.className = "updated" + (fresh ? " is-fresh" : "");
    el.replaceChildren(h("span", { class: "dot", "aria-hidden": "true" }),
      h("span", null, relDay(n)), h("time", { datetime: upd }, fmtDate(upd)));
  }

  // ---------- 通知とアイコンの印 ----------
  // sw.js が通知を表示し、アイコンに印を付ける。開いたら印と通知を消す。
  const PUSH = { reg: null, on: false };
  const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  function b64ToBytes(b64) {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  async function clearBadge() {
    try { if (navigator.clearAppBadge) await navigator.clearAppBadge(); } catch (e) {}
    try { if (PUSH.reg) (await PUSH.reg.getNotifications()).forEach((n) => n.close()); } catch (e) {}
  }
  function paintNotify(state) {
    const b = $("notifyBtn"); if (!b) return;
    b.hidden = false;
    b.classList.toggle("is-on", state === "on");
    // スイッチ型：ラベルは常に「新しい号の通知」、右のスイッチで今の状態を見せる
    const label = state === "blocked" ? "通知はブロック中" : state === "ios" ? "通知を受け取るには" : "新しい号の通知";
    const hasSwitch = state === "on" || state === "off";
    // 部品は最初の1回だけ作り、あとはクラスと文字だけ変える（つまみが滑らかに動くように）
    if (!b.querySelector(".nb-label")) b.replaceChildren(icon("bell"), h("span", { class: "nb-label" }), h("span", { class: "switch", "aria-hidden": "true" }, h("span", { class: "knob" })));
    b.querySelector(".nb-label").textContent = label;
    b.querySelector(".switch").hidden = !hasSwitch;
    b.setAttribute("role", hasSwitch ? "switch" : "button");
    b.setAttribute("aria-checked", state === "on" ? "true" : "false");
  }
  const APP_VERSION = "2026-11-14.23";
  async function setupPush() {
    const cfg = (S.config && S.config.push) || {};
    if (!("serviceWorker" in navigator)) return;
    try { PUSH.reg = await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }); PUSH.reg.update().catch(() => {}); } catch (e) { return; }
    clearBadge();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") clearBadge(); });
    if (!cfg.enabled || !cfg.vapidPublicKey || !SB.ok()) return;
    const b = $("notifyBtn");
    if (!("PushManager" in window) || !("Notification" in window)) {
      if (isIOS() && !isStandalone()) { paintNotify("ios"); b.onclick = () => toast("共有メニューから「ホーム画面に追加」し、そこから開くと通知を受け取れます"); }
      return;
    }
    const sub = await PUSH.reg.pushManager.getSubscription().catch(() => null);
    PUSH.on = !!sub && Notification.permission === "granted";
    paintNotify(Notification.permission === "denied" ? "blocked" : PUSH.on ? "on" : "off");
    // まだオフなら、起動後に一度だけベルを揺らして気づかせる
    if (!PUSH.on && Notification.permission !== "denied" && FX()) setTimeout(() => FX().ring(b), 2200);
    b.onclick = async () => {
      if (Notification.permission === "denied") { toast("端末の設定で、このサイトの通知を許可してください"); return; }
      b.disabled = true;
      try {
        if (PUSH.on) {
          const s = await PUSH.reg.pushManager.getSubscription();
          if (s) { await SB.rpc("delete_push_subscription", { p_endpoint: s.endpoint }).catch(() => {}); await s.unsubscribe(); }
          PUSH.on = false; paintNotify("off"); toast("新しい号の通知をオフにしました");
        } else {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") { paintNotify(perm === "denied" ? "blocked" : "off"); return; }
          let s;
          try { s = await PUSH.reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.vapidPublicKey) }); }
          catch (e) { toast(`端末の通知登録に失敗しました（${(e && e.name) || "エラー"}）`); return; }
          const j = s.toJSON();
          try { await SB.rpc("save_push_subscription", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth }); }
          catch (e) { await s.unsubscribe().catch(() => {}); toast(`登録先に保存できませんでした（${String((e && e.message) || "").replace("save_push_subscription ", "")}）`); return; }
          PUSH.on = true; paintNotify("on"); toast("新しい号の通知をオンにしました");
          if (FX()) { FX().ring(b); FX().burst(b); }
        }
      } catch (e) { toast(`通知の設定に失敗しました（${(e && e.name) || ""}: ${(e && e.message) || e}）`); }
      finally { b.disabled = false; }
    };
  }

  // ---------- 表紙（新しい号を初めて開いたときに1回だけ。上にスワイプしてめくる） ----------
  function showCover(force) {
    const d = S.current; if (!d) return;
    const key = "opened:" + d.id;
    if (!force && store.get(key)) return;
    const items = itemsOf(d);
    const lead = items.find((it) => str(it.id) === str(d.leadId)) || items[0];
    const hero = lead ? heroOf(lead) : null;
    const meta = ((S.index && S.index.issues) || []).find((i) => i.id === d.id) || {};
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sheet = h("div", { class: `cover ${lead ? catClass(str(lead.cat)) : ""}`, role: "dialog", "aria-modal": "true", "aria-label": `${issueLabel(meta)}の表紙`, tabindex: "-1" },
      h("span", { class: "cover-bg-wrap", "aria-hidden": "true" }),
      h("div", { class: "cover-body" },
        h("span", { class: "cover-brand" }, "NAIS"),
        h("span", { class: "cover-no" }, issueLabel(meta)),
        meta.published ? h("span", { class: "cover-date" }, fmtDate(meta.published)) : null,
        h("p", { class: "cover-title" }, str(d.title).replace(/^第\d+号\s*/, "")),
        lead ? h("div", { class: "cover-lead" },
          h("span", { class: "cover-lead-lbl" }, str(site().leadLabel) || "今週の注目"),
          hero ? h("span", { class: "cover-hero" }, hero.value) : null,
          h("span", { class: "cover-lead-title" }, str(lead.title))) : null,
        h("span", { class: "cover-count" }, `この号の記事　${items.length}本`)),
      h("button", { type: "button", class: "cover-open" }, h("span", { class: "chev", "aria-hidden": "true" }), "上にスワイプして開く"));
    sheet.querySelector(".cover-bg-wrap").innerHTML = '<svg class="cover-bg" viewBox="0 0 512 512"><path d="M150 360 C150 250 210 190 256 190 C302 190 362 250 362 360" fill="none" stroke="currentColor" stroke-width="22" stroke-linecap="round"/><circle cx="256" cy="150" r="30" fill="currentColor"/><path d="M120 400 H392" stroke="currentColor" stroke-width="18" stroke-linecap="round"/></svg>';
    document.body.append(sheet);
    document.documentElement.classList.add("cover-lock");
    if (FX()) { const hv = sheet.querySelector(".cover-hero"); if (hv) FX().countUp(hv, 650); }
    sheet.focus({ preventScroll: true });

    let done = false;
    const open = () => {
      if (done) return; done = true;
      store.set(key, "1");
      const finish = () => { sheet.remove(); document.documentElement.classList.remove("cover-lock"); };
      if (reduce) { finish(); return; }
      sheet.style.transition = "transform 450ms cubic-bezier(0.3, 0, 0.8, 0.15), opacity 450ms cubic-bezier(0.3, 0, 0.8, 0.15)";   // §7：出ていく＝accel・long
      sheet.style.transform = "translateY(-104%)"; sheet.style.opacity = "0.6";
      setTimeout(finish, 460);
    };
    sheet.querySelector(".cover-open").addEventListener("click", open);
    sheet.addEventListener("keydown", (e) => { if (["Enter", "Escape", " ", "ArrowUp"].includes(e.key)) { e.preventDefault(); open(); } });

    // 指についてくるスワイプ
    let y0 = null, t0 = 0, dy = 0;
    sheet.addEventListener("pointerdown", (e) => { if (done) return; y0 = e.clientY; t0 = performance.now(); dy = 0; sheet.style.transition = "none"; sheet.setPointerCapture(e.pointerId); });
    sheet.addEventListener("pointermove", (e) => {
      if (y0 === null || done) return;
      dy = Math.min(0, e.clientY - y0);
      if (!reduce) sheet.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (y0 === null || done) return;
      const v = -dy / Math.max(1, performance.now() - t0);   // px/ms
      y0 = null;
      if (-dy > innerHeight * 0.22 || (v > 0.5 && -dy > 30)) open();
      else { sheet.style.transition = "transform .3s ease"; sheet.style.transform = "translateY(0)"; }
    };
    sheet.addEventListener("pointerup", end); sheet.addEventListener("pointercancel", end);
  }

  // ---------- 号 ----------
  function renderIssueNav() {
    const list = (S.index && S.index.issues) || [];
    $("issues").replaceChildren(...list.map((i) => h("button", {
      type: "button", "aria-pressed": S.current && S.current.id === i.id ? "true" : "false",
      onclick: () => selectIssue(i.id, true)
    }, issueLabel(i), (daysAgo(i.published) ?? 99) <= FRESH_DAYS ? h("span", { class: "new-badge" }, "NEW") : null)));
  }

  // 号のタブは「第1号」だけ（日付は各記事に出す）
  function issueLabel(i) {
    const no = (str(i.label).match(/第\d+号/) || [""])[0];
    return no || str(i.label) || i.id;
  }

  async function selectIssue(id, push) {
    const list = (S.index && S.index.issues) || [];
    const meta = list.find((i) => i.id === id) || list[0];
    if (!meta) { notice("まだ号がありません。"); return; }
    closeMemo();
    try { if (!S.issues[meta.id]) S.issues[meta.id] = await getJSON(`issues/${meta.id}.json`); }
    catch (e) { notice("この号を読み込めませんでした。時間をおいて開き直してください。"); return; }
    S.current = S.issues[meta.id]; S.current.id = meta.id;
    if (push) { try { history.replaceState(null, "", "#" + meta.id); } catch (e) {} }
    renderIssueNav(); renderHead(); renderFilters(); renderList();
  }

  function renderHead() {
    const d = S.current;
    $("issueHead").replaceChildren(
      h("h2", null, str(d.title)),
      h("span", { class: "period" }, str(d.period)),
      radioBlock(),
      d.editorNote ? h("p", { class: "editor-note" }, str(d.editorNote)) : null,
      tocBlock()
    );
  }

  // ---------- 目次 ----------
  function sortedItems() {
    const leadId = str(S.current.leadId);
    return itemsOf(S.current).slice().sort((a, b) => (str(b.id) === leadId) - (str(a.id) === leadId));
  }
  // 目次：横にスワイプできる小さなカード（カテゴリ・主役の数字・見出し）
  function heroOf(it) {
    const v = Array.isArray(it.visual) ? it.visual.find((x) => x && x.type === "stats") : (it.visual && it.visual.type === "stats" ? it.visual : null);
    const first = v && Array.isArray(v.items) && v.items[0];
    return first ? { value: str(first.value), label: str(first.label) } : null;
  }
  function tocBlock() {
    const items = sortedItems();
    if (!items.length) return null;
    const leadId = str(S.current.leadId);
    return h("nav", { class: "toc", "aria-label": "今週の記事" },
      h("div", { class: "toc-head" }, h("span", { class: "toc-title" }, `この号の記事　${items.length}本`), h("span", { class: "toc-hint", "aria-hidden": "true" }, "横にスワイプ →")),
      h("ol", { class: "toc-strip" }, items.map((it, i) => {
        const key = keyOf(it); const hero = heroOf(it);
        return h("li", { class: `toc-card ${catClass(str(it.cat))}` + (str(it.id) === leadId ? " is-lead" : ""), style: `--i:${i}` },
          h("a", { href: "#" + key, onclick: (e) => { e.preventDefault(); jumpTo(key); } },
            h("span", { class: "toc-top" },
              h("span", { class: "toc-cat" }, h("span", { class: "cat-swatch", "aria-hidden": "true" }), str(it.cat)),
              h("span", { class: "toc-no" }, String(i + 1).padStart(2, "0"))),
            hero ? h("span", { class: "toc-hero" }, hero.value) : null,
            h("span", { class: "toc-text" }, str(it.title))));
      })));
  }
  function jumpTo(key) {
    if (S.filter !== "all" && !document.getElementById(key)) { S.filter = "all"; renderFilters(); renderList(); }
    const el = document.getElementById(key); if (!el) return;
    el.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth" });
    el.classList.remove("landed"); void el.offsetWidth; el.classList.add("landed");
    setTimeout(() => el.classList.remove("landed"), 1400);
    try { history.replaceState(null, "", "#" + key); } catch (e) {}
  }

  // ---------- 絞り込み ----------
  function renderFilters() {
    const f = $("filters"); f.hidden = false;
    const present = [...new Set(itemsOf(S.current).map((it) => str(it.cat)).filter(Boolean))];
    const order = Object.keys(cats());
    present.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    const opts = [["all", "すべて"], ...present.map((c) => [c, c])];
    f.replaceChildren(h("span", { class: "lbl" }, "絞り込み"), ...opts.map(([k, label]) => h("button", {
      type: "button", class: "chip", "aria-pressed": S.filter === k ? "true" : "false",
      onclick: () => { S.filter = k; renderFilters(); renderList(); }
    }, label)));
  }

  // ---------- 図（DESIGN.md §2, §3） ----------
  const VISUALS = {
    stats(v) {
      const items = (Array.isArray(v.items) ? v.items : []).slice(0, 3);
      if (!items.length) return null;
      const [hero, ...rest] = items;
      return h("figure", { class: "vis vis-stats" },
        v.headline ? h("figcaption", { class: "vis-headline" }, str(v.headline)) : null,
        h("div", { class: "stat-row" },
          h("div", { class: "stat-hero" },
            h("span", { class: "stat-value" }, str(hero.value)),
            h("span", { class: "stat-label" }, str(hero.label)),
            hero.note ? h("span", { class: "stat-note" }, str(hero.note)) : null),
          rest.length ? h("dl", { class: "stat-side" }, rest.map((s) => h("div", null,
            h("dt", null, str(s.value)),
            h("dd", null, str(s.label), s.note ? h("span", { class: "stat-note" }, `（${str(s.note)}）`) : null)))) : null));
    },
    bars(v) {
      let items = (Array.isArray(v.items) ? v.items : []).filter((b) => typeof b.value === "number");
      if (!items.length) return null;
      const hiLabel = items[Number.isInteger(v.highlight) ? v.highlight : 0] && items[Number.isInteger(v.highlight) ? v.highlight : 0].label;
      items = items.slice().sort((a, b) => b.value - a.value);
      const max = Math.max(...items.map((b) => b.value), 1);
      const unit = str(v.unit);
      return h("figure", { class: "vis vis-bars" },
        v.title ? h("figcaption", { class: "vis-headline" }, str(v.title)) : null,
        h("div", { class: "bars", role: "list" }, items.map((b) => h("div", { class: "bar-row" + (b.label === hiLabel ? " hi" : ""), role: "listitem" },
          h("div", { class: "bar-text" }, h("span", { class: "bar-label" }, str(b.label)), h("span", { class: "bar-value" }, `${b.value}${unit}`)),
          h("span", { class: "bar-track" }, h("span", { class: "bar-fill", style: `width:${(b.value / max) * 100}%` }))))),
        v.note ? h("p", { class: "vis-note" }, str(v.note)) : null);
    }
  };
  function renderVisual(v) {
    if (!v || typeof v !== "object") return null;
    const els = (Array.isArray(v) ? v : [v]).map((x) => (x && VISUALS[x.type] ? VISUALS[x.type](x) : null)).filter(Boolean);
    return els.length ? h("div", { class: "visual" }, els) : null;
  }

  // ---------- 出典 ----------
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
  function sourceIcon(u, name) {
    const host = hostOf(u);
    const mono = h("span", { class: "src-mono", "aria-hidden": "true" }, (str(name) || host || "?").replace(/^[^A-Za-z0-9ぁ-んァ-ヶ一-龠]+/, "").slice(0, 1).toUpperCase());
    if (S.config.showSourceIcons === false || !host) return mono;
    const img = h("img", { class: "src-icon", alt: "", width: "16", height: "16", loading: "lazy", referrerpolicy: "no-referrer",
      src: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` });
    img.addEventListener("error", () => img.replaceWith(mono));
    return img;
  }

  // ---------- 出典の種類と訂正 ----------
  const SRC_KIND = {
    primary: { label: "一次", title: "当事者の一次発表（論文・公式発表）" },
    news: { label: "報道", title: "報道機関の記事" },
    aggregator: { label: "まとめ", title: "まとめサイト・ニュースレター（補助的な出典）" }
  };
  function correctionBlock(it) {
    const cs = Array.isArray(it.corrections) ? it.corrections : [];
    if (!cs.length) return null;
    return h("div", { class: "corrections", role: "note" },
      h("span", { class: "corr-lbl" }, "訂正"),
      h("ul", null, cs.map((c) => h("li", null, c.date ? h("time", { datetime: str(c.date) }, fmtDate(c.date) + "　") : null, str(c.text)))));
  }

  // ---------- 共有 ----------
  async function share(it) {
    const url = location.href.split("#")[0] + "#" + keyOf(it);
    try {
      if (navigator.share) { await navigator.share({ title: str(it.title), url }); return; }
      await navigator.clipboard.writeText(url); toast("リンクをコピーしました");
    } catch (e) { if (e && e.name !== "AbortError") toast(url); }
  }

  // ---------- 動き：カードの登場（DESIGN.md §7-1） ----------
  // 動き：スクロールに連動して登場・退場（§7-1）。下から入ると起き上がり、戻すとそのまま逆再生で沈む
  // 滑らかさのため：位置は変わったときだけ測り（読む）、毎フレームは書き込みだけにする。
  // CSS変数は子要素すべての再計算を起こすので使わず、transform/opacity を直接書く（合成だけで済む）
  let revealCards = [], revealBound = false, revealRaf = 0, revealDirty = true;
  function revealMeasure() {
    for (const el of revealCards) {
      let y = 0, n = el; while (n) { y += n.offsetTop; n = n.offsetParent; }   // 変形の影響を受けない位置
      el._top = y; el._h = el.offsetHeight;
    }
    revealDirty = false;
  }
  function revealApply(el, p, q) {
    const key = p.toFixed(3) + "|" + q.toFixed(3);
    if (el._k === key) return; el._k = key;
    const r = 1 - p;
    if (p >= 1 && q >= 1) { el.style.transform = "none"; el.style.opacity = "1"; el.style.willChange = ""; }
    else {
      el.style.willChange = "transform, opacity";
      el.style.opacity = (p * (0.35 + 0.65 * q)).toFixed(3);
      el.style.transform = `perspective(900px) translate3d(0,${(r * 110).toFixed(1)}px,0) rotateX(${(r * 18).toFixed(2)}deg) scale(${((0.84 + 0.16 * p) * (0.92 + 0.08 * q)).toFixed(4)})`;
    }
    // 中身の時間差：動いている間だけ書く。止まったら一度だけ消す
    const kids = el.children, moving = r > 0.001;
    if (!moving && !el._kidsMoved) return;
    for (let i = 0; i < kids.length; i++) {
      kids[i].style.transform = moving ? `translate3d(0,${(r * (i === 0 ? 26 : i === 1 ? 44 : 64)).toFixed(1)}px,0)` : "";
    }
    el._kidsMoved = moving;
  }
  function revealTick() {
    revealRaf = 0;
    if (revealDirty) revealMeasure();
    const H = innerHeight, zone = H * 0.3, top = H * 0.22, sy = scrollY;
    for (const el of revealCards) {
      const rt = el._top - sy, rb = rt + el._h;
      if (rt > H + 60) { revealApply(el, 0, 1); continue; }       // まだ下：隠れた状態で待つ
      if (rb < -60) { revealApply(el, 1, 0); continue; }
      let p = Math.min(1, Math.max(0, (H - rt) / zone));
      let q = Math.min(1, Math.max(0, rb / top));
      p = 1 - Math.pow(1 - p, 3); q = 1 - Math.pow(1 - q, 2);
      revealApply(el, p, q);
    }
  }
  function revealSchedule() { if (!revealRaf) revealRaf = requestAnimationFrame(revealTick); }
  function revealRelayout() { revealDirty = true; revealSchedule(); }
  function setupReveal(cards) {
    if (reduceMotion()) return;   // 動きを減らす設定では最初から表示したまま
    revealCards = cards; revealDirty = true;
    cards.forEach((c) => { c.classList.add("reveal"); c._k = null; });
    if (!revealBound) {
      addEventListener("scroll", revealSchedule, { passive: true });
      addEventListener("resize", revealRelayout);
      if ("ResizeObserver" in window) new ResizeObserver(revealRelayout).observe(document.body);   // 詳しく・コメントの開閉で高さが変わったとき
      revealBound = true;
    }
    revealTick();
  }

  // ---------- 動き：開閉（§7-2）。高さが伸び、中身が少しずつずれて現れる ----------
  function expand(body, open, btn) {
    if (btn) { btn.setAttribute("aria-expanded", open ? "true" : "false"); btn.classList.toggle("is-open", open); }
    if (body._anim) { body._anim.cancel(); body._anim = null; }
    if (reduceMotion() || !body.animate) { body.hidden = !open; return; }
    if (open) {
      body.hidden = false;
      const hgt = body.scrollHeight;
      body._anim = body.animate([{ height: "0px", opacity: 0 }, { height: hgt + "px", opacity: 1 }], { duration: 420, easing: "cubic-bezier(0.2, 0, 0, 1)" });
      body._anim.onfinish = () => { body._anim = null; };
      [...body.children].forEach((c, i) => c.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }],
        { duration: 380, delay: 80 + i * 70, easing: "cubic-bezier(0.05, 0.7, 0.1, 1)", fill: "backwards" }));
    } else {
      const hgt = body.offsetHeight;
      body._anim = body.animate([{ height: hgt + "px", opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 260, easing: "cubic-bezier(0.3, 0, 0.8, 0.15)" });
      body._anim.onfinish = () => { body.hidden = true; body._anim = null; };
    }
  }
  function toggleBtn(label, body) {
    const b = h("button", { type: "button", class: "more-toggle", "aria-expanded": "false" }, h("span", null, label), h("span", { class: "plus", "aria-hidden": "true" }));
    b.addEventListener("click", () => expand(body, body.hidden, b));
    return b;
  }

  function animateDetails(det) {
    const sum = det.querySelector("summary"); const body = det.querySelector(".more-body");
    if (!sum || !body) return;
    sum.addEventListener("click", (e) => {
      if (reduceMotion() || !body.animate) return;     // 既定の開閉に任せる
      e.preventDefault();
      if (det.open) {
        const hgt = body.offsetHeight;
        const anim = body.animate([{ height: hgt + "px", opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 250, easing: "cubic-bezier(0.3, 0, 0.8, 0.15)" });
        anim.onfinish = () => { det.open = false; };
      } else {
        det.open = true;
        const hgt = body.offsetHeight;
        body.animate([{ height: "0px", opacity: 0 }, { height: hgt + "px", opacity: 1 }], { duration: 300, easing: "cubic-bezier(0.2, 0, 0, 1)" });
      }
    });
  }

  // ---------- 記事 ----------
  function renderList() {
    const s = site();
    let items = sortedItems();
    const leadId = str(S.current.leadId);
    if (S.filter !== "all") items = items.filter((it) => str(it.cat) === S.filter);
    if (!items.length) { $("list").replaceChildren(h("div", { class: "notice" }, "この条件に合う記事はありません。")); return; }
    $("list").replaceChildren(...items.map((it) => {
      const key = keyOf(it);
      const isLead = str(it.id) === leadId;
      const srcs = Array.isArray(it.sources) ? it.sources : [];
      const url = safeUrl(it.url) || (srcs[0] ? safeUrl(srcs[0].url) : null);
      const showImpl = s.showImplication !== false && it.implication;
      return h("article", { class: `item ${catClass(str(it.cat))}` + (isLead ? " is-lead" : ""), id: key },
        isLead ? h("span", { class: "lead-label" }, str(s.leadLabel) || "今週の注目") : null,
        h("div", { class: "meta" },
          h("span", { class: "cat" }, h("span", { class: "cat-swatch", "aria-hidden": "true" }), str(it.cat)),
          it.date ? h("time", { datetime: str(it.date) }, fmtDate(it.date)) : null,
          h("span", { class: "spacer" }),
          h("button", { type: "button", class: "icon-btn", "aria-label": "この記事を共有", title: "共有", onclick: () => share(it) }, icon("share"))),
        h("h3", null, url ? h("a", { href: url, target: "_blank", rel: "noopener" }, str(it.title)) : str(it.title)),
        renderVisual(it.visual),
        h("p", { class: "summary" }, str(it.summary)),
        it.detail ? (() => {
          const body = h("div", { class: "more-body", hidden: true }, str(it.detail).split(/\n\s*\n/).map((para) => h("p", null, para.trim())));
          return h("div", { class: "more" }, toggleBtn("詳しく", body), body);
        })() : null,
        showImpl ? h("div", { class: "impl" }, h("span", { class: "lbl" }, str(s.implicationLabel) || "理論研究者にとっての意味"), h("p", null, str(it.implication))) : null,
        h("div", { class: "sources" }, "出典", srcs.map((x) => {
          const u = safeUrl(x && x.url);
          const kind = SRC_KIND[x.type];
          return u ? h("a", { class: "src", href: u, target: "_blank", rel: "noopener" }, sourceIcon(u, x.name), h("span", null, str(x.name) || hostOf(u)),
                       kind ? h("span", { class: "src-kind k-" + x.type, title: kind.title }, kind.label) : null)
                   : h("span", { class: "src" }, str(x && x.name));
        })),
        correctionBlock(it),
        reactionBlock(key),
        memoBlock(key)
      );
    }));
    loadReactionCounts(items.map(keyOf));
    loadComments(items.map(keyOf));
    const cards = [...document.querySelectorAll("#list article.item")];
    setupReveal(cards);
    if (FX()) FX().observeVisuals($("list"));
  }

  // ---------- メモ（差し替え可能な部品） ----------
  const MEMO_PROVIDERS = {
    none: { ready: () => false },
    giscus: {
      ready: (c) => !!(c && c.repo && c.repoId && c.categoryId),
      mount(panel, key, c) {
        panel.classList.add("giscus");
        const s = document.createElement("script");
        s.src = "https://giscus.app/client.js"; s.async = true; s.crossOrigin = "anonymous";
        const attrs = {
          repo: c.repo, "repo-id": c.repoId, category: c.category || "Memos", "category-id": c.categoryId,
          mapping: "specific", term: key, strict: "1", "reactions-enabled": c.reactionsEnabled || "1",
          "emit-metadata": "0", "input-position": c.inputPosition || "top",
          theme: "preferred_color_scheme", lang: c.lang || "ja", loading: "lazy"
        };
        for (const [k, v] of Object.entries(attrs)) s.setAttribute("data-" + k, v);
        panel.after(s); panel._script = s;
      },
      unmount(panel) { panel.classList.remove("giscus"); panel.replaceChildren(); if (panel._script) { panel._script.remove(); panel._script = null; } }
    }
  };
  // コメント（Supabase）：ログイン不要。名前は任意で、この端末に覚えておく
  const CM = { byItem: {} };
  const relTime = (iso) => {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return "たった今"; if (d < 3600) return `${Math.floor(d / 60)}分前`; if (d < 86400) return `${Math.floor(d / 3600)}時間前`;
    if (d < 86400 * 7) return `${Math.floor(d / 86400)}日前`; return fmtDate(new Date(iso).toISOString().slice(0, 10));
  };
  async function loadComments(keys) {
    const m = (S.config && S.config.memo) || {};
    if (m.provider !== "supabase" || !SB.ok() || !keys.length) return;
    try {
      const rows = await SB.rpc("list_comments", { items: keys, secret: secret() });
      keys.forEach((k) => { CM.byItem[k] = []; });
      (rows || []).forEach((r) => { (CM.byItem[r.item] ||= []).push(r); });
      keys.forEach(paintComments);
    } catch (e) { /* 読めなければ空のまま */ }
  }
  function paintComments(key) {
    const box = document.querySelector(`.cm[data-key="${CSS.escape(key)}"]`); if (!box) return;
    const list = CM.byItem[key] || [];
    const n = box.querySelector(".cm-n"); if (n) n.textContent = list.length ? String(list.length) : "";
    const ul = box.querySelector(".cm-list");
    ul.replaceChildren(...(list.length ? list.map((c) => h("li", { class: "cm-item" + (c.mine ? " mine" : "") },
      h("div", { class: "cm-head" }, h("span", { class: "cm-name" }, str(c.name) || "匿名"), h("time", { datetime: str(c.created_at) }, relTime(c.created_at)),
        c.mine ? h("button", { type: "button", class: "cm-del", "aria-label": "このコメントを消す", onclick: () => delComment(key, c.id) }, "消す") : null),
      h("p", { class: "cm-body" }, str(c.body)))) : [h("li", { class: "cm-empty" }, "まだコメントはありません")]));
  }
  async function delComment(key, id) {
    try { await SB.rpc("delete_comment", { p_id: id, secret: secret() }); CM.byItem[key] = (CM.byItem[key] || []).filter((c) => c.id !== id); paintComments(key); }
    catch (e) { toast("消せませんでした"); }
  }
  function commentBlock(key) {
    const body = h("div", { class: "cm-body-wrap", hidden: true },
      h("ul", { class: "cm-list" }),
      (() => {
        const name = h("input", { type: "text", class: "cm-name-in", maxlength: "24", placeholder: "名前（なしでもOK）", "aria-label": "名前", value: store.get("cm-name") || "" });
        const text = h("textarea", { class: "cm-text", rows: "2", maxlength: "300", placeholder: "ひとこと", "aria-label": "コメント" });
        const send = h("button", { type: "submit", class: "cm-send" }, "送る");
        const form = h("form", { class: "cm-form" }, text, h("div", { class: "cm-row" }, name, send));
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const t = text.value.trim(); if (!t) { text.focus(); return; }
          store.set("cm-name", name.value.trim() || null);
          send.disabled = true;
          try {
            const id = await SB.rpc("add_comment", { p_item: key, p_name: name.value.trim(), p_body: t, secret: secret() });
            (CM.byItem[key] ||= []).push({ id, item: key, name: name.value.trim(), body: t, created_at: new Date().toISOString(), mine: true });
            text.value = ""; paintComments(key);
            const last = body.querySelector(".cm-item:last-child");
            if (last && !reduceMotion()) last.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(0.05, 0.7, 0.1, 1)" });
          } catch (err) { toast(/too many/.test(String(err && err.message)) ? "少し時間をおいてから書いてください" : "送れませんでした"); }
          finally { send.disabled = false; }
        });
        return form;
      })());
    const btn = h("button", { type: "button", class: "more-toggle cm-toggle", "aria-expanded": "false" }, icon("memo"), h("span", null, "コメント"), h("span", { class: "cm-n" }), h("span", { class: "plus", "aria-hidden": "true" }));
    btn.addEventListener("click", () => expand(body, body.hidden, btn));
    return h("div", { class: "cm", "data-key": key }, btn, body);
  }

  function memoBlock(key) {
    const m = (S.config && S.config.memo) || {};
    if (m.provider === "supabase") return SB.ok() ? commentBlock(key) : null;
    const p = MEMO_PROVIDERS[m.provider] || MEMO_PROVIDERS.none; const c = m[m.provider];
    if (!p.ready(c)) return null;
    const panel = h("div", { class: "memo-panel", id: "memo-" + key, hidden: true });
    const btn = h("button", { type: "button", class: "memo-toggle", "aria-expanded": "false", "aria-controls": "memo-" + key }, icon("memo"), h("span", null, "コメント"));
    btn.addEventListener("click", () => {
      if (S.openMemo && S.openMemo.panel === panel) { closeMemo(); return; }
      closeMemo();
      panel.hidden = false; btn.setAttribute("aria-expanded", "true"); btn.lastChild.textContent = "閉じる";
      p.mount(panel, key, c); S.openMemo = { panel, btn, p };
    });
    return h("div", { class: "memo" }, btn, panel);
  }
  function closeMemo() {
    const o = S.openMemo; if (!o) return;
    if (o.p.unmount) o.p.unmount(o.panel);
    o.panel.hidden = true; o.btn.setAttribute("aria-expanded", "false"); o.btn.lastChild.textContent = "コメント";
    S.openMemo = null;
  }

  // ---------- リアクション ----------
  // config.reactions.provider: "supabase"（全員で集計） / "local"（この端末だけ）
  const R = { counts: {}, mine: {}, secret: null };
  const rcfg = () => (S.config && S.config.reactions) || {};
  const rItems = () => (Array.isArray(rcfg().items) ? rcfg().items : []);
  function secret() {
    if (R.secret) return R.secret;
    let v = store.get("rx-secret");
    if (!v) { v = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""); store.set("rx-secret", v); }
    return (R.secret = v);
  }
  const SB = {
    ok() { const c = rcfg().supabase || {}; return rcfg().provider === "supabase" && c.url && c.anonKey; },
    // 新形式の公開キー（sb_publishable_…）は apikey ヘッダーだけで送る。旧形式の anon キー（JWT）は Authorization にも付ける
    headers(key) {
      const hd = { apikey: key, "Content-Type": "application/json" };
      if (!String(key).startsWith("sb_")) hd.Authorization = `Bearer ${key}`;
      return hd;
    },
    async rpc(fn, body) {
      const c = rcfg().supabase;
      const r = await fetch(`${c.url.replace(/\/(rest\/v1\/?)?$/, "").replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
        method: "POST", headers: SB.headers(c.anonKey), body: JSON.stringify(body) });
      if (!r.ok) throw new Error(fn + " " + r.status);
      // 戻り値のない関数は空の返事（204）になるので、空なら null を返す
      const t = await r.text();
      return t ? JSON.parse(t) : null;
    }
  };
  async function loadReactionCounts(keys) {
    if (!rItems().length || !keys.length) return;
    if (SB.ok()) {
      try {
        const [counts, mine] = await Promise.all([SB.rpc("reaction_counts", { items: keys }), SB.rpc("my_reactions", { items: keys, secret: secret() })]);
        keys.forEach((k) => { R.counts[k] = {}; R.mine[k] = {}; });
        (counts || []).forEach((r) => { (R.counts[r.item] ||= {})[r.emoji] = Number(r.n) || 0; });
        (mine || []).forEach((r) => { (R.mine[r.item] ||= {})[r.emoji] = true; });
      } catch (e) { if (!R.warned) { R.warned = true; toast("リアクションの集計に接続できませんでした"); } }
    } else {
      keys.forEach((k) => {
        R.mine[k] = {}; R.counts[k] = {};
        rItems().forEach((x) => { if (store.get(`rx:${k}:${x.key}`) === "1") { R.mine[k][x.key] = true; R.counts[k][x.key] = 1; } });
      });
    }
    keys.forEach(paintReactions);
  }
  function paintReactions(key) {
    document.querySelectorAll(`.reactions[data-key="${CSS.escape(key)}"] .rx`).forEach((b) => {
      const k = b.dataset.rx; const n = (R.counts[key] || {})[k] || 0; const on = !!(R.mine[key] || {})[k];
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.querySelector(".rx-n").textContent = n ? String(n) : "";
      b.classList.toggle("has", n > 0);
    });
  }
  async function toggleReaction(key, rx) {
    const mine = (R.mine[key] ||= {}); const counts = (R.counts[key] ||= {});
    const on = !mine[rx];
    mine[rx] = on; counts[rx] = Math.max(0, (counts[rx] || 0) + (on ? 1 : -1)); paintReactions(key);
    if (on && !reduceMotion()) {
      const b = document.querySelector(`.reactions[data-key="${CSS.escape(key)}"] .rx[data-rx="${rx}"]`);
      if (b) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); if (FX()) FX().floatEmoji(b, (rItems().find((x) => x.key === rx) || {}).emoji || "✨"); }
    }
    if (SB.ok()) {
      try { const res = await SB.rpc("toggle_reaction", { p_item: key, p_emoji: rx, secret: secret() }); if (typeof res === "boolean" && res !== on) { mine[rx] = res; counts[rx] = Math.max(0, counts[rx] + (res ? 1 : -1)); paintReactions(key); } }
      catch (e) { mine[rx] = !on; counts[rx] = Math.max(0, counts[rx] + (on ? -1 : 1)); paintReactions(key); toast("反応を保存できませんでした"); }
    } else {
      store.set(`rx:${key}:${rx}`, on ? "1" : null);
    }
  }
  function reactionBlock(key) {
    if (!rItems().length) return null;
    return h("div", { class: "reactions", "data-key": key, role: "group", "aria-label": "この記事への反応" },
      // 見た目は絵文字と数だけ。意味（気になる・ショック…）は読み上げと長押しの説明で伝える
      rItems().map((x) => h("button", { type: "button", class: "rx", "data-rx": x.key, "aria-pressed": "false", title: x.label, "aria-label": x.label,
        onclick: () => toggleReaction(key, x.key) },
        h("span", { class: "rx-e", "aria-hidden": "true" }, x.emoji), h("span", { class: "rx-n" }))));
  }

  // ---------- ラジオ ----------
  const player = { audio: null, block: null, visible: true };
  function radioBlock() {
    const r = (S.config && S.config.radio) || {};
    if (r.enabled === false) return null;
    const meta = ((S.index && S.index.issues) || []).find((i) => i.id === S.current.id) || {};
    const a = meta.audio;
    if (!a || !a.src) return null;
    const pc = r.podcast || {};
    const feedUrl = new URL("feed.xml", location.href.split("#")[0]).href;
    if (player.audio) { player.audio.pause(); }
    const audio = h("audio", { controls: true, preload: "none", src: a.src });
    player.audio = audio;
    audio.addEventListener("play", () => {
      if ("mediaSession" in navigator && window.MediaMetadata) {
        try { navigator.mediaSession.metadata = new MediaMetadata({ title: str(S.current.title), artist: str(pc.title) || "AIラジオ", artwork: [{ src: pc.image || "assets/icon-512.png", sizes: "1400x1400", type: "image/png" }] }); } catch (e) {}
      }
      updateMini();
    });
    ["pause", "timeupdate", "ended"].forEach((ev) => audio.addEventListener(ev, updateMini));
    const rateBtns = [1, 1.25, 1.5, 2].map((x) => h("button", {
      type: "button", class: "rate", "aria-pressed": x === 1 ? "true" : "false",
      onclick: (e) => { audio.defaultPlaybackRate = x; audio.playbackRate = x; e.currentTarget.parentElement.querySelectorAll(".rate").forEach((b) => b.setAttribute("aria-pressed", b === e.currentTarget ? "true" : "false")); }
    }, `${x}x`));
    const copyStatus = h("span", { class: "copy-status", "aria-live": "polite" });
    const copyBtn = h("button", { type: "button", class: "copy-btn", onclick: async () => {
      try { await navigator.clipboard.writeText(feedUrl); copyStatus.textContent = "コピーしました"; } catch (e) { copyStatus.textContent = feedUrl; }
    } }, "フィードURLをコピー");
    const block = h("section", { class: "radio", "aria-label": "音声で聴く" },
      h("div", { class: "radio-top" }, h("span", { class: "radio-label" }, icon("phones"), str(r.label) || "耳で聴く"), a.duration ? h("span", { class: "radio-len" }, fmtTime(a.duration)) : null),
      audio,
      h("div", { class: "radio-ctl" }, h("span", { class: "lbl" }, "速度"), rateBtns),
      h("details", { class: "radio-sub" },
        h("summary", null, "ポッドキャストアプリで毎週受け取る"),
        h("p", null, "Apple Podcasts（ライブラリ →「番組をURLでフォロー」）、Pocket Casts、Overcast などに下のURLを登録すると、毎週自動で届き、画面を消しても再生できます。"),
        h("code", { class: "feed-url" }, feedUrl),
        h("div", { class: "radio-ctl" }, copyBtn, copyStatus)),
      r.credit ? h("p", { class: "radio-credit" }, str(r.credit)) : null);
    player.block = block;
    if ("IntersectionObserver" in window) {
      if (player.io) player.io.disconnect();
      player.io = new IntersectionObserver((ents) => { player.visible = ents[0].isIntersecting; updateMini(); });
      player.io.observe(block);
    }
    return block;
  }
  function buildMini() {
    const bar = h("div", { class: "mini", id: "mini", hidden: true, role: "region", "aria-label": "再生中の音声" },
      h("button", { type: "button", class: "mini-play", id: "miniPlay", "aria-label": "再生", onclick: () => { const a = player.audio; if (!a) return; a.paused ? a.play() : a.pause(); } }, icon("play")),
      h("div", { class: "mini-body" },
        h("span", { class: "mini-title", id: "miniTitle" }),
        h("div", { class: "mini-seek", id: "miniSeek", role: "slider", tabindex: "0", "aria-label": "再生位置", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" },
          h("span", { class: "mini-track" }, h("span", { id: "miniBar" })), h("span", { class: "mini-thumb", id: "miniThumb" }))),
      h("span", { class: "mini-time", id: "miniTime" }));
    bar.querySelector(".mini-title").addEventListener("click", () => player.block && player.block.scrollIntoView({ behavior: "smooth", block: "center" }));
    // バーをつかんで再生位置を動かす（指・マウス・キーボード）
    const seek = bar.querySelector("#miniSeek"); let dragging = false;
    const seekTo = (clientX) => {
      const a = player.audio; if (!a || !a.duration) return;
      const r = seek.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      a.currentTime = ratio * a.duration; updateMini();
    };
    seek.addEventListener("pointerdown", (e) => { dragging = true; seek.classList.add("dragging"); seek.setPointerCapture(e.pointerId); seekTo(e.clientX); e.stopPropagation(); });
    seek.addEventListener("pointermove", (e) => { if (dragging) seekTo(e.clientX); });
    const stop = () => { dragging = false; seek.classList.remove("dragging"); };
    seek.addEventListener("pointerup", stop); seek.addEventListener("pointercancel", stop);
    seek.addEventListener("keydown", (e) => {
      const a = player.audio; if (!a || !a.duration) return;
      if (e.key === "ArrowRight") { a.currentTime = Math.min(a.duration, a.currentTime + 10); e.preventDefault(); }
      if (e.key === "ArrowLeft") { a.currentTime = Math.max(0, a.currentTime - 10); e.preventDefault(); }
      updateMini();
    });
    document.body.append(bar);
  }
  function updateMini() {
    const a = player.audio, bar = $("mini"); if (!bar || !a) return;
    const started = a.currentTime > 0 || !a.paused;
    const show = started && !player.visible && !a.ended;
    bar.hidden = false; bar.classList.toggle("on", show); bar.setAttribute("aria-hidden", show ? "false" : "true");
    document.body.classList.toggle("has-mini", show);
    if (!show) return;
    $("miniPlay").replaceChildren(icon(a.paused ? "play" : "pause"));
    $("miniPlay").setAttribute("aria-label", a.paused ? "再生" : "一時停止");
    $("miniTitle").textContent = str(S.current && S.current.title);
    $("miniTime").textContent = `${fmtTime(a.currentTime)} / ${fmtTime(a.duration)}`;
    const pct = a.duration ? (a.currentTime / a.duration) * 100 : 0;
    $("miniBar").style.width = `${pct}%`; $("miniThumb").style.left = `${pct}%`;
    $("miniSeek").setAttribute("aria-valuenow", String(Math.round(pct)));
    $("miniSeek").setAttribute("aria-valuetext", `${fmtTime(a.currentTime)} / ${fmtTime(a.duration)}`);
  }

  // ---------- ホーム画面アプリでは拡大しない ----------
  // iPhone は viewport の指定だけでは拡大を止めないため、ピンチの操作も止める
  if (document.documentElement.classList.contains("standalone")) {
    ["gesturestart", "gesturechange", "gestureend"].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
    document.addEventListener("touchmove", (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  }

  function setupHowto() {
    const ul = $("howto"); if (!ul || ul.dataset.ready) return;
    ul.dataset.ready = "1"; ul.hidden = true;
    const title = ul.parentElement.querySelector("h2"); if (title) title.remove();
    ul.before(toggleBtn("使い方", ul));
  }

  // ---------- 起動 ----------
  async function boot() {
    try { [S.config, S.index] = await Promise.all([getJSON("config.json"), getJSON("issues/index.json")]); }
    catch (e) { notice("データを読み込めませんでした。通信状況を確認して開き直してください。"); return; }
    applySite(); applyStyles(); buildMini(); renderUpdated(); setupPush(); setupHowto();
    const v = $("appVersion"); if (v) v.textContent = `版 ${APP_VERSION}`;
    const list = S.index.issues || [];
    if (!list.length) { notice("まだ号がありません。最初の号が届くまでお待ちください。"); return; }
    const want = location.hash.slice(1).split("__")[0];
    await selectIssue(list.some((i) => i.id === want) ? want : list[0].id, false);
    // 最新号を初めて開いたときだけ表紙を出す（?cover で何度でも確認できる）
    const forceCover = /[?&]cover\b/.test(location.search);
    if (FX()) await FX().opening();
    if (FX()) FX().helix($("helix"));
    if (S.current && (S.current.id === list[0].id || forceCover)) showCover(forceCover);
    const target = location.hash.slice(1);
    if (target.includes("__")) { const el = document.getElementById(target); if (el) el.scrollIntoView(); }
  }
  boot();
})();
