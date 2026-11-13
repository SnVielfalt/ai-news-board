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
    pause: '<path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z" fill="currentColor" stroke="none"/>'
  };
  function icon(name) {
    const t = document.createElement("template");
    t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
    return t.content.firstChild;
  }
  let toastTimer = null;
  function toast(msg) {
    let el = $("toast");
    if (!el) { el = h("div", { class: "toast", id: "toast", role: "status", hidden: true }); document.body.append(el); }
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
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

  // ---------- 号 ----------
  function renderIssueNav() {
    const list = (S.index && S.index.issues) || [];
    $("issues").replaceChildren(...list.map((i) => h("button", {
      type: "button", "aria-pressed": S.current && S.current.id === i.id ? "true" : "false",
      onclick: () => selectIssue(i.id, true)
    }, issueLabel(i))));
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
        return h("li", { class: `toc-card ${catClass(str(it.cat))}` + (str(it.id) === leadId ? " is-lead" : "") },
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
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
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
        it.detail ? h("details", { class: "more" }, h("summary", null, "詳しく"),
          h("div", { class: "more-body" }, str(it.detail).split(/\n\s*\n/).map((para) => h("p", null, para.trim())))) : null,
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
  function memoBlock(key) {
    const m = (S.config && S.config.memo) || {};
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
      return r.json();
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
      rItems().map((x) => h("button", { type: "button", class: "rx", "data-rx": x.key, "aria-pressed": "false", title: x.label,
        onclick: () => toggleReaction(key, x.key) },
        h("span", { class: "rx-e", "aria-hidden": "true" }, x.emoji), h("span", { class: "rx-l" }, x.label), h("span", { class: "rx-n" }))));
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
        h("span", { class: "mini-track" }, h("span", { id: "miniBar" }))),
      h("span", { class: "mini-time", id: "miniTime" }));
    bar.querySelector(".mini-body").addEventListener("click", () => player.block && player.block.scrollIntoView({ behavior: "smooth", block: "center" }));
    document.body.append(bar);
  }
  function updateMini() {
    const a = player.audio, bar = $("mini"); if (!bar || !a) return;
    const started = a.currentTime > 0 || !a.paused;
    const show = started && !player.visible && !a.ended;
    bar.hidden = !show; document.body.classList.toggle("has-mini", show);
    if (!show) return;
    $("miniPlay").replaceChildren(icon(a.paused ? "play" : "pause"));
    $("miniPlay").setAttribute("aria-label", a.paused ? "再生" : "一時停止");
    $("miniTitle").textContent = str(S.current && S.current.title);
    $("miniTime").textContent = `${fmtTime(a.currentTime)} / ${fmtTime(a.duration)}`;
    $("miniBar").style.width = a.duration ? `${(a.currentTime / a.duration) * 100}%` : "0";
  }

  // ---------- 起動 ----------
  async function boot() {
    try { [S.config, S.index] = await Promise.all([getJSON("config.json"), getJSON("issues/index.json")]); }
    catch (e) { notice("データを読み込めませんでした。通信状況を確認して開き直してください。"); return; }
    applySite(); applyStyles(); buildMini();
    const list = S.index.issues || [];
    if (!list.length) { notice("まだ号がありません。最初の号が届くまでお待ちください。"); return; }
    const want = location.hash.slice(1).split("__")[0];
    await selectIssue(list.some((i) => i.id === want) ? want : list[0].id, false);
    const target = location.hash.slice(1);
    if (target.includes("__")) { const el = document.getElementById(target); if (el) el.scrollIntoView(); }
  }
  boot();
})();
