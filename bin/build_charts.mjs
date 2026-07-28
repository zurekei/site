#!/usr/bin/env node
/* 指標ページ ビルダー
 *
 *   chart/<key>.html   … 指標ごとの本体（数値の実体つき）
 *   chart/index.html   … 8指標へのハブ（sitemap 以外の発見経路）
 *
 * 使い方:
 *   node bin/build_charts.mjs           # 生成する
 *   node bin/build_charts.mjs --check   # 生成物が最新かだけ見る（書かない）
 *
 * ■ なぜ生成するのか
 *   8指標は長らく chart.html 1ファイルを ?m= で共有していた。クエリ文字列では
 *   ファイルを出し分けられないので、本文は空（"—" と "----"）のまま JS が描く形に
 *   なっていた。JSを実行しないクローラ（GPTBot / ClaudeBot 系のほとんど）にとっては
 *   読む中身が無く、検索側では8URLが1件に畳まれる。指標ごとに実ファイルを持たせる
 *   ことでしか、この2つは同時に直らない。
 *
 * ■ なぜ METRICS をこちらに書き写さないのか
 *   指標定義と数値の整形規則は chart.js にある。ビルド側に複製すると、いつか必ず
 *   ズレて「表とグラフが同じ年度に違う数字を出す」状態になる。ズレの記録を名乗る
 *   サイトでそれは起こしてはいけない。なので chart.js / csv.js をそのまま評価して
 *   本物の METRICS と本物の整形関数を取り込む。表とグラフは定義上一致する。
 *
 * ■ 陳腐化について
 *   生成物は data/*.csv に依存するので、CSVを直したら再生成が要る。手順の記憶に
 *   任せると必ず忘れるため、bin/deploy.sh が --check で止める。
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(HERE, "..");
const OUT_DIR = path.join(SITE_DIR, "chart");
const SITE = "https://zurekei.org";

// style.css / chart.js のキャッシュバスター。ページ側の ?v= と揃える。
const ASSET_V = "20260731c";

/* ── chart.js / csv.js を「本物のまま」取り込む ───────────────────── */

function loadRuntime() {
  const csvSrc = fs.readFileSync(path.join(SITE_DIR, "csv.js"), "utf8");
  const chartSrc = fs.readFileSync(path.join(SITE_DIR, "chart.js"), "utf8");

  // chart.js はブラウザ用で、最後の main() だけが DOM に触る。それより上は
  // 定数と整形関数だけなので、この1行を落とせば Node でそのまま評価できる。
  // 見つからなくなったら「たまたま動いた」状態で生成を続けず、ここで止める。
  const stripped = chartSrc.replace(/\bmain\(\);\s*$/, "");
  if (stripped === chartSrc) {
    throw new Error("chart.js の末尾に main(); が見つからない。構造が変わった可能性がある");
  }

  const names = [
    // csv.js
    "parseCSV", "toNum", "computeGapStats", "escapeHTML", "safeUrl",
    // chart.js
    "T", "METRICS", "fmtFY", "gapLabelText", "gapUnitSuffix",
    "gapSummaryText", "fmtVal", "extractSourceUrl", "extractEventNote",
  ];
  const ctx = { __out: null };
  vm.runInNewContext(`${csvSrc}\n${stripped}\n__out = { ${names.join(", ")} };`, ctx, {
    filename: "zurekei-runtime.js",
  });

  const missing = names.filter((n) => ctx.__out[n] === undefined);
  if (missing.length) throw new Error(`取り込めなかった定義: ${missing.join(", ")}`);
  return ctx.__out;
}

const R = loadRuntime();
const { METRICS, T, escapeHTML, safeUrl, toNum, parseCSV } = R;

/* ── データ ───────────────────────────────────────────────── */

function readRows(metric) {
  // METRICS の csv は "/data/x.csv"（ページがサブディレクトリに来たので
  // ルート絶対にしてある）。ディスク上は site/ からの相対で読む。
  const rel = metric.csv.replace(/^\//, "");
  const rows = parseCSV(fs.readFileSync(path.join(SITE_DIR, rel), "utf8"));
  return rows
    .map((r) => ({
      year: Number(r.fiscal_year),
      forecastVal: toNum(r[metric.forecastCol]),
      actualVal: toNum(r[metric.actualCol]),
      forecastSourceUrl: R.extractSourceUrl(r[metric.forecastSourceCol], metric.forecastSourceLabel),
      actualSourceUrl: R.extractSourceUrl(r[metric.actualSourceCol], metric.actualSourceLabel),
      notes: r.notes || "",
    }))
    .sort((a, b) => a.year - b.year);
}

/* ── 表 ──────────────────────────────────────────────────── */

// 数値セルの文言は chart.js の render() と同じ規則で作る（関数も同じものを使う）。
// 表とグラフで丸めや符号が違って見えることが無いようにするため。
function cellForecast(metric, r) {
  return r.forecastVal !== null
    ? { text: R.fmtVal(r.forecastVal, metric.unit, metric.signed), ph: null }
    : { text: R.gapLabelText(metric, "ja"), ph: "gap" };
}

function cellActual(metric, r, lastActualYear) {
  if (r.actualVal !== null) return { text: R.fmtVal(r.actualVal, metric.unit, metric.signed), ph: null };
  return r.year > lastActualYear
    ? { text: T.ja.actualPending, ph: "pending" }
    : { text: T.ja.actualUnavailable, ph: "unavailable" };
}

function cellGap(metric, r) {
  if (r.forecastVal === null || r.actualVal === null) return "—";
  const diff = r.actualVal - r.forecastVal;
  return `${diff > 0 ? "+" : ""}${diff.toFixed(1)}${R.gapUnitSuffix(metric)}`;
}

function sourceCell(r) {
  const parts = [];
  const f = safeUrl(r.forecastSourceUrl);
  const a = safeUrl(r.actualSourceUrl);
  if (f) parts.push(`<a href="${escapeHTML(f)}" target="_blank" rel="noopener" data-src="forecast">見通し</a>`);
  if (a) parts.push(`<a href="${escapeHTML(a)}" target="_blank" rel="noopener" data-src="actual">実績</a>`);
  return parts.join(" ");
}

function buildTable(metric, rows) {
  const actuals = rows.filter((r) => r.actualVal !== null);
  const lastActualYear = actuals.length ? actuals[actuals.length - 1].year : -Infinity;

  const body = rows
    .map((r) => {
      const f = cellForecast(metric, r);
      const a = cellActual(metric, r, lastActualYear);
      const phAttr = (c) => (c.ph ? ` data-ph="${c.ph}"` : "");
      const tr =
        `      <tr>\n` +
        `        <th scope="row" class="mono" data-year="${r.year}">${escapeHTML(R.fmtFY(r.year, "ja"))}</th>\n` +
        `        <td class="mono"${phAttr(f)}>${escapeHTML(f.text)}</td>\n` +
        `        <td class="mono"${phAttr(a)}>${escapeHTML(a.text)}</td>\n` +
        `        <td class="mono">${escapeHTML(cellGap(metric, r))}</td>\n` +
        `        <td class="data-table-src">${sourceCell(r)}</td>\n` +
        `      </tr>`;
      // 実績側の注記だけを出す（[見通し原文] 等は転記者向けの控えなので出さない）。
      // chart.js の readout と同じ extractEventNote に判断を委ねている。
      const note = R.extractEventNote(r.notes);
      if (!note) return tr;
      // 注記は一次資料からの転記そのままなので日本語のみ。EN に切り替えても
      // 翻訳しない（訳を用意していないのに訳したふりをしない）ため lang を明示する。
      return `${tr}\n      <tr class="data-table-note"><td colspan="5" lang="ja">${escapeHTML(note)}</td></tr>`;
    })
    .join("\n");

  return (
    // 横スクロールは <table> 自身ではなく外側の箱に持たせる。table に display:block を
    // かけると内側が shrink-to-fit になり、指標ごとに表の幅が変わってしまう。
    `      <div class="data-table-wrap">\n` +
    `      <table class="data-table">\n` +
    `        <caption id="t-table-caption">${escapeHTML(metric.title)}｜年度ごとの見通し・実績・ズレ</caption>\n` +
    `        <thead>\n` +
    `          <tr>\n` +
    `            <th scope="col" id="t-th-year">年度</th>\n` +
    `            <th scope="col" id="t-th-forecast">見通し</th>\n` +
    `            <th scope="col" id="t-th-actual">実績</th>\n` +
    `            <th scope="col" id="t-th-gap">ズレ</th>\n` +
    `            <th scope="col" id="t-th-source">出典</th>\n` +
    `          </tr>\n` +
    `        </thead>\n` +
    `        <tbody>\n${body}\n        </tbody>\n` +
    `      </table>\n` +
    `      </div>`
  );
}

/* ── JSON-LD ─────────────────────────────────────────────── */

// ライセンスは書かない。サイトのどこにも利用条件の記載がなく、ここで勝手に
// 宣言すると「出典つきで確かめられる」という主旨の逆をやることになる。
// 利用条件を決めたら license を足すこと。
function buildJsonLd(key, metric, rows) {
  const years = rows.map((r) => r.year);
  const obj = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${metric.title}｜政府の当初見通しと実績`,
    description: metric.desc,
    url: `${SITE}/chart/${key}`,
    isAccessibleForFree: true,
    inLanguage: "ja",
    temporalCoverage: `${Math.min(...years)}/${Math.max(...years)}`,
    creator: { "@type": "Organization", name: "ズレ計", url: SITE },
    variableMeasured: [
      { "@type": "PropertyValue", name: "見通し（当初）", unitText: metric.unit },
      { "@type": "PropertyValue", name: "実績（確定）", unitText: metric.unit },
    ],
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "text/csv",
        contentUrl: `${SITE}${metric.csv}`,
      },
    ],
  };
  return JSON.stringify(obj, null, 2);
}

/* ── ページ ──────────────────────────────────────────────── */

const BRAND_SVG = `<svg class="brand-logo" viewBox="0 0 512 512">
        <path d="M235,205 C245,150 295,105 365,95 C405,88 440,98 447,122 C450,138 440,148 425,145 C435,165 420,188 392,200 C355,213 285,208 235,205 Z" fill="#D4482E"></path>
        <path d="M57,264 C90,248 135,240 180,241 L180,288 C135,286 92,280 57,264 Z" fill="#E8A13D"></path>
        <circle cx="300" cy="290" r="130" fill="#1B2A4A"></circle>
        <path d="M188,380 A130,130 0 0 0 400,392" fill="none" stroke="#3A4A6B" stroke-width="3" stroke-linecap="round" opacity="0.55"></path>
        <circle cx="299" cy="245" r="35" fill="#E1DFDC"></circle>
        <circle cx="289" cy="250" r="15" fill="#111318"></circle>
        <circle cx="283" cy="244" r="3.5" fill="#F2EFE8"></circle>
      </svg>`;

function header() {
  return `  <header class="site-header">
    <a class="brand" href="/" aria-label="ズレ計 トップへ">
      ${BRAND_SVG}
      <div>
        <div class="brand-name">
          <span class="brand-name-main">zurekei</span>
          <span class="brand-name-slash">~/</span>
        </div>
        <div class="brand-tag">FORECAST × ACTUAL</div>
      </div>
    </a>
    <div class="header-right">
      <div class="lang-toggle">
        <button id="lang-ja" class="lang-btn mono">JA</button>
        <button id="lang-en" class="lang-btn mono">EN</button>
      </div>
    </div>
  </header>`;
}

function footer() {
  return `  <footer class="site-footer-row">
    <span id="t-footer-src">src: 内閣府 / 国民経済計算(SNA)</span>
    <a class="footer-about" id="t-footer-about" href="/about.html">このサイトについて</a>
    <a class="footer-about" id="t-footer-contact" href="/contact.html">お問い合わせ</a>
  </footer>`;
}

// このディレクトリのページは / ではなく /chart/ に置かれる。相対パスのままだと
// style.css が /chart/style.css を指し、Pages は存在しないパスにもトップページの
// HTML を 200 で返すので「CSSのつもりでHTMLを読み込む」壊れ方になる（気づきにくい）。
// ルート絶対で書くこと。<base> で誤魔化さないのは、ここを読んだ人が理由ごと
// 分かるようにするため。
function assetHead() {
  return `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="/style.css?v=${ASSET_V}">`;
}

function buildPage(key, metric) {
  const rows = readRows(metric);
  const url = `${SITE}/chart/${key}`;
  const title = `${metric.title} — ズレ計`;
  const note = metric.note
    ? `      <p class="chart-note mono" id="chart-note">${escapeHTML(metric.note)}</p>`
    : `      <p class="chart-note mono" id="chart-note" hidden></p>`;
  const archive = metric.archiveNote
    ? `      <p class="chart-note mono" id="archive-note">${escapeHTML(metric.archiveNote)}</p>`
    : `      <p class="chart-note mono" id="archive-note" hidden></p>`;

  // 集計行はグラフと同じ computeGapStats / gapSummaryText で作る
  const stats = R.computeGapStats(rows, "forecastVal", "actualVal", { fromYear: metric.statsFromYear });
  const summaryText = R.gapSummaryText(stats, metric, "ja");
  const summary = summaryText
    ? `      <p class="chart-summary mono" id="chart-summary">${escapeHTML(summaryText)}</p>`
    : `      <p class="chart-summary mono" id="chart-summary" hidden></p>`;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- このファイルは bin/build_charts.mjs が data/*.csv から生成している。直接編集しない。
     直すのは chart.js の METRICS か data/*.csv のどちらか。 -->
<title id="page-title">${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(metric.desc)}">
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="ズレ計">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(metric.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/og.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
${assetHead()}
<script type="application/ld+json">
${buildJsonLd(key, metric, rows)}
</script>
</head>
<body data-metric="${key}">
<div class="page">
${header()}

  <a class="chart-back" id="t-back" href="/">← 指標一覧</a>

  <main>
    <section class="chart-section">
      <h1 class="chart-title" id="chart-title">${escapeHTML(metric.title)}</h1>
      <p class="chart-desc" id="chart-desc">${escapeHTML(metric.desc)}</p>
${note}

      <div class="chart-wrap">
        <svg id="chart" viewBox="0 0 960 480" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="chart-title"></svg>
      </div>

${summary}

      <div class="controls">
        <input type="range" id="year-select" min="0" max="0" value="0" step="1">
      </div>

      <div class="readout">
        <div class="readout-year mono" id="year-readout">----</div>
        <div class="stat-row">
          <div class="stat-chip">
            <span class="stat-chip-dot stat-chip-dot-forecast"></span>
            <span class="stat-chip-label" id="t-stat-forecast">見通し</span>
            <span class="stat-chip-value" id="v-forecast">—</span>
          </div>
          <div class="stat-chip">
            <span class="stat-chip-dot stat-chip-dot-actual"></span>
            <span class="stat-chip-label" id="t-stat-actual">実績</span>
            <span class="stat-chip-value" id="v-actual">—</span>
          </div>
          <div class="stat-chip stat-chip-diff">
            <span class="stat-chip-label" id="t-stat-gap">ズレ</span>
            <span class="stat-chip-value" id="v-diff">—</span>
          </div>
        </div>
      </div>

      <div class="readout-notes" id="v-notes"></div>

      <div class="readout-source" id="v-source"></div>

${archive}
    </section>

    <section class="data-section">
      <details class="data-details">
        <summary id="t-table-toggle">年度ごとの数値を表で見る（${rows.length}年度分）</summary>
${buildTable(metric, rows)}
        <p class="chart-note mono"><span id="t-table-csv">元データ: </span><a href="${metric.csv}">${escapeHTML(metric.csv)}</a></p>
      </details>
    </section>
  </main>

${footer()}
</div>
<script src="/csv.js?v=${ASSET_V}"></script>
<script src="/chart.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}

/* ── ハブ ────────────────────────────────────────────────── */

function buildIndex(keys) {
  const items = keys
    .map((k) => {
      const m = METRICS[k];
      return `        <li>
          <a href="/chart/${k}" data-en="${escapeHTML(m.titleEn)}">${escapeHTML(m.title)}</a>
          <span class="hub-desc" data-en="${escapeHTML(m.descEn)}">${escapeHTML(m.desc)}</span>
        </li>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- bin/build_charts.mjs が生成している。直接編集しない。 -->
<title>指標一覧 — ズレ計</title>
<meta name="description" content="政府の当初見通しと確定した実績を並べた指標の一覧。">
<link rel="canonical" href="${SITE}/chart/">
<meta property="og:site_name" content="ズレ計">
<meta property="og:type" content="website">
<meta property="og:title" content="指標一覧 — ズレ計">
<meta property="og:description" content="政府の当初見通しと確定した実績を並べた指標の一覧。">
<meta property="og:url" content="${SITE}/chart/">
<meta property="og:image" content="${SITE}/assets/og.png">
${assetHead()}
</head>
<body>
<div class="page">
${header()}

  <a class="chart-back" href="/" data-en="← Home">← トップ</a>

  <main>
    <section class="chart-section">
      <h1 class="chart-title" data-en="Indicators">指標一覧</h1>
      <p class="chart-desc" data-en="The forecast the government set at the start of each fiscal year, laid alongside the actual figure confirmed later — one page per indicator.">政府が年度の初めに置いた見通しと、後から確定した実績を、指標ごとに並べています。</p>
      <ul class="hub-list">
${items}
      </ul>
    </section>
  </main>

  <footer class="site-footer-row">
    <span data-en="src: Cabinet Office of Japan / SNA">src: 内閣府 / 国民経済計算(SNA)</span>
    <a class="footer-about" href="/about.html" data-en="About this site">このサイトについて</a>
    <a class="footer-about" href="/contact.html" data-en="Contact">お問い合わせ</a>
  </footer>
</div>
<script>
// 旧URL（/chart?m=gdp-real）で来た人を、その指標の新しいURLへ送る。
// 一覧そのものは静的に出ているので、JSが動かなくても行き止まりにはならない。
(function () {
  var m = new URLSearchParams(location.search).get("m");
  if (!m) return;
  var link = document.querySelector('.hub-list a[href="/chart/' + m.replace(/[^a-z-]/g, "") + '"]');
  if (link) location.replace(link.getAttribute("href"));
})();

// 言語トグル。他のページと同じ物がヘッダに載っている以上、押して何も起きない状態で
// 出さない（/contact で一度その状態を出した）。JA は data-ja に退避して往復させる。
// 訳は data-en に埋めてあるので、この一覧に固有の辞書は持たない。
(function () {
  var els = document.querySelectorAll("[data-en]");
  els.forEach(function (el) { el.dataset.ja = el.textContent; });
  function apply(lang) {
    els.forEach(function (el) { el.textContent = lang === "en" ? el.dataset.en : el.dataset.ja; });
    document.documentElement.lang = lang;
    document.getElementById("lang-ja").classList.toggle("active", lang === "ja");
    document.getElementById("lang-en").classList.toggle("active", lang === "en");
  }
  document.getElementById("lang-ja").addEventListener("click", function () { apply("ja"); });
  document.getElementById("lang-en").addEventListener("click", function () { apply("en"); });
  apply("ja");
})();
</script>
</body>
</html>
`;
}

/* ── 実行 ────────────────────────────────────────────────── */

/* ── 参照側の取りこぼし検査 ──────────────────────────────────
 * 指標ページ本体は生成されるので増減に自動で追従するが、そこへ「辿らせる側」
 * (トップの素のリンクと sitemap)は手書きで、足し忘れても見た目には何も起きない。
 * 静かに索引から漏れるだけなので、生成のたびに機械で突き合わせる。
 */
function crossRefErrors(keys) {
  const errs = [];
  const read = (f) => fs.readFileSync(path.join(SITE_DIR, f), "utf8");

  const sitemap = read("sitemap.xml");
  const listed = new Set([...sitemap.matchAll(/<loc>https:\/\/zurekei\.org\/chart\/([a-z-]+)<\/loc>/g)].map((m) => m[1]));
  for (const k of keys) if (!listed.has(k)) errs.push(`sitemap.xml に /chart/${k} が無い`);
  for (const k of listed) if (!keys.includes(k)) errs.push(`sitemap.xml の /chart/${k} は指標として存在しない`);

  const index = read("index.html");
  const linked = new Set([...index.matchAll(/href="chart\/([a-z-]+)"/g)].map((m) => m[1]));
  for (const k of keys) if (!linked.has(k)) errs.push(`index.html の card-grid に chart/${k} へのリンクが無い`);
  for (const k of linked) if (!keys.includes(k)) errs.push(`index.html の chart/${k} は指標として存在しない`);

  return errs;
}

const check = process.argv.includes("--check");
const keys = Object.keys(METRICS);
const files = new Map();
for (const k of keys) files.set(path.join(OUT_DIR, `${k}.html`), buildPage(k, METRICS[k]));
files.set(path.join(OUT_DIR, "index.html"), buildIndex(keys));

if (check) {
  const stale = [];
  for (const [f, want] of files) {
    let got = null;
    try {
      got = fs.readFileSync(f, "utf8");
    } catch {
      /* 未生成 */
    }
    if (got !== want) stale.push(path.relative(SITE_DIR, f));
  }
  // 生成対象から外れた指標の置き土産も落とす（指標をリネームした時に残る）
  const known = new Set([...files.keys()].map((f) => path.basename(f)));
  const orphans = fs.existsSync(OUT_DIR)
    ? fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".html") && !known.has(f))
    : [];

  const refs = crossRefErrors(keys);
  if (stale.length || orphans.length || refs.length) {
    if (stale.length) console.error(`✗ 生成物が古い: ${stale.join(", ")}`);
    if (orphans.length) console.error(`✗ 余分なファイル: ${orphans.join(", ")}`);
    refs.forEach((e) => console.error(`✗ ${e}`));
    if (stale.length || orphans.length) console.error("  node bin/build_charts.mjs を実行してからデプロイすること");
    process.exit(1);
  }
  console.log(`✓ 指標ページ ${files.size} 本は最新（sitemap / トップのリンクとも一致）`);
} else {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const known = new Set([...files.keys()].map((f) => path.basename(f)));
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.endsWith(".html") && !known.has(f)) fs.unlinkSync(path.join(OUT_DIR, f));
  }
  for (const [f, html] of files) fs.writeFileSync(f, html);
  console.log(`✓ ${files.size} 本を生成: ${path.relative(SITE_DIR, OUT_DIR)}/`);
  // 生成そのものは成功しても、辿らせる側が欠けていれば索引には出ない。
  // 落ちるほどではないので警告にとどめ、デプロイは --check 側で止める。
  crossRefErrors(keys).forEach((e) => console.warn(`⚠ ${e}`));
}
