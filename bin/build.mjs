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
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(HERE, "..");
const OUT_DIR = path.join(SITE_DIR, "chart");
// /en/ 配下は既存ページの言語違いなので、ディレクトリの切り方も /chart/ と
// 揃える(EN_DIR/en/chart/<key>.html が /en/chart/<key> に対応)。
const EN_DIR = path.join(SITE_DIR, "en");
const EN_OUT_DIR = path.join(EN_DIR, "chart");
const SITE = "https://zurekei.org";

// トップの Organization ノードの @id。各ページの Dataset の creator/publisher と
// トップの WebSite/Organization を同じ実体として束ねるための共通の識別子。
// 個人を特定する情報(founder等)は入れない(匿名運営を選択肢として残しているため)。
const ORG_ID = `${SITE}/#organization`;

// DataCatalog(10個の Dataset を束ねる節点)の @id。各 Dataset の
// includedInDataCatalog が参照する共通の識別子。置き場所をトップ(index.html)に
// したのは buildHomeJsonLd のコメントを参照。
const CATALOG_ID = `${SITE}/#catalog`;

// fertility / hoan の Dataset の name・@id・url は、Dataset 自身の JSON-LD
// (fertilityJsonLd/hoanJsonLd)と、カタログ側(buildHomeJsonLd)の参照の両方から
// 使う。1箇所にしないと「カタログに載っている名前」と「Dataset 自身が名乗る
// 名前」がいつか別のものに書き換わってズレる。
const FERTILITY_DATASET = {
  id: `${SITE}/fertility#dataset`,
  url: `${SITE}/fertility`,
  name: {
    ja: "合計特殊出生率｜歴代の将来推計の仮定と実績",
    en: "Total fertility rate — assumptions across successive projections vs actual",
  },
};
const HOAN_DATASET = {
  id: `${SITE}/hoan#dataset`,
  url: `${SITE}/hoan`,
  name: {
    ja: "法律の見直し条項｜期限と検討状況",
    en: "Statutory review clauses — deadlines and status",
  },
};

/* ── JA/EN 相互URL ───────────────────────────────────────────
 * /en/ 以下は既存ページの言語違いなので、URLの対応関係を1箇所にする(ページごとに
 * 書き写すと、いつか /en/ 側だけリンク切れになる)。root-absolute・拡張子なしに
 * 統一している(新しく足すリンクの規約。既存の相対リンク・.html付きリンクは
 * 触っていないページの中身なので変えない)。
 */
const REL = {
  home: { ja: "/", en: "/en/" },
  chartHub: { ja: "/chart/", en: "/en/chart/" },
  fertility: { ja: "/fertility", en: "/en/fertility" },
  hoan: { ja: "/hoan", en: "/en/hoan" },
  about: { ja: "/about", en: "/en/about" },
  corrections: { ja: "/corrections", en: "/en/corrections" },
  contact: { ja: "/contact", en: "/en/contact" },
};
const chartRel = (key) => ({ ja: `/chart/${key}`, en: `/en/chart/${key}` });
const abs = (rel) => `${SITE}${rel}`;

// canonical は常に自ページを指す(相互に向けない。かつて ?m= で固定canonicalを
// 共有し7ページが索引から消えた反省を参照)。hreflang は両言語 + x-default を
// 両方向のページに置く。x-default は ja(サイトの既定言語)を指す。
function hreflangTags(pair) {
  return `<link rel="alternate" hreflang="ja" href="${abs(pair.ja)}">
<link rel="alternate" hreflang="en" href="${abs(pair.en)}">
<link rel="alternate" hreflang="x-default" href="${abs(pair.ja)}">`;
}

// style.css / chart.js のキャッシュバスター。ページ側の ?v= と揃える。
const ASSET_V = "20260731l";

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
  "T", "METRICS", "fmtFY", "gapLabelText", "gapUnitSuffix", "metricUnit",
  "gapSummaryText", "fmtVal", "extractSourceUrl", "extractEventNote",
]);

const { METRICS, T, escapeHTML, safeUrl, toNum, parseCSV, computeGapStats } = R;

// JA を本文に、EN を data-en に置く（/en/ 生成前からある fertility.html / chart/index.html
// の既存の二言語表現方式）。入れ替えは各ページの applyTableI18n 等が行う。訳を辞書ごと
// ビルド側に持たせないのは、文言の出所を .js 側の T 一箇所に保つため。
// /en/ ページ自体にはこの属性を持たせない（EN側は本文として直接その言語のテキストを
// 出すので、data-en が要る場面はJA側の静的ページのみ）。
function dual(en) {
  return ` data-en="${escapeHTML(en)}"`;
}

// /en/ ページの生成に要る4ファイルぶんの取り込み。手書きページ(index/about/
// contact/corrections)の文言・整形関数もここで本物を取り込む。chart.js等と同じ
// 理由(表とページで文言が違う数字・言葉を出す事故を起こさない)。
const HOME = loadModule("home.js", [
  "T", "INDICATOR_META", "fmtSigned", "buildSparkline",
  "buildFertilitySparkline", "cardGapSummaryText", "renderCard", "metaUnit",
]);

// chart.js の metricUnit は buildTable が英語生成時に全指標分呼ぶのでビルドが
// unitEn漏れを踏める。home.js の metaUnit は buildHomeEn がカード名(nameEn)しか
// 使わず一度も呼ばないため、同じ守りが無かった(2026-07-30レビュー指摘)。将来
// INDICATOR_META に兆円系の指標を足して unitEn を書き忘れても、ビルドも
// --check も緑のままデプロイされ、英語トップのカード描画が実行時に throw する
// ところだった。ここで全指標×英語を1回強制評価し、書き忘れをビルド時に踏む。
HOME.INDICATOR_META.forEach((m) => HOME.metaUnit(m, "en"));
const ABOUT = loadModule("about.js", ["T", "METHODS_ROWS", "renderMethodsRows"]);
const CONTACT = loadModule("contact.js", ["T"]);
const CORR = loadModule("corrections.js", ["T", "renderEntry"]);

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
function cellForecast(metric, r, lang) {
  return r.forecastVal !== null
    ? { text: R.fmtVal(r.forecastVal, R.metricUnit(metric, lang), metric.signed), ph: null }
    : { text: R.gapLabelText(metric, lang), ph: "gap" };
}

function cellActual(metric, r, lastActualYear, lang) {
  if (r.actualVal !== null) return { text: R.fmtVal(r.actualVal, R.metricUnit(metric, lang), metric.signed), ph: null };
  return r.year > lastActualYear
    ? { text: T[lang].actualPending, ph: "pending" }
    : { text: T[lang].actualUnavailable, ph: "unavailable" };
}

function cellGap(metric, r, lang) {
  if (r.forecastVal === null || r.actualVal === null) return "—";
  const diff = r.actualVal - r.forecastVal;
  return `${diff > 0 ? "+" : ""}${diff.toFixed(1)}${R.gapUnitSuffix(metric, lang)}`;
}

function sourceCell(r, lang) {
  const parts = [];
  const f = safeUrl(r.forecastSourceUrl);
  const a = safeUrl(r.actualSourceUrl);
  if (f) parts.push(`<a href="${escapeHTML(f)}" target="_blank" rel="noopener" data-src="forecast">${escapeHTML(T[lang].forecast)}</a>`);
  if (a) parts.push(`<a href="${escapeHTML(a)}" target="_blank" rel="noopener" data-src="actual">${escapeHTML(T[lang].actual)}</a>`);
  return parts.join(" ");
}

function buildTable(metric, rows, lang) {
  const actuals = rows.filter((r) => r.actualVal !== null);
  const lastActualYear = actuals.length ? actuals[actuals.length - 1].year : -Infinity;

  const body = rows
    .map((r) => {
      const f = cellForecast(metric, r, lang);
      const a = cellActual(metric, r, lastActualYear, lang);
      const phAttr = (c) => (c.ph ? ` data-ph="${c.ph}"` : "");
      const tr =
        `      <tr>\n` +
        `        <th scope="row" class="mono" data-year="${r.year}">${escapeHTML(R.fmtFY(r.year, lang))}</th>\n` +
        `        <td class="mono"${phAttr(f)}>${escapeHTML(f.text)}</td>\n` +
        `        <td class="mono"${phAttr(a)}>${escapeHTML(a.text)}</td>\n` +
        `        <td class="mono">${escapeHTML(cellGap(metric, r, lang))}</td>\n` +
        `        <td class="data-table-src">${sourceCell(r, lang)}</td>\n` +
        `      </tr>`;
      // 実績側の注記だけを出す（[見通し原文] 等は転記者向けの控えなので出さない）。
      // chart.js の readout と同じ extractEventNote に判断を委ねている。
      const note = R.extractEventNote(r.notes);
      if (!note) return tr;
      // 注記は一次資料からの転記そのままなので常に日本語(EN表でも訳さない。
      // 訳を用意していないのに訳したふりをしない)。lang="ja" は表自体の言語が
      // enでも、この1セルだけ日本語であることを明示する(かつ元からの規約)。
      return `${tr}\n      <tr class="data-table-note"><td colspan="5" lang="ja">${escapeHTML(note)}</td></tr>`;
    })
    .join("\n");

  const t = T[lang];
  return (
    // 横スクロールは <table> 自身ではなく外側の箱に持たせる。table に display:block を
    // かけると内側が shrink-to-fit になり、指標ごとに表の幅が変わってしまう。
    `      <div class="data-table-wrap">\n` +
    `      <table class="data-table">\n` +
    `        <caption id="t-table-caption">${escapeHTML(lang === "ja" ? metric.title : metric.titleEn)}${escapeHTML(t.tableCaptionSuffix)}</caption>\n` +
    `        <thead>\n` +
    `          <tr>\n` +
    `            <th scope="col" id="t-th-year">${escapeHTML(t.thYear)}</th>\n` +
    `            <th scope="col" id="t-th-forecast">${escapeHTML(t.forecast)}</th>\n` +
    `            <th scope="col" id="t-th-actual">${escapeHTML(t.actual)}</th>\n` +
    `            <th scope="col" id="t-th-gap">${escapeHTML(t.gap)}</th>\n` +
    `            <th scope="col" id="t-th-source">${escapeHTML(t.thSource)}</th>\n` +
    `          </tr>\n` +
    `        </thead>\n` +
    `        <tbody>\n${body}\n        </tbody>\n` +
    `      </table>\n` +
    `      </div>`
  );
}

/* ── JSON-LD ─────────────────────────────────────────────── */

// カタログ側の参照(name/url)と Dataset 自身の name を1箇所にする(呼び出し側で
// 同じ文言を書き写さない)。EN側の文言はどの.jsのT辞書にも属さないJSON-LD専用の
// 短い名前なので、ここで新規に用意する(2026-07-29、/en/ページ追加時。他の
// メタ情報用コピー─タイトルタグ・meta descriptionと同じ扱い)。
function metricDatasetName(metric, lang) {
  return lang === "en"
    ? `${metric.titleEn} — government's initial forecast and confirmed actual`
    : `${metric.title}｜政府の当初見通しと実績`;
}

const ORG_NAME = { ja: "ズレ計", en: "zurekei" };

// Organization ノード(ORG_ID)は全ページ(JA/EN問わず)から同じ @id で参照される
// 単一の実体なので、name はページの言語で変えてはいけない — 変えると「同じ@idの
// 実体が2つの矛盾したnameを名乗る」ことになる(2026-07-30レビュー指摘。JAページは
// name:"ズレ計"、ENページはname:"zurekei"を主張していた)。canonicalは
// "zurekei"にした: header()のブランドの文字(brand-name-main)がJA/EN共通で常に
// 英字"zurekei"であり、ドメイン名でもあるため、どちらの言語のページから見ても
// 変わらない自己名としてふさわしい。「ズレ計」はalternateNameとして残す(消す
// 理由が無い正式な日本語名なので)。og:site_name(ページ単位のメタタグ)や
// WebSite.name(WebSite自体はJA/ENで@idが別なので言語ごとに変えてよい)は
// ORG_NAME[lang]のまま(ここでの整理と対象が違う)。
function orgNode() {
  return { "@type": "Organization", "@id": ORG_ID, name: ORG_NAME.en, alternateName: ORG_NAME.ja, url: SITE };
}

// ライセンス: 2026-07-29、運営がCC BY 4.0(データ・本文)/MIT(コード)を決定。
// それまでは「サイトのどこにも利用条件の記載がなく、ここで勝手に宣言すると
// 出典つきで確かめられるという主旨の逆をやることになる」との理由で書いて
// いなかった(このコメントは決定の経緯を残すために消さず書き換えている)。
// CC BYの対象はズレ計が作った部分(指標の選定・並べ方、注記、出典URLの対応
// づけ、本文)であり、個々の数値そのもの(著作権の対象外)や hoan_clauses の
// 条文原文(著作権法13条によりそもそも著作権の対象外)には及ばない。詳細は
// ../LICENSE-DATA と about.js の licenseBody を参照。
//
// EN側の @id は JA側と衝突しないよう /en/chart/<key>#dataset にする(同じ指標でも
// 別言語の別ページなので、別のDatasetとして参照できる必要がある)。
const CC_BY_4 = "https://creativecommons.org/licenses/by/4.0/";
function buildJsonLd(key, metric, rows, lang) {
  const years = rows.map((r) => r.year);
  const url = abs(chartRel(key)[lang]);
  const obj = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    // トップ(index.html)の DataCatalog からこの @id で参照する。
    "@id": `${url}#dataset`,
    name: metricDatasetName(metric, lang),
    description: lang === "en" ? metric.descEn : metric.desc,
    url,
    isAccessibleForFree: true,
    license: CC_BY_4,
    inLanguage: lang,
    temporalCoverage: `${Math.min(...years)}/${Math.max(...years)}`,
    // @id を持たせて、トップの Organization(index.html) と同一実体だと機械に
    // 分かる形にする。type/name/url も残すのは、このページ単体だけを読んだ
    // クローラでも自己完結して解釈できるようにするため。name は言語で変えない
    // (orgNode() のコメント参照 — 同じ@idの実体が2つの矛盾したnameを名乗らない)。
    creator: orgNode(),
    // カタログ→Dataset の裸の @id 参照だけでは、Google 等の消費側がページ単位
    // でしか処理せず別文書の @id を解決しに行かないため実質不発になる
    // (2026-07-29 に気づいた)。Google の Dataset ドキュメントが明記しているのは
    // Dataset→DataCatalog のこの逆向きの参照で、効くのは実はこちらなので必ず持たせる。
    includedInDataCatalog: { "@id": CATALOG_ID },
    // unitText も R.metricUnit を通す(直書きの metric.unit だとここだけ日本語の
    // 単位が英語ページのJSON-LDに漏れる、まさに今回直したのと同じ種類の事故)。
    variableMeasured: lang === "en"
      ? [
          { "@type": "PropertyValue", name: "Forecast (initial)", unitText: R.metricUnit(metric, lang) },
          { "@type": "PropertyValue", name: "Actual (confirmed)", unitText: R.metricUnit(metric, lang) },
        ]
      : [
          { "@type": "PropertyValue", name: "見通し（当初）", unitText: R.metricUnit(metric, lang) },
          { "@type": "PropertyValue", name: "実績（確定）", unitText: R.metricUnit(metric, lang) },
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

// urls はこのページ自身の JA/EN 対 (トグルの行き先)。ブランドのリンク先は常に
// トップ(REL.home)で、このページの対とは別物。
//
// aria-label はJAの元コードも T の辞書を通さず直書きだった(サイト名+"トップへ"は
// どのページの.jsにも属さない共通chromeのため)。EN側もそれに揃えて直書きにする
// (2026-07-29、/en/ページ追加時の新規英文。既存のJA同様ここにしか無い)。
function header(lang, urls) {
  const ariaLabel = lang === "en" ? "zurekei home" : "ズレ計 トップへ";
  return `  <header class="site-header">
    <a class="brand" href="${REL.home[lang]}" aria-label="${ariaLabel}">
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
        <a id="lang-ja" class="lang-btn mono${lang === "ja" ? " active" : ""}" href="${urls.ja}">JA</a>
        <a id="lang-en" class="lang-btn mono${lang === "en" ? " active" : ""}" href="${urls.en}">EN</a>
      </div>
    </div>
  </header>`;
}

// about/contact へのリンクは、JA側は元から .html 付きの root-absolute
// ("/about.html")なので、そのバイト列は変えない(このファイルの他の変更と同じ
// 「JAは触らない」制約)。EN側は新規リンクなので REL の規約(拡張子なし)に従う。
function footer(lang) {
  const t = lang === "en"
    ? { src: T.en.footerSrc, about: T.en.footerAbout, contact: T.en.footerContact, aboutHref: REL.about.en, contactHref: REL.contact.en }
    : { src: T.ja.footerSrc, about: T.ja.footerAbout, contact: T.ja.footerContact, aboutHref: "/about.html", contactHref: "/contact.html" };
  return `  <footer class="site-footer-row">
    <span id="t-footer-src">${t.src}</span>
    <a class="footer-about" id="t-footer-about" href="${t.aboutHref}">${t.about}</a>
    <a class="footer-about" id="t-footer-contact" href="${t.contactHref}">${t.contact}</a>
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

// title/meta descriptionはどの.jsのT辞書にも属さない(JAも元からbuild.mjsに
// 直書き)。EN側もそれに揃えて直書きにする(2026-07-29、/en/ページ追加時の新規
// 英文)。本文の見出し・説明は metric.titleEn/descEn(chart.jsのMETRICSに既にある
// 本物の訳)をそのまま使うので、ここで新規に訳しているのは "— zurekei" という
// サイト名の付け方だけ。
function buildPage(key, metric, lang) {
  const rows = readRows(metric);
  const urls = chartRel(key);
  const url = abs(urls[lang]);
  const t = T[lang];
  const metricTitle = lang === "ja" ? metric.title : metric.titleEn;
  const metricDesc = lang === "ja" ? metric.desc : metric.descEn;
  const title = lang === "ja" ? `${metric.title} — ズレ計` : `${metric.titleEn} — zurekei`;
  const metricNote = lang === "ja" ? metric.note : metric.noteEn;
  const note = metricNote
    ? `      <p class="chart-note mono" id="chart-note">${escapeHTML(metricNote)}</p>`
    : `      <p class="chart-note mono" id="chart-note" hidden></p>`;
  const metricArchiveNote = lang === "ja" ? metric.archiveNote : metric.archiveNoteEn;
  const archive = metricArchiveNote
    ? `      <p class="chart-note mono" id="archive-note">${escapeHTML(metricArchiveNote)}</p>`
    : `      <p class="chart-note mono" id="archive-note" hidden></p>`;

  // 集計行はグラフと同じ computeGapStats / gapSummaryText で作る
  const stats = R.computeGapStats(rows, "forecastVal", "actualVal", { fromYear: metric.statsFromYear });
  const summaryText = R.gapSummaryText(stats, metric, lang);
  const summary = summaryText
    ? `      <p class="chart-summary mono" id="chart-summary">${escapeHTML(summaryText)}</p>`
    : `      <p class="chart-summary mono" id="chart-summary" hidden></p>`;

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- このファイルは bin/build.mjs が data/*.csv から生成している。直接編集しない。
     直すのは chart.js の METRICS か data/*.csv のどちらか。 -->
<title id="page-title">${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(metricDesc)}">
<link rel="canonical" href="${url}">
${hreflangTags(urls)}
<meta property="og:site_name" content="${ORG_NAME[lang]}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(metricDesc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/og.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
${assetHead()}
${NOSCRIPT_STYLE}
<script type="application/ld+json">
${buildJsonLd(key, metric, rows, lang)}
</script>
</head>
<body data-metric="${key}">
<div class="page">
${header(lang, urls)}

  <a class="chart-back" id="t-back" href="${REL.home[lang]}">${escapeHTML(t.back)}</a>

  <main>
    <section class="chart-section">
      <h1 class="chart-title" id="chart-title">${escapeHTML(metricTitle)}</h1>
      <p class="chart-desc" id="chart-desc">${escapeHTML(metricDesc)}</p>
${note}

      <div class="chart-wrap">
        <svg id="chart" viewBox="0 0 960 480" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="chart-title"></svg>
        <!-- グラフはJSでしか描かない。JSが無いとこの枠が空箱として残り、壊れて
             いるようにしか見えないので、行き先を書いておく。表示の切り替えは
             <head> の <noscript><style> が持つ。 -->
        <p class="chart-noscript mono">${escapeHTML(t.chartNoscript)}</p>
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
            <span class="stat-chip-label" id="t-stat-forecast">${escapeHTML(t.forecast)}</span>
            <span class="stat-chip-value" id="v-forecast">—</span>
          </div>
          <div class="stat-chip">
            <span class="stat-chip-dot stat-chip-dot-actual"></span>
            <span class="stat-chip-label" id="t-stat-actual">${escapeHTML(t.actual)}</span>
            <span class="stat-chip-value" id="v-actual">—</span>
          </div>
          <div class="stat-chip stat-chip-diff">
            <span class="stat-chip-label" id="t-stat-gap">${escapeHTML(t.gap)}</span>
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
        <summary id="t-table-toggle">${escapeHTML(t.tableToggle(rows.length))}</summary>
${buildTable(metric, rows, lang)}
        <p class="chart-note mono"><span id="t-table-csv">${escapeHTML(t.tableCsvLabel)}</span><a href="${metric.csv}">${escapeHTML(metric.csv)}</a></p>
      </details>
    </section>
  </main>

${footer(lang)}
</div>
<script src="/csv.js?v=${ASSET_V}"></script>
<script src="/chart.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}

/* ── ハブ ────────────────────────────────────────────────── */

// DataCatalog(10個の Dataset を束ねる節点)はここ(chart/index.html)には置かない。
// このハブが実際にリンクしているのは8指標だけで fertility/hoan へのリンクを
// 持たない(経済指標だけの一覧として作られている)。ここに10件のカタログを
// 置くと「そのページに実際に載っている内容と対応しない構造化データ」になり
// スパム扱いされうる。置き場所と理由は buildHomeJsonLd のコメントを参照。
// ハブの見出し・トップへのリンク・フッターの文言はこのページ固有で、どの.jsの
// T辞書にも属さない(このページ自体に対応する.jsが無いため)。JA/EN とも元々
// build.mjsに直書きだった(EN は 2026-07-29 まで data-en 属性としてのみ存在。
// /en/chart/ を実ファイルにするにあたり、新しい文言を追加で発明せず、既にあった
// data-en の値をそのまま「そのページの本文」に昇格させた)。
const HUB_TEXT = {
  ja: {
    title: "指標一覧",
    desc: "政府が年度の初めに置いた見通しと、後から確定した実績を、指標ごとに並べています。",
    metaDesc: "政府の当初見通しと確定した実績を並べた指標の一覧。",
    back: "← トップ",
    footerSrc: "src: 内閣府 / 国民経済計算(SNA)",
    footerAbout: "このサイトについて",
    footerContact: "お問い合わせ",
  },
  en: {
    title: "Indicators",
    desc: "The forecast the government set at the start of each fiscal year, laid alongside the actual figure confirmed later — one page per indicator.",
    metaDesc: "The government's initial forecast laid alongside the confirmed actual, one page per indicator.",
    back: "← Home",
    footerSrc: "src: Cabinet Office of Japan / SNA",
    footerAbout: "About this site",
    footerContact: "Contact",
  },
};

function buildIndex(keys, lang) {
  const h = HUB_TEXT[lang];
  const url = abs(REL.chartHub[lang]);
  const title = lang === "ja" ? "指標一覧 — ズレ計" : "Indicators — zurekei";

  // JAページは元の data-en 属性をそのまま残す(このページの本体機能とは無関係な
  // 旧swap方式の名残だが、JA側は「触らない」制約のもとバイト単位で保つ)。EN
  // ページは data-en を持たない(EN側は本文として直接英語テキストを出す規約)。
  const items = keys
    .map((k) => {
      const m = METRICS[k];
      const mTitle = lang === "ja" ? m.title : m.titleEn;
      const mDesc = lang === "ja" ? m.desc : m.descEn;
      const aAttr = lang === "ja" ? dual(m.titleEn) : "";
      const spanAttr = lang === "ja" ? dual(m.descEn) : "";
      return `        <li>
          <a href="${chartRel(k)[lang]}"${aAttr}>${escapeHTML(mTitle)}</a>
          <span class="hub-desc"${spanAttr}>${escapeHTML(mDesc)}</span>
        </li>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- bin/build.mjs が生成している。直接編集しない。 -->
<title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(h.metaDesc)}">
<link rel="canonical" href="${url}">
${hreflangTags(REL.chartHub)}
<meta property="og:site_name" content="${ORG_NAME[lang]}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(h.metaDesc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/og.png">
${assetHead()}
</head>
<body>
<div class="page">
${header(lang, REL.chartHub)}

  <a class="chart-back" href="${REL.home[lang]}"${lang === "ja" ? dual(HUB_TEXT.en.back) : ""}>${escapeHTML(h.back)}</a>

  <main>
    <section class="chart-section">
      <h1 class="chart-title"${lang === "ja" ? dual(HUB_TEXT.en.title) : ""}>${escapeHTML(h.title)}</h1>
      <p class="chart-desc"${lang === "ja" ? dual(HUB_TEXT.en.desc) : ""}>${escapeHTML(h.desc)}</p>
      <ul class="hub-list">
${items}
      </ul>
    </section>
  </main>

  <footer class="site-footer-row">
    <span${lang === "ja" ? dual(HUB_TEXT.en.footerSrc) : ""}>${escapeHTML(h.footerSrc)}</span>
    <a class="footer-about" href="${lang === "ja" ? "/about.html" : REL.about.en}"${lang === "ja" ? dual(HUB_TEXT.en.footerAbout) : ""}>${escapeHTML(h.footerAbout)}</a>
    <a class="footer-about" href="${lang === "ja" ? "/contact.html" : REL.contact.en}"${lang === "ja" ? dual(HUB_TEXT.en.footerContact) : ""}>${escapeHTML(h.footerContact)}</a>
  </footer>
</div>
<script>
// 旧URL（/chart?m=gdp-real）で来た人を、その指標の新しいURLへ送る。
// 一覧そのものは静的に出ているので、JSが動かなくても行き止まりにはならない。
(function () {
  var m = new URLSearchParams(location.search).get("m");
  if (!m) return;
  var link = document.querySelector('.hub-list a[href="${REL.chartHub[lang]}' + m.replace(/[^a-z-]/g, "") + '"]');
  if (link) location.replace(link.getAttribute("href"));
})();

// 言語トグルは他ページと同じ実リンク(<a>)。切り替えはブラウザの通常の
// ナビゲーションに任せるので、クリック自体にJSは要らない(2026-07-29、
// /en/ページ追加時に、旧来のその場swap方式(data-en/apply(lang))から差し替えた。
// 以前はここでlocalStorageに選択を書き込んでいたが、読み返す処理がどこにも無い
// 書くだけの死んだコードだったため2026-07-30に削除。詳細はhome.jsの同じ変更の
// コメントを参照)。
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

/* ── id指定での中身の置き換え ─────────────────────────────────
 * injectRegion は <!-- BUILD:名前 --> のマーカーが要る(fertility/hoan/
 * index.htmlのJSON-LDのように、機械の持ち物にする領域をあらかじめ手で
 * 区切っておける場合の道具)。id="..." を持つ既存の葉要素(home.jsが
 * textContentで埋めているものなど)にはマーカーを新設せず、id自体を
 * 目印にして中身だけを置き換える。
 *
 * findElementBounds() は fillText()(書く側、task1)と locateElement()
 * (読む側、task2のドリフト検査)の両方から使う共通の下請け。「id="..."を
 * 含む開始タグ〜対応する終了タグ」の境界を、ネストを考慮せず単純に
 * 探すだけ(対象はどれも中に同名タグの入れ子を持たない葉要素なので、
 * 開始タグの直後から次に現れる </タグ名> を対応する終了タグとみなして
 * 差し支えない)。
 */
function findElementBounds(html, id) {
  const idAttr = `id="${id}"`;
  const idIdx = html.indexOf(idAttr);
  if (idIdx < 0) return null;
  const tagStart = html.lastIndexOf("<", idIdx);
  if (tagStart < 0) return null;
  const tagNameMatch = html.slice(tagStart).match(/^<([a-zA-Z][\w-]*)/);
  if (!tagNameMatch) return null;
  const tagName = tagNameMatch[1];
  const openEnd = html.indexOf(">", idIdx);
  if (openEnd < 0) return null;
  const contentStart = openEnd + 1;
  const closeTag = `</${tagName}>`;
  const closeStart = html.indexOf(closeTag, contentStart);
  if (closeStart < 0) return null;
  return { contentStart, closeStart };
}

// 冪等な置き換え(何度ビルドしても同じ結果になる = 追記ではなく置換)。
// 見つからなければ injectRegion と同じ思想で throw する(構造が変わったのに
// 黙って通さない)。既存の中身にタグらしき文字(< か >)が入っていたら、
// 「葉要素の中身をtextContentで丸ごと差し替える」という前提そのものが
// 崩れているサインなので、ここも throw で止める(このヘルパの対象は
// home.jsがtextContent代入している要素だけを想定しており、innerHTML代入
// (contact.js の label-* 等)やネスト構造を持つ要素は対象外)。
function fillText(html, id, text, file) {
  const bounds = findElementBounds(html, id);
  if (!bounds) {
    throw new Error(`${file} に id="${id}" を持つ要素(開始タグ〜対応する終了タグ)が見つからない(構造が変わった可能性がある)`);
  }
  const { contentStart, closeStart } = bounds;
  const existing = html.slice(contentStart, closeStart);
  if (/[<>]/.test(existing)) {
    throw new Error(
      `${file} の id="${id}" の中身に既にタグらしき文字(<>)が含まれている。fillText は葉要素(textContent代入)専用なのでここで止める: ${JSON.stringify(existing)}`
    );
  }
  return html.slice(0, contentStart) + escapeHTML(text) + html.slice(closeStart);
}

// 読み取り専用版(task2のドリフト検査用)。fillText と違い書き込まないので、
// 中身にタグが含まれていても構わない(about.js等はinnerHTMLで<a>入りの文言を
// 差し込むページもあるため)。見つからなければ null を返す — 呼び出し側の
// idCoverageErrors() が「idが無いこと自体」を別に検出しているので、ここでは
// 存在しないidを二重にエラー化しない。
function locateElement(html, id) {
  const bounds = findElementBounds(html, id);
  return bounds ? html.slice(bounds.contentStart, bounds.closeStart) : null;
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

// lang==="ja" は元の出し方(本文=JA、data-en=EN)のまま。lang==="en" は data-en を
// 持たず、本文に直接EN文字列を置く(/en/ ページ側の規約。他の関数と同じ)。
function fertilityTable(d, lang = "ja") {
  const head =
    lang === "ja"
      ? `            <th scope="col"${dual(FERT.T.en.thYear)}>${escapeHTML(FERT.T.ja.thYear)}</th>\n` +
        `            <th scope="col"${dual(FERT.T.en.thActual)}>${escapeHTML(FERT.T.ja.thActual)}</th>\n` +
        d.vintages
          .map(
            (v) =>
              `            <th scope="col"${dual(FERT.vintageLabel(v, "en"))}>${escapeHTML(FERT.vintageLabel(v, "ja"))}</th>`
          )
          .join("\n")
      : `            <th scope="col">${escapeHTML(FERT.T.en.thYear)}</th>\n` +
        `            <th scope="col">${escapeHTML(FERT.T.en.thActual)}</th>\n` +
        d.vintages
          .map((v) => `            <th scope="col">${escapeHTML(FERT.vintageLabel(v, "en"))}</th>`)
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

  const caption =
    lang === "ja"
      ? `        <caption${dual(FERT.T.en.tableCaption)}>${escapeHTML(FERT.T.ja.tableCaption)}</caption>\n`
      : `        <caption>${escapeHTML(FERT.T.en.tableCaption)}</caption>\n`;

  return (
    `      <div class="data-table-wrap">\n` +
    `      <table class="data-table data-table-wide">\n` +
    caption +
    `        <thead>\n          <tr>\n${head}\n          </tr>\n        </thead>\n` +
    `        <tbody>\n${body}\n        </tbody>\n` +
    `      </table>\n` +
    `      </div>`
  );
}

function fertilitySection(d, lang = "ja") {
  const gapJa = fertilityGapLines(d, "ja");
  const gapEn = fertilityGapLines(d, "en");
  // 出典リンクの文言(「出典」)はどのページの.jsにも属さない語で、元から
  // build.mjsに直書きだった(JA固定・EN側もこれまで訳が無かった)。EN表示では
  // fertility.js の sourceActualPrefix と語調を揃えた "Source" を使う
  // (2026-07-29 新規)。
  const srcLabel = lang === "ja" ? "出典" : "Source";
  const gaps = (lang === "ja" ? gapJa : gapEn)
    .map((g, i) => {
      const src = g.url
        ? ` <a href="${escapeHTML(g.url)}" target="_blank" rel="noopener">${srcLabel}</a>`
        : "";
      if (lang === "ja") {
        return `          <li><span${dual(gapEn[i].text)}>${escapeHTML(g.text)}</span>${src}</li>`;
      }
      return `          <li><span>${escapeHTML(g.text)}</span>${src}</li>`;
    })
    .join("\n");

  const summary =
    lang === "ja"
      ? `<summary${dual(FERT.T.en.tableToggle(d.years.length))}>${escapeHTML(FERT.T.ja.tableToggle(d.years.length))}</summary>`
      : `<summary>${escapeHTML(FERT.T.en.tableToggle(d.years.length))}</summary>`;
  const gapHead =
    lang === "ja"
      ? `<p class="gap-head mono"${dual(FERT.T.en.gapHead)}>${escapeHTML(FERT.T.ja.gapHead)}</p>`
      : `<p class="gap-head mono">${escapeHTML(FERT.T.en.gapHead)}</p>`;
  const roundNote =
    lang === "ja"
      ? `<p class="chart-note mono"${dual(FERT.T.en.tableRoundNote)}>${escapeHTML(FERT.T.ja.tableRoundNote)}</p>`
      : `<p class="chart-note mono">${escapeHTML(FERT.T.en.tableRoundNote)}</p>`;
  const csvLabel =
    lang === "ja"
      ? `<span${dual(FERT.T.en.tableCsvLabel)}>${escapeHTML(FERT.T.ja.tableCsvLabel)}</span>`
      : `<span>${escapeHTML(FERT.T.en.tableCsvLabel)}</span>`;

  return `
  <section class="data-section">
    <details class="data-details">
      ${summary}

      ${gapHead}
      <ul class="gap-list mono">
${gaps}
      </ul>

${fertilityTable(d, lang)}

      ${roundNote}
      <p class="chart-note mono">${csvLabel}<a href="/data/fertility_forecast.csv">/data/fertility_forecast.csv</a> · <a href="/data/fertility_actual.csv">/data/fertility_actual.csv</a></p>
    </details>
  </section>
  `;
}

function fertilityJsonLd(d, lang = "ja") {
  const url = abs(REL.fertility[lang]);
  return `
<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${url}#dataset`,
    name: FERTILITY_DATASET.name[lang],
    description: FERT.T[lang].desc,
    url,
    isAccessibleForFree: true,
    license: CC_BY_4,
    inLanguage: lang,
    temporalCoverage: `${d.years[0]}/${d.years[d.years.length - 1]}`,
    // @id はトップ(index.html)の Organization と共通。理由は chart 側の
    // buildJsonLd のコメントを参照。
    creator: orgNode(),
    // トップの card-grid(.card-fallback)に実際にこのページへのリンクがある
    // ので、10件のカタログに含めてよい。理由と裏向き参照の意味は chart 側の
    // buildJsonLd のコメントを参照。
    includedInDataCatalog: { "@id": CATALOG_ID },
    variableMeasured: lang === "en"
      ? [
          { "@type": "PropertyValue", name: "Assumption (medium variant)", unitText: "Total fertility rate" },
          { "@type": "PropertyValue", name: "Actual", unitText: "Total fertility rate" },
        ]
      : [
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
  html = injectRegion(html, "jsonld", fertilityJsonLd(d, "ja"), "fertility.html");
  html = injectRegion(html, "table", fertilitySection(d, "ja"), "fertility.html");
  return html;
}

// /en/fertility.html はJAと違い元ファイルが存在しない(新規)ので injectRegion は
// 使えない。fertility.html のチャーム(header/back-link/h1等)を翻訳して丸ごと
// 組み立てる。中身(JSON-LD・数値表)は fertilityJsonLd/fertilitySection の
// lang="en" 呼び出しをそのまま使う(JAと同じ関数・同じデータ)。
function buildFertilityEn() {
  const d = fertilityData();
  const t = FERT.T.en;
  const urls = REL.fertility;
  const url = abs(urls.en);
  const title = `${t.title} — zurekei`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(t.desc)}">
<link rel="canonical" href="${url}">
${hreflangTags(urls)}
<meta property="og:site_name" content="zurekei">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(t.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/og.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="/style.css?v=${ASSET_V}">
<noscript><style>.chart-wrap > svg, #fertility-legend, #fertility-source { display: none !important; } .chart-noscript { display: block; }</style></noscript>
${fertilityJsonLd(d, "en")}</head>
<body>
<div class="page">
${header("en", urls)}

  <a class="chart-back" id="t-back" href="${REL.home.en}">${escapeHTML(t.back)}</a>

  <main>
    <section class="chart-section">
      <h1 class="chart-title" id="fert-title">${escapeHTML(t.title)}</h1>
      <p class="chart-desc" id="fert-desc">${escapeHTML(t.desc)}</p>

      <div class="chart-wrap">
        <svg id="fertility-chart" viewBox="0 0 960 480" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHTML(t.chartAriaLabel)}"></svg>
        <p class="chart-noscript mono">${escapeHTML(t.chartNoscript)}</p>
      </div>

      <div class="fertility-legend" id="fertility-legend"></div>

      <div class="readout-source" id="fertility-source"></div>
    </section>

${fertilitySection(d, "en")}
  </main>

  <footer class="site-footer-row">
    <span id="t-footer-src">${escapeHTML(t.footerSrc)}</span>
    <a class="footer-about" id="t-footer-about" href="${REL.about.en}">${escapeHTML(t.footerAbout)}</a>
    <a class="footer-about" id="t-footer-contact" href="${REL.contact.en}">${escapeHTML(t.footerContact)}</a>
  </footer>
</div>
<script src="/csv.js?v=${ASSET_V}"></script>
<script src="/fertility.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}

/* ── 見直し条項 ─────────────────────────────────────────── */

const HOAN = loadModule("hoan.js", ["T", "STATUS", "NOTE_LABEL"]);

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

function hoanRowHtml(r, lang = "ja") {
  const t = HOAN.T[lang];
  const meta = HOAN.STATUS[r.review_status] || HOAN.STATUS.pending;
  const status = t.status[r.review_status] || t.status.pending;
  const deadline = r.review_deadline || t.noDeadline;
  const yrs = r.review_years ? t.yearsAfter(r.review_years) : t.noDeadlineYears;
  const noteText = r.enforcement_note ? HOAN.NOTE_LABEL[lang][r.enforcement_note] || r.enforcement_note : "";
  const staged = noteText ? `<span class="hoan-staged mono">${escapeHTML(noteText)}</span>` : "";
  const url = safeUrl(r.source_law_url);
  const src = url
    ? `<a class="hoan-srclink mono" href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(t.srcLink)}</a>`
    : "";
  const clause = hoanClause(r.law_id);

  // 詳細行は hidden にしない。hidden にすると、JSが動かない相手には「HTMLには
  // あるが決して開けない」状態になる。<details> なら素のHTMLだけで開閉できる。
  // JSが動く場合は hoan.js の render() がこの行ごと差し替えるので、操作感は不変。
  // 条文原文(clause)・法令名(law_title)・法令番号(law_num)はいずれも一次資料
  // からの転記そのままなので、EN側でも訳さず常に日本語(lang="en"のページでは
  // lang="ja" を明示する。詳細は chart 側の buildTable の同種コメントを参照)。
  // <pre>にだけ付けて.hoan-lawtitle/.hoan-lawnumに付け忘れていた不揃いが
  // あった(2026-07-30レビュー指摘。日本語のまま残すこと自体は方針どおり
  // 正しいので、マークだけ揃える)。
  const clauseLang = lang === "en" ? ` lang="ja"` : "";
  const detail = clause
    ? `      <tr class="hoan-detail hoan-detail-static">
        <td colspan="4">
          <details>
            <summary class="hoan-clause-head mono">${escapeHTML(t.clauseHead)}</summary>
            <pre class="hoan-clause"${clauseLang}>${escapeHTML(clause)}</pre>
          </details>
        </td>
      </tr>`
    : "";

  return `      <tr class="hoan-row hoan-row-static">
        <td class="col-title">
          <div class="hoan-lawtitle"${clauseLang}>${escapeHTML(r.law_title)}</div>
          <div class="hoan-lawnum mono"${clauseLang}>${escapeHTML(r.law_num)} ${src}</div>
        </td>
        <td class="col-date mono">${escapeHTML(r.enforcement_date || t.enforceMissing)}${staged}</td>
        <td class="col-date mono">${escapeHTML(deadline)}<div class="hoan-yrs mono">${escapeHTML(yrs)}</div></td>
        <td class="col-status"><span class="hoan-badge ${meta.cls}">${escapeHTML(status)}</span></td>
      </tr>
${detail}`;
}

function hoanJsonLd(rows, lang = "ja") {
  const years = rows.map((r) => (r.promulgation_date || "").slice(0, 4)).filter(Boolean).sort();
  const url = abs(REL.hoan[lang]);
  return `
<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${url}#dataset`,
    name: HOAN_DATASET.name[lang],
    description: HOAN.T[lang].desc,
    url,
    isAccessibleForFree: true,
    // CC BYの対象はこのDatasetが表す編集部分(見直し期限の算出・状況分類・
    // 対応づけ)。条文原文(data/hoan_clauses/*.txt)は著作権法13条によりそもそも
    // 著作権の対象外でCC BYの対象にならない(../LICENSE-DATA参照)。ここでの
    // licenseはページ全体ではなくこのDataset(表側のデータ)にかかる宣言。
    license: CC_BY_4,
    inLanguage: lang,
    temporalCoverage: `${years[0]}/${years[years.length - 1]}`,
    // @id はトップ(index.html)の Organization と共通。理由は chart 側の
    // buildJsonLd のコメントを参照。
    creator: orgNode(),
    // トップに hoan-entry として実際にこのページへのリンクがあるので、10件の
    // カタログに含めてよい。理由と裏向き参照の意味は chart 側の buildJsonLd の
    // コメントを参照。
    includedInDataCatalog: { "@id": CATALOG_ID },
    variableMeasured: lang === "en"
      ? [
          { "@type": "PropertyValue", name: "Enforcement date" },
          { "@type": "PropertyValue", name: "Review deadline (enforcement date + clause's N years)" },
          { "@type": "PropertyValue", name: "Whether the deadline has arrived" },
        ]
      : [
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
  html = injectRegion(html, "jsonld", hoanJsonLd(rows, "ja"), "hoan.html");
  // #summary と tbody#rows は、JSが動けば hoan.js が同じ規則で書き直す領域。
  // 静的版はその初期状態（絞り込み無し）にあたる。
  html = injectRegion(html, "summary", escapeHTML(HOAN.T.ja.summary(rows.length, due)), "hoan.html");
  html = injectRegion(html, "rows", `\n${rows.map((r) => hoanRowHtml(r, "ja")).join("\n")}\n    `, "hoan.html");
  return html;
}

// /en/hoan.html も fertility 同様、元ファイルが無いので丸ごと組み立てる。
function buildHoanEn() {
  const rows = hoanRows();
  const due = rows.filter((r) => r.review_status === "due").length;
  const t = HOAN.T.en;
  const urls = REL.hoan;
  const url = abs(urls.en);
  const title = `${t.title} — zurekei`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(t.desc)}">
<link rel="canonical" href="${url}">
${hreflangTags(urls)}
<meta property="og:site_name" content="zurekei">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(t.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/og.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="/style.css?v=${ASSET_V}">
${hoanJsonLd(rows, "en")}</head>
<body>
<div class="page">
${header("en", urls)}

  <a class="chart-back" href="${REL.home.en}" id="t-back">${escapeHTML(t.back)}</a>

  <main>
    <section class="hoan-head">
      <h1 class="chart-title" id="t-title">${escapeHTML(t.title)}</h1>
      <p class="chart-desc" id="t-desc">
        ${escapeHTML(t.desc)}
      </p>
      <p class="hoan-note mono" id="t-note">
        ${escapeHTML(t.note)}
      </p>
    </section>

    <section class="hoan-controls" id="controls" hidden>
      <div class="hoan-filter" id="status-filter" role="group" aria-label="Filter by status"></div>
      <div class="hoan-filter-right">
        <label class="hoan-year-label mono" for="year-filter" id="t-year-label">${escapeHTML(t.yearLabel)}</label>
        <select id="year-filter" class="hoan-year mono"></select>
      </div>
    </section>

    <div class="hoan-summary mono" id="summary">${escapeHTML(t.summary(rows.length, due))}</div>

    <div class="hoan-table-wrap">
      <table class="hoan-table">
        <thead>
          <tr>
            <th class="col-title" id="t-col-law">${escapeHTML(t.colLaw)}</th>
            <th class="col-date mono" id="t-col-enact">${escapeHTML(t.colEnact)}</th>
            <th class="col-date mono" id="t-col-deadline">${escapeHTML(t.colDeadline)}</th>
            <th class="col-status" id="t-col-status">${escapeHTML(t.colStatus)}</th>
          </tr>
        </thead>
        <tbody id="rows">
${rows.map((r) => hoanRowHtml(r, "en")).join("\n")}
    </tbody>
      </table>
    </div>
  </main>

  <footer class="site-footer-row">
    <a class="footer-src" id="t-footer-src" href="https://laws.e-gov.go.jp/" target="_blank" rel="noopener">${escapeHTML(t.footerSrc)}</a>
    <a class="footer-about" id="t-footer-corrections" href="${REL.corrections.en}">${escapeHTML(t.footerCorrections)}</a>
    <a class="footer-about" id="t-footer-about" href="${REL.about.en}">${escapeHTML(t.footerAbout)}</a>
    <a class="footer-about" id="t-footer-contact" href="${REL.contact.en}">${escapeHTML(t.footerContact)}</a>
  </footer>
</div>
<script src="/csv.js?v=${ASSET_V}"></script>
<script src="/hoan.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}

/* ── トップページ(index.html) ───────────────────────────────
 * index.html は元から手書きの静的ページ(丸ごと生成ではない)。fertility/hoan と
 * 同じ理由で、JSON-LD の入る領域だけを BUILD マーカーで機械の持ち物にする。
 */
// DataCatalog(8指標 + fertility + hoan = 10個の Dataset を束ねる節点)をここに
// 置く。かつては chart/index.html(指標一覧)に置いていたが、そのハブが実際に
// リンクしているのは8指標だけで fertility/hoan へのリンクを持たない(経済指標
// だけの一覧として作られている)。構造化データは、そのページに実際に載っている
// 内容と対応していなければならない(対応していないものを書くとスパム扱い
// されうる)ので、8件だけカタログに残す手もあったが、それだと「引用される
// 主体をサイトにする」目的からは片手落ちになる。トップ(index.html)は
// card-grid(.card-fallback、8指標+fertility)と hoan-entry(hoan)の両方で
// 実際に10件全てへのリンクを持っており、内容と対応するのでここに移した。
function buildHomeJsonLd(desc, keys, lang = "ja") {
  const fertUrl = abs(REL.fertility[lang]);
  const hoanUrl = abs(REL.hoan[lang]);
  const catalogDatasets = [
    ...keys.map((k) => {
      const m = METRICS[k];
      const url = abs(chartRel(k)[lang]);
      return {
        "@type": "Dataset",
        "@id": `${url}#dataset`,
        name: metricDatasetName(m, lang),
        url,
        license: CC_BY_4,
      };
    }),
    { "@type": "Dataset", "@id": `${fertUrl}#dataset`, name: FERTILITY_DATASET.name[lang], url: fertUrl, license: CC_BY_4 },
    { "@type": "Dataset", "@id": `${hoanUrl}#dataset`, name: HOAN_DATASET.name[lang], url: hoanUrl, license: CC_BY_4 },
  ];
  const catalogName = lang === "en" ? "Indicators" : "指標一覧";
  // @id 用(末尾スラッシュを含む形。/#website のような結合に使う)と、
  // url フィールド用(JAは元コードが SITE を裸のまま=末尾スラッシュ無しで
  // 使っていたので、そのバイト列を変えないためJAだけ据え置く)を分ける。
  // EN側にJA由来のこの表記ゆれを持ち込む理由は無いので、ENは両方 siteUrl。
  const siteUrl = abs(REL.home[lang]);
  const siteUrlField = lang === "en" ? siteUrl : SITE;
  return `<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@graph": [
      // Organization は各 Dataset(chart/*.html, fertility.html, hoan.html)の
      // creator/publisher が @id で参照する共通ノード。個人を特定する情報
      // (founder/employee/address/telephone等)は入れない。匿名運営を選択肢
      // として残しているため。ja/en 共通(1個体を指すノードなので言語で
      // 分けない。name/alternateNameの決め方は orgNode() のコメントを参照。
      // かつてここは name: ORG_NAME[lang] で、このコメントが「言語で分けない」
      // と書いているのに実装は分けてしまっていた=同じ@idの実体がJAページでは
      // 「ズレ計」、ENページでは「zurekei」を名乗る矛盾があった
      // (2026-07-30レビュー指摘)。
      orgNode(),
      {
        "@type": "WebSite",
        // JAとENは別URL(別ページ)なので @id も分ける(Dataset側の作法と揃える)。
        "@id": `${siteUrl}#website`,
        url: siteUrlField,
        name: ORG_NAME[lang],
        description: desc,
        inLanguage: lang,
        publisher: { "@id": ORG_ID },
      },
      {
        "@type": "DataCatalog",
        // 言語で分けない(CATALOG_ID固定)。以前はEN側だけ`${siteUrl}#catalog`
        // (=/en/#catalog)という別の@idを名乗っていたが、Dataset側の
        // includedInDataCatalogはJA/EN問わず常にCATALOG_IDだけを参照するため
        // (chart側のbuildJsonLdのコメント参照)、/en/#catalogはどこからも
        // 参照されない孤立ノードになっていた。かつこのコード自身のコメントが
        // 「効くのはDataset→DataCatalogの逆参照」と明記している以上、効く側
        // (Dataset→CATALOG_ID)と揃えるのが設計意図に合う(2026-07-30
        // レビュー指摘)。name/description/datasetはこのページの言語でよい
        // (@idが同じでも、各ページが自己完結して説明する分には矛盾しない —
        // Organizationのnameと違い、カタログの「一覧としての見え方」は
        // ページの言語に従って当然変わってよい情報のため)。
        "@id": CATALOG_ID,
        name: catalogName,
        // 新しいコピーを発明せず、トップの meta description をそのまま使う
        // (WebSite と同じ文言でよい。このページ自体が10件へのリンクを持つ
        // ことで内容と対応しているので、カタログ専用の説明文は要らない)。
        description: desc,
        url: siteUrlField,
        license: CC_BY_4,
        // creator ではなく publisher にしたのは、各 Dataset 側が creator を
        // 名乗っているのに揃えるため(このカタログ自身がデータを作っている
        // わけではなく、束ねて出しているだけ)。
        publisher: { "@id": ORG_ID },
        // ここも type/name/url を持たせた参照にする(裸の @id だけだと、この
        // ページ単体を読んだ消費者には「型も名前も無い10個の参照」にしか
        // 見えない)。ただし効くのは Dataset→ここへの includedInDataCatalog の
        // 方(chart側の buildJsonLd のコメント参照)なので、こちらは主に
        // このページを読む人間・クローラへの自己完結した説明として持たせる。
        dataset: catalogDatasets,
      },
    ],
  },
  null,
  2
)}
</script>`;
}

// hero-caption / hero-copy-summary / t-hoan-entry-note の3つは、gdp-nominal と
// hoan_review.csv の実データが要る動的な文言。home.js の main() と同じ計算
// (readRows は chart.js 側の同名関数と別物で home.js には無いため、ここでは
// chart.js から取り込んだ R.parseCSV/R.toNum で同じ手順を踏む。値の出所は
// data/gdp_forecast.csv 一本で、chart/gdp-nominal ページが使っているのと同じ
// CSV・同じ列)。
//
// JA(buildHome)とEN(buildHomeEn)の両方がこの3つを必要とするが、計算をそれぞれに
// 書き写すと「写しを作らない」というこのファイル全体の方針に反する(いつか
// 片方だけ直して数字がズレる)。t(HOME.T.ja または HOME.T.en)を受け取り、
// 文言の組み立て自体は home.js 本物の関数(t.heroCaption/t.heroGapBelow/
// t.hoanEntryNote)にそのまま委ねる、共有の1箇所にする。
function homeDynamicText(t) {
  const gdpNominal = METRICS["gdp-nominal"];
  const gdpRows = readRows(gdpNominal);
  const years = gdpRows.map((r) => r.year);
  const heroRange = years.length ? { min: Math.min(...years), max: Math.max(...years) } : null;
  const heroStats = computeGapStats(gdpRows, "forecastVal", "actualVal", {
    fromYear: gdpNominal.statsFromYear,
  });
  const heroCaption = heroRange ? t.heroCaption(heroRange.min, heroRange.max) : "";
  const heroSummary = heroStats ? t.heroGapBelow(heroStats.below, heroStats.count) : "";

  const hoanAllRows = hoanRows();
  const hoanDue = hoanAllRows.filter((r) => r.review_status === "due").length;
  const hoanNote = t.hoanEntryNote(hoanAllRows.length, hoanDue);

  return { heroCaption, heroSummary, hoanNote };
}

// index.html は元から手書きの静的ページで、home.js の applyI18n() が実行時に
// document.getElementById(id).textContent = t.<key> の形で21個の文言を、CSV
// 由来の動的3個(上のhomeDynamicText)を加えた24個を書き込んでいる。JSを
// 実行しないクローラにはこの24個が一度も見えない(トップページ全体が
// ほぼ無文に見える)ため、ここでT.jaを唯一の原本として静的HTMLへ焼く。
// 対応はhome.jsのapplyI18n()からそのまま写している(発明しない)。
//
// (id, key)の組で持つ(以前は(id, (t) => t.key)という関数のペアだったが、
// それだと下のhomeFillsCoverageErrors()がhome.js側から静的に抜き出した
// (id, key)の組と機械的に突き合わせられない——関数を文字列化して比較するのは
// 脆い)。値はどれもtの単純なプロパティで計算を挟まないため、キー名だけで
// 表現しても表現力を失わない。
const HOME_FILLS = [
  ["t-tag", "tag"],
  ["t-nav", "nav"],
  ["t-nav-hoan", "navHoan"],
  ["t-nav-data", "navData"],
  ["t-nav-about", "navAbout"],
  ["t-lead", "lead"],
  ["t-callout-title", "calloutTitle"],
  ["t-callout-body", "calloutBody"],
  ["t-indicators-label", "indicatorsLabel"],
  ["t-indicators-latest", "indicatorsLatest"],
  ["t-legend-forecast", "plan"],
  ["t-legend-actual", "actual"],
  ["t-hoan-entry-label", "hoanEntryLabel"],
  ["t-hoan-entry-title", "hoanEntryTitle"],
  ["t-hoan-entry-desc", "hoanEntryDesc"],
  ["t-next-update", "nextUpdate"],
  ["hero-copy-headline", "heroCopy"],
  ["t-footer-src", "src"],
  ["t-footer-corrections", "correctionsLink"],
  ["t-footer-about", "aboutLink"],
  ["t-footer-contact", "contactLink"],
];

// CSV由来の動的3件。t.<key>の単純代入ではなく関数呼び出し(t.heroCaption(...)
// 等)でhome.js側から埋められるため、HOME_FILLSにもextractStaticAssignments()の
// 抽出結果にも入らない(下のhomeFillsCoverageErrors()参照)。黙って差分から
// 漏らさないよう、ここに明示しておく。buildHome()/buildHomeEn()はこの3件を
// homeDynamicText()経由で別途fillTextしている。
const HOME_DYNAMIC_EXCLUDED = ["hero-caption", "hero-copy-summary", "t-hoan-entry-note"];

function buildHome(keys) {
  let html = read("index.html");
  // 新しいコピーを発明せず、既存の <meta name="description"> をそのまま使う。
  const m = html.match(/<meta name="description" content="([^"]*)">/);
  if (!m) throw new Error("index.html の meta description が見つからない(構造が変わった可能性がある)");
  const desc = m[1];
  html = injectRegion(html, "jsonld", buildHomeJsonLd(desc, keys, "ja"), "index.html");

  const t = HOME.T.ja;
  for (const [id, key] of HOME_FILLS) html = fillText(html, id, t[key], "index.html");
  // heroCopyは"見通しと実績のズレを、\n記録し続ける。"のように生の改行を含む。
  // <br>に変換しない(EN側のbuildHomeEnと同じくCSSのwhite-space: pre-lineが
  // 改行の見た目を作る側なので、ここは escapeHTML(t.heroCopy) をそのまま置くだけでよい)。
  const { heroCaption, heroSummary, hoanNote } = homeDynamicText(t);
  html = fillText(html, "hero-caption", heroCaption, "index.html");
  html = fillText(html, "hero-copy-summary", heroSummary, "index.html");
  html = fillText(html, "t-hoan-entry-note", hoanNote, "index.html");

  return html;
}

// /en/index.html は元ファイルが無いので丸ごと組み立てる(fertility/hoan と同じ
// 方針)。title/meta description・aria-label は index.html 側もJAの元コードから
// T辞書を通さず直書きなので、EN側も直書きにする(2026-07-29の新規英文。既存の
// 判断基準は header() 直上のコメントを参照)。
function buildHomeEn(keys) {
  const t = HOME.T.en;
  const desc = "An instrument that records the government's economic forecasts and the actual figures side by side, every year, with sources.";
  const title = "zurekei — the gap between government forecasts and actual outcomes";
  const url = abs(REL.home.en);

  const gdpNominal = METRICS["gdp-nominal"]; // hero SVGのaria-label(titleEn)に使うのでこの参照だけ残す
  const { heroCaption, heroSummary, hoanNote } = homeDynamicText(t);

  // JSを実行しないクローラのための素のリンク一覧。JA側の card-fallback と同じ
  // 最小限の忠実度(名前のみ、数値カードには踏み込まない)。
  const cardFallback = HOME.INDICATOR_META.map((m) => {
    const href = m.key === "fertility" ? REL.fertility.en : chartRel(m.key).en;
    return `    <a class="card-fallback" href="${href}">${escapeHTML(m.nameEn)}</a>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(desc)}">
<link rel="canonical" href="${url}">
${hreflangTags(REL.home)}
<meta property="og:site_name" content="zurekei">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/og.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="/style.css?v=${ASSET_V}">
${buildHomeJsonLd(desc, keys, "en")}
</head>
<body>
<div class="page">
  <header class="site-header">
    <a class="brand" href="${REL.home.en}" aria-label="zurekei home">
      ${BRAND_SVG}
      <div>
        <div class="brand-name">
          <span class="brand-name-main">zurekei</span>
          <span class="brand-name-slash">~/</span>
        </div>
        <div class="brand-tag" id="t-tag">${escapeHTML(t.tag)}</div>
      </div>
    </a>
    <div class="header-right">
      <div class="lang-toggle">
        <a id="lang-ja" class="lang-btn mono" href="/">JA</a>
        <a id="lang-en" class="lang-btn mono active" href="/en/">EN</a>
      </div>
      <nav class="site-nav">
        <a class="nav-link nav-current" id="t-nav" href="${REL.home.en}">${escapeHTML(t.nav)}</a>
        <a class="nav-link" id="t-nav-hoan" href="${REL.hoan.en}">${escapeHTML(t.navHoan)}</a>
        <a class="nav-link" id="t-nav-data" href="https://github.com/zurekei/site/tree/main/data" target="_blank" rel="noopener">${escapeHTML(t.navData)}</a>
        <a class="nav-link" id="t-nav-about" href="${REL.about.en}">${escapeHTML(t.navAbout)}</a>
      </nav>
    </div>
  </header>

  <section class="hero">
    <svg id="hero-chart" viewBox="0 0 960 340" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHTML(gdpNominal.titleEn)} — government's initial forecast and confirmed actual"></svg>
    <div class="hero-copy" id="hero-copy">
      <div class="hero-copy-headline" id="hero-copy-headline">${escapeHTML(t.heroCopy)}</div>
      <div class="hero-copy-summary mono" id="hero-copy-summary">${escapeHTML(heroSummary)}</div>
    </div>
    <div class="hero-caption mono" id="hero-caption">${escapeHTML(heroCaption)}</div>
  </section>

  <p class="lead" id="t-lead">${escapeHTML(t.lead)}</p>

  <div class="callout">
    <div class="callout-title" id="t-callout-title">${escapeHTML(t.calloutTitle)}</div>
    <p class="callout-body" id="t-callout-body">${escapeHTML(t.calloutBody)}</p>
  </div>

  <div class="indicators-heading">
    <div class="indicators-label" id="t-indicators-label">${escapeHTML(t.indicatorsLabel)}</div>
    <div class="indicators-latest" id="t-indicators-latest">${escapeHTML(t.indicatorsLatest)}</div>
  </div>

  <!-- 中身は home.js が最新年度の数値つきカードに差し替える。素のリンクを置いて
       あるのは、JSを実行しないクローラにとって、トップから各指標へ辿れる唯一の
       経路になるため(sitemap.xml だけに頼らない)。JA側と同じ理由・同じ忠実度。 -->
  <div class="card-grid" id="card-grid">
${cardFallback}
  </div>

  <div class="legend-row">
    <span class="legend-item"><span class="legend-swatch legend-swatch-forecast"></span><span id="t-legend-forecast">${escapeHTML(t.plan)}</span></span>
    <span class="legend-item"><span class="legend-swatch legend-swatch-actual"></span><span id="t-legend-actual">${escapeHTML(t.actual)}</span></span>
  </div>

  <a class="hoan-entry" href="${REL.hoan.en}">
    <div class="hoan-entry-label mono" id="t-hoan-entry-label">${escapeHTML(t.hoanEntryLabel)}</div>
    <div class="hoan-entry-title" id="t-hoan-entry-title">${escapeHTML(t.hoanEntryTitle)}</div>
    <div class="hoan-entry-desc" id="t-hoan-entry-desc">${escapeHTML(t.hoanEntryDesc)}</div>
    <div class="hoan-entry-note mono" id="t-hoan-entry-note">${escapeHTML(hoanNote)}</div>
    <span class="hoan-entry-arrow mono" aria-hidden="true">→</span>
  </a>

  <div class="next-update mono" id="t-next-update">${escapeHTML(t.nextUpdate)}</div>

  <footer class="site-footer-row">
    <a class="footer-src" id="t-footer-src" href="https://www5.cao.go.jp/keizai1/mitoshi/mitoshikako.html" target="_blank" rel="noopener">${escapeHTML(t.src)}</a>
    <a class="footer-about" id="t-footer-corrections" href="${REL.corrections.en}">${escapeHTML(t.correctionsLink)}</a>
    <a class="footer-about" id="t-footer-about" href="${REL.about.en}">${escapeHTML(t.aboutLink)}</a>
    <a class="footer-about" id="t-footer-contact" href="${REL.contact.en}">${escapeHTML(t.contactLink)}</a>
  </footer>
</div>
<script src="/csv.js?v=${ASSET_V}"></script>
<script src="/hero.js?v=${ASSET_V}"></script>
<script src="/home.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}

// about.html/contact.html はいずれも build.mjs が触ってこなかった純粋な静的
// ファイル(各ページの.jsがクライアント側で文言を差し込むだけ)。corrections.html
// も元はこの2つと同じ純粋な静的ファイルだったが、#corrections-list だけは
// 2026-07-30にBUILD:listマーカーで機械の持ち物にした(理由はbuildCorrections()
// 直上のコメントを参照)。/en/ 版はこの違いに関わらずどの3ページも同じ形にする
// 必要は無い(クローラ向けにHTML自身に文言を書き出す方針のため)ので、
// fertility/hoan/home と同じく丸ごと組み立てる。id 構成は元ファイルの
// applyI18n()/applyStatic() が触るidと1対1で対応させ、静的な初期表示として
// そのまま正しい文言が出るようにする。

function buildAboutEn() {
  const t = ABOUT.T.en;
  const urls = REL.about;
  const url = abs(urls.en);
  const title = `${t.title} — zurekei`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(t.lead)}">
<link rel="canonical" href="${url}">
${hreflangTags(urls)}
<meta property="og:site_name" content="zurekei">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(t.lead)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/og.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="/style.css?v=${ASSET_V}">
</head>
<body>
<div class="page">
${header("en", urls)}

  <a class="chart-back" id="t-back" href="${REL.home.en}">${escapeHTML(t.back)}</a>

  <main class="about-body">
    <h1 class="about-title" id="about-title">${escapeHTML(t.title)}</h1>

    <p class="about-lead" id="about-lead">
      ${escapeHTML(t.lead)}
    </p>

    <details class="about-more">
      <summary><span id="about-summary">${escapeHTML(t.summary)}</span></summary>

      <div class="about-more-body">
        <p id="p-o1">${escapeHTML(t.o1)}</p>

        <p id="p-o2">${escapeHTML(t.o2)}</p>

        <p id="p-o3">${escapeHTML(t.o3)}</p>

        <h2 id="h2-does">${escapeHTML(t.doesTitle)}</h2>

        <p id="p-d1">${escapeHTML(t.d1)}</p>

        <p id="p-d2">${escapeHTML(t.d2)}</p>

        <h2 id="h2-whose">${escapeHTML(t.whoseTitle)}</h2>

        <p id="p-w1">${escapeHTML(t.w1)}</p>

        <p id="p-w2">${escapeHTML(t.w2)}</p>

        <h2 id="h2-goal">${escapeHTML(t.goalTitle)}</h2>

        <p id="p-g1">${escapeHTML(t.g1)}</p>
      </div>
    </details>

    <section class="about-contact">
      <h2 class="about-contact-title" id="contact-title">${escapeHTML(t.contactTitle)}</h2>
      <p id="contact-lead">${t.contactBody}</p>
    </section>

    <section class="about-methods">
      <h2 class="about-methods-title" id="methods-title">${escapeHTML(t.methodsTitle)}</h2>

      <div class="methods-table-wrap">
        <table class="methods-table">
          <thead>
            <tr>
              <th id="th-indicator">${escapeHTML(t.thIndicator)}</th>
              <th id="th-forecast">${escapeHTML(t.thForecast)}</th>
              <th id="th-actual">${escapeHTML(t.thActual)}</th>
            </tr>
          </thead>
          <tbody id="methods-tbody">${ABOUT.renderMethodsRows("en")}</tbody>
        </table>
      </div>

      <dl class="methods-notes">
        <dt id="freq-title">${escapeHTML(t.freqTitle)}</dt>
        <dd id="freq-body">${escapeHTML(t.freqBody)}</dd>

        <dt id="archive-title">${escapeHTML(t.archiveTitle)}</dt>
        <dd id="archive-body">${escapeHTML(t.archiveBody)}</dd>

        <dt id="corrections-title">${escapeHTML(t.correctionsTitle)}</dt>
        <dd id="corrections-body">${t.correctionsBody}</dd>

        <dt id="data-title">${escapeHTML(t.dataTitle)}</dt>
        <dd id="data-body">${t.dataBody}</dd>

        <dt id="license-title">${escapeHTML(t.licenseTitle)}</dt>
        <dd id="license-body">${t.licenseBody}</dd>
      </dl>
    </section>
  </main>

  <footer class="site-footer-row">
    <span id="t-footer-src">${escapeHTML(t.footerSrc)}</span>
    <a class="footer-about" id="t-footer-corrections" href="${REL.corrections.en}">${escapeHTML(t.footerCorrections)}</a>
    <a class="footer-about" id="t-footer-index" href="${REL.home.en}">${escapeHTML(t.footerIndex)}</a>
    <a class="footer-about" id="t-footer-contact" href="${REL.contact.en}">${escapeHTML(t.footerContact)}</a>
  </footer>
</div>
<script src="/about.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}

// data/corrections.csv を読む。fertility/hoan の hoanRows() 等と同じく、
// read()(SITE_DIR相対)経由に揃える(以前はここだけ fs.readFileSync +
// path.join(SITE_DIR, …) を直書きしていた名残り)。
function correctionsRows() {
  return parseCSV(read("data/corrections.csv"));
}

// #corrections-list の中身(内側のHTMLのみ、外側のdivは呼び出し側が持つ)。
// corrections.js の main() が実行時に list.innerHTML へ書き込む規則
// (0件なら空状態の一文、1件以上あれば日付降順でrenderEntry()を並べる)と
// 完全に同じ規則をここに1箇所だけ持つ。JA(buildCorrections)・EN
// (buildCorrectionsEn)の両方から呼ぶ — renderEntry相当のマークアップを
// 言語ごとに書き写すと、いつか片方だけ直して食い違う(このファイル全体の
// 方針)。hoanRowHtml() が JA/EN 共有なのと同じ形。
//
// 各行のマークアップは corrections.js の renderEntry() を loadModule() 経由で
// 取り込んだ本物(CORR.renderEntry)をそのまま呼ぶ。以前はここに renderEntry と
// バイト同一の写しを直書きしていたが、この関数だけ他の.js(chart.js の
// buildTable、hoan.js の hoanRowHtml 等)と違って写しになっており、
// renderEntry が変わるとビルド側が黙ってズレる上に #corrections-list は
// handwrittenJaDriftErrors() の対象外(このファイルの直下のコメント参照)
// なので誰も気づけない状態だった(2026-07-30レビュー指摘)。ABOUT.renderMethodsRows
// を loadModule 経由で呼んでいるのと同じ形に揃えた。
//
// 0件のときの空状態の一文(<p class="correction-empty">…</p>)だけは、
// corrections.js の main() の rows.length === 0 分岐にべた書きで埋まっており
// loadModule 越しに関数として取り出せる形になっていないため、ここは写しとして
// 残す(対応させている行: corrections.js の main() 内、
// `list.innerHTML = ...T[lang].empty...` の1行)。
//
// hoan.html の #summary/#rows に付けたのと同じ注記: ここはJSが動けば
// corrections.js が同じ規則で書き直す領域で、静的版はその初期状態
// (=ビルド時点の data/corrections.csv を全件・日付降順でそのまま出す。
// このページに絞り込みUIは無いので「初期状態」がそのまま「唯一の状態」)
// にあたる。
function correctionsListHtml(rows, lang) {
  const t = CORR.T[lang];
  if (rows.length === 0) {
    return `<p class="correction-empty">${escapeHTML(t.empty)}</p>`;
  }
  return rows
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => CORR.renderEntry(r, lang))
    .join("");
}

// corrections.html(JA)は about/contact と違い、#corrections-list だけは
// BUILD:list マーカーで機械の持ち物にする(fertility/hoanと同じ理由: 訂正が
// 1件でも記録された瞬間、JSを実行しないクローラにはJA版の訂正履歴だけが
// 空に見えてしまうため。2026-07-30に追加)。他のid(title/lead/footer等)は
// これまでどおり手書きのままで、handwrittenJaDriftErrors() がT.jaとの
// 食い違いを検査する(#corrections-list はcorrections.jsが t.<key> の
// 単純代入ではなくrenderEntry()で組み立てるため、その検査の対象には
// 元々入っていない。ここをビルダーの持ち物にしても検査対象は変わらない)。
function buildCorrections() {
  const rows = correctionsRows();
  let html = read("corrections.html");
  html = injectRegion(html, "list", correctionsListHtml(rows, "ja"), "corrections.html");
  return html;
}

function buildCorrectionsEn() {
  const t = CORR.T.en;
  const urls = REL.corrections;
  const url = abs(urls.en);
  const title = `${t.title} — zurekei`;
  // data/corrections.csv は現時点で0件(空データ)。JA版と同じくビルド時点の
  // 状態をそのまま静的HTMLへ焼く(corrections.js の main() が空配列のときに
  // 出す文言と同じ)。行が増えたら次回ビルドで自動的に反映される。
  const rows = correctionsRows();
  const listHtml = correctionsListHtml(rows, "en");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(t.lead)}">
<link rel="canonical" href="${url}">
${hreflangTags(urls)}
<meta property="og:site_name" content="zurekei">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(t.lead)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/og.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="/style.css?v=${ASSET_V}">
</head>
<body>
<div class="page">
${header("en", urls)}

  <a class="chart-back" id="t-back" href="${REL.home.en}">${escapeHTML(t.back)}</a>

  <main class="about-body">
    <h1 class="about-title" id="corrections-title">${escapeHTML(t.title)}</h1>

    <p class="about-lead" id="corrections-lead">
      ${escapeHTML(t.lead)}
    </p>

    <div id="corrections-list">${listHtml}</div>
  </main>

  <footer class="site-footer-row">
    <span id="t-footer-src">${escapeHTML(t.footerSrc)}</span>
    <a class="footer-about" id="t-footer-about" href="${REL.about.en}">${escapeHTML(t.footerAbout)}</a>
    <a class="footer-about" id="t-footer-contact" href="${REL.contact.en}">${escapeHTML(t.footerContact)}</a>
  </footer>
</div>
<script src="/csv.js?v=${ASSET_V}"></script>
<script src="/corrections.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}

// contact.html の <style> は言語に依存しない共通レイアウトなので、JA版から
// バイト単位で複製する(発明ではなく転記。文言はここには一切無い)。
const CONTACT_STYLE = read("contact.html").match(/<style>[\s\S]*?<\/style>/)[0];

function buildContactEn() {
  const t = CONTACT.T.en;
  const urls = REL.contact;
  const url = abs(urls.en);
  const title = `${t.title} — zurekei`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(t.lead)}">
<link rel="canonical" href="${url}">
${hreflangTags(urls)}
<meta property="og:site_name" content="zurekei">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(t.lead)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="/style.css?v=${ASSET_V}">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
${CONTACT_STYLE}
</head>
<body>
<div class="page">
${header("en", urls)}

  <a class="chart-back" id="t-back" href="${REL.home.en}">${escapeHTML(t.back)}</a>

  <div class="contact-page-wrap">
    <h1 id="contact-title">${escapeHTML(t.title)}</h1>
    <p class="lead" id="contact-lead">
      ${escapeHTML(t.lead)}
    </p>

    <form id="contactForm">
      <div class="form-group">
        <label id="label-name">${escapeHTML(t.labelName)}<span>*</span></label>
        <input type="text" id="name" placeholder="${escapeHTML(t.phName)}" required>
      </div>

      <div class="form-group">
        <label id="label-email">${escapeHTML(t.labelEmail)}<span>*</span></label>
        <input type="email" id="email" placeholder="${escapeHTML(t.phEmail)}" required>
      </div>

      <div class="form-group">
        <label id="label-affiliation">${escapeHTML(t.labelAffiliation)}</label>
        <input type="text" id="affiliation" placeholder="${escapeHTML(t.phAffiliation)}">
      </div>

      <div class="form-group">
        <label id="label-message">${escapeHTML(t.labelMessage)}<span>*</span></label>
        <textarea id="message" placeholder="${escapeHTML(t.phMessage)}" required></textarea>
      </div>

      <!-- Site key of the "zurekei-contact" widget. Public by design (it ships to every
           visitor); the paired Secret Key lives in the Pages project's env vars. Both must
           come from the SAME widget — a mismatch fails server-side verification. -->
      <div class="cf-turnstile" data-sitekey="0x4AAAAAAD_Ftl2YrgymWDtM" data-appearance="interaction-only"></div>

      <button type="submit" class="submit-btn" id="submitBtn" data-text="${escapeHTML(t.submit)}">${escapeHTML(t.submit)}</button>

      <div class="form-msg success" id="successMsg">
        ${escapeHTML(t.success)}
      </div>
      <div class="form-msg error" id="errorMsg">
        ${escapeHTML(t.error)}
      </div>
    </form>
  </div>

  <footer class="site-footer-row">
    <a class="footer-about" id="t-footer-index" href="${REL.home.en}">${escapeHTML(t.footerIndex)}</a>
    <a class="footer-about" id="t-footer-corrections" href="${REL.corrections.en}">${escapeHTML(t.footerCorrections)}</a>
    <a class="footer-about" id="t-footer-about" href="${REL.about.en}">${escapeHTML(t.footerAbout)}</a>
  </footer>
</div>

<script src="/contact.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}

/* ── sitemap.xml ─────────────────────────────────────────────
 * かつては手書きで、lastmod は「正確な値を持てない」として入れていなかった
 * (推測日を書くと信用できない情報になる、という当時としては正しい判断)。
 * 今は違う: bin/build.mjs が data/*.csv からページを生成するようになったので、
 * 「そのページの中身がいつ変わったか」は推測ではなく実データ(元ファイルの
 * コミット日)として取れる。政府の公表日に合わせてデータが更新されることが
 * このサイトの価値の中心なのに、更新されたことを機械に伝える手段が今まで
 * 無かった。lastmod は再クロール頻度に効く主要シグナルなので足す。
 *
 * ■ lastmod は「入力ファイル群」ではなく「出力そのもの」で決める
 *   最初の実装は「そのページの元になっているファイル群の、最終更新日の
 *   最大値」だった。その依存表に bin/build.mjs 自身を入れていたため、
 *   bin/build.mjs のコメントを1行直すだけで配信されるHTMLが1バイトも
 *   変わらないのに、それに依存する全ページの lastmod が「更新された」と
 *   宣言されてしまっていた(2026-07-29にレビューで発覚)。lastmod は「中身が
 *   変わった」と機械に伝える信号で、内容と対応しない更新を繰り返すと信号
 *   そのものの信用を落とす。
 *
 *   直したのは判定対象そのもの: 「入力ファイル群」ではなく「生成された出力」
 *   を見る。丸ごと/差し込み生成しているページ(chart/*.html, fertility.html,
 *   hoan.html, corrections.html, index.html)は、いま生成した文字列を
 *   git show HEAD:<path> の内容と比べ、
 *     - 違う(=このビルドでバイトが変わった) → 今日の日付
 *     - 同じ → その出力ファイル自身の git log -1 --format=%cs
 *     - HEAD に無い(新規ページ) → 今日の日付
 *   とする(outputDate())。これで bin/build.mjs 自身への変更は、それが実際に
 *   配信バイトを変えたときだけ lastmod に効く。依存ファイルの対応表を人が
 *   保守する必要も無くなった(このリポジトリが避けてきた「手書きの対応表」が
 *   ひとつ消える)。
 *
 *   about/contact の JA版はビルダーの生成物ではない(ビルダーが触らない
 *   ページ)ので、この判定は使えない。従来どおり「元になっているファイル群の
 *   コミット日の最大値」(lastmod()/fileDate())のままでよい。この2ページの
 *   依存表に bin/build.mjs は元から入っていない(触っていないので当然)。
 *   corrections.html は元はこの2つと同じ純粋な静的ファイルだったが、
 *   #corrections-list だけは(訂正が1件でも記録された瞬間、JSを実行しない
 *   クローラにはJA版の訂正履歴だけが空に見えてしまうのを防ぐため)2026-07-30に
 *   BUILD:list マーカーで機械の持ち物にした。#corrections-list 以外(title/
 *   lead/footer等)はいまも手書きのままだが、ページ全体としては「生成された
 *   出力」を持つようになったので、この3ページの中では corrections.html だけが
 *   fertility/hoan と同じ outputDate() を使う(sitemapEntries() を参照)。
 *   EN版(en/about.html 等)はJA版と違い buildAboutEn() 等が丸ごと生成する
 *   正真正銘のビルダー出力なので、こちらは他の生成ページと同じ outputDate() を
 *   使う(2026-07-30レビュー指摘。以前はEN版もlastmod()を使っておりこの
 *   コメントの原則自体に反していた)。
 *
 *   ■ 循環しないことの確認
 *   「出力を HEAD と比べる」設計がコミットの前後で安定するかを、実際に
 *   コミットを挟まずに追う: ビルド時点でまだ書かれていない・変わった出力は
 *   HEAD と不一致 → 今日の日付になり、そのままファイルへ書かれる。次に
 *   コミットすると、HEAD の内容はいまディスクに書いた内容そのものになる。
 *   入力(CSV等)が変わっていなければ、次にビルドしたときに生成される文字列は
 *   前回と同一なので、HEAD の内容とも一致する → 今度は「その出力ファイルの
 *   最終コミット日」を返す。この値は入力が変わらない限りビルドのたびに同じ
 *   コミットを指し続けるので、それ以上動かない(安定点に落ちる)。逆に入力が
 *   変わって生成文字列が変化すれば、また HEAD と不一致になり今日の日付へ
 *   戻る。「今日の日付」と「安定したコミット日」の2状態しか無く、どちらの
 *   遷移も一方向(不一致→今日、コミットで一致→固定)なので、検査が交互に
 *   落ち続けるような輪にはならない。
 *
 * ■ TODAY はローカル日付にする(UTCだと早朝に破れる)
 *   git log --format=%cs はコミットのローカルタイムゾーン(この運営は日本から
 *   作業しておりJST)の日付を返す。new Date().toISOString() は一見正しく
 *   見える(実際に一度これで書かれていた)が、これはUTCの日付を返す。この
 *   運営は実際に早朝(JST 4時台)にコミットすることがあり、00:00〜09:00 JSTの
 *   間はUTCがまだ前日なので、ビルド時点で「今日」として書いた日付が、直後の
 *   コミットの %cs(JSTでの当日)より1日古くなる。同じ日にビルドしてコミット
 *   すれば両者は一致する、という前提が朝の時間帯だけ崩れる。
 *   Intl.DateTimeFormat("sv-SE") はロケールの書式に頼らず YYYY-MM-DD を返す
 *   数少ない標準APIで、かつローカルタイムゾーンで評価される(toISOString()の
 *   ようにUTCへ強制変換しない)ため、ここではこちらを使う。
 */

// git 未追跡・未コミットのパス一覧を1回だけ読む(ファイルごとに git を呼ぶと
// 遅いうえ、輪の説明も「1回読んだ集合と突き合わせる」方が読みやすい)。
const DIRTY_PATHS = (() => {
  const out = execFileSync("git", ["status", "--porcelain"], { cwd: SITE_DIR, encoding: "utf8" });
  const set = new Set();
  for (const line of out.split("\n")) {
    // ステータス2文字 + 半角スペース + パス。リネームの "old -> new" 形式は
    // このリポジトリの依存ファイル(コード・CSV)には起きない運用なので考慮しない。
    const m = line.match(/^.{2} (.+)$/);
    if (m) set.add(m[1]);
  }
  return set;
})();

const TODAY = new Intl.DateTimeFormat("sv-SE").format(new Date());
const fileDateCache = new Map();

// 「入力ファイル群」から日付を決める(生成物ではない about/contact 用。
// corrections.html は2026-07-30以降 outputDate() 側を使う。理由は上のファイル
// 冒頭コメントの「lastmod は入力ファイル群ではなく出力そのもので決める」節を参照)。
function fileDate(rel) {
  if (fileDateCache.has(rel)) return fileDateCache.get(rel);
  let d;
  if (DIRTY_PATHS.has(rel)) {
    d = TODAY;
  } else {
    d = execFileSync("git", ["log", "-1", "--format=%cs", "--", rel], { cwd: SITE_DIR, encoding: "utf8" }).trim();
    if (!d) {
      // 追跡されているはずなのに履歴が見つからない = パス指定ミスの可能性が
      // 高い。誤った日付を静かに出さず、ここで止める。
      throw new Error(`sitemap lastmod: ${rel} の git 履歴が見つからない(パスを確認すること)`);
    }
  }
  fileDateCache.set(rel, d);
  return d;
}

const lastmod = (deps) => deps.map(fileDate).reduce((a, b) => (a > b ? a : b));

const outputDateCache = new Map();

// 「生成された出力そのもの」から日付を決める(bin/build.mjs が丸ごと/差し込み
// 生成する側: chart/*.html, chart/index.html, fertility.html, hoan.html,
// index.html)。理由と循環しないことの説明は上のファイル冒頭コメントを参照。
//
// git status で出力ファイル自体を見る案は取らない: ビルドの時点で出力ファイルは
// まだディスクに書かれておらず、直前のデプロイ分がそのまま clean に見えるため
// 変化を取りこぼす(レビューで指摘された罠)。必ず HEAD の内容といま生成した
// 文字列そのものを比べる。
function outputDate(rel, generated) {
  if (outputDateCache.has(rel)) return outputDateCache.get(rel);
  let head = null;
  try {
    // stdio を明示して stderr を pipe にする: 既定のままだと execFileSync は
    // 失敗時の stderr を e.stderr に積みつつ、このプロセスの stderr にもそのまま
    // 流してしまう(node の既定動作。試して確認済み)。新規ページでは毎回この
    // catch を通るのが正常系なので、放っておくと「HEADに無い」だけの
    // fatal: が指標の数だけ端末に流れ、bin/deploy.sh が警告を読ませる設計を
    // 壊す(本物の警告が埋もれる)。stdio: ["ignore","pipe","pipe"] にすると、
    // e.stderr での判別はそのまま保ちつつ端末には出さずに済む。
    head = execFileSync("git", ["show", `HEAD:${rel}`], {
      cwd: SITE_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString() : "";
    // 黙らせてよいのは「HEADに無い」(=新規ページ、このtry/catch自体が正常に
    // 処理する経路)のときだけ。git リポジトリでない・オブジェクトが壊れている
    // 等、他の理由での失敗まで黙らせると、気づけるべき異常ごと握り潰すことに
    // なる。そのメッセージ以外は stderr をそのまま出し直して投げる。
    //
    // git のメッセージは2種類ある(実測して確認済み):
    //   - "exists on disk, but not in 'HEAD'" … ディスクには既に書かれている
    //     (このビルドを一度動かした後の再実行、または前回の未コミットな生成物)
    //   - "does not exist in 'HEAD'" … ディスクにもまだ無い(全く初めてのビルドで、
    //     このsitemap生成がfs.writeFileSyncより前に走るため。上のファイル冒頭
    //     コメントの「ビルドの時点で出力ファイルはまだディスクに書かれていない」
    //     を参照)。どちらも意味は同じ「HEADに無い」なので両方黙らせる。
    if (!/^fatal: path '.*' (?:exists on disk, but not in|does not exist in) ['"]HEAD['"]/m.test(stderr)) {
      if (stderr) process.stderr.write(stderr);
      throw e;
    }
    head = null; // HEAD に無い = 新規ページ
  }
  let d;
  if (head !== generated) {
    d = TODAY;
  } else {
    d = execFileSync("git", ["log", "-1", "--format=%cs", "--", rel], { cwd: SITE_DIR, encoding: "utf8" }).trim();
    if (!d) {
      throw new Error(`sitemap lastmod: ${rel} の git 履歴が見つからない(パスを確認すること)`);
    }
  }
  outputDateCache.set(rel, d);
  return d;
}

// 出力ファイルの絶対パスを、git/<loc> で使う "/" 区切りの相対パスにする。
function siteRel(absPath) {
  return path.relative(SITE_DIR, absPath).split(path.sep).join("/");
}

function sitemapEntries(keys, files) {
  // files(絶対パス→生成済み文字列)から、そのページに対応する出力の日付を引く。
  // files に無いパスを渡したら呼び出し順の間違い(生成前にsitemapを作ろうと
  // した等)なので、誤った日付を出さずここで止める。
  const genDate = (absPath) => {
    const rel = siteRel(absPath);
    const generated = files.get(absPath);
    if (generated === undefined) {
      throw new Error(`sitemap lastmod: ${rel} が生成物の一覧に無い(呼び出し順を確認すること)`);
    }
    return outputDate(rel, generated);
  };

  const metricEntries = keys.map((k) => ({
    loc: `${SITE}/chart/${k}`,
    priority: "0.9",
    date: genDate(path.join(OUT_DIR, `${k}.html`)),
  }));
  // EN側は同じ生成物なので、対応する出力ファイル(files に積んである)の日付を
  // そのまま使う。about/corrections/contact のEN版も同様にgenDate()を使う
  // (下のstatic配列を参照。about/contactはJA版だけがビルダーの生成物ではないので
  // 別方式。corrections.htmlはJA版も2026-07-30からgenDate()を使う——詳細は
  // static配列のcorrections直上のコメントを参照)。
  const enMetricEntries = keys.map((k) => ({
    loc: `${SITE}/en/chart/${k}`,
    priority: "0.9",
    date: genDate(path.join(EN_OUT_DIR, `${k}.html`)),
  }));

  return {
    home: [
      { loc: `${SITE}/`, priority: "1.0", date: genDate(path.join(SITE_DIR, "index.html")) },
      { loc: `${SITE}/en/`, priority: "1.0", date: genDate(path.join(EN_DIR, "index.html")) },
    ],
    hub: [
      { loc: `${SITE}/chart/`, priority: "0.8", date: genDate(path.join(OUT_DIR, "index.html")) },
      { loc: `${SITE}/en/chart/`, priority: "0.8", date: genDate(path.join(EN_OUT_DIR, "index.html")) },
    ],
    metrics: [
      ...metricEntries,
      { loc: `${SITE}/fertility`, priority: "0.9", date: genDate(path.join(SITE_DIR, "fertility.html")) },
      { loc: `${SITE}/hoan`, priority: "0.8", date: genDate(path.join(SITE_DIR, "hoan.html")) },
      ...enMetricEntries,
      { loc: `${SITE}/en/fertility`, priority: "0.9", date: genDate(path.join(EN_DIR, "fertility.html")) },
      { loc: `${SITE}/en/hoan`, priority: "0.8", date: genDate(path.join(EN_DIR, "hoan.html")) },
    ],
    static: [
      { loc: `${SITE}/about`, priority: "0.7", date: lastmod(["about.html", "about.js", "about.md"]) },
      // corrections.html(JA)はabout.html/contact.htmlと違い、#corrections-listだけは
      // 2026-07-30からbuild.mjsの生成物(BUILD:listマーカー)になっている。「生成物は
      // 出力そのもので決める」という上のファイル冒頭コメントの原則どおりgenDate()を
      // 使う(以前は入力ファイル群のコミット日=lastmod()を見ており、そのままだと
      // corrections.jsのコメントを1行直しただけでもlastmodが動く=過大申告になって
      // いた。逆に#corrections-listの中身だけが変わってもcorrections.htmlのコミット日は
      // 動かないので、入力方式のままなら過少申告にもなり得た。2026-07-30レビュー指摘)。
      { loc: `${SITE}/corrections`, priority: "0.5", date: genDate(path.join(SITE_DIR, "corrections.html")) },
      { loc: `${SITE}/contact`, priority: "0.3", date: lastmod(["contact.html", "contact.js"]) },
      // en/about.html・en/corrections.html・en/contact.html は
      // buildAboutEn/buildCorrectionsEn/buildContactEn が丸ごと生成する出力
      // そのもの(chart/fertility/hoan/homeと同じ生成物)なので、他の生成ページと
      // 同じgenDate()(出力そのものをHEADと比べる)を使う。以前はここも
      // lastmod()(JA側の入力ファイル群のコミット日)を見ていたが、それだと
      // このファイル自身が上のコメントで説く「出力そのもので決める」原則に反し、
      // 英語版のレイアウトだけ変えてもlastmodが動かず(過少申告)、逆にJA版だけ
      // 直してもEN版のlastmodが動く(過大申告)という2方向のズレを持っていた
      // (2026-07-30レビュー指摘)。
      { loc: `${SITE}/en/about`, priority: "0.7", date: genDate(path.join(EN_DIR, "about.html")) },
      { loc: `${SITE}/en/corrections`, priority: "0.5", date: genDate(path.join(EN_DIR, "corrections.html")) },
      { loc: `${SITE}/en/contact`, priority: "0.3", date: genDate(path.join(EN_DIR, "contact.html")) },
    ],
  };
}

function buildSitemap(keys, files) {
  const groups = sitemapEntries(keys, files);
  const urlTag = (e) => `  <url><loc>${e.loc}</loc><lastmod>${e.date}</lastmod><priority>${e.priority}</priority></url>`;
  const body = [groups.home, groups.hub, groups.metrics, groups.static]
    .map((g) => g.map(urlTag).join("\n"))
    .join("\n\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  bin/build.mjs が生成している(chart/*.html と同様、直接編集しない)。指標を
  増やしたときにここを手で直す必要はない(METRICS からURLを導くため)。直すのは
  chart.js の METRICS と、クローラ向けの素のリンクを持つ index.html の
  card-grid だけでよい。静的な発見経路は /chart/ のハブとトップページの
  カードにもあるので、このファイルが唯一の入口だった時期(2026-07-29まで)とは
  事情が変わっている。それでも重複して置くのは、片方が壊れても拾われ続ける
  ようにするため。

  lastmod は当初入れていなかった(正確な値を持てないため。推測日を書くと
  信用できない情報になる、というのが最初の判断)。しかしそれは「このファイルが
  手書きで、更新日を追う手段が無かった」時期の話で、今は bin/build.mjs が
  data/*.csv からページを生成するようになったので、「そのページの中身がいつ
  変わったか」は推測ではなく実データ(元ファイルのコミット日)として取れる。
  政府の公表日に合わせてデータが更新されることがこのサイトの価値の中心なのに、
  更新されたことを機械に伝える手段が今まで無かったので、ここで足す。

  丸ごと/差し込み生成しているページ(chart 系・fertility・hoan・corrections・
  トップ・en/about・en/corrections・en/contact)の lastmod は「そのページの
  元になっているファイル群」ではなく「生成された出力そのもの」を見て決めている。
  生成した文字列を直前のコミット(HEAD)の内容と比べ、違えば今日の日付、同じなら
  出力ファイル自身の最終コミット日とする。理由は、依存ファイルの対応表に
  生成器自身を含めていた最初の実装だと、生成器のコメントを直すだけで配信
  バイトが1つも変わらないのに更新扱いになってしまうため。about/contact の
  JA版だけはビルダーの生成物ではないページなので、この判定は使わず、従来どおり
  元ファイル群のコミット日の最大値を使う(corrections.htmlのJA版は
  #corrections-listだけを機械の持ち物にした2026-07-30以降、他の生成ページと
  同じ判定を使う)。

  日付は同じ日にビルドしてコミットする限り安定する。日をまたぐと検査(node
  bin/build.mjs のcheckモード)が落ちるが、落ちる方向が安全側(誤った日付が
  出ることはなく「ビルドし直せ」と言われるだけ)なので、これでよいとする。
  詳細は bin/build.mjs の sitemapEntries()/buildSitemap() 手前のコメントを
  参照。

  ※ このコメント自体、XMLコメントはハイフンの連続を含められない制約があり、
    ビルドオプション名をそのまま書けなかった(実際にこれで xmllint がパース
    エラーになり、IndexNow送信が「URLを1件も読めない」という気づきにくい
    壊れ方をした)。
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

/* ── 実行 ────────────────────────────────────────────────── */

/* ── 参照側の取りこぼし検査 ──────────────────────────────────
 * 指標ページ本体は生成されるので増減に自動で追従する。sitemap.xml も
 * 2026-07-29から生成物になり METRICS からURLを導くようになったので、この
 * 関数のsitemap側チェックは構造上もう落ちようがない(常にkeysと一致する)。
 * それでも残しているのは、生成ロジック自体を書き換えたときの安全網として。
 * 一方 index.html の card-grid は今も手書きで、足し忘れても見た目には何も
 * 起きず静かに索引から漏れるので、そちらは引き続き意味のある検査。
 */
function crossRefErrors(keys) {
  const errs = [];

  const sitemap = read("sitemap.xml");
  const listed = new Set([...sitemap.matchAll(/<loc>https:\/\/zurekei\.org\/chart\/([a-z-]+)<\/loc>/g)].map((m) => m[1]));
  for (const k of keys) if (!listed.has(k)) errs.push(`sitemap.xml に /chart/${k} が無い`);
  for (const k of listed) if (!keys.includes(k)) errs.push(`sitemap.xml の /chart/${k} は指標として存在しない`);

  const listedEn = new Set([...sitemap.matchAll(/<loc>https:\/\/zurekei\.org\/en\/chart\/([a-z-]+)<\/loc>/g)].map((m) => m[1]));
  for (const k of keys) if (!listedEn.has(k)) errs.push(`sitemap.xml に /en/chart/${k} が無い`);
  for (const k of listedEn) if (!keys.includes(k)) errs.push(`sitemap.xml の /en/chart/${k} は指標として存在しない`);

  const index = read("index.html");
  const linked = new Set([...index.matchAll(/href="chart\/([a-z-]+)"/g)].map((m) => m[1]));
  for (const k of keys) if (!linked.has(k)) errs.push(`index.html の card-grid に chart/${k} へのリンクが無い`);
  for (const k of linked) if (!keys.includes(k)) errs.push(`index.html の chart/${k} は指標として存在しない`);

  // /en/index.html はビルダーの生成物(buildHomeEn)なので、この検査は本来
  // 落ちようがない(METRICS/INDICATOR_META とHOME.INDICATOR_METAが食い違わない
  // 限り)。それでも生成ロジック自体の書き換えに対する安全網として置く。
  const indexEn = read("en/index.html");
  const linkedEn = new Set([...indexEn.matchAll(/href="\/en\/chart\/([a-z-]+)"/g)].map((m) => m[1]));
  for (const k of keys) if (!linkedEn.has(k)) errs.push(`en/index.html の card-grid に /en/chart/${k} へのリンクが無い`);
  for (const k of linkedEn) if (!keys.includes(k)) errs.push(`en/index.html の /en/chart/${k} は指標として存在しない`);

  return errs;
}

/* ── idの取りこぼし検査 ────────────────────────────────────────
 * 「日本語版に要素+idを足し、対応する.jsのapplyI18n()にsetを1行足したのに、
 * 英語版の生成側に同じidを足し忘れる」という壊れ方は、この検査が無いと
 * 誰にも拾われない: chart.js/about.js/fertility.js等のapplyI18n()は
 * nullガード無しの document.getElementById(...).textContent なので、
 * 存在しないidを引けばTypeErrorでmain()ごと死ぬ。JS自体は有効に読み込まれる
 * (構文エラーではない)ので<noscript>の案内も出ず、空のSVG箱だけが残る
 * 壊れ方になる。かつ既存の--checkは「ビルダーの出力とディスクの一致」しか
 * 見ないので、この種の壊れ方には永久に反応しない(2026-07-30レビュー指摘)。
 *
 * 各.jsからgetElementByIdの対象idを正規表現で抜き出し、対応する生成HTML
 * (filesに積んだ「実際に配信されるバイト列」そのもの)にid="..."が存在するか
 * 照合する。JA側が生成物ではないページ(about/contactのJA)はディスク上の
 * 手書きファイルをreadする — このid検査に限っては「実際に配信されている中身」を
 * 見たいので、ビルド前のディスクの中身で十分(about.html/contact.htmlは
 * build.mjsが触らないのでビルドしても変わらない)。corrections.htmlのJA版も
 * 同じくreadでディスクから読む。こちらは#corrections-listの中身自体は
 * 2026-07-30以降build.mjsが書き換えるが、この検査が見ているのは
 * id="corrections-list"という外枠のidの存在だけで、その外枠はbuild.mjsが
 * 触らない領域にあるので、ビルド前のディスクの中身のままで支障ない。
 */
function extractGetElementByIdIds(src) {
  const direct = [...src.matchAll(/getElementById\(\s*["'`]([\w-]+)["'`]\s*\)/g)].map((m) => m[1]);
  // getElementById の直接呼び出しだけを見ると、この検査はほぼ何も見ない。
  // 各ページの applyStatic() は set("t-title", t.title) というヘルパー越しに
  // idを渡しており、リテラルが getElementById(...) の中に現れないため
  // 上のパターンに1つも掛からない(hoan.js は13個すべてがこの形で、
  // en/hoan.html から id を消しても検査が通ってしまった)。
  // 「i18nで差し替える要素のidは t- で始める」というこのサイトの規約に
  // 乗って、t- で始まる文字列リテラルも対象にする。規約を破ったidは
  // 拾えないが、その場合は直接 getElementById で引かれる形になるので
  // 上のパターンが拾う。
  const tPrefixed = [...src.matchAll(/["'`](t-[\w-]+)["'`]/g)].map((m) => m[1]);
  return [...new Set([...direct, ...tPrefixed])];
}

function htmlHasId(html, id) {
  // id="..." 属性そのものだけを見る(data-*属性名やコメント中の文字列との
  // 誤マッチを避ける)。
  return new RegExp(`\\bid="${id}"`).test(html);
}

function idCoverageErrors() {
  const errs = [];
  const targets = [
    {
      js: "hero.js",
      htmls: [
        { label: "index.html", html: files.get(path.join(SITE_DIR, "index.html")) },
        { label: "en/index.html", html: files.get(path.join(EN_DIR, "index.html")) },
      ],
    },
    {
      js: "home.js",
      htmls: [
        { label: "index.html", html: files.get(path.join(SITE_DIR, "index.html")) },
        { label: "en/index.html", html: files.get(path.join(EN_DIR, "index.html")) },
      ],
    },
    {
      js: "chart.js",
      htmls: keys.flatMap((k) => [
        { label: `chart/${k}.html`, html: files.get(path.join(OUT_DIR, `${k}.html`)) },
        { label: `en/chart/${k}.html`, html: files.get(path.join(EN_OUT_DIR, `${k}.html`)) },
      ]),
    },
    {
      js: "fertility.js",
      htmls: [
        { label: "fertility.html", html: files.get(path.join(SITE_DIR, "fertility.html")) },
        { label: "en/fertility.html", html: files.get(path.join(EN_DIR, "fertility.html")) },
      ],
    },
    {
      js: "hoan.js",
      htmls: [
        { label: "hoan.html", html: files.get(path.join(SITE_DIR, "hoan.html")) },
        { label: "en/hoan.html", html: files.get(path.join(EN_DIR, "hoan.html")) },
      ],
    },
    {
      js: "about.js",
      htmls: [
        { label: "about.html", html: read("about.html") },
        { label: "en/about.html", html: files.get(path.join(EN_DIR, "about.html")) },
      ],
    },
    {
      js: "contact.js",
      htmls: [
        { label: "contact.html", html: read("contact.html") },
        { label: "en/contact.html", html: files.get(path.join(EN_DIR, "contact.html")) },
      ],
    },
    {
      js: "corrections.js",
      htmls: [
        { label: "corrections.html", html: read("corrections.html") },
        { label: "en/corrections.html", html: files.get(path.join(EN_DIR, "corrections.html")) },
      ],
    },
  ];

  for (const { js, htmls } of targets) {
    const ids = extractGetElementByIdIds(read(js));
    for (const id of ids) {
      for (const { label, html } of htmls) {
        if (html === undefined) continue; // このJSと組み合わせが無いページは対象外
        if (!htmlHasId(html, id)) errs.push(`${label} に ${js} が参照する id="${id}" が無い`);
      }
    }
  }
  return errs;
}

/* ── 手書きJAページ(about/corrections/contact)のドリフト検査 ─────────────
 * about.html / contact.html の JA版は、buildAboutEn() 直前のコメントのとおり
 * build.mjs が触らない純粋な手書きファイル。corrections.html のJA版も
 * #corrections-list(2026-07-30にBUILD:listマーカーで機械の持ち物にした領域。
 * 詳細はbuildCorrections()直上のコメントを参照)以外は同じく手書きのまま。
 * この3ページとも、対応する *.js が実行時に
 * document.getElementById(id).textContent/innerHTML = t.<key> の形で文言を
 * 上書きする。この非対称のせいで、T.ja側だけ直して静的HTMLを直し忘れても、
 * ブラウザ(JSが動く側)では正しい文言が上書き表示されるので誰も気づけない。
 * 実際にabout.jsのT.jaだけ直してabout.htmlが古いまま残り、「運営は一個人
 * です。」がJSを実行しないクローラに一度も見えていなかった事故が起きた
 * (about-lead以下は2026-07-29に手直し済み)。idCoverageErrors()は「idが
 * 存在するか」しか見ておらず、この「idはあるが中身が古い」壊れ方には反応しない。
 *
 * 素朴な全文字列一致では駄目(以前プロトタイプで試して、実体参照や改行の
 * 入れ方の違いで誤検出しうることが分かっている): id単位で、その要素の
 * 中身と、対応するT.jaの値をtextContent/innerHTMLそれぞれの規則どおりに
 * 変換した値を個別に突き合わせる。
 */

// 各.jsから「id と、それに書き込まれる t.<key>」の対応を静的に読み取る。
// 実際に3ファイルを読んで確認した代入の形は次の3種類:
//   1) document.getElementById("id").textContent = t.key;  (about.js に多数)
//   2) document.getElementById("id").innerHTML   = t.key;  (about.js の一部)
//   3) set("id", t.key);  … contact.js/corrections.js が定義する
//      textContent専用ヘルパー経由(そのままgetElementByIdだけを正規表現で
//      探すとこの形は1件も拾えない。idCoverageErrors()のextractGetElementByIdIds
//      が「t-で始まるidは文字列リテラルからも拾う」のと同じ理由の対処)。
//      ヘルパーの定義自体を実際に読んで確認した上で、その定義文字列が
//      ファイル中に無ければ拾わない(ヘルパーの中身が変わったら黙って
//      誤読しないための最小限のガード)。
//   4) document.getElementById("id").innerHTML = `${t.key}<固定マークアップ>`;
//      … contact.js の label-name/label-email/label-message。必須項目の
//      "*" を付けるためだけにinnerHTMLを使っており、t.key の後ろに続く
//      静的な文字列(例: "<span>*</span>")も比較対象に含める。
function extractStaticAssignments(src) {
  const items = [];
  for (const m of src.matchAll(
    /document\.getElementById\(\s*["'`]([\w-]+)["'`]\s*\)\.(textContent|innerHTML)\s*=\s*t\.(\w+)\s*;/g
  )) {
    items.push({ id: m[1], prop: m[2], key: m[3], suffix: "" });
  }
  const SET_HELPER = 'const set = (id, text) => { document.getElementById(id).textContent = text; };';
  if (src.includes(SET_HELPER)) {
    for (const m of src.matchAll(/\bset\(\s*["'`]([\w-]+)["'`]\s*,\s*t\.(\w+)\s*\)/g)) {
      items.push({ id: m[1], prop: "textContent", key: m[2], suffix: "" });
    }
  } else if (/\bset\(/.test(src)) {
    // set(...) の呼び出しが実在するのに SET_HELPER の定義文字列と一致しない。
    // 一致しなければ上のif節は静かに何もせず、set()経由の代入がまるごと検査から
    // 消える(実測: SET_HELPERの定義に改行を1つ入れて再フォーマットしただけで、
    // corrections.jsは6件全部・contact.jsは12件中8件が0件に無言で落ちた。
    // 2026-07-30レビュー指摘)。
    //
    // これはこのリポジトリの pre-push フックが一度実際に事故にした壊れ方と
    // 同型: リモートの先端SHAが手元に無いとき、走査範囲を決める
    // `git rev-list "$remote_sha..$local_sha"` が失敗して空文字列になり、
    // その失敗を誰も見ていなかったせいで「範囲が空 = チェック対象0件」を
    // 「問題なし」と区別できず、コミットメッセージの検査を一度も走らせずに
    // exit 0 していた(fail open)。ここも同じ形の罠になりうる: ヘルパーの
    // 形が変わって抽出が0件になっても、"0件"と"元々対象が無い"を区別しない
    // 限り検査は黙って通ってしまう。ヘルパーの誤読(=違う形のコードを誤って
    // 正しいと判定すること)は防げているが、「壊れたら黙って通る」検査は
    // 検査が無いより悪い、というのがこのリポジトリの基準なので、ここは
    // 例外を投げて fail closed にする(正規表現をヘルパーの現在の書き方に
    // 追随させて直すまでビルドを止める)。
    throw new Error(
      "extractStaticAssignments: set(...) の呼び出しがあるのに SET_HELPER の定義文字列と一致しない(ヘルパーの形が変わった可能性が高い。正規表現をヘルパーの現在の書き方に追随させること)"
    );
  }
  for (const m of src.matchAll(
    /document\.getElementById\(\s*["'`]([\w-]+)["'`]\s*\)\.innerHTML\s*=\s*`\$\{t\.(\w+)\}([^`$]*)`\s*;/g
  )) {
    items.push({ id: m[1], prop: "innerHTML", key: m[2], suffix: m[3] });
  }
  return items;
}

function handwrittenJaDriftErrors() {
  const errs = [];
  const targets = [
    {
      file: "about.html",
      js: "about.js",
      T: ABOUT.T.ja,
      html: read("about.html"),
      // methods-tbody は `.innerHTML = renderMethodsRows(lang);` という関数呼び
      // 出しで、上のextractStaticAssignments()が拾う「t.<key>」の形にならない
      // (renderMethodsRows自体はMETHODS_ROWSという別の一覧を見る、about.js内の
      // 別の原本)。ここだけ写しを作らずABOUT.renderMethodsRows(loadModuleで
      // 取り込み済みの本物の関数)をそのまま呼んで比較する。この特例で実際に
      // ドリフトを1件検出した(hakkou01.pdf/hakkou02.pdfの参照が about.html 側
      // にだけ残っていた。詳細はこの検査を追加したコミットの説明を参照)。
      // markup:true の意味は下のコメント(タグ間の空白の扱い)を参照。
      extra: [{ id: "methods-tbody", prop: "innerHTML", raw: ABOUT.renderMethodsRows("ja"), markup: true }],
    },
    { file: "corrections.html", js: "corrections.js", T: CORR.T.ja, html: read("corrections.html"), extra: [] },
    { file: "contact.html", js: "contact.js", T: CONTACT.T.ja, html: read("contact.html"), extra: [] },
  ];

  // タグとタグの間だけにある空白(手書きHTML側の改行・インデント)を畳む。
  // renderMethodsRows() 等の関数が組み立てる<tr><td>…のような構造的マーク
  // アップは空白を一切挟まないので、手で整形して読みやすくしてある側とは
  // タグの間の空白だけが違う。文中のテキストとタグの間([日本語]<a>のような
  // 隣接)には元々空白が無いので、ここで畳んでも中身(文字そのもの)は一切
  // 変えない。t.<key>の単純な代入(拡張子extra以外)には使わない — あちらは
  // 地の文なので、空白1つでも実在する食い違いになりうる。
  const collapseMarkupWhitespace = (s) => s.replace(/>\s+</g, "><");

  for (const { file, js, T, html, extra } of targets) {
    const rawAssigns = extractStaticAssignments(read(js));
    // 3ファイルとも実際には最低6件の直接代入がある(corrections.js/contact.jsは
    // set()経由、about.jsはdocument.getElementById().textContent/innerHTML経由)。
    // 0件は「正規表現が現実に追いつけなくなった」以外の意味を持たない ——
    // まっとうな編集で件数自体は変わりうるので「必ずN件」という決め打ちにはせず、
    // 「0件だけを異常とみなす」線で fail closed にする(pre-pushフックの事故
    // ——走査範囲が空になったのを誰も見ておらず、コミットメッセージ検査を
    // 一度も走らせずexit 0していた——と同型。詳細は上のSET_HELPER直後の
    // コメントを参照)。
    if (rawAssigns.length === 0) {
      throw new Error(
        `${js} から extractStaticAssignments() が1件も抽出できなかった(0件はありえない。正規表現がヘルパーの現在の書き方に追いついていない可能性が高い)`
      );
    }
    const assigns = rawAssigns.map(({ id, prop, key, suffix }) => {
      if (T[key] === undefined) throw new Error(`${js} が参照する t.${key} が T.ja に無い(構造が変わった可能性がある)`);
      return { id, prop, raw: T[key] + suffix, markup: false };
    });
    for (const { id, prop, raw, markup } of [...assigns, ...extra]) {
      // idそのものが無いケースはidCoverageErrors()が既に検出するので、ここでは
      // 二重にエラー化せず黙ってスキップする(そちらのエラーメッセージだけで
      // 「idを足し忘れた」ことは分かる)。
      let actual = locateElement(html, id);
      if (actual === null) continue;
      let expected = prop === "textContent" ? escapeHTML(raw) : raw;
      // 前後の空白(手書きHTMLのインデント・改行)は正規化してよいが、中身の
      // 正規化はしない(全角/半角・句読点の違いなどをここで飲み込むと、この
      // 検査自体が事故を見逃す側になる)。
      actual = actual.trim();
      expected = expected.trim();
      if (markup) {
        actual = collapseMarkupWhitespace(actual);
        expected = collapseMarkupWhitespace(expected);
      }
      if (actual !== expected) {
        errs.push(`${file} の id="${id}"(${prop})が ${js} の T.ja と食い違っている`);
      }
    }
  }
  return errs;
}

/* ── HOME_FILLS ↔ home.js の対応検査 ─────────────────────────────
 * HOME_FILLS は home.js の applyI18n() にある21件の直接代入(id, t.<key>)の
 * 手書きの写し(このファイル1401行目付近のコメント参照)。home.js に代入を
 * 1行足して HOME_FILLS に足し忘れると、次のどの検査も反応しない:
 *   - idCoverageErrors() は通る(idはHTML側に存在する。足りないのはHOME_FILLS
 *     側の対応であって、id自体の欠落ではない)
 *   - stale検査は通る(生成物と実ファイルは一致している——足し忘れた文言は
 *     単に生成されないだけで、生成物自体は「その状態で最新」になる)
 *   - handwrittenJaDriftErrors() は通る(index.htmlはそもそもこの検査の
 *     対象外——about/corrections/contactのJA版だけを見る検査のため)
 * → 検出手段ゼロで、index.htmlに空要素が再発する。これは修正2(手書きJA
 * ページのドリフト検査)がまさに殺そうとした壊れ方そのものが、今回追加した
 * HOME_FILLSという新しい写しの中で再発している状態(2026-07-30レビュー指摘)。
 *
 * home.js の applyI18n() にある21件の直接代入は、いずれも
 * extractStaticAssignments() のパターン1
 * (document.getElementById("id").textContent = t.key;)と完全に一致する形を
 * しているので、home.js を読んでこの検査を新たに書ける。HOME_FILLS の
 * (id, key) の組と双方向で突き合わせ、どちらかにしか無い組をエラーにする。
 */
function homeFillsCoverageErrors() {
  const errs = [];
  const fromJs = new Map(extractStaticAssignments(read("home.js")).map(({ id, key }) => [id, key]));
  const fromFills = new Map(HOME_FILLS.map(([id, key]) => [id, key]));

  for (const [id, key] of fromJs) {
    if (HOME_DYNAMIC_EXCLUDED.includes(id)) continue; // 通常ここには来ない(関数呼び出しはパターン1に掛からないため)。念のための防御。
    if (!fromFills.has(id)) {
      errs.push(`home.js の applyI18n() が id="${id}" に t.${key} を代入しているが、HOME_FILLS に対応する組が無い`);
    } else if (fromFills.get(id) !== key) {
      errs.push(
        `home.js の applyI18n() は id="${id}" に t.${key} を代入しているが、HOME_FILLS は t.${fromFills.get(id)} を書いている`
      );
    }
  }
  for (const [id, key] of fromFills) {
    if (!fromJs.has(id)) {
      errs.push(`HOME_FILLS の id="${id}"(t.${key})に対応する代入が home.js の applyI18n() に無い`);
    }
  }
  return errs;
}

const check = process.argv.includes("--check");
const keys = Object.keys(METRICS);

// 丸ごと生成する側（chart/）と、既存ファイルに差し込む側（fertility / hoan）を
// 同じ Map に載せる。中身が最終形として一致すればよいので、扱いは同じでよい。
const files = new Map();
for (const k of keys) files.set(path.join(OUT_DIR, `${k}.html`), buildPage(k, METRICS[k], "ja"));
files.set(path.join(OUT_DIR, "index.html"), buildIndex(keys, "ja"));
files.set(path.join(SITE_DIR, "fertility.html"), buildFertility());
files.set(path.join(SITE_DIR, "hoan.html"), buildHoan());
files.set(path.join(SITE_DIR, "corrections.html"), buildCorrections());
files.set(path.join(SITE_DIR, "index.html"), buildHome(keys));
// /en/ 以下(2026-07-29追加)。JA側と同じ生成器を lang="en" で呼ぶか、元ファイルが
// 無いページ(home/fertility/hoan/about/corrections/contact)は buildXxxEn() で
// 丸ごと組み立てる。詳細は各関数の直上コメントを参照。
for (const k of keys) files.set(path.join(EN_OUT_DIR, `${k}.html`), buildPage(k, METRICS[k], "en"));
files.set(path.join(EN_OUT_DIR, "index.html"), buildIndex(keys, "en"));
files.set(path.join(EN_DIR, "fertility.html"), buildFertilityEn());
files.set(path.join(EN_DIR, "hoan.html"), buildHoanEn());
files.set(path.join(EN_DIR, "index.html"), buildHomeEn(keys));
files.set(path.join(EN_DIR, "about.html"), buildAboutEn());
files.set(path.join(EN_DIR, "corrections.html"), buildCorrectionsEn());
files.set(path.join(EN_DIR, "contact.html"), buildContactEn());
// sitemap.xml の lastmod は他の生成ページの「いま生成した文字列」を直接見る
// (outputDate()。詳細はそのコメントを参照)ので、今度こそ本当に順序が意味を
// 持つ: files に他の全ページが積み終わったあとで呼ぶ必要がある(このMapに
// まだ無いパスを buildSitemap が要求したら genDate() が例外で止める)。
files.set(path.join(SITE_DIR, "sitemap.xml"), buildSitemap(keys, files));

// 指標ディレクトリの余分ファイル(置き土産)検出を chart/ と en/chart/ の両方で
// 行う共通ヘルパー。
function findOrphans(dir) {
  const known = new Set(
    [...files.keys()].filter((f) => path.dirname(f) === dir).map((f) => path.basename(f))
  );
  const orphans = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".html") && !known.has(f))
    : [];
  return { known, orphans };
}

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
  const { orphans } = findOrphans(OUT_DIR);
  const { orphans: orphansEn } = findOrphans(EN_OUT_DIR);

  // crossRefErrors は index.html/en/index.html/sitemap.xml をディスクから
  // read() する。--check はファイルを一切書かないので、これらのうち一度も
  // node bin/build.mjs(素の生成モード)を走らせたことがない環境では
  // en/index.html 等がまだディスクに無くENOENTで落ちる(2026-07-30レビュー
  // 指摘: 落ちる方向自体は安全側だが、生のスタックトレースだけでは原因が
  // 分からない)。ここで拾って「先にビルドしろ」と分かる案内に変える。
  // ENOENT以外(リポジトリが壊れている等)まで握り潰すと本物の異常を隠すので、
  // それだけは再throwする。
  let refs;
  try {
    refs = crossRefErrors(keys);
  } catch (e) {
    if (e && e.code === "ENOENT") {
      console.error(`✗ ${e.path ? path.relative(SITE_DIR, e.path) : "生成物"} が無い(未ビルド)`);
      console.error("  先に `node bin/build.mjs` を実行してから --check を使うこと");
      process.exit(1);
    }
    throw e;
  }
  // idの取りこぼし(英語版の生成側にidを足し忘れる等)は、生成物が最新でも
  // sitemap/トップのリンクが揃っていても検出できない別種の壊れ方なので、
  // stale/orphans/refsとは独立に必ず見る。
  const idErrs = idCoverageErrors();
  // 手書きJAページ(about/corrections/contact)のドリフトも同様に独立(生成物が
  // 最新でも、そもそも生成対象外のページの壊れ方なので stale 側には出ない)。
  const driftErrs = handwrittenJaDriftErrors();
  // HOME_FILLS↔home.jsの対応も同様に独立(index.htmlはhandwrittenJaDriftErrors()
  // の対象外なので、そちらでは拾えない壊れ方)。
  const homeFillsErrs = homeFillsCoverageErrors();
  if (
    stale.length ||
    orphans.length ||
    orphansEn.length ||
    refs.length ||
    idErrs.length ||
    driftErrs.length ||
    homeFillsErrs.length
  ) {
    if (stale.length) console.error(`✗ 生成物が古い: ${stale.join(", ")}`);
    if (orphans.length) console.error(`✗ 余分なファイル: chart/${orphans.join(", chart/")}`);
    if (orphansEn.length) console.error(`✗ 余分なファイル: en/chart/${orphansEn.join(", en/chart/")}`);
    refs.forEach((e) => console.error(`✗ ${e}`));
    idErrs.forEach((e) => console.error(`✗ ${e}`));
    driftErrs.forEach((e) => console.error(`✗ ${e}`));
    homeFillsErrs.forEach((e) => console.error(`✗ ${e}`));
    if (stale.length || orphans.length || orphansEn.length) console.error("  node bin/build.mjs を実行してからデプロイすること");
    process.exit(1);
  }
  console.log(
    `✓ ${files.size} ページは最新（sitemap / トップのリンク / idの対応 / 手書きJAページのT.jaとの対応 / HOME_FILLSとhome.jsの対応とも一致）`
  );
} else {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(EN_OUT_DIR, { recursive: true });
  const { known: chartKnown, orphans } = findOrphans(OUT_DIR);
  for (const f of orphans) fs.unlinkSync(path.join(OUT_DIR, f));
  const { known: chartKnownEn, orphans: orphansEn } = findOrphans(EN_OUT_DIR);
  for (const f of orphansEn) fs.unlinkSync(path.join(EN_OUT_DIR, f));
  for (const [f, html] of files) fs.writeFileSync(f, html);
  console.log(
    `✓ ${files.size} ページを更新（chart/ ${chartKnown.size} 本 + en/chart/ ${chartKnownEn.size} 本 + fertility/hoan/about/corrections/contact(ja+en) + index.html(ja+en) + sitemap.xml）`
  );
  // 生成そのものは成功しても、辿らせる側が欠けていれば索引には出ない。
  // 落ちるほどではないので警告にとどめ、デプロイは --check 側で止める。
  crossRefErrors(keys).forEach((e) => console.warn(`⚠ ${e}`));
  idCoverageErrors().forEach((e) => console.warn(`⚠ ${e}`));
  handwrittenJaDriftErrors().forEach((e) => console.warn(`⚠ ${e}`));
  homeFillsCoverageErrors().forEach((e) => console.warn(`⚠ ${e}`));
}
