// 理論屋のAIニュース掲示板 — 表示ロジック
// 中身は config.json と issues/*.json にあり、このファイルを触らずに号・タグ・メモ方式を変えられます。
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const S = { config: null, index: null, issues: {}, current: null, filter: "all", openMemo: null };

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
  const fmtDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(d)); return m ? `${+m[2]}/${+m[3]}` : str(d); };
  const getJSON = async (path) => { const r = await fetch(path, { cache: "no-cache" }); if (!r.ok) throw new Error(path + " " + r.status); return r.json(); };
  const notice = (msg) => $("issueHead").replaceChildren(h("div", { class: "notice" }, msg));
  const tags = () => (S.config && S.config.tags) || {};

  // タグ色を config から CSS に反映
  function applyTagColors() {
    const css = Object.entries(tags()).map(([k, t]) =>
      `.tag.t-${k}{color:${t.color || "inherit"}}@media (prefers-color-scheme: dark){.tag.t-${k}{color:${t.colorDark || t.color || "inherit"}}}`).join("");
    document.head.append(h("style", null, css));
  }

  function applySite() {
    const s = (S.config && S.config.site) || {};
    if (s.title) { $("siteTitle").textContent = s.title; }
    $("kicker").textContent = str(s.kicker);
    $("siteDesc").textContent = str(s.description);
  }

  // ---------- 号 ----------
  function renderIssueNav() {
    const list = (S.index && S.index.issues) || [];
    $("issues").replaceChildren(...list.map((i) => h("button", {
      type: "button", "aria-pressed": S.current && S.current.id === i.id ? "true" : "false",
      onclick: () => selectIssue(i.id, true)
    }, str(i.label) || i.id)));
  }

  async function selectIssue(id, push) {
    const list = (S.index && S.index.issues) || [];
    const meta = list.find((i) => i.id === id) || list[0];
    if (!meta) { notice("まだ号がありません。"); return; }
    closeMemo();
    try {
      if (!S.issues[meta.id]) S.issues[meta.id] = await getJSON(`issues/${meta.id}.json`);
    } catch (e) { notice("この号を読み込めませんでした。時間をおいて開き直してください。"); return; }
    S.current = S.issues[meta.id]; S.current.id = meta.id;
    if (push) { try { history.replaceState(null, "", "#" + meta.id); } catch (e) {} }
    renderIssueNav(); renderHead(); renderFilters(); renderList();
  }

  function renderHead() {
    const d = S.current;
    $("issueHead").replaceChildren(
      h("h2", null, str(d.title)),
      h("span", { class: "period" }, str(d.period)),
      d.editorNote ? h("p", { class: "editor-note" }, str(d.editorNote)) : null
    );
  }

  function renderFilters() {
    const f = $("filters"); f.hidden = false;
    const opts = [["all", "すべて"], ...Object.entries(tags()).map(([k, t]) => [k, `${t.icon || ""} ${t.label || k}`.trim()])];
    f.replaceChildren(h("span", { class: "lbl" }, "絞り込み"), ...opts.map(([k, label]) => h("button", {
      type: "button", class: "chip", "aria-pressed": S.filter === k ? "true" : "false",
      onclick: () => { S.filter = k; renderFilters(); renderList(); }
    }, label)));
  }

  function renderList() {
    const d = S.current; const site = S.config.site || {};
    let items = Array.isArray(d.items) ? d.items.slice() : [];
    const leadId = str(d.leadId);
    items.sort((a, b) => (str(b.id) === leadId) - (str(a.id) === leadId));
    if (S.filter !== "all") items = items.filter((it) => Array.isArray(it.tags) && it.tags.includes(S.filter));
    if (!items.length) { $("list").replaceChildren(h("div", { class: "notice" }, "この条件に合う記事はありません。")); return; }
    $("list").replaceChildren(...items.map((it) => {
      const key = `${d.id}__${str(it.id)}`;
      const isLead = str(it.id) === leadId;
      const srcs = Array.isArray(it.sources) ? it.sources : [];
      const url = safeUrl(it.url) || (srcs[0] ? safeUrl(srcs[0].url) : null);
      const tagEls = (Array.isArray(it.tags) ? it.tags : []).filter((t) => tags()[t])
        .map((t) => h("span", { class: "tag t-" + t }, `${tags()[t].icon || ""} ${tags()[t].label || t}`.trim()));
      return h("article", { class: "item" + (isLead ? " is-lead" : ""), id: key },
        isLead ? h("span", { class: "lead-label" }, str(site.leadLabel) || "今週の1本") : null,
        h("div", { class: "meta" }, h("span", { class: "cat" }, str(it.cat)), it.date ? h("time", { datetime: str(it.date) }, fmtDate(it.date)) : null, tagEls),
        h("h3", null, url ? h("a", { href: url, target: "_blank", rel: "noopener" }, str(it.title)) : str(it.title)),
        h("p", { class: "summary" }, str(it.summary)),
        it.detail ? h("p", { class: "detail" }, str(it.detail)) : null,
        h("div", { class: "impl" }, h("span", { class: "lbl" }, str(site.implicationLabel) || "理論屋にとっての意味"), h("p", null, str(it.implication))),
        h("div", { class: "sources" }, "出典：", srcs.map((s) => {
          const u = safeUrl(s && s.url); return u ? h("a", { href: u, target: "_blank", rel: "noopener" }, str(s.name) || u) : h("span", null, str(s && s.name));
        })),
        memoBlock(key, str(it.title))
      );
    }));
  }

  // ---------- メモ（差し替え可能な部品） ----------
  // config.memo.provider で方式を切り替え。新しい方式は MEMO_PROVIDERS に1つ足すだけ。
  const MEMO_PROVIDERS = {
    none: { ready: () => false },
    giscus: {
      ready: (c) => !!(c && c.repo && c.repoId && c.categoryId),
      mount(panel, key, c) {
        panel.classList.add("giscus");
        const s = document.createElement("script");
        s.src = "https://giscus.app/client.js";
        s.async = true; s.crossOrigin = "anonymous";
        const attrs = {
          repo: c.repo, "repo-id": c.repoId, category: c.category || "Memos", "category-id": c.categoryId,
          mapping: "specific", term: key, strict: "1", "reactions-enabled": c.reactionsEnabled || "1",
          "emit-metadata": "0", "input-position": c.inputPosition || "top",
          theme: "preferred_color_scheme", lang: c.lang || "ja", loading: "lazy"
        };
        for (const [k, v] of Object.entries(attrs)) s.setAttribute("data-" + k, v);
        panel.after(s);
        panel._script = s;
      },
      unmount(panel) { panel.classList.remove("giscus"); panel.replaceChildren(); if (panel._script) { panel._script.remove(); panel._script = null; } }
    }
  };

  function memoCfg() {
    const m = (S.config && S.config.memo) || {};
    const p = MEMO_PROVIDERS[m.provider] || MEMO_PROVIDERS.none;
    return { m, p, c: m[m.provider] };
  }

  function memoBlock(key) {
    const { m, p, c } = memoCfg();
    if (!p.ready(c)) return h("div", { class: "memo" }, h("p", { class: "memo-off" }, "メモ機能は準備中です。"));
    const panel = h("div", { class: "memo-panel", id: "memo-" + key, hidden: true });
    const btn = h("button", { type: "button", class: "memo-toggle", "aria-expanded": "false", "aria-controls": "memo-" + key }, "メモを見る・書く");
    btn.addEventListener("click", () => {
      if (S.openMemo && S.openMemo.panel === panel) { closeMemo(); return; }
      closeMemo();
      panel.hidden = false; btn.setAttribute("aria-expanded", "true"); btn.textContent = "メモを閉じる";
      p.mount(panel, key, c);
      S.openMemo = { panel, btn, p };
    });
    return h("div", { class: "memo" }, btn, m.hint ? h("p", { class: "memo-hint" }, str(m.hint)) : null, panel);
  }

  // giscus は1ページに1つしか同時に動かないため、開くのは常に1記事だけ
  function closeMemo() {
    const o = S.openMemo; if (!o) return;
    if (o.p.unmount) o.p.unmount(o.panel);
    o.panel.hidden = true; o.btn.setAttribute("aria-expanded", "false"); o.btn.textContent = "メモを見る・書く";
    S.openMemo = null;
  }

  // ---------- 月次ふりかえり ----------
  function renderReviews() {
    const rs = (S.index && Array.isArray(S.index.reviews)) ? S.index.reviews : [];
    if (!rs.length) {
      $("reviews").replaceChildren(h("div", { class: "review" }, h("h2", null, "月次ふりかえり"),
        h("p", null, "毎月末に、その月の📅・🧭の記事とみんなのメモをもとに「研究計画・キャリアについての問い」をまとめてここに載せます。")));
      return;
    }
    $("reviews").replaceChildren(...rs.map((r) => h("div", { class: "review" },
      h("h2", null, str(r.title) || "月次ふりかえり"),
      r.body ? h("p", null, str(r.body)) : null,
      Array.isArray(r.questions) && r.questions.length ? h("ol", null, r.questions.map((q) => h("li", null, str(q)))) : null)));
  }

  // ---------- 起動 ----------
  async function boot() {
    try {
      [S.config, S.index] = await Promise.all([getJSON("config.json"), getJSON("issues/index.json")]);
    } catch (e) { notice("データを読み込めませんでした。通信状況を確認して開き直してください。"); return; }
    applySite(); applyTagColors(); renderReviews();
    const list = S.index.issues || [];
    if (!list.length) { notice("まだ号がありません。最初の号が届くまでお待ちください。"); return; }
    const want = location.hash.slice(1).split("__")[0];
    await selectIssue(list.some((i) => i.id === want) ? want : list[0].id, false);
    const target = location.hash.slice(1);
    if (target.includes("__")) { const el = document.getElementById(target); if (el) el.scrollIntoView(); }
  }
  boot();
})();
