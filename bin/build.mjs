#!/usr/bin/env node
/* ページ ビルダー — 数値を HTML の実体として置くためのもの
 *
 * 生成するもの:
 *   chart/<key>.html   … 8指標の本体（丸ごと生成）
 *   chart/index.html   … 8指標へのハブ（丸ごと生成）
 * 差し込むもの（既存ファイルの <!-- BUILD:名前 --> … <!-- /BUILD:名前 --> の中だけ）:
 *   fertility.html     … 歴代推計 × 実績の表、推計ごとの平均ズレ、JSON-LD
 *   hoan.html          … 見直し条項49件の表と条文原文、JSON-LD
 *
 * 使い方:
 *   node bin/build.mjs           # 生成・差し込みをする
 *   node bin/build.mjs --check   # 最新かだけ見る（書かない）
 *
 * ■ なぜこれが要るのか
 *   このサイトは全ページがJSで描画していた。ブラウザでは正しく見えるが、JSを実行
 *   しないクローラにとっては読む中身が無い（本文は "—" と空の tbody だけ）。
 *   出典つきで確かめられることを主旨に置いている以上、確かめる相手がHTMLしか
 *   読まないなら、HTMLに数値が入っていなければ意味がない。
 *
 *   8指標は加えて chart.html 1ファイルを ?m= で共有していた。クエリ文字列では
 *   ファイルを出し分けられないので、指標ごとに実ファイルを持たせないと、検索側では
 *   8URLが1件に畳まれたままになる。だからそちらは丸ごと生成にした。
 *   fertility / hoan は元から専用URLを持っているので、手書きのページ構造はそのまま
 *   残し、数値の入る領域だけを機械の持ち物にしている。
 *
 * ■ なぜ定義や文言をこちらに書き写さないのか
 *   指標定義・整形規則・UIの文言は chart.js / fertility.js / hoan.js にある。ビルド側に
 *   複製すると、いつか必ずズレて「表とグラフが同じ年について違う数字を出す」状態に
 *   なる。ズレの記録を名乗るサイトでそれは起こしてはいけない。なので各 .js をその
 *   まま評価して本物の定義を取り込む。表と描画は定義上一致する。
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
const ASSET_V = "20260731i";

const read = (f) => fs.readFileSync(path.join(SITE_DIR, f), "utf8");

/* ── 各ページの .js を「本物のまま」取り込む ─────────────────────── */

const CSV_SRC = read("csv.js");

// ブラウザ用の .js を Node で評価して、トップレベルの定義を取り出す。
// どのファイルも最後の main() だけが DOM に触るので、その1行を落とせば評価できる。
// 見つからなくなったら「たまたま動いた」状態で生成を続けず、ここで止める。
// globals は、トップレベルでブラウザAPIを触るファイル用の最小限の代役。
function loadModule(file, names, globals = {}) {
  const src = read(file);
  const stripped = src.replace(/\bmain\(\);\s*$/, "");
  if (stripped === src) {
    throw new Error(`${file} の末尾に main(); が見つからない。構造が変わった可能性がある`);
  }
  // ファイルごとに別コンテキストにする。chart.js / fertility.js / hoan.js は
  // どれもトップレベルで const T を宣言しているので、混ぜると衝突する。
  const ctx = { __out: null, ...globals };
  vm.runInNewContext(`${CSV_SRC}\n${stripped}\n__out = { ${names.join(", ")} };`, ctx, {
    filename: `zurekei:${file}`,
  });
  const missing = names.filter((n) => ctx.__out[n] === undefined);
  if (missing.length) throw new Error(`${file} から取り込めなかった定義: ${missing.join(", ")}`);
  return ctx.__out;
}

const R = loadModule("chart.js", [
  // csv.js
  "parseCSV", "toNum", "computeGapStats", "escapeHTML", "safeUrl",
  // chart.js
  "T", "METRICS", "fmtFY", "gapLabelText", "gapUnitSuffix",
  "gapSummaryText", "fmtVal", "extractSourceUrl", "extractEventNote",
]);

const { METRICS, T, escapeHTML, safeUrl, toNum, parseCSV, computeGapStats } = R;

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

// JSが動かないときに、中身が入らないまま残る部品を畳んで、案内文と入れ替える。
// 対象は「JSでしか中身が入らないもの」だけ: 空のSVG、年を選ぶスライダー、その年の
// 読み取り欄（"—" のまま）、注記・出典欄（空のまま）。集計行と数値表は静的に
// 入っているので触らない。
//
// <head> の <noscript> に <style> を置くのは仕様どおりの使い方で、JSが動く側には
// 一切影響しない。body 側で出し分けようとすると、描画されるまでの一瞬だけ案内が
// 見えてしまう。!important なのは style.css 側が #chart や display:flex で強いため
// （セレクタを盛って勝ちにいくより、上書きの意図が読めるこちらを採る）。
const NOSCRIPT_STYLE =
  `<noscript><style>` +
  `.chart-wrap > svg, .controls, .readout, #v-notes, #v-source { display: none !important; }` +
  ` .chart-noscript { display: block; }` +
  `</style></noscript>`;

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
<!-- このファイルは bin/build.mjs が data/*.csv から生成している。直接編集しない。
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
${NOSCRIPT_STYLE}
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
        <!-- グラフはJSでしか描かない。JSが無いとこの枠が空箱として残り、壊れて
             いるようにしか見えないので、行き先を書いておく。表示の切り替えは
             <head> の <noscript><style> が持つ。 -->
        <p class="chart-noscript mono">グラフの描画には JavaScript が必要です。数値は下の表にあります。</p>
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
<!-- bin/build.mjs が生成している。直接編集しない。 -->
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

/* ── 既存ページへの差し込み ───────────────────────────────────
 * fertility / hoan は手書きのページで、URL も構造も既にある。丸ごと生成にすると
 * 版面まで機械の持ち物になってしまうので、数値の入る領域だけを置き換える。
 * 領域の外は人間が自由に触ってよい、というのがこのマーカーの意味。
 */
function injectRegion(html, name, body, file) {
  const open = `<!-- BUILD:${name} -->`;
  const close = `<!-- /BUILD:${name} -->`;
  const i = html.indexOf(open);
  const j = html.indexOf(close);
  if (i < 0 || j < 0 || j < i) {
    throw new Error(`${file} に ${open} … ${close} が見つからない`);
  }
  return html.slice(0, i + open.length) + body + html.slice(j);
}

// JA を本文に、EN を data-en に置く。入れ替えは各ページの applyTableI18n が行う。
// 訳を辞書ごとビルド側に持たせないのは、文言の出所を .js 側の T 一箇所に保つため。
function dual(en) {
  return ` data-en="${escapeHTML(en)}"`;
}

/* ── 合計特殊出生率 ──────────────────────────────────────── */

const FERT = loadModule("fertility.js", ["T", "vintageLabel"]);

function fertilityData() {
  const forecast = parseCSV(read("data/fertility_forecast.csv"))
    .map((r) => ({
      vintage: Number(r.vintage_year),
      year: Number(r.target_year),
      mid: toNum(r.assumed_tfr_mid),
      sourceUrl: r.forecast_source_url,
    }))
    .filter((r) => r.mid !== null);
  const actual = parseCSV(read("data/fertility_actual.csv"))
    .map((r) => ({ year: Number(r.year), tfr: toNum(r.actual_tfr), sourceUrl: r.source_url }))
    .filter((r) => r.tfr !== null);

  const vintages = [...new Set(forecast.map((r) => r.vintage))].sort((a, b) => a - b);
  const actualByYear = new Map(actual.map((r) => [r.year, r.tfr]));
  const years = [...new Set([...actual.map((r) => r.year), ...forecast.map((r) => r.year)])].sort(
    (a, b) => a - b
  );
  const cell = new Map(forecast.map((r) => [`${r.vintage}:${r.year}`, r.mid]));
  return { forecast, actual, vintages, actualByYear, years, cell };
}

// 出生率は小数第2位まで。実績が2桁で公表されているので、推計側の5桁は表示上そこへ
// 揃える（元データの精度は CSV に残っていると表の下に書いてある）。
const fmtTfr = (v) => v.toFixed(2);
const fmtTfrGap = (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`;

function fertilityGapLines(d, lang) {
  const t = FERT.T[lang];
  const lines = [];
  for (const v of d.vintages) {
    const rows = d.forecast
      .filter((r) => r.vintage === v)
      .map((r) => ({ year: r.year, f: r.mid, a: d.actualByYear.has(r.year) ? d.actualByYear.get(r.year) : null }));
    // 実績と重なる年が無い推計（将来だけを扱う版が来た場合）は黙って飛ばす。
    // 0年分を「平均 0.00」と書くと、ズレが無かったように読めてしまう。
    const st = computeGapStats(rows, "f", "a");
    if (!st) continue;
    lines.push({
      text: t.gapLine(FERT.vintageLabel(v, lang), st.count, fmtTfrGap(st.meanGap), st.below, st.above),
      url: safeUrl(d.forecast.find((r) => r.vintage === v).sourceUrl),
    });
  }
  return lines;
}

function fertilityTable(d) {
  const head =
    `            <th scope="col"${dual(FERT.T.en.thYear)}>${escapeHTML(FERT.T.ja.thYear)}</th>\n` +
    `            <th scope="col"${dual(FERT.T.en.thActual)}>${escapeHTML(FERT.T.ja.thActual)}</th>\n` +
    d.vintages
      .map(
        (v) =>
          `            <th scope="col"${dual(FERT.vintageLabel(v, "en"))}>${escapeHTML(FERT.vintageLabel(v, "ja"))}</th>`
      )
      .join("\n");

  const body = d.years
    .map((y) => {
      const a = d.actualByYear.has(y) ? fmtTfr(d.actualByYear.get(y)) : "";
      const cells = d.vintages
        .map((v) => {
          const val = d.cell.get(`${v}:${y}`);
          return `        <td class="mono">${val === undefined ? "" : fmtTfr(val)}</td>`;
        })
        .join("\n");
      return (
        `      <tr>\n` +
        `        <th scope="row" class="mono">${y}</th>\n` +
        `        <td class="mono">${a}</td>\n` +
        `${cells}\n` +
        `      </tr>`
      );
    })
    .join("\n");

  return (
    `      <div class="data-table-wrap">\n` +
    `      <table class="data-table data-table-wide">\n` +
    `        <caption${dual(FERT.T.en.tableCaption)}>${escapeHTML(FERT.T.ja.tableCaption)}</caption>\n` +
    `        <thead>\n          <tr>\n${head}\n          </tr>\n        </thead>\n` +
    `        <tbody>\n${body}\n        </tbody>\n` +
    `      </table>\n` +
    `      </div>`
  );
}

function fertilitySection(d) {
  const gapJa = fertilityGapLines(d, "ja");
  const gapEn = fertilityGapLines(d, "en");
  const gaps = gapJa
    .map((g, i) => {
      const src = g.url
        ? ` <a href="${escapeHTML(g.url)}" target="_blank" rel="noopener">出典</a>`
        : "";
      return `          <li><span${dual(gapEn[i].text)}>${escapeHTML(g.text)}</span>${src}</li>`;
    })
    .join("\n");

  return `
  <section class="data-section">
    <details class="data-details">
      <summary${dual(FERT.T.en.tableToggle(d.years.length))}>${escapeHTML(FERT.T.ja.tableToggle(d.years.length))}</summary>

      <p class="gap-head mono"${dual(FERT.T.en.gapHead)}>${escapeHTML(FERT.T.ja.gapHead)}</p>
      <ul class="gap-list mono">
${gaps}
      </ul>

${fertilityTable(d)}

      <p class="chart-note mono"${dual(FERT.T.en.tableRoundNote)}>${escapeHTML(FERT.T.ja.tableRoundNote)}</p>
      <p class="chart-note mono"><span${dual(FERT.T.en.tableCsvLabel)}>${escapeHTML(FERT.T.ja.tableCsvLabel)}</span><a href="/data/fertility_forecast.csv">/data/fertility_forecast.csv</a> · <a href="/data/fertility_actual.csv">/data/fertility_actual.csv</a></p>
    </details>
  </section>
  `;
}

function fertilityJsonLd(d) {
  return `
<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "合計特殊出生率｜歴代の将来推計の仮定と実績",
    description: FERT.T.ja.desc,
    url: `${SITE}/fertility`,
    isAccessibleForFree: true,
    inLanguage: "ja",
    temporalCoverage: `${d.years[0]}/${d.years[d.years.length - 1]}`,
    creator: { "@type": "Organization", name: "ズレ計", url: SITE },
    variableMeasured: [
      { "@type": "PropertyValue", name: "推計の仮定（中位）", unitText: "合計特殊出生率" },
      { "@type": "PropertyValue", name: "実績", unitText: "合計特殊出生率" },
    ],
    distribution: [
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE}/data/fertility_forecast.csv` },
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE}/data/fertility_actual.csv` },
    ],
  },
  null,
  2
)}
</script>
`;
}

function buildFertility() {
  const d = fertilityData();
  let html = read("fertility.html");
  html = injectRegion(html, "jsonld", fertilityJsonLd(d), "fertility.html");
  html = injectRegion(html, "table", fertilitySection(d), "fertility.html");
  return html;
}

/* ── 見直し条項 ─────────────────────────────────────────── */

// hoan.js はトップレベルで localStorage を読む（言語の記憶）。Node には無いので
// 代役を置く。値は使わないので null を返すだけでよい。
const HOAN = loadModule("hoan.js", ["T", "STATUS", "NOTE_LABEL"], {
  localStorage: { getItem: () => null, setItem: () => {} },
});

// 並びは hoan.js の sortRows と同じ規則（状況 → 期限）。STATUS も本物を使う。
function hoanRows() {
  return parseCSV(read("data/hoan_review.csv")).slice().sort((a, b) => {
    const oa = (HOAN.STATUS[a.review_status] || HOAN.STATUS.pending).order;
    const ob = (HOAN.STATUS[b.review_status] || HOAN.STATUS.pending).order;
    if (oa !== ob) return oa - ob;
    return (a.review_deadline || "9999-99-99").localeCompare(b.review_deadline || "9999-99-99");
  });
}

// 条文原文は data/hoan_clauses/<law_id>.txt にある。JS版はクリック時に取りに行くが、
// JSを実行しない相手には取りに行く手立てが無いので、ここでHTMLに入れてしまう。
// 全49件で約31KB。このページで最も引用される価値があるのは一次資料そのもの
// なので、隠したままにしない。
function hoanClause(id) {
  const f = path.join(SITE_DIR, "data", "hoan_clauses", `${id}.txt`);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim() : null;
}

function hoanRowHtml(r) {
  const t = HOAN.T.ja;
  const meta = HOAN.STATUS[r.review_status] || HOAN.STATUS.pending;
  const status = t.status[r.review_status] || t.status.pending;
  const deadline = r.review_deadline || t.noDeadline;
  const yrs = r.review_years ? t.yearsAfter(r.review_years) : t.noDeadlineYears;
  const noteText = r.enforcement_note ? HOAN.NOTE_LABEL.ja[r.enforcement_note] || r.enforcement_note : "";
  const staged = noteText ? `<span class="hoan-staged mono">${escapeHTML(noteText)}</span>` : "";
  const url = safeUrl(r.source_law_url);
  const src = url
    ? `<a class="hoan-srclink mono" href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(t.srcLink)}</a>`
    : "";
  const clause = hoanClause(r.law_id);

  // 詳細行は hidden にしない。hidden にすると、JSが動かない相手には「HTMLには
  // あるが決して開けない」状態になる。<details> なら素のHTMLだけで開閉できる。
  // JSが動く場合は hoan.js の render() がこの行ごと差し替えるので、操作感は不変。
  const detail = clause
    ? `      <tr class="hoan-detail hoan-detail-static">
        <td colspan="4">
          <details>
            <summary class="hoan-clause-head mono">${escapeHTML(t.clauseHead)}</summary>
            <pre class="hoan-clause">${escapeHTML(clause)}</pre>
          </details>
        </td>
      </tr>`
    : "";

  return `      <tr class="hoan-row hoan-row-static">
        <td class="col-title">
          <div class="hoan-lawtitle">${escapeHTML(r.law_title)}</div>
          <div class="hoan-lawnum mono">${escapeHTML(r.law_num)} ${src}</div>
        </td>
        <td class="col-date mono">${escapeHTML(r.enforcement_date || t.enforceMissing)}${staged}</td>
        <td class="col-date mono">${escapeHTML(deadline)}<div class="hoan-yrs mono">${escapeHTML(yrs)}</div></td>
        <td class="col-status"><span class="hoan-badge ${meta.cls}">${escapeHTML(status)}</span></td>
      </tr>
${detail}`;
}

function hoanJsonLd(rows) {
  const years = rows.map((r) => (r.promulgation_date || "").slice(0, 4)).filter(Boolean).sort();
  return `
<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "法律の見直し条項｜期限と検討状況",
    description: HOAN.T.ja.desc,
    url: `${SITE}/hoan`,
    isAccessibleForFree: true,
    inLanguage: "ja",
    temporalCoverage: `${years[0]}/${years[years.length - 1]}`,
    creator: { "@type": "Organization", name: "ズレ計", url: SITE },
    variableMeasured: [
      { "@type": "PropertyValue", name: "施行日" },
      { "@type": "PropertyValue", name: "見直し期限（施行日＋条項の年数）" },
      { "@type": "PropertyValue", name: "期限到来の有無" },
    ],
    distribution: [
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE}/data/hoan_review.csv` },
    ],
  },
  null,
  2
)}
</script>
`;
}

function buildHoan() {
  const rows = hoanRows();
  const due = rows.filter((r) => r.review_status === "due").length;
  let html = read("hoan.html");
  html = injectRegion(html, "jsonld", hoanJsonLd(rows), "hoan.html");
  // #summary と tbody#rows は、JSが動けば hoan.js が同じ規則で書き直す領域。
  // 静的版はその初期状態（絞り込み無し）にあたる。
  html = injectRegion(html, "summary", escapeHTML(HOAN.T.ja.summary(rows.length, due)), "hoan.html");
  html = injectRegion(html, "rows", `\n${rows.map(hoanRowHtml).join("\n")}\n    `, "hoan.html");
  return html;
}

/* ── 実行 ────────────────────────────────────────────────── */

/* ── 参照側の取りこぼし検査 ──────────────────────────────────
 * 指標ページ本体は生成されるので増減に自動で追従するが、そこへ「辿らせる側」
 * (トップの素のリンクと sitemap)は手書きで、足し忘れても見た目には何も起きない。
 * 静かに索引から漏れるだけなので、生成のたびに機械で突き合わせる。
 */
function crossRefErrors(keys) {
  const errs = [];

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

// 丸ごと生成する側（chart/）と、既存ファイルに差し込む側（fertility / hoan）を
// 同じ Map に載せる。中身が最終形として一致すればよいので、扱いは同じでよい。
const files = new Map();
for (const k of keys) files.set(path.join(OUT_DIR, `${k}.html`), buildPage(k, METRICS[k]));
files.set(path.join(OUT_DIR, "index.html"), buildIndex(keys));
files.set(path.join(SITE_DIR, "fertility.html"), buildFertility());
files.set(path.join(SITE_DIR, "hoan.html"), buildHoan());

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
  const chartKnown = new Set(
    [...files.keys()].filter((f) => path.dirname(f) === OUT_DIR).map((f) => path.basename(f))
  );
  const orphans = fs.existsSync(OUT_DIR)
    ? fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".html") && !chartKnown.has(f))
    : [];

  const refs = crossRefErrors(keys);
  if (stale.length || orphans.length || refs.length) {
    if (stale.length) console.error(`✗ 生成物が古い: ${stale.join(", ")}`);
    if (orphans.length) console.error(`✗ 余分なファイル: chart/${orphans.join(", chart/")}`);
    refs.forEach((e) => console.error(`✗ ${e}`));
    if (stale.length || orphans.length) console.error("  node bin/build.mjs を実行してからデプロイすること");
    process.exit(1);
  }
  console.log(`✓ ${files.size} ページは最新（sitemap / トップのリンクとも一致）`);
} else {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const chartKnown = new Set(
    [...files.keys()].filter((f) => path.dirname(f) === OUT_DIR).map((f) => path.basename(f))
  );
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.endsWith(".html") && !chartKnown.has(f)) fs.unlinkSync(path.join(OUT_DIR, f));
  }
  for (const [f, html] of files) fs.writeFileSync(f, html);
  console.log(`✓ ${files.size} ページを更新（chart/ ${chartKnown.size} 本 + fertility.html + hoan.html）`);
  // 生成そのものは成功しても、辿らせる側が欠けていれば索引には出ない。
  // 落ちるほどではないので警告にとどめ、デプロイは --check 側で止める。
  crossRefErrors(keys).forEach((e) => console.warn(`⚠ ${e}`));
}
