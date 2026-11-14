// 新しい号が追加されたら、登録している端末に通知を送る（GitHub Actions から実行）。
//   node tools/notify.mjs <前の issues/index.json> <今の issues/index.json>
// 必要な環境変数: VAPID_PRIVATE_KEY, PUSH_ADMIN_TOKEN（GitHub の Secrets）
import fs from "node:fs";
import webpush from "web-push";

const args = process.argv.slice(2);
const TEST = args.includes("--test");
const [prevPath, curPath] = args.filter((a) => a !== "--test");
const cfg = JSON.parse(fs.readFileSync("config.json", "utf8"));
const cur = JSON.parse(fs.readFileSync(curPath, "utf8"));
let prevIds = new Set();
try { prevIds = new Set(JSON.parse(fs.readFileSync(prevPath, "utf8")).issues.map((i) => i.id)); } catch { /* 初回 */ }
// --test のときは最新号でテスト通知を送る
const added = TEST ? (cur.issues || []).slice(0, 1) : (cur.issues || []).filter((i) => !prevIds.has(i.id));
if (!added.length) { console.log("新しい号はありません。通知しません。"); process.exit(0); }

const { VAPID_PRIVATE_KEY, PUSH_ADMIN_TOKEN } = process.env;
if (!VAPID_PRIVATE_KEY || !PUSH_ADMIN_TOKEN) { console.error("Secrets（VAPID_PRIVATE_KEY / PUSH_ADMIN_TOKEN）が未設定です。"); process.exit(1); }
const site = cfg.radio?.podcast?.siteUrl || "https://snvielfalt.github.io/ai-news-board/";
webpush.setVapidDetails(site, cfg.push.vapidPublicKey, VAPID_PRIVATE_KEY);

const sb = cfg.reactions.supabase;
const base = sb.url.replace(/\/(rest\/v1\/?)?$/, "").replace(/\/$/, "");
const headers = { apikey: sb.anonKey, "Content-Type": "application/json" };
if (!String(sb.anonKey).startsWith("sb_")) headers.Authorization = `Bearer ${sb.anonKey}`;
const rpc = async (fn, body) => {
  const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
};

const issue = added[0];
let title = issue.label || "新しい号";
try { title = JSON.parse(fs.readFileSync(`issues/${issue.id}.json`, "utf8")).title || title; } catch {}
const payload = JSON.stringify(TEST
  ? { title: "NAIS テスト通知", body: "通知は正しく届いています。", url: site, tag: "nais-test" }
  : { title: `NAIS ${issue.label || ""}が届きました`.replace(/\s+/g, " "), body: title, url: `${site}#${issue.id}`, tag: `nais-${issue.id}` });

const subs = await rpc("list_push_subscriptions", { token: PUSH_ADMIN_TOKEN });
console.log(`登録している端末: ${(subs || []).length} 台`);
let ok = 0, gone = 0, fail = 0;
for (const s of subs || []) {
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 * 3 });
    ok++;
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) { gone++; await rpc("delete_push_subscription", { p_endpoint: s.endpoint }).catch(() => {}); }
    else { fail++; console.error("送信失敗:", e.statusCode || "", e.body || e.message); }
  }
}
console.log(`通知: 成功 ${ok} 件、無効な登録を削除 ${gone} 件、失敗 ${fail} 件（対象: ${issue.id}）`);
