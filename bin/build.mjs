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
import { createHash } from "node:crypto";

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

// DataCatalog(METRICSの指標+ fertility + births + hoan の Dataset を束ねる
// 節点。件数はMETRICSの増減に自動で追従するので、ここでは固定数を書かない
// — 2026-08-06、8→10指標への増加時にこのコメントが「8指標=10個」のまま
// 取り残されていた反省)の @id。各 Dataset の
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
const BIRTHS_DATASET = {
  id: `${SITE}/births#dataset`,
  url: `${SITE}/births`,
  name: {
    ja: "出生数｜歴代の将来推計と実績",
    en: "Number of births — successive projections vs actual",
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
  births: { ja: "/births", en: "/en/births" },
  bojVintages: { ja: "/boj-outlook-vintages", en: "/en/boj-outlook-vintages" },
  hoan: { ja: "/hoan", en: "/en/hoan" },
  about: { ja: "/about", en: "/en/about" },
  corrections: { ja: "/corrections", en: "/en/corrections" },
  contact: { ja: "/contact", en: "/en/contact" },
  cite: { ja: "/cite", en: "/en/cite" },
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
const ASSET_V = "20260803a";

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

// 指標ごとのOGP画像は og-<key>.png / og-<key>-en.png(buildPageのogImage参照)。
// カード名の衝突チェックは OG_CARDS の出力先パス一意性チェックとして下に
// ある(OG_CARDSがここではまだ定義されていないため、実際のthrowはそちら)。
// 以前はここに `if ("en" in METRICS) throw ...` という1行だけがあったが、
// 守れていたのは "en" という1キーの衝突だけだった。METRICSにキーX と
// キーX-enが併存すると、Xの英語カードとX-enの日本語カードがどちらも
// og-X-en.pngになり、後に焼いた方が前を黙って上書きする穴が残っていた
// (ogFileErrors()はexpectedをSetで作るため重複が消えて検出しない)。
// 2026-07-30、列挙(="en"というキー名を名指しする)から構造(=出力先パスの
// 重複を機械的に見る)へ変えた。理由: 列挙は「気づいた衝突パターンを1つずつ
// 塞ぐ」やり方で、次に別の衝突パターン(X/X-en以外の組み合わせ)が出るたびに
// また1行足す必要がある。出力先パスの一意性という構造そのものを見れば、
// "en"キーも含めどんな組み合わせの衝突も自動的に捕まる。

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
// 「引用のしかた」ページ。renderDataRows は about.js の renderMethodsRows と同じ
// 理由(データ直リンク表の行を写しにしない)で本物を取り込む。
const CITE = loadModule("cite.js", ["T", "renderDataRows", "DATA_FILES"]);

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

function sourceCell(r, lang, firstRelease) {
  const parts = [];
  const f = safeUrl(r.forecastSourceUrl);
  const a = safeUrl(r.actualSourceUrl);
  if (f) parts.push(`<a href="${escapeHTML(f)}" target="_blank" rel="noopener" data-src="forecast">${escapeHTML(T[lang].forecast)}</a>`);
  if (a) parts.push(`<a href="${escapeHTML(a)}" target="_blank" rel="noopener" data-src="actual">${escapeHTML(T[lang].actual)}</a>`);
  // 初回確報の出典は年版(確報)ごとに別ファイルなので、基準ごとに1本へ畳める
  // 包絡帯(vintageSourceHtml)と違って行ごとに出すしかない。ここに出ることで
  // data/gdp_first_release.csv のURLが静的HTMLに現れ、sourceUrlReachErrors()
  // の要求も満たす(実質の23本はこのページ、名目の23本は名目GDPのページ)。
  const fr = firstRelease && safeUrl(firstRelease.url);
  if (fr) {
    parts.push(
      `<a href="${escapeHTML(fr)}" target="_blank" rel="noopener" data-src="first-release">${escapeHTML(T[lang].firstRelease)}</a>`
    );
  }
  return parts.join(" ");
}

// data/gdp_first_release.csv を年度で引ける形にする。初回確報を持たない指標では
// 空の Map を返し、呼び出し側は列そのものを出さない。
function firstReleaseByYear(metric) {
  const map = new Map();
  if (!metric.firstReleaseCsv) return map;
  const urlCol = `${metric.firstReleaseCol}_source_url`;
  for (const r of parseCSV(read(metric.firstReleaseCsv.replace(/^\//, "")))) {
    const v = toNum(r[metric.firstReleaseCol]);
    if (v === null) continue;
    // **知らない basis は落とす。** vintageSourceHtml と同じ理由で、呼称の追加漏れ
    // (英語ページに生の識別子が出る/訳が無い)を誰にも気づかれないまま公開しない。
    if (!T.ja.basisLabels[r.release_basis] || !T.en.basisLabels[r.release_basis]) {
      throw new Error(
        `data/gdp_first_release.csv の release_basis "${r.release_basis}" に呼称が無い(chart.js の T.ja/T.en の basisLabels に追加すること)`
      );
    }
    map.set(Number(r.fiscal_year), { val: v, url: r[urlCol] || "", basis: r.release_basis || "" });
  }
  if (!map.size) throw new Error(`${metric.firstReleaseCsv} から ${metric.firstReleaseCol} を1件も取り出せなかった`);
  return map;
}

function buildTable(metric, rows, lang) {
  const actuals = rows.filter((r) => r.actualVal !== null);
  const lastActualYear = actuals.length ? actuals[actuals.length - 1].year : -Infinity;
  const frMap = firstReleaseByYear(metric);
  const hasFR = frMap.size > 0;
  // 列数は 年度/見通し/実績/ズレ/出典 の5つ。初回確報を持つ指標だけ6つになる。
  const colCount = hasFR ? 6 : 5;

  const body = rows
    .map((r) => {
      const f = cellForecast(metric, r, lang);
      const a = cellActual(metric, r, lastActualYear, lang);
      const fr = frMap.get(r.year) || null;
      const phAttr = (c) => (c.ph ? ` data-ph="${c.ph}"` : "");
      // 収録の無い年度(FY1999〜2002の年版はウェブ上に残っていない、FY1997以前は
      // 年版そのものが無い)は「—」。実績側の「未公表」「取得できず」と違って
      // 語彙を分けていないのは、ここが空なのは年度の新旧ではなく資料の有無
      // だけによるため。
      const frCell = hasFR
        ? `        <td class="mono">${escapeHTML(fr ? R.fmtVal(fr.val, R.metricUnit(metric, lang), metric.signed) : "—")}</td>\n`
        : "";
      const tr =
        `      <tr>\n` +
        `        <th scope="row" class="mono" data-year="${r.year}">${escapeHTML(R.fmtFY(r.year, lang))}</th>\n` +
        `        <td class="mono"${phAttr(f)}>${escapeHTML(f.text)}</td>\n` +
        frCell +
        `        <td class="mono"${phAttr(a)}>${escapeHTML(a.text)}</td>\n` +
        `        <td class="mono">${escapeHTML(cellGap(metric, r, lang))}</td>\n` +
        `        <td class="data-table-src">${sourceCell(r, lang, fr)}</td>\n` +
        `      </tr>`;
      // 実績側の注記だけを出す（[見通し原文] 等は転記者向けの控えなので出さない）。
      // chart.js の readout と同じ extractEventNote に判断を委ねている。
      const note = R.extractEventNote(r.notes);
      if (!note) return tr;
      // 注記は一次資料からの転記そのままなので常に日本語(EN表でも訳さない。
      // 訳を用意していないのに訳したふりをしない)。lang="ja" は表自体の言語が
      // enでも、この1セルだけ日本語であることを明示する(かつ元からの規約)。
      return `${tr}\n      <tr class="data-table-note"><td colspan="${colCount}" lang="ja">${escapeHTML(note)}</td></tr>`;
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
    (hasFR ? `            <th scope="col" id="t-th-first-release">${escapeHTML(t.firstRelease)}</th>\n` : "") +
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

// 背景の包絡帯(実績が基準改定でどれだけ動いたかの幅)の出典。
//
// **JS側では組み立てない。** /fertility の出典が JS でしか作られておらず、JSを
// 実行しない相手に1文字も届いていなかった事故(2026-08-04)と同じ形にしないため、
// ここで静的HTMLに焼く。数値表と同じ扱い。
//
// 原本は data/gdp_vintages.csv の行ごとのURL列で、この関数は基準ごとに1行へ
// 畳んで見せるだけ(1つの基準の出典は全年度で同じファイル1本なので、54行ぶん
// 並べても読めない)。畳んだ結果は sourceUrlReachErrors() が要求する「CSVの
// URLが静的HTMLに現れること」を実質/名目の2ページで分担して満たす — 実質の
// 6本はこのページに、名目の6本は名目GDPのページに出る。
//
// 基準の呼称は chart.js の T.basisLabels(実績線の基準表示と同じ辞書)を引く。
// **知らない basis は落とす**: 黙って生の `2020base` のような文字列を画面に
// 出すと、訳が無いまま英語ページに日本語の識別子が出たり、呼称の追加漏れが
// 誰にも気づかれないまま公開される。基準を足すのはCSVに行を足すだけで済む
// 作業なので、辞書への追加忘れはここで踏ませるのが正しい。
function vintageSourceHtml(metric, lang) {
  const rows = parseCSV(read(metric.vintageCsv.replace(/^\//, "")));
  const urlCol = `${metric.vintageCol}_source_url`;
  // **data-en は付けない。** /fertility の出典行は1ページの中でJS(fertility.js の
  // applyTableI18n)が本文とdata-enを入れ替えるためあの形だが、指標ページは
  // JA/ENを別ファイルにして解決しており(/chart/... と /en/chart/...)、chart.js に
  // data-en を読む処理は無い。付けても誰も見ないうえ、「ここは実行時に切り替わる
  // 」という嘘の合図になる。
  const label = (ja, en) => `<span>${escapeHTML(lang === "ja" ? ja : en)}</span>`;

  const lines = [];
  const seen = new Set();
  for (const r of rows) {
    const url = safeUrl(r[urlCol]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const ja = T.ja.basisLabels[r.basis];
    const en = T.en.basisLabels[r.basis];
    if (!ja || !en) {
      throw new Error(
        `data/gdp_vintages.csv の basis "${r.basis}" に呼称が無い(chart.js の T.ja/T.en の basisLabels に追加すること)`
      );
    }
    // notes は原資料の但し書きの写しで、訳は用意していない(EN表示でも日本語の
    // まま出すので lang="ja" を付ける)。同じ基準の複数行に同じ文が入るので
    // 重複は畳む。
    const notes = [
      ...new Set(rows.filter((x) => x.basis === r.basis && x.notes).map((x) => x.notes)),
    ];
    const note = notes.length ? ` <span lang="ja">(${escapeHTML(notes.join(" / "))})</span>` : "";
    lines.push(
      `${label(ja, en)}: <a href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(url)}</a>${note}`
    );
  }
  if (!lines.length) throw new Error(`${metric.vintageCsv} から ${urlCol} を1件も取り出せなかった`);

  // クラスは #v-source(JSが年ごとの出典を入れる箱)と同じ readout-source を使う。
  // 見た目を揃えるためだけでなく、**このクラスだけが `word-break: break-all` を
  // 持っている**ため: ESRIのURLは95文字あって区切り機会が無く、chart-note の
  // ままだと狭い画面で横にはみ出す。
  const prefix = label(T.ja.vintageSourcePrefix, T.en.vintageSourcePrefix);
  return `      <p class="readout-source" id="vintage-source">${prefix}<br>${lines.join("<br>")}</p>`;
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
//
// logo は 2026-08-12 に追加(faviconを全ページに宣言したのと同じ回)。PNGの方を
// 指すのは、Googleのロゴの要件が「112x112px以上」というラスタ前提の寸法で
// 書かれており、SVGだと寸法を持たない場合があるため。favicon側でSVGを先に
// 書いているのとは判断が別で、あちらは表示するブラウザ、こちらは読み取る
// クローラが相手。参照先は favicon と同じ実体(zurekei_icon_512.png)にして
// おり、タブのアイコンと検索結果に出るロゴが食い違わないようにしている。
function orgNode() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: ORG_NAME.en,
    alternateName: ORG_NAME.ja,
    url: SITE,
    logo: `${SITE}/zurekei_icon_512.png`,
  };
}

// パンくずの構造化データ(2026-08-06)。可視のナビゲーション(chart-back等の
// 「← 指標一覧」リンク)は常にトップ(REL.home)へ直接戻る2階層構成で、
// /chart/ ハブを経由しない。BreadcrumbListも同じ2階層(トップ→このページ)に
// 揃える — Googleのガイドラインはページ上の可視のナビゲーションと構造化
// データの経路が一致していることを求めており、実在しない中間階層(/chart/ハブ)
// を挟むと不一致になる。Dataset本体とは別のscriptタグとして追加する(Dataset
// 側の「1ページで完結する」制約に無関係な、別の@type)。
function breadcrumbJsonLd(lang, pageUrl, pageTitle) {
  return `
<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: ORG_NAME[lang], item: abs(REL.home[lang]) },
      { "@type": "ListItem", position: 2, name: pageTitle, item: pageUrl },
    ],
  },
  null,
  2
)}
</script>`;
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

// favicon。2026-08-12まで、置いてあるのに <link rel="icon"> がどのページにも
// 無かった(ブラウザは /favicon.ico を暗黙に取りにいくが、そのファイルは存在せず、
// Cloudflare Pages は存在しないパスにトップのHTMLを200で返すので、画像として
// 壊れたものを掴む)。兄弟サイト archives.zurekei.org ができてタブでの識別が
// 意味を持つようになったので明示する。
//
// SVGを先に書くのは、対応するブラウザにそちらを使わせるため(拡大に強い)。
// PNGは非対応ブラウザ向けの控えで、apple-touch-icon はホーム画面追加用。
// ここもルート絶対で書く(理由は下の assetHead() のコメントと同じ。
// /chart/ 配下から相対で書くと /chart/zurekei_icon.svg を指す)。
const FAVICON_HEAD =
  `<link rel="icon" type="image/svg+xml" href="/zurekei_icon.svg">\n` +
  `<link rel="icon" type="image/png" sizes="512x512" href="/zurekei_icon_512.png">\n` +
  `<link rel="apple-touch-icon" href="/zurekei_icon_512.png">`;

// このディレクトリのページは / ではなく /chart/ に置かれる。相対パスのままだと
// style.css が /chart/style.css を指し、Pages は存在しないパスにもトップページの
// HTML を 200 で返すので「CSSのつもりでHTMLを読み込む」壊れ方になる（気づきにくい）。
// ルート絶対で書くこと。<base> で誤魔化さないのは、ここを読んだ人が理由ごと
// 分かるようにするため。
function assetHead() {
  return `${FAVICON_HEAD}\n<link rel="stylesheet" href="/style.css?v=${ASSET_V}">`;
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
  // 包絡帯を持つ指標(実質GDP・名目GDP)だけ、帯の元になった基準別系列の出典を
  // 静的HTMLに出す。帯そのものはJSでしか描かないが、出典はJSを実行しない
  // 相手にも届かなければならない(CLAUDE.md「出典も静的HTMLに入れる」)。
  const vintageSource = metric.vintageCsv ? `\n${vintageSourceHtml(metric, lang)}` : "";
  // 段階1(4月号の中央値のみ)から段階2(全号・扇状チャート)への内部リンク
  // (2026-08-06)。metric.seeVintages を持つ指標(boj-outlook-real/cpi)だけ。
  // /boj-outlook-vintages はホームカード・DataCatalogを持たないため、この
  // リンクが無いとsitemap以外に発見経路が無くなる。
  const seeVintages = metric.seeVintages
    ? `\n      <p class="chart-note mono"><a href="${REL.bojVintages[lang]}">${escapeHTML(t.seeVintagesLink)}</a></p>`
    : "";
  // OGP画像は指標ごとに専用のカード(2026-07-30、og.html?m=<key>で焼く)。
  // ja: og-<key>.png / en: og-<key>-en.png。/chart(指標一覧)・トップ等の
  // 汎用ページは対象外(そちらは buildIndex 等で従来どおり og.png/og-en.png)。
  const ogImage = lang === "ja" ? `og-${key}.png` : `og-${key}-en.png`;

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
<meta property="og:image" content="${SITE}/assets/${ogImage}">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
${assetHead()}
${NOSCRIPT_STYLE}
<script type="application/ld+json">
${buildJsonLd(key, metric, rows, lang)}
</script>
${breadcrumbJsonLd(lang, url, metricTitle)}
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

${archive}${vintageSource}${seeVintages}
    </section>

    <section class="data-section">
      <details class="data-details">
        <summary id="t-table-toggle">${escapeHTML(t.tableToggle(rows.length))}</summary>
${buildTable(metric, rows, lang)}
        <p class="chart-note mono"><span id="t-table-csv">${escapeHTML(t.tableCsvLabel)}</span><a href="${metric.csv}">${escapeHTML(metric.csv)}</a> · <a id="t-cite-link" href="${REL.cite[lang]}">${escapeHTML(t.citeLinkText)}</a></p>
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
  // OGP画像はja/enで別ファイル。JAはog.png、ENはog-en.png(og.html?lang=enで焼く)。
  const ogImage = lang === "ja" ? "og.png" : "og-en.png";

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
<meta property="og:image" content="${SITE}/assets/${ogImage}">
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
      notes: r.notes,
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
  // 「引用のしかた」への導線。文言は chart.js の T(citeLinkText)をそのまま使う
  // (写しを作らない。この T は build.mjs 冒頭で `const { T } = R` として既に
  // chart.js から取り込み済み)。chart/*.html の同じ導線(buildPage)と1箇所に
  // 揃えている。
  const citeLink =
    lang === "ja"
      ? `<a href="${REL.cite.ja}"${dual(T.en.citeLinkText)}>${escapeHTML(T.ja.citeLinkText)}</a>`
      : `<a href="${REL.cite.en}">${escapeHTML(T.en.citeLinkText)}</a>`;

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
      <p class="chart-note mono">${csvLabel}<a href="/data/fertility_forecast.csv">/data/fertility_forecast.csv</a> · <a href="/data/fertility_actual.csv">/data/fertility_actual.csv</a> · ${citeLink}</p>
    </details>
  </section>
  `;
}

// 出典行(#fertility-source)。元は fertility.js の buildSourceHtml() が組み立てて
// いたが、それだと**JSを実行しない相手には出典そのものが届かない**。実際、実績値の
// 出典3件と2002年推計の「原本はスキャンPDFなので別機関のミラーで数値を確認した」
// という注記は、静的HTMLのどこにも出ていなかった(2026-08-04発見)。推計側のURLだけは
// 上のズレ一覧が別途持っていたので、URLが1本も無いようには見えず気づきにくかった。
// 「出典つきで確かめられる」がこのサイトの前提である以上、数値表と同じ扱い——
// ビルドがHTMLに埋め、JSでは組み直さない——にする。
function fertilitySourceHtml(d, lang = "ja") {
  // JAページは本文=JA・data-en=EN。ラベルだけが訳の対象で、URLは言語に依らない。
  // data-en は textContent ごと差し替えられるので、<a> を含まない <span> に付ける。
  const label = (ja, en) =>
    lang === "ja"
      ? `<span${dual(en)}>${escapeHTML(ja)}</span>`
      : `<span>${escapeHTML(en)}</span>`;
  const link = (url) =>
    `<a href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(url)}</a>`;

  const lines = [];
  const seen = new Set();
  for (const v of d.vintages) {
    const first = d.forecast.find((r) => r.vintage === v);
    const url = safeUrl(first.sourceUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    // notes は原資料についての但し書き(ミラーで確認した等)で、訳は用意していない。
    // 日本語のまま出すので lang="ja" を付ける。JAページでも付けるのは、EN表示に
    // 切り替わると <html lang> が en になり、この注記だけ嘘になるため。
    const note = first.notes ? ` <span lang="ja">(${escapeHTML(first.notes)})</span>` : "";
    lines.push(
      `${label(FERT.vintageLabel(v, "ja"), FERT.vintageLabel(v, "en"))}: ${link(url)}${note}`
    );
  }
  for (const r of d.actual) {
    const url = safeUrl(r.sourceUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    lines.push(
      `${label(FERT.T.ja.sourceActualPrefix, FERT.T.en.sourceActualPrefix)}${link(url)}`
    );
  }
  return lines.join("<br>");
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
${breadcrumbJsonLd(lang, url, FERTILITY_DATASET.name[lang])}
`;
}

// 範囲注記(2026-08-01)。合計特殊出生率(比率)と出生数(人数)を読者が取り違え
// やすいため、fert-desc の直後に静的な<p>として常設する。原本は
// fertility.js の T.scopeNote 1箇所(FERT.T[lang].scopeNoteとしてここで
// そのまま読む。写しは作らない)。
function fertilityScopeNote(lang) {
  return escapeHTML(FERT.T[lang].scopeNote);
}

function buildFertility() {
  const d = fertilityData();
  let html = read("fertility.html");
  html = injectRegion(html, "jsonld", fertilityJsonLd(d, "ja"), "fertility.html");
  html = injectRegion(html, "scope", fertilityScopeNote("ja"), "fertility.html");
  html = injectRegion(html, "table", fertilitySection(d, "ja"), "fertility.html");
  html = injectRegion(html, "fertsource", fertilitySourceHtml(d, "ja"), "fertility.html");
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
<!-- 出生率専用カード(2026-07-30追加。og.html?shot&m=fertility&lang=enで焼く)。
     汎用og-en.pngは他のページ(トップ・/chart一覧・about等)用で、fertilityは
     対象から外れた(og.htmlのrenderFan()参照)。 -->
<meta property="og:image" content="${SITE}/assets/og-fertility-en.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
${assetHead()}
<!-- JAの fertility.html と同じ規則。#fertility-source をここに入れないのは、
     中身をビルドがHTMLに埋めてあり、JSが動かない相手にこそ見せたいものだから
     (隠すと出典が届かなくなる)。#fertility-legend はJSが描くSVGの凡例なので
     SVGごと隠す。 -->
<noscript><style>.chart-wrap > svg, #fertility-legend { display: none !important; } .chart-noscript { display: block; }</style></noscript>
${fertilityJsonLd(d, "en")}</head>
<body>
<div class="page">
${header("en", urls)}

  <a class="chart-back" id="t-back" href="${REL.home.en}">${escapeHTML(t.back)}</a>

  <main>
    <section class="chart-section">
      <h1 class="chart-title" id="fert-title">${escapeHTML(t.title)}</h1>
      <p class="chart-desc" id="fert-desc">${escapeHTML(t.desc)}</p>
      <p class="chart-note mono" id="fert-scope-note">${fertilityScopeNote("en")}</p>

      <div class="chart-wrap">
        <svg id="fertility-chart" viewBox="0 0 960 480" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHTML(t.chartAriaLabel)}"></svg>
        <p class="chart-noscript mono">${escapeHTML(t.chartNoscript)}</p>
      </div>

      <div class="fertility-legend" id="fertility-legend"></div>

      <div class="readout-source" id="fertility-source">${fertilitySourceHtml(d, "en")}</div>
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

/* ── 出生数 ─────────────────────────────────────────────
 * 形は /fertility と同じ「歴代推計 vs 実績」だが、値が比率ではなく人数なので
 * 書式(3桁区切り)と軸の単位が違い、さらに /fertility には無い次元がある:
 * **推計側に2つの基準が混じる**(2012年以前の版は日本に住む外国人を含む
 * 総人口ベース、2017年以降の版は日本人人口ベース)。実績は人口動態統計の
 * 「日本における日本人」しか完全な年次系列が無いので、基準が揃うのは
 * 2017/2023の2版だけになる。これを黙って混ぜないために forecast_basis 列を
 * 持たせ、版のラベルに印を付け、注記で差の実測値(2021年で約1.8万人)を書く。
 * 語彙そのものは下の birthsBasisErrors() が検査する。
 */

const BIRTH = loadModule("births.js", [
  "T", "vintageLabel", "BASIS_JAPANESE", "fmtBirths", "fmtBirthsGap",
]);

function birthsData() {
  const forecast = parseCSV(read("data/births_forecast.csv"))
    .map((r) => ({
      vintage: Number(r.vintage_year),
      year: Number(r.target_year),
      births: toNum(r.projected_births),
      basis: r.forecast_basis,
      sourceUrl: r.forecast_source_url,
      notes: r.notes,
    }))
    .filter((r) => r.births !== null);
  const actual = parseCSV(read("data/births_actual.csv"))
    .map((r) => ({
      year: Number(r.year),
      births: toNum(r.actual_births),
      sourceUrl: r.source_url,
      notes: r.notes,
    }))
    .filter((r) => r.births !== null);

  const vintages = [...new Set(forecast.map((r) => r.vintage))].sort((a, b) => a - b);
  // 基準は版の属性(全行同じ)。1版1値であることは birthsBasisErrors() が見る。
  const basisOf = new Map(vintages.map((v) => [v, forecast.find((r) => r.vintage === v).basis]));
  const actualByYear = new Map(actual.map((r) => [r.year, r.births]));
  const years = [...new Set([...actual.map((r) => r.year), ...forecast.map((r) => r.year)])].sort(
    (a, b) => a - b
  );
  const cell = new Map(forecast.map((r) => [`${r.vintage}:${r.year}`, r.births]));
  return { forecast, actual, vintages, basisOf, actualByYear, years, cell };
}

const birthsVintageLabel = (d, v, lang) => BIRTH.vintageLabel(v, lang, d.basisOf.get(v));

// notes の先頭タグ([実績] 等。data/README.md の「notesのタグ」を参照)は、
// 出典行では直前のラベル(「実績: 」)と重複するので落として出す。タグ自体は
// CSV側の統制語彙なので消さない(chart.js の extractEventNote() が同じ規則で
// 読んでいる)。
const stripNoteTag = (s) => (s || "").replace(/^\[[^\]]*\]/, "");

function birthsGapLines(d, lang) {
  const t = BIRTH.T[lang];
  const lines = [];
  for (const v of d.vintages) {
    const rows = d.forecast
      .filter((r) => r.vintage === v)
      .map((r) => ({
        year: r.year,
        f: r.births,
        a: d.actualByYear.has(r.year) ? d.actualByYear.get(r.year) : null,
      }));
    // 実績と重なる年が無い推計は黙って飛ばす(理由は fertilityGapLines と同じ)。
    const st = computeGapStats(rows, "f", "a");
    if (!st) continue;
    lines.push({
      text: t.gapLine(birthsVintageLabel(d, v, lang), st.count, BIRTH.fmtBirthsGap(st.meanGap), st.below, st.above),
      url: safeUrl(d.forecast.find((r) => r.vintage === v).sourceUrl),
    });
  }
  return lines;
}

function birthsTable(d, lang = "ja") {
  const th = (ja, en) =>
    lang === "ja"
      ? `            <th scope="col"${dual(en)}>${escapeHTML(ja)}</th>`
      : `            <th scope="col">${escapeHTML(en)}</th>`;
  const head = [
    th(BIRTH.T.ja.thYear, BIRTH.T.en.thYear),
    th(BIRTH.T.ja.thActual, BIRTH.T.en.thActual),
    ...d.vintages.map((v) => th(birthsVintageLabel(d, v, "ja"), birthsVintageLabel(d, v, "en"))),
  ].join("\n");

  const body = d.years
    .map((y) => {
      const a = d.actualByYear.has(y) ? BIRTH.fmtBirths(d.actualByYear.get(y)) : "";
      const cells = d.vintages
        .map((v) => {
          const val = d.cell.get(`${v}:${y}`);
          return `        <td class="mono">${val === undefined ? "" : BIRTH.fmtBirths(val)}</td>`;
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
      ? `        <caption${dual(BIRTH.T.en.tableCaption)}>${escapeHTML(BIRTH.T.ja.tableCaption)}</caption>\n`
      : `        <caption>${escapeHTML(BIRTH.T.en.tableCaption)}</caption>\n`;

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

function birthsSection(d, lang = "ja") {
  const gapEn = birthsGapLines(d, "en");
  const srcLabel = lang === "ja" ? "出典" : "Source";
  const gaps = (lang === "ja" ? birthsGapLines(d, "ja") : gapEn)
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

  const line = (tag, cls, ja, en) =>
    lang === "ja"
      ? `<${tag} class="${cls}"${dual(en)}>${escapeHTML(ja)}</${tag}>`
      : `<${tag} class="${cls}">${escapeHTML(en)}</${tag}>`;

  const summary =
    lang === "ja"
      ? `<summary${dual(BIRTH.T.en.tableToggle(d.years.length))}>${escapeHTML(BIRTH.T.ja.tableToggle(d.years.length))}</summary>`
      : `<summary>${escapeHTML(BIRTH.T.en.tableToggle(d.years.length))}</summary>`;
  const gapHead = line("p", "gap-head mono", BIRTH.T.ja.gapHead, BIRTH.T.en.gapHead);
  const roundNote = line("p", "chart-note mono", BIRTH.T.ja.tableRoundNote, BIRTH.T.en.tableRoundNote);
  const csvLabel =
    lang === "ja"
      ? `<span${dual(BIRTH.T.en.tableCsvLabel)}>${escapeHTML(BIRTH.T.ja.tableCsvLabel)}</span>`
      : `<span>${escapeHTML(BIRTH.T.en.tableCsvLabel)}</span>`;
  const citeLink =
    lang === "ja"
      ? `<a href="${REL.cite.ja}"${dual(T.en.citeLinkText)}>${escapeHTML(T.ja.citeLinkText)}</a>`
      : `<a href="${REL.cite.en}">${escapeHTML(T.en.citeLinkText)}</a>`;

  return `
  <section class="data-section">
    <details class="data-details">
      ${summary}

      ${gapHead}
      <ul class="gap-list mono">
${gaps}
      </ul>

${birthsTable(d, lang)}

      ${roundNote}
      <p class="chart-note mono">${csvLabel}<a href="/data/births_forecast.csv">/data/births_forecast.csv</a> · <a href="/data/births_actual.csv">/data/births_actual.csv</a> · ${citeLink}</p>
    </details>
  </section>
  `;
}

// 出典行(#births-source)。fertilitySourceHtml と同じ理由でビルドがHTMLに埋める
// (JSでは組み直さない)。違いは実績側の notes も出すこと —— 2025年の値は確定数
// ではなく概数で、9月公表の確定数で改定される。これは「その数字をどう読むか」に
// 直に効く但し書きなので、JSを実行しない相手にも届いていなければ意味がない。
function birthsSourceHtml(d, lang = "ja") {
  const label = (ja, en) =>
    lang === "ja" ? `<span${dual(en)}>${escapeHTML(ja)}</span>` : `<span>${escapeHTML(en)}</span>`;
  const link = (url) =>
    `<a href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(url)}</a>`;
  // 但し書きは一次資料についての日本語の記述で、訳は用意していない。EN表示に
  // 切り替わると <html lang> が en になるため lang="ja" を付ける(fertility と同じ)。
  const note = (raw) => {
    const s = stripNoteTag(raw).trim();
    return s ? ` <span lang="ja">(${escapeHTML(s)})</span>` : "";
  };

  const lines = [];
  const seen = new Set();
  for (const v of d.vintages) {
    const first = d.forecast.find((r) => r.vintage === v);
    const url = safeUrl(first.sourceUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    lines.push(
      `${label(birthsVintageLabel(d, v, "ja"), birthsVintageLabel(d, v, "en"))}: ${link(url)}${note(first.notes)}`
    );
  }
  for (const r of d.actual) {
    const url = safeUrl(r.sourceUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    // 同じ出典の中で但し書きを持つのは先頭行だけ(残りは空欄)なので、その行を探す。
    const withNote = d.actual.find((x) => x.sourceUrl === r.sourceUrl && x.notes);
    lines.push(
      `${label(BIRTH.T.ja.sourceActualPrefix, BIRTH.T.en.sourceActualPrefix)}${link(url)}${note(withNote && withNote.notes)}`
    );
  }
  return lines.join("<br>");
}

function birthsJsonLd(d, lang = "ja") {
  const url = abs(REL.births[lang]);
  return `
<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${url}#dataset`,
    name: BIRTHS_DATASET.name[lang],
    description: BIRTH.T[lang].desc,
    url,
    isAccessibleForFree: true,
    license: CC_BY_4,
    inLanguage: lang,
    temporalCoverage: `${d.years[0]}/${d.years[d.years.length - 1]}`,
    creator: orgNode(),
    includedInDataCatalog: { "@id": CATALOG_ID },
    variableMeasured: lang === "en"
      ? [
          { "@type": "PropertyValue", name: "Projection (medium-fertility variant)", unitText: "Births" },
          { "@type": "PropertyValue", name: "Actual", unitText: "Births" },
        ]
      : [
          { "@type": "PropertyValue", name: "推計（出生中位）", unitText: "人" },
          { "@type": "PropertyValue", name: "実績", unitText: "人" },
        ],
    distribution: [
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE}/data/births_forecast.csv` },
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE}/data/births_actual.csv` },
    ],
  },
  null,
  2
)}
</script>
${breadcrumbJsonLd(lang, url, BIRTHS_DATASET.name[lang])}
`;
}

// 範囲注記。原本は births.js の T.scopeNote 1箇所(fertilityScopeNote と同じ扱い)。
function birthsScopeNote(lang) {
  return escapeHTML(BIRTH.T[lang].scopeNote);
}

function buildBirths() {
  const d = birthsData();
  let html = read("births.html");
  html = injectRegion(html, "jsonld", birthsJsonLd(d, "ja"), "births.html");
  html = injectRegion(html, "scope", birthsScopeNote("ja"), "births.html");
  html = injectRegion(html, "table", birthsSection(d, "ja"), "births.html");
  html = injectRegion(html, "birthsource", birthsSourceHtml(d, "ja"), "births.html");
  return html;
}

// /en/births.html は元ファイルが存在しないので丸ごと組み立てる(buildFertilityEn と同じ)。
function buildBirthsEn() {
  const d = birthsData();
  const t = BIRTH.T.en;
  const urls = REL.births;
  const url = abs(urls.en);
  const title = `${t.title} — zurekei`;
  const desc = "Successive NIPSSR projections of the annual number of births, recorded alongside the actual figure with sources.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(desc)}">
<link rel="canonical" href="${url}">
${hreflangTags(urls)}
<meta property="og:site_name" content="zurekei">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(desc)}">
<meta property="og:url" content="${url}">
<!-- 出生数専用カード(2026-08-04追加。og.html?shot&m=births&lang=en で焼く)。
     JA側 births.html の同じ位置のコメントを参照。 -->
<meta property="og:image" content="${SITE}/assets/og-births-en.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
${assetHead()}
<!-- JAの births.html と同じ規則。#births-source をここに入れないのは、中身を
     ビルドがHTMLに埋めてあり、JSが動かない相手にこそ見せたいものだから。 -->
<noscript><style>.chart-wrap > svg, #births-legend { display: none !important; } .chart-noscript { display: block; }</style></noscript>
${birthsJsonLd(d, "en")}</head>
<body>
<div class="page">
${header("en", urls)}

  <a class="chart-back" id="t-back" href="${REL.home.en}">${escapeHTML(t.back)}</a>

  <main>
    <section class="chart-section">
      <h1 class="chart-title" id="births-title">${escapeHTML(t.title)}</h1>
      <p class="chart-desc" id="births-desc">${escapeHTML(t.desc)}</p>
      <p class="chart-note mono" id="births-scope-note">${birthsScopeNote("en")}</p>

      <div class="chart-wrap">
        <svg id="births-chart" viewBox="0 0 960 480" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHTML(t.chartAriaLabel)}"></svg>
        <p class="chart-noscript mono">${escapeHTML(t.chartNoscript)}</p>
      </div>

      <div class="fertility-legend" id="births-legend"></div>

      <div class="readout-source" id="births-source">${birthsSourceHtml(d, "en")}</div>
    </section>

${birthsSection(d, "en")}
  </main>

  <footer class="site-footer-row">
    <span id="t-footer-src">${escapeHTML(t.footerSrc)}</span>
    <a class="footer-about" id="t-footer-about" href="${REL.about.en}">${escapeHTML(t.footerAbout)}</a>
    <a class="footer-about" id="t-footer-contact" href="${REL.contact.en}">${escapeHTML(t.footerContact)}</a>
  </footer>
</div>
<script src="/csv.js?v=${ASSET_V}"></script>
<script src="/births.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}

/* ── 日銀展望レポート: 号ごとの見通し(段階2) ──────────────────────
 * /chart/boj-outlook-real・/chart/boj-outlook-cpi(段階1)が年度ごとに1つの値
 * (4月号)だけを切り出しているのに対し、このページは全号(issue_kind=="main")の
 * 見通しを号の公表時点で並べる。fertility/births と形は同じ「歴代の見通し
 * vs 実績」だが、グラフのグループ化軸が逆(あちらは1本=1つの推計版、こちらは
 * 1本=1つの対象年度)。理由は boj-outlook-vintages.js 冒頭のコメントを参照。
 */

const BOJV = loadModule("boj-outlook-vintages.js", ["T", "issueToX"]);

function bojVintagesData() {
  const mainRows = parseCSV(read("data/boj_outlook_vintages.csv"))
    .filter((r) => r.issue_kind === "main")
    .map((r) => ({
      issue: r.issue,
      fy: Number(r.target_fiscal_year),
      real: toNum(r.real_median),
      realLow: toNum(r.real_low),
      realHigh: toNum(r.real_high),
      cpi: toNum(r.cpi_median),
      cpiLow: toNum(r.cpi_low),
      cpiHigh: toNum(r.cpi_high),
      sourceUrl: r.source_url,
    }));
  const fysWithMedian = mainRows.filter((r) => r.real !== null || r.cpi !== null).map((r) => r.fy);
  return {
    mainRows,
    fyMin: Math.min(...fysWithMedian),
    fyMax: Math.max(...fysWithMedian),
  };
}

const fmt1 = (v) => (v === null ? null : v.toFixed(1));

// 「中央値(下限〜上限)」の1セル。レンジが無い(段階1のFY2001/2002/2020と同じ
// 事情で、中央値だけ後年に判明しレンジが無い号は無い想定だが、念のため中央値
// だけでも出せるようにしておく)場合は中央値のみ。
function bojVintagesRangeCell(median, low, high) {
  if (median === null) return "";
  if (low === null || high === null) return fmt1(median);
  return `${fmt1(median)} (${fmt1(low)}〜${fmt1(high)})`;
}

function bojVintagesTable(d, lang = "ja") {
  const t = BOJV.T[lang];
  const th = (ja, en) =>
    lang === "ja" ? `            <th scope="col"${dual(en)}>${escapeHTML(ja)}</th>` : `            <th scope="col">${escapeHTML(en)}</th>`;
  const head = [
    th(BOJV.T.ja.thIssue, BOJV.T.en.thIssue),
    th(BOJV.T.ja.thTargetYear, BOJV.T.en.thTargetYear),
    th(BOJV.T.ja.thReal, BOJV.T.en.thReal),
    th(BOJV.T.ja.thCpi, BOJV.T.en.thCpi),
  ].join("\n");

  const body = d.mainRows
    .map((r) => {
      const url = safeUrl(r.sourceUrl);
      const issueCell = url
        ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(r.issue)}</a>`
        : escapeHTML(r.issue);
      return (
        `      <tr>\n` +
        `        <th scope="row" class="mono">${issueCell}</th>\n` +
        `        <td class="mono">${r.fy}</td>\n` +
        `        <td class="mono">${bojVintagesRangeCell(r.real, r.realLow, r.realHigh)}</td>\n` +
        `        <td class="mono">${bojVintagesRangeCell(r.cpi, r.cpiLow, r.cpiHigh)}</td>\n` +
        `      </tr>`
      );
    })
    .join("\n");

  const caption =
    lang === "ja"
      ? `        <caption${dual(t.tableCaption)}>${escapeHTML(BOJV.T.ja.tableCaption)}</caption>\n`
      : `        <caption>${escapeHTML(t.tableCaption)}</caption>\n`;

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

function bojVintagesSection(d, lang = "ja") {
  const t = BOJV.T[lang];
  const summary =
    lang === "ja"
      ? `<summary${dual(t.tableToggle(d.mainRows.length))}>${escapeHTML(BOJV.T.ja.tableToggle(d.mainRows.length))}</summary>`
      : `<summary>${escapeHTML(t.tableToggle(d.mainRows.length))}</summary>`;
  const roundNote =
    lang === "ja"
      ? `<p class="chart-note mono"${dual(t.tableRoundNote)}>${escapeHTML(BOJV.T.ja.tableRoundNote)}</p>`
      : `<p class="chart-note mono">${escapeHTML(t.tableRoundNote)}</p>`;
  const csvLabel =
    lang === "ja"
      ? `<span${dual(t.tableCsvLabel)}>${escapeHTML(BOJV.T.ja.tableCsvLabel)}</span>`
      : `<span>${escapeHTML(t.tableCsvLabel)}</span>`;
  const citeLink =
    lang === "ja"
      ? `<a href="${REL.cite.ja}"${dual(T.en.citeLinkText)}>${escapeHTML(T.ja.citeLinkText)}</a>`
      : `<a href="${REL.cite.en}">${escapeHTML(T.en.citeLinkText)}</a>`;

  return `
  <section class="data-section">
    <details class="data-details">
      ${summary}

${bojVintagesTable(d, lang)}

      ${roundNote}
      <p class="chart-note mono">${csvLabel}<a href="/data/boj_outlook_vintages.csv">/data/boj_outlook_vintages.csv</a> · ${citeLink}</p>
    </details>
  </section>
  `;
}

function bojVintagesJsonLd(d, lang = "ja") {
  const url = abs(REL.bojVintages[lang]);
  const name =
    lang === "en"
      ? "BOJ Outlook Report — real GDP and CPI forecast by issue"
      : "日銀展望レポート｜号ごとの実質GDP・消費者物価見通し";
  return `
<script type="application/ld+json">
${JSON.stringify(
  {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${url}#dataset`,
    name,
    description: BOJV.T[lang].desc,
    url,
    isAccessibleForFree: true,
    license: CC_BY_4,
    inLanguage: lang,
    temporalCoverage: `${d.fyMin}/${d.fyMax}`,
    creator: orgNode(),
    // fertility/births と違い、トップの card-grid にこのページへのリンクは
    // 無い(/chart/boj-outlook-real・/chart/boj-outlook-cpiの詳細版という位置
    // づけで、単独の指標カードにはしていない)。よってbuildHomeJsonLdの10件
    // カタログには含めない(includedInDataCatalogを持たせない。fertilityJsonLd
    // 直上のコメントの逆側の帰結)。
    variableMeasured:
      lang === "en"
        ? [
            { "@type": "PropertyValue", name: "Real GDP forecast (Policy Board median)", unitText: "percent" },
            { "@type": "PropertyValue", name: "CPI forecast (Policy Board median)", unitText: "percent" },
          ]
        : [
            { "@type": "PropertyValue", name: "実質GDP見通し(大勢見通し中央値)", unitText: "percent" },
            { "@type": "PropertyValue", name: "消費者物価見通し(大勢見通し中央値)", unitText: "percent" },
          ],
    distribution: [
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE}/data/boj_outlook_vintages.csv` },
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE}/data/boj_outlook_real.csv` },
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE}/data/boj_outlook_cpi.csv` },
    ],
  },
  null,
  2
)}
</script>
${breadcrumbJsonLd(lang, url, name)}
`;
}

function bojVintagesScopeNote(lang) {
  return escapeHTML(BOJV.T[lang].scopeNote);
}

function buildBojVintages() {
  const d = bojVintagesData();
  let html = read("boj-outlook-vintages.html");
  html = injectRegion(html, "jsonld", bojVintagesJsonLd(d, "ja"), "boj-outlook-vintages.html");
  html = injectRegion(html, "scope", bojVintagesScopeNote("ja"), "boj-outlook-vintages.html");
  html = injectRegion(html, "table", bojVintagesSection(d, "ja"), "boj-outlook-vintages.html");
  return html;
}

// /en/boj-outlook-vintages.html は元ファイルが存在しないので丸ごと組み立てる
// (buildFertilityEn/buildBirthsEnと同じ方針)。
function buildBojVintagesEn() {
  const d = bojVintagesData();
  const t = BOJV.T.en;
  const urls = REL.bojVintages;
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
<meta property="og:image" content="${SITE}/assets/og-en.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
${assetHead()}
<noscript><style>.chart-wrap > svg, .bojv-legend { display: none !important; } .chart-noscript { display: block; }</style></noscript>
${bojVintagesJsonLd(d, "en")}</head>
<body>
<div class="page">
${header("en", urls)}

  <a class="chart-back" id="t-back" href="${REL.home.en}">${escapeHTML(t.back)}</a>

  <main>
    <section class="chart-section">
      <h1 class="chart-title" id="bojv-title">${escapeHTML(t.title)}</h1>
      <p class="chart-desc" id="bojv-desc">${escapeHTML(t.desc)}</p>
      <p class="chart-note mono" id="bojv-scope-note">${bojVintagesScopeNote("en")}</p>

      <p class="chart-note mono"><a href="${REL.chartHub.en}boj-outlook-real">${escapeHTML(t.seeAlsoReal)}</a></p>
      <h2 class="chart-title" style="font-size:1.1rem;margin-top:28px">${escapeHTML(t.sectionTitleReal)}</h2>
      <div class="chart-wrap">
        <svg id="boj-vintages-chart-real" viewBox="0 0 960 380" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHTML(t.chartAriaLabelReal)}"></svg>
        <p class="chart-noscript mono">${escapeHTML(t.chartNoscript)}</p>
      </div>
      <div class="fertility-legend bojv-legend" id="boj-vintages-legend-real"></div>

      <p class="chart-note mono"><a href="${REL.chartHub.en}boj-outlook-cpi">${escapeHTML(t.seeAlsoCpi)}</a></p>
      <h2 class="chart-title" style="font-size:1.1rem;margin-top:28px">${escapeHTML(t.sectionTitleCpi)}</h2>
      <div class="chart-wrap">
        <svg id="boj-vintages-chart-cpi" viewBox="0 0 960 380" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHTML(t.chartAriaLabelCpi)}"></svg>
        <p class="chart-noscript mono">${escapeHTML(t.chartNoscript)}</p>
      </div>
      <div class="fertility-legend bojv-legend" id="boj-vintages-legend-cpi"></div>
    </section>

${bojVintagesSection(d, "en")}
  </main>

  <footer class="site-footer-row">
    <span id="t-footer-src">${escapeHTML(t.footerSrc)}</span>
    <a class="footer-about" id="t-footer-about" href="${REL.about.en}">${escapeHTML(t.footerAbout)}</a>
    <a class="footer-about" id="t-footer-contact" href="${REL.contact.en}">${escapeHTML(t.footerContact)}</a>
  </footer>
</div>
<script src="/csv.js?v=${ASSET_V}"></script>
<script src="/boj-outlook-vintages.js?v=${ASSET_V}"></script>
</body>
</html>
`;
}

/* ── 見直し条項 ─────────────────────────────────────────── */

const HOAN = loadModule("hoan.js", ["T", "STATUS", "NOTE_LABEL", "lawNumEn", "transLinkHtml", "TENTATIVE"]);

// 公式英訳(法務省「日本法令外国語訳データベースシステム」)。translation_url を
// 作るのは bin/build_hoan.py 側で、ここで使うのはフッタの出所表示と、
// hoanTranslationErrors() が列の形を確かめるための前提だけ。
const HOAN_TRANS_SITE = "https://www.japaneselawtranslation.go.jp/";
const HOAN_TRANS_PREFIX = "https://www.japaneselawtranslation.go.jp/en/laws/view/";

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
  // 2026-08-03に法令番号だけ英語の換算形を**併記**するようにした(日本語表記は
  // 消していない。理由と換算規則は hoan.js の lawNumEn を参照)。併記部分は
  // 英語なので lang="ja" の外に出す。
  const clauseLang = lang === "en" ? ` lang="ja"` : "";
  const numEn = lang === "en" ? HOAN.lawNumEn(r.law_num) : null;
  const numEnHtml = numEn ? ` <span class="hoan-lawnum-en">(${escapeHTML(numEn)})</span>` : "";
  // 公式英訳へのリンク(EN側のみ)。組み立てはhoan.jsのtransLinkHtmlに1本化して
  // あり、置き場所も静的版・JS版とも法令番号の行で揃えてある(理由はあちらの
  // 関数の直上のコメント)。
  const trans = HOAN.transLinkHtml(r, lang);
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
          <div class="hoan-lawnum mono"><span${clauseLang}>${escapeHTML(r.law_num)}</span>${numEnHtml} ${src}${trans ? ` ${trans}` : ""}</div>
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
${breadcrumbJsonLd(lang, url, HOAN_DATASET.name[lang])}
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
<meta property="og:image" content="${SITE}/assets/og-en.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
${assetHead()}
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
    <!-- 英訳リンクの出所。EN側にしか出さないのでJA側(hoan.html)には対応する行が無く、
         hoan.js が差し替える文言でもないので id も持たせない(idを付けると
         idCoverageErrors() が hoan.html 側にも同じidを要求する)。 -->
    <a class="footer-src" href="${escapeHTML(HOAN_TRANS_SITE)}" target="_blank" rel="noopener">${escapeHTML(t.footerSrcTrans)}</a>
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
  const birthsUrl = abs(REL.births[lang]);
  const hoanUrl = abs(REL.hoan[lang]);
  // 各 Dataset は description/creator を省略しない。@id が個別ページ側
  // (chart/*.html・fertility.html・hoan.html)の Dataset と同一なので、JSON-LDの
  // 仕様上は同一ノードとして統合されてよく、かつては省略形(name/url/license
  // のみ)で済ませていた。しかしGoogleのリッチリザルト検証は文書単位でしか
  // 読まず、@idをまたいで別ページの定義を合成しない。そのため、このページ
  // 単体では「description・creatorの無いDataset」に見え、2026-07-31の
  // Search Console URL検査で実際に「10件の無効なアイテム」(descriptionは
  // 重大なエラー、creatorは任意)として検出された。1ページで完結する必要が
  // あるため、ここでも各指標ページと同じ description を(METRICS/FERT.T/HOAN.T
  // という本物の出所から、写しを作らず)フルで持たせる。creator は個別ページ
  // 側と違い orgNode() をベタ書きしない: このページの @graph には既に
  // Organization ノード(ORG_ID)自身が載っており、同一文書内の @id 参照は
  // JSON-LDとして正しい。すぐ下の DataCatalog.publisher も同じ参照形なので、
  // それに揃える(省略形に戻さないこと)。
  const catalogDatasets = [
    ...keys.map((k) => {
      const m = METRICS[k];
      const url = abs(chartRel(k)[lang]);
      return {
        "@type": "Dataset",
        "@id": `${url}#dataset`,
        name: metricDatasetName(m, lang),
        description: lang === "en" ? m.descEn : m.desc,
        url,
        license: CC_BY_4,
        creator: { "@id": ORG_ID },
      };
    }),
    {
      "@type": "Dataset",
      "@id": `${fertUrl}#dataset`,
      name: FERTILITY_DATASET.name[lang],
      description: FERT.T[lang].desc,
      url: fertUrl,
      license: CC_BY_4,
      creator: { "@id": ORG_ID },
    },
    {
      "@type": "Dataset",
      "@id": `${birthsUrl}#dataset`,
      name: BIRTHS_DATASET.name[lang],
      description: BIRTH.T[lang].desc,
      url: birthsUrl,
      license: CC_BY_4,
      creator: { "@id": ORG_ID },
    },
    {
      "@type": "Dataset",
      "@id": `${hoanUrl}#dataset`,
      name: HOAN_DATASET.name[lang],
      description: HOAN.T[lang].desc,
      url: hoanUrl,
      license: CC_BY_4,
      creator: { "@id": ORG_ID },
    },
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
  const desc =
    "An instrument that records the government's economic forecasts and the actual figures side by side, every year, with sources. It lets you follow the gap between the government's forecast and what actually happened, indicator by indicator, year by year.";
  const title = "zurekei — the gap between government forecasts and actual outcomes";
  const url = abs(REL.home.en);

  const gdpNominal = METRICS["gdp-nominal"]; // hero SVGのaria-label(titleEn)に使うのでこの参照だけ残す
  const { heroCaption, heroSummary, hoanNote } = homeDynamicText(t);

  // JSを実行しないクローラのための素のリンク一覧。JA側の card-fallback と同じ
  // 最小限の忠実度(名前のみ、数値カードには踏み込まない)。
  // /chart/<key> に無い指標(扇のページ)はREL側にURLを持つ。ここに書き足す
  // 必要があるのは、chartRel() が「/chart/<key>」しか作れないから。
  const NON_CHART_REL = { fertility: REL.fertility, births: REL.births };
  const cardFallback = HOME.INDICATOR_META.map((m) => {
    const href = NON_CHART_REL[m.key] ? NON_CHART_REL[m.key].en : chartRel(m.key).en;
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
<meta property="og:image" content="${SITE}/assets/og-en.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
${assetHead()}
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
<meta property="og:image" content="${SITE}/assets/og-en.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
${assetHead()}
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
<meta property="og:image" content="${SITE}/assets/og-en.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
${assetHead()}
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

// cite.html の <style> も同じ理由(言語に依存しないページ固有CSSの転記)で
// JA版からバイト単位で複製する。
const CITE_STYLE = read("cite.html").match(/<style>[\s\S]*?<\/style>/)[0];

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
<meta property="og:image" content="${SITE}/assets/og-en.png">
<meta name="twitter:card" content="summary_large_image">
${assetHead()}
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

// /en/cite.html は about/corrections/contact と同じく、JA版(cite.html、
// build.mjsが触らない純粋な手書きファイル)に対応する元ファイルが無いので
// 丸ごと組み立てる。中身(セクション見出し・本文・データ直リンク表)は
// CITE.T.en / CITE.renderDataRows("en") をそのまま使う(表とページで文言が
// 食い違う事故を起こさないため、他の生成関数と同じ理由)。
function buildCiteEn() {
  const t = CITE.T.en;
  const urls = REL.cite;
  const url = abs(urls.en);
  const title = `${t.title} — zurekei`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<meta name="description" content="How to cite zurekei's data and text, the license breakdown, and direct links to the data files.">
<link rel="canonical" href="${url}">
${hreflangTags(urls)}
<meta property="og:site_name" content="zurekei">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="How to cite zurekei's data and text, the license breakdown, and direct links to the data files.">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/og-en.png">
<meta name="twitter:card" content="summary_large_image">
${assetHead()}
${CITE_STYLE}
</head>
<body>
<div class="page">
${header("en", urls)}

  <a class="chart-back" id="t-back" href="${REL.home.en}">${escapeHTML(t.back)}</a>

  <main class="about-body cite-page-wrap">
    <h1 class="about-title" id="cite-title">${escapeHTML(t.title)}</h1>

    <p class="about-lead" id="cite-lead">
      ${escapeHTML(t.lead)}
    </p>

    <section class="about-methods">
      <h2 class="about-methods-title" id="h2-primary">${escapeHTML(t.h2Primary)}</h2>
      <p id="primary-p1">${t.primaryP1}</p>
      <p id="primary-p2">${escapeHTML(t.primaryP2)}</p>
    </section>

    <section class="about-methods">
      <h2 class="about-methods-title" id="h2-format">${escapeHTML(t.h2Format)}</h2>
      <p id="format-intro">${escapeHTML(t.formatIntro)}</p>

      <dl class="methods-notes">
        <dt id="example-site-label">${escapeHTML(t.exampleSiteLabel)}</dt>
        <dd><code class="mono cite-code" id="example-site">${escapeHTML(t.exampleSite)}</code></dd>

        <dt id="example-page-label">${escapeHTML(t.examplePageLabel)}</dt>
        <dd><code class="mono cite-code" id="example-page">${escapeHTML(t.examplePage)}</code></dd>

        <dt id="example-data-label">${escapeHTML(t.exampleDataLabel)}</dt>
        <dd><code class="mono cite-code" id="example-data">${escapeHTML(t.exampleData)}</code></dd>
      </dl>
      <p class="cite-example-note" id="example-note">${escapeHTML(t.exampleNote)}</p>

      <p id="date-note">${escapeHTML(t.dateNote)}</p>
    </section>

    <section class="about-methods">
      <h2 class="about-methods-title" id="h2-data">${escapeHTML(t.h2Data)}</h2>
      <p id="data-intro">${t.dataIntro}</p>

      <div class="methods-table-wrap">
        <table class="methods-table">
          <thead>
            <tr>
              <th id="th-file">${escapeHTML(t.thFile)}</th>
              <th id="th-content">${escapeHTML(t.thContent)}</th>
              <th id="th-page">${escapeHTML(t.thPage)}</th>
            </tr>
          </thead>
          <tbody id="cite-data-tbody">${CITE.renderDataRows("en")}</tbody>
        </table>
      </div>
    </section>

    <section class="about-methods">
      <h2 class="about-methods-title" id="h2-license">${escapeHTML(t.h2License)}</h2>
      <p id="license-intro">${t.licenseIntro}</p>
      <ul class="cite-license-list" id="cite-license-list">${t.licenseList}</ul>
    </section>

    <section class="about-methods">
      <h2 class="about-methods-title" id="h2-urls">${escapeHTML(t.h2Urls)}</h2>
      <p id="urls-p1">${escapeHTML(t.urlsP1)}</p>
      <p id="urls-p2">${escapeHTML(t.urlsP2)}</p>
    </section>

    <section class="about-methods">
      <h2 class="about-methods-title" id="h2-errors">${escapeHTML(t.h2Errors)}</h2>
      <p id="errors-p1">${t.errorsP1}</p>
    </section>
  </main>

  <footer class="site-footer-row">
    <a class="footer-about" id="t-footer-index" href="${REL.home.en}">${escapeHTML(t.footerIndex)}</a>
    <a class="footer-about" id="t-footer-corrections" href="${REL.corrections.en}">${escapeHTML(t.footerCorrections)}</a>
    <a class="footer-about" id="t-footer-about" href="${REL.about.en}">${escapeHTML(t.footerAbout)}</a>
  </footer>
</div>

<script src="/cite.js?v=${ASSET_V}"></script>
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
      { loc: `${SITE}/births`, priority: "0.9", date: genDate(path.join(SITE_DIR, "births.html")) },
      // boj-outlook-vintages は /chart/boj-outlook-real・/chart/boj-outlook-cpi の
      // 詳細版(号ごとの生データ)であって単独の指標カードではないため、優先度は
      // hoan と同じ0.8(fertility/births/指標本体より低い)。
      { loc: `${SITE}/boj-outlook-vintages`, priority: "0.8", date: genDate(path.join(SITE_DIR, "boj-outlook-vintages.html")) },
      { loc: `${SITE}/hoan`, priority: "0.8", date: genDate(path.join(SITE_DIR, "hoan.html")) },
      ...enMetricEntries,
      { loc: `${SITE}/en/fertility`, priority: "0.9", date: genDate(path.join(EN_DIR, "fertility.html")) },
      { loc: `${SITE}/en/births`, priority: "0.9", date: genDate(path.join(EN_DIR, "births.html")) },
      { loc: `${SITE}/en/boj-outlook-vintages`, priority: "0.8", date: genDate(path.join(EN_DIR, "boj-outlook-vintages.html")) },
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
      // cite.html(JA)は about.html/contact.html と同じくビルダーが触らない
      // 純粋な手書きファイルなので、この2ページと同じ lastmod()(入力ファイル群の
      // コミット日の最大値)を使う。優先度は contact と同じ 0.3(データページ
      // 本体ではなく利用者向けの補助ページという位置づけ)。
      { loc: `${SITE}/cite`, priority: "0.3", date: lastmod(["cite.html", "cite.js"]) },
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
      // en/cite.html は buildCiteEn() が丸ごと生成する出力そのものなので、他の
      // 生成ページと同じ genDate() を使う(en/about.html等と同じ理由)。
      { loc: `${SITE}/en/cite`, priority: "0.3", date: genDate(path.join(EN_DIR, "cite.html")) },
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

// llms.txt(llmstxt.org の非公式な慣習。まだ標準化されていないので効果は
// 未確証だが、コストが低く、robots.txt の Content-Signal(ai-input=yes)で
// 既に表明している「AI引用は歓迎」の姿勢と整合するため設置する。英語で
// 書くのは llmstxt.org の実例がほぼ英語であるのに倣ったもので、各リンクは
// JA/EN両方のURLを併記する。sitemap.xml と同じ理由で生成物にする
// (METRICS/REL から機械的に導けば、指標を足したときの書き忘れが構造的に
// 起きない)。2026-08-06追加。
function llmsTxtContent(keys) {
  const line = (m) => {
    const url = abs(chartRel(m.key).en);
    const urlJa = abs(chartRel(m.key).ja);
    return `- [${m.titleEn}](${url}) (JA: ${urlJa}): ${m.descEn}`;
  };
  const metricLines = keys
    .filter((k) => !METRICS[k].seeVintages) // 段階1(boj-outlook-real/cpi)は下の「詳細版」節にまとめて出す
    .map((k) => line({ key: k, titleEn: METRICS[k].titleEn, descEn: METRICS[k].descEn }));
  const bojLines = keys
    .filter((k) => METRICS[k].seeVintages)
    .map((k) => line({ key: k, titleEn: METRICS[k].titleEn, descEn: METRICS[k].descEn }));

  return `# zurekei (ズレ計)

> A static instrument that tracks Japanese government and public-institution forecasts against confirmed actuals, one fiscal year at a time, with a primary source linked for every figure. Deliberately free of evaluative language — figures and citations only, no commentary.

Operated by an individual, not an organization or company. Data and text are CC BY 4.0 (${abs("/LICENSE-DATA")}); code is MIT (${abs("/LICENSE")}). This site welcomes AI systems referencing its content when answering questions, and does not permit its use as training/fine-tuning data — see ${abs("/robots.txt")} (Content-Signal: ai-input=yes, ai-train=no).

## Indicators (forecast vs. actual, by fiscal year)

${metricLines.join("\n")}

## BOJ Outlook Report (forecast vs. actual, plus full issue-by-issue detail)

${bojLines.join("\n")}
- [BOJ Outlook Report — every issue's forecast, by publication date](${abs(REL.bojVintages.en)}) (JA: ${abs(REL.bojVintages.ja)}): ${BOJV.T.en.desc}

## Population projections (successive projection vintages vs. actual)

- [Total fertility rate](${abs(REL.fertility.en)}) (JA: ${abs(REL.fertility.ja)}): ${FERT.T.en.desc}
- [Number of births](${abs(REL.births.en)}) (JA: ${abs(REL.births.ja)}): ${BIRTH.T.en.desc}

## Other

- [Statutory review clause tracker](${abs(REL.hoan.en)}) (JA: ${abs(REL.hoan.ja)}): ${HOAN.T.en.desc}
- [About / why this site exists](${abs(REL.about.en)}) (JA: ${abs(REL.about.ja)})
- [How to cite](${abs(REL.cite.en)}) (JA: ${abs(REL.cite.ja)})
- [Correction history](${abs(REL.corrections.en)}) (JA: ${abs(REL.corrections.ja)})
- [Contact](${abs(REL.contact.en)}) (JA: ${abs(REL.contact.ja)})

## Data

Raw CSV source files live under ${abs("/data/")}; column schema is documented at ${abs("/data/README.md")}. Full URL list: ${abs("/sitemap.xml")}.
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
      js: "births.js",
      htmls: [
        { label: "births.html", html: files.get(path.join(SITE_DIR, "births.html")) },
        { label: "en/births.html", html: files.get(path.join(EN_DIR, "births.html")) },
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
    {
      js: "cite.js",
      htmls: [
        { label: "cite.html", html: read("cite.html") },
        { label: "en/cite.html", html: files.get(path.join(EN_DIR, "cite.html")) },
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
    {
      file: "cite.html",
      js: "cite.js",
      T: CITE.T.ja,
      html: read("cite.html"),
      // #cite-data-tbody は about.html の #methods-tbody と同じ理由(cite.jsの
      // renderDataRows()が組み立てる<tr><td>…はt.<key>の単純代入の形にならない)
      // でここに特例として持つ。写しを作らずCITE.renderDataRows(loadModule経由の
      // 本物)をそのまま呼ぶ。
      extra: [{ id: "cite-data-tbody", prop: "innerHTML", raw: CITE.renderDataRows("ja"), markup: true }],
    },
    // hoan.html / fertility.html は「全体が生成物」ではなく、injectRegion() で
    // 一部の領域(hoan: jsonld/summary/rows、fertility: jsonld/scope/table)だけを
    // 差し替える形なので、**それ以外の地の文は上の4ファイルと同じ手書き**であり
    // 同じ壊れ方をする。2026-08-01に hoan.js の T.ja.desc だけを直して
    // hoan.html の静的本文を直し忘れ、同じページの中で本文(旧)とJSON-LD(新)が
    // 食い違ったまま --check が緑で通った(JSが動く環境では set() が上書きする
    // ので永久に気づけない)。2026-08-04にこの2つを対象へ入れて塞いだ。
    //
    // injectRegion() が生成する領域の中にあるidも、ここでは特に除外しない。
    // 生成側が T.ja から作っているなら一致するので無害で、もし食い違うなら
    // それは生成側の実バグとして拾いたい(#fert-scope-note が実際にこの形)。
    // なお #summary(hoan) は tr().summary(件数) という関数呼び出しの代入で、
    // extractStaticAssignments() が拾う「t.<key>」の形にならないため対象外。
    // fertility.js の #fertility-legend / #fertility-source も同様に関数から
    // 組み立てるが、about.html の #methods-tbody のような extra は足していない
    // — あちらは「手書きHTML vs JSの関数」の突き合わせなのに対し、こちらは
    // BUILD:table の生成領域の中にあり、生成側(fertilitySection)とJS側
    // (buildLegendHtml)が別々に組み立てている**別種の写し**だから。これは
    // 手書きドリフトではないので、この検査に混ぜると筋が悪くなる(TODO)。
    { file: "hoan.html", js: "hoan.js", T: HOAN.T.ja, html: read("hoan.html"), extra: [] },
    { file: "fertility.html", js: "fertility.js", T: FERT.T.ja, html: read("fertility.html"), extra: [] },
    { file: "births.html", js: "births.js", T: BIRTH.T.ja, html: read("births.html"), extra: [] },
  ];

  // タグとタグの間だけにある空白(手書きHTML側の改行・インデント)を畳む。
  // renderMethodsRows() 等の関数が組み立てる<tr><td>…のような構造的マーク
  // アップは空白を一切挟まないので、手で整形して読みやすくしてある側とは
  // タグの間の空白だけが違う。文中のテキストとタグの間([日本語]<a>のような
  // 隣接)には元々空白が無いので、ここで畳んでも中身(文字そのもの)は一切
  // 変えない。t.<key>の単純な代入(拡張子extra以外)には使わない — あちらは
  // 地の文なので、空白1つでも実在する食い違いになりうる。
  const collapseMarkupWhitespace = (s) => s.replace(/>\s+</g, "><");

  // injectRegion() のマーカーは差し替え先の要素の**中**に入る
  // (例: <p id="fert-scope-note"><!-- BUILD:scope -->本文<!-- /BUILD:scope --></p>)。
  // 落とさずに比べると、生成側とJS側が同じ T.ja を見ていても必ず食い違う
  // (2026-08-04に hoan/fertility を対象へ入れた時点で #fert-scope-note が
  // これで誤検出になった)。落としたうえで比べれば、injectRegion が入れた
  // 中身が T.ja と一致しているかを見ることになり、検査としてはむしろ強くなる。
  const stripBuildMarkers = (s) => s.replace(/<!--\s*\/?BUILD:[a-zA-Z0-9_-]+\s*-->/g, "");

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
      actual = stripBuildMarkers(actual).trim();
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

/* ── OGP画像(assets/og.png・assets/og-en.png)の陳腐化検査 ─────────────
 * og.html はサイト本体からリンクされない独立ページで、bin/build.mjs の
 * 生成物ではない(人間が bin/og.sh でヘッドレスChromeのスクリーンショットと
 * して焼く道具)。そのため他のページと違い「いま生成した文字列とディスクを
 * 比較する」stale 検査には乗らない。実際、FY1980〜1997の見通しを収集した
 * 後もこの焼き直しを忘れ、破線が1998年からしか無い古い画像がしばらく公開
 * され続けていたことがある(2026-07-30に発覚)。同じ穴を塞ぐため、「画像の
 * 元になる入力が、画像そのものより後に変わっていないか」を機械的に見る。
 *
 * ■ 時刻比較(git日時 / mtime)ではなく入力の内容ハッシュで判定する
 *   最初の実装は「4パスの実効的な最終更新時刻を比べ、ソース側が新しければ
 *   エラー」という時刻比較だった(git のコミット日時 → 未コミットは fs の
 *   mtime、という二段構え)。これには実際に踏むデッドロックがあった
 *   (2026-07-30レビュー指摘・実測で再現):
 *     1. 絵に一切影響しない変更(例: data/gdp_forecast.csv の notes列だけ
 *        直す。og.htmlはfiscal_year/forecast_real/actual_realしか読まない
 *        ので絵は変わらない)をコミットする
 *     2. ソースのコミット日時が画像より新しくなり `--check` が発火する
 *     3. 指示どおり `bin/og.sh` で焼き直す → 焼き直しはバイト単位で決定的
 *        なので PNG は前回と完全に同一になる
 *     4. 画像ファイルの中身が1バイトも変わらないので git 上は非dirty
 *        (コミットする差分が無い)→ mtimeも更新されない経路がある
 *        (touchしない限り) → コミット日時は古いまま → 永久にエラーのまま
 *        脱出できない
 *   これは `bin/deploy.sh` がこの `--check` をデプロイの門番にしている
 *   ことと組み合わさると特に悪い: 詰まった人が取りがちな回避策は
 *   「`bin/deploy.sh` を使わず素の `npx wrangler pages deploy` を直に叩く」で、
 *   これは秘密ファイル混入チェックを丸ごと迂回する経路としてこのリポジトリで
 *   明確に禁止されている(deploy.sh 冒頭のコメント参照)。うるさい検査の
 *   代償が安全側(秘密ファイルの誤配信)に出るのでは本末転倒。
 *
 *   時刻比較にはさらに偽陰性もある: 画像を焼いてコミットしたあとCSVを追加
 *   編集し、焼き直しを忘れたまま `git commit --amend` で同じコミットに
 *   同乗させると、全パスの %ct が揃って `>` 比較を素通りし、古い画像が出る
 *   (rebase/squashでも同様)。`cp -p`/`rsync -a`/同期フォルダ経由でmtimeが
 *   保存されたままCSVだけ変わる経路も同じ穴を踏む。
 *
 *   直したのは「入力の中身そのもの」をハッシュで見る方式への切り替え:
 *   `bin/og.sh` が焼くたびに、入力ファイル群のsha256を `assets/og.inputs.json`
 *   (スタンプファイル)へ書く。`--check` は「いまの入力のハッシュ」と
 *   「スタンプに記録されたハッシュ」を比較するだけで、gitのコミット日時も
 *   ファイルのmtimeも一切見ない(DIRTY_PATHSへの依存も外れた)。これで上の
 *   デッドロックは起きない: 絵に影響しない変更でも入力のハッシュは変わる
 *   →検査が発火→`bin/og.sh`で焼き直す→PNGはバイト同一でも
 *   `og.inputs.json`の中身(記録されたハッシュ)は新しい入力のハッシュに
 *   更新される→そのスタンプはコミットできる(中身が変わっているので)→
 *   赤から出られる。amendやmtime保存も、見ているのが内容そのものなので
 *   効かない。
 *
 * ■ 入力の集合(時刻比較では入れられなかったものも入れられるようになった)
 *   - og.html
 *   - csv.js … og.htmlが loadCSV/toNum をここから読んでいるのに、時刻比較
 *     版では対象外だった(style.cssと同種の見落とし。2026-07-30レビュー指摘)
 *   - style.css … og.htmlが変数(--bg, --navy 等)を参照しており、変われば
 *     絵が変わりうる。**時刻比較版では「CSSを触るたび発火して形骸化する」
 *     という理由で対象外にしていたが、ハッシュ方式では発火しても
 *     `bin/og.sh` を1回回せば必ず解消するので、対象外にする理由が無くなり
 *     2026-07-30に対象へ加えた。** 「style.cssは既知の穴」という記述は
 *     この変更で解消したので消してある(このファイルの履歴として残すのは
 *     この段落自体)。
 *   - chart.js … 2026-07-30、指標ごとのOGカード対応でog.htmlがchart.jsの
 *     METRICSをfetchして読むようになったため追加。**ファイル全体のハッシュ
 *     を取る(カードが実際に使うフィールドだけを見る形にはしない)。**
 *     chart.jsはnote/desc/archiveNoteといったカードに出ない長い文章も
 *     抱えているので、その1文字を直すだけでも22枚(2026-07-30、出生率カード
 *     追加後の枚数)の焼き直しが要求される(1分ほど)。これは承知の上での
 *     選択: 「カードが使うフィールドだけ」を
 *     列挙する方式にすると、og.htmlが将来別のフィールドを使い始めたときに
 *     その列挙を更新し忘れる=検査が黙って効かなくなる穴が生まれる。
 *     ファイル全体のハッシュにはその穴が構造的に存在しない。焼き直しの
 *     1分と、穴の可能性を天秤にかけて前者を取っている(この判断を将来
 *     「最適化」で覆さないこと)。
 *   - METRICSの全指標が使うCSV(重複除去)… 同じ理由で、指標カードが実際に
 *     読むCSVすべて。data/gdp_forecast.csvを手書きで固定していた旧版と違い、
 *     METRICSから機械的に導くので指標を足せば自動で対象に入る。
 *
 * ■ それでもエラーにする(fail-openにしない)ケース
 *   - スタンプファイル(assets/og.inputs.json)が無い、またはJSONとして
 *     壊れている
 *   - スタンプに記録されているパスの集合が、いまの入力パス一覧
 *     (SOURCESの内容)と一致しない(入力を増減したのにbin/og.shを
 *     一度も回していない状態)
 *   - 入力ファイル自体が読めない(fs.readFileSyncが失敗)
 *   いずれも「判定できないので黙って通す」という経路は用意していない。
 *
 * ■ この検査で捕まえられないもの(正直に書く)
 *   - Google Fontsなど外部から読むフォントの中身。フォントの読み込み失敗や
 *     フォールバック表示は入力ファイルの中身に現れないため、ハッシュ比較
 *     では検出できない。og.html自体の変更(フォント指定行の変更等)は
 *     捕まるが、フォント配信側の障害は捕まらない。目視確認に頼る
 *   - ヘッドレスChrome自体のバージョン差によるレンダリングの微差
 *   - assets/og*.png(22枚、2026-07-30に出生率2枚・2026-08-04に出生数2枚を追加)を bin/og.sh を
 *     経由せず直接上書きした場合の「中身」の正しさ(スタンプの記録内容とは
 *     無関係に発生するため、この検査の対象外。生成物ではなく人間が置く画像
 *     である以上、ここまでは面倒を見ない)。ただしファイルの過不足(22枚の
 *     うち何かが無い・余分にある)はこの検査とは別に ogFileErrors() が見る
 *     (下記参照)
 */

// og.htmlの描画に効く入力ファイル一覧(SITE_DIR相対)。2026-07-30、指標ごとの
// OGカード対応で og.html が chart.js の METRICS を読み込むようになったため、
// chart.js 自身と METRICS が使う全指標のCSV(重複除去)を追加した。手書きの
// リストにはしない: METRICS から機械的に導くので、指標を足せば自動でここにも
// 入る(足し忘れて陳腐化検査が効かなくなる、という穴を構造的に塞ぐ)。
// bin/og.sh は自分で同じ集合を持たず、`node bin/build.mjs --og-list` の
// INPUT行からこの配列をそのまま受け取る(片方だけ増減する事故がそもそも
// 起きない。以前は bin/og.sh 側に手書きの INPUT_RELS があり「片方だけ増減
// すると検査が気づく」という設計だったが、2026-07-30に「そもそも1箇所にする」
// 設計へ変えた)。
//
// ■ 配列全体を一度Setに通す(2026-07-30。重複が入ると--checkが恒久的に赤くなる)
//   以前はMETRICS由来のCSVだけをSetで重複除去し、その外側で出生率CSV2本を
//   無条件にpushしていた。将来METRICSにdata/fertility_*.csvを使う指標を足すと
//   (キー名が"fertility"でなければ出力先パス一意性検査にも掛からない)同じ
//   パスが2回入る。og.shのcompute_stampはpythonのdictへ書くので**スタンプ側は
//   必ず重複が潰れる**一方、下のogStalenessErrors()は
//   `[...OG_INPUT_RELS].sort()` を重複つきのまま比較するため、集合一致検査が
//   永久に不一致になる。「bin/og.shで焼き直すこと」と言われるのに何度焼いても
//   直らない=デプロイゲート(bin/deploy.sh)が閉じたまま開かない。時刻比較方式を
//   撤回した理由と同型のデッドロックなので、配列全体をSetに通して構造的に
//   潰しておく。
// 扇形カード(?m=fertility / ?m=births)の一覧。og.html の FAN_SPECS と対に
// なっていて、**CSVパスと値の列名は両側に同じものを書く**(og.htmlはHTMLなので
// loadModule()で読めず、辞書と違って共有経路が作れない。og.html側のFAN_SPECS
// 直上コメント参照)。ずれると、こちらが数えたminYear/vintageCountを期待値と
// して bin/og.sh の verify_dom が焼き上がりを検査するため、必ず赤くなって
// 気づける(黙って違う絵が出る経路にはならない)。
// key は og.html に渡す ?m= の値であり、出力先 assets/og-<key>[-en].png でもある。
const FAN_CARDS = [
  {
    key: "fertility",
    forecastCsv: "data/fertility_forecast.csv",
    actualCsv: "data/fertility_actual.csv",
    forecastValCol: "assumed_tfr_mid",
    actualValCol: "actual_tfr",
  },
  {
    key: "births",
    forecastCsv: "data/births_forecast.csv",
    actualCsv: "data/births_actual.csv",
    forecastValCol: "projected_births",
    actualValCol: "actual_births",
  },
];

const OG_INPUT_RELS = [...new Set([
  "og.html",
  "csv.js",
  "style.css",
  "chart.js",
  ...Object.values(METRICS).map((m) => m.csv.replace(/^\//, "")),
  // 扇形カード(assets/og-fertility[-en].png / og-births[-en].png、2026-07-30に
  // 出生率、2026-08-04に出生数)の入力CSV。下のFAN_CARDSから機械的に導くので、
  // 扇形ページを足せば自動でここにも入る(METRICS由来のCSVと同じ扱い)。
  // **fertility.js / births.js は入れない**: og.html はどちらも読み込まず
  // (?m=fertility / ?m=births の描画はrenderFan()が持ち、og.html自前の
  // CSVパス・列名(FAN_SPECS)で完結する)、両ファイルのどの関数・定数にも
  // 触れていない。したがってページ側の変更(版ラベルの位置調整やアニメー
  // ション速度など)は扇形カードの見た目に一切影響しない。列名が変われば
  // CSVの中身も必ず変わるため、CSVのハッシュだけで検出でき、chart.jsを
  // 丸ごとハッシュしている理由(「カードが使うフィールドだけ列挙すると
  // 将来の見落としが構造的に残る」上のコメント参照)とは事情が異なる。
  ...FAN_CARDS.flatMap((f) => [f.forecastCsv, f.actualCsv]),
])];
const OG_STAMP_REL = "assets/og.inputs.json";

// og.htmlが焼くべきOGカード全部(汎用2枚+指標8種×2言語の16枚+扇形2種×2言語=
// 計22枚、2026-07-30に出生率2枚・2026-08-04に出生数2枚を追加)。
// query は og.html に渡すクエリ文字列(`shot`を含む)、out は assets/ 以下の
// 出力先相対パス、minYear はそのカードの年度レンジ最小値の期待値
// (og.html側の「見通し列か実績列に値がある行の最小fiscal_year」と同じ規則。
// 規則がずれると bin/og.sh の verify_dom が誤爆するので、ここは readRows() を
// 経由して og.html と同じデータから導く)。汎用2枚は gdp-real の値を使う
// (og.htmlの?mなし=実質GDP固定という仕様に合わせる)。
//
// type(2026-07-30、出生率カード対応で追加。2026-08-04に出生数カードを足す
// のに合わせて "fertility" から "fan" へ改名した — 種別が表しているのは
// 「どのページか」ではなく「扇形の描画か」なので、ページ名で名乗ると2枚目を
// 足した時点で内容と合わなくなる): bin/og.sh の verify_dom がどの検査を
// すべきかを表す種別。"metric"(汎用2枚+指標8種×2言語)は従来どおり
// hasForecast/hasActualに応じてline-forecast/line-actualを双方向に見る。
// "fan"(出生率・出生数の各2言語)はline-forecastが存在しない別系統の描画
// なので、代わりにvintageCount(下記)本のline-forecast-vintageがデータ付きで
// 描かれていることを見る。bin/og.sh は未知のtypeが来たらエラーで止める(fail-closed。
// 「知らない行=カード」のフォールバックを無くしたのと同じ趣旨)。
//
// hasForecast/hasActual(2026-07-30追加): そのカードの見通し列/実績列に
// 実際に値のある行が1つでもあるか(1/0)。bin/og.sh の verify_dom が「実績線
// (line-actual)には無条件にd="M <数字>を要求する」という決め打ちだったため、
// 見通しだけ先に収集して実績値が1つも無い指標を METRICS に足すと、
// verify_dom が永久に赤くなり bin/og.sh が完走できなくなる欠陥があった
// (og.shが完走しないとスタンプが書けず--checkも赤のまま=このリポジトリが
// 過去に撤回した時刻比較方式と同型のデッドロック)。加えて検査が実績線しか
// 見ていなかったため、forecastColの列名タイポ等で見通し線が全滅しても
// 検査は素通りしていた。「そのカードに見通し/実績のデータが実際にあるか」を
// ビルド側(データを知っている側)から渡し、bin/og.sh側は「データの実態
// どおりの線になっているか」(データが無いはずの線には無条件にd="M...も
// 要求しない代わりに、d="M...が描かれていたら誤検出として落とす)を見る形に
// 変えた。minYearと同じくreadRows()経由で導くので、年度レンジの判定規則
// (?mの有無に応じたCSV・列名の決め方)とずれない。
function metricLineInfo(metric) {
  const rows = readRows(metric);
  const domain = rows.filter((r) => r.forecastVal !== null || r.actualVal !== null);
  return {
    minYear: Math.min(...domain.map((r) => r.year)),
    hasForecast: rows.some((r) => r.forecastVal !== null) ? 1 : 0,
    hasActual: rows.some((r) => r.actualVal !== null) ? 1 : 0,
  };
}

// 扇形カード(type="fan")用。og.htmlのrenderFan()と同じ規則で
// minYear(推計target_year・実績yearの両方を含めた最小年)とvintageCount
// (vintage_yearの異なる値の個数=扇の本数の期待値)を導く。og.htmlはこの2本の
// CSVをchart.jsのMETRICSを経由せず自前で読むため、readRows()(METRICS前提)は
// 使えず専用に書く。引数は上のFAN_CARDSの1要素(2026-08-04、出生数カードの
// 追加でCSVと列名を引数化した。それまでは出生率決め打ちだった)。
//
// 空でない非数値セルは必ず投げる(2026-07-30追加。og.htmlのrenderFan()と
// 同じ規則。理由の詳細はそちら側のコメントを参照): csv.jsのtoNum()は空文字
// だけをnullにし、転記ミスの `1.49x934` のようなセルにはNaNを返す。`!== null`
// のフィルタはNaNを素通しするため、ここで数えるvintageCountとog.htmlが描く
// 扇の本数が**両側とも自己整合的に「7本」と答えたまま、実際には全pathが
// NaNで1本も描かれていない**という状態が全機械検査を通過しえた。
//
// 列がヘッダに実在するかも見る(2026-08-04追加。og.htmlのrequireColと同じ
// 理由): toNum()は存在しない列(undefined)をnullにするので、列名の綴り違いは
// 「全行が消える」=vintageCount 0 として静かに通り、og.html側も同じ綴り違いを
// 持っていれば 0==0 で検査が成立してしまう。
function fanCardInfo(fan) {
  const reqNum = (raw, where) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) throw new Error(`${where}: 数値として読めない(${JSON.stringify(raw)})。CSVの転記ミスの可能性`);
    return v;
  };
  const optNum = (raw, where) => {
    const v = toNum(raw);
    if (v !== null && !Number.isFinite(v)) {
      throw new Error(`${where}: 空でないのに数値として読めない(${JSON.stringify(raw)})。CSVの転記ミスの可能性`);
    }
    return v;
  };
  const requireCol = (rows, col, where) => {
    if (rows.length && !(col in rows[0])) {
      throw new Error(`${where}: 列 "${col}" がCSVのヘッダに無い(FAN_CARDSの列名の綴り違いの可能性)`);
    }
  };
  const FC = fan.forecastCsv;
  const AC = fan.actualCsv;
  const forecastRaw = parseCSV(fs.readFileSync(path.join(SITE_DIR, FC), "utf8"));
  const actualRaw = parseCSV(fs.readFileSync(path.join(SITE_DIR, AC), "utf8"));
  requireCol(forecastRaw, fan.forecastValCol, FC);
  requireCol(actualRaw, fan.actualValCol, AC);
  const forecastRows = forecastRaw
    .map((r) => ({
      vintageYear: reqNum(r.vintage_year, `${FC} vintage_year`),
      targetYear: reqNum(r.target_year, `${FC} target_year`),
      val: optNum(r[fan.forecastValCol], `${FC} ${fan.forecastValCol}`),
    }))
    .filter((r) => r.val !== null);
  const actualRows = actualRaw
    .map((r) => ({ year: reqNum(r.year, `${AC} year`), val: optNum(r[fan.actualValCol], `${AC} ${fan.actualValCol}`) }))
    .filter((r) => r.val !== null);
  const domainYears = forecastRows.map((r) => r.targetYear).concat(actualRows.map((r) => r.year));
  return {
    minYear: Math.min(...domainYears),
    hasActual: actualRows.length > 0 ? 1 : 0,
    vintageCount: new Set(forecastRows.map((r) => r.vintageYear)).size,
  };
}

const OG_CARDS = (() => {
  // ここではまだ後段の `const keys` が初期化されていない(TDZ)ため、
  // Object.keys(METRICS) を直接使う(値は同じもの)。
  const generic = metricLineInfo(METRICS["gdp-real"]);
  const cards = [
    { query: "shot", out: "assets/og.png", type: "metric", vintageCount: 0, ...generic },
    { query: "shot&lang=en", out: "assets/og-en.png", type: "metric", vintageCount: 0, ...generic },
  ];
  for (const k of Object.keys(METRICS)) {
    const info = metricLineInfo(METRICS[k]);
    cards.push({ query: `shot&m=${k}`, out: `assets/og-${k}.png`, type: "metric", vintageCount: 0, ...info });
    cards.push({ query: `shot&m=${k}&lang=en`, out: `assets/og-${k}-en.png`, type: "metric", vintageCount: 0, ...info });
  }
  // 扇形カード(2026-07-30に出生率、2026-08-04に出生数): line-forecastが無い
  // 別系統の描画なので hasForecast は持たない(0を入れているが、bin/og.sh側は
  // type="fan" のカードに対してこの値を見ない。列を揃えるためだけに置いている)。
  for (const fan of FAN_CARDS) {
    const info = fanCardInfo(fan);
    cards.push({ query: `shot&m=${fan.key}`, out: `assets/og-${fan.key}.png`, type: "fan", hasForecast: 0, ...info });
    cards.push({ query: `shot&m=${fan.key}&lang=en`, out: `assets/og-${fan.key}-en.png`, type: "fan", hasForecast: 0, ...info });
  }
  return cards;
})();

// カード名の衝突検査(2026-07-30、B): 以前は `if ("en" in METRICS) throw` と
// いう列挙(気づいた1パターンだけを名指しする)方式だったが、キーX とX-enの
// 併存のような別の衝突パターンを見逃す。OG_CARDSの出力先パス(out)が重複して
// いないかを機械的に見る構造的なチェックに置き換えた。"en"というキー名も
// これで自動的に捕まる(og-en.pngという出力先を持つのが2件になるため)。
// 衝突すると片方が後に焼いた方に黙って上書きされ、22枚焼いたつもりで実際は
// 21枚(1枚は別指標の絵)という事故になるため、検出したら列挙せずに止める。
{
  const outs = OG_CARDS.map((c) => c.out);
  const seen = new Set();
  const dupes = new Set();
  for (const o of outs) {
    if (seen.has(o)) dupes.add(o);
    seen.add(o);
  }
  if (dupes.size) {
    throw new Error(
      `OGカードの出力先パスが衝突している: ${[...dupes].sort().join(", ")}` +
        `(METRICSの複数のキーが同じ og-<key>[-en].png を指している)`
    );
  }
}

// assets/ 配下の og*.png が「焼くべき22枚」の集合とちょうど一致するかを見る
// (findOrphansがchart/に対してやっているのと同じ趣旨)。指標を消したときに
// 古いカードが配信され続ける事故や、bin/og.shを経ずに置かれた置き土産
// (og-zzz.pngのような)を検出する。zurekei_icon_512.pngはassets/の外にある
// ため、この走査には最初から入らない。
function ogFileErrors() {
  const assetsDir = path.join(SITE_DIR, "assets");
  const expected = new Set(OG_CARDS.map((c) => path.basename(c.out)));
  let actual;
  try {
    actual = fs.readdirSync(assetsDir).filter((f) => /^og.*\.png$/.test(f));
  } catch (e) {
    return [`OGP画像検査: assets/ が読めない(${e.message})`];
  }
  const orphans = actual.filter((f) => !expected.has(f)).sort();
  const missing = [...expected].filter((f) => !actual.includes(f)).sort();
  const errs = [];
  if (orphans.length) {
    errs.push(
      `OGP画像: assets/ に余分なファイル: ${orphans.join(", ")}(指標を消した置き土産か、bin/og.shを経ずに置かれた可能性)`
    );
  }
  if (missing.length) {
    errs.push(`OGP画像: assets/ に無いファイル: ${missing.join(", ")}。bin/og.sh で焼くこと`);
  }
  return errs;
}

function sha256OfFile(absPath) {
  return createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
}

function ogStalenessErrors() {
  const errs = [];

  // いまの入力の実ハッシュ
  const current = {};
  for (const rel of OG_INPUT_RELS) {
    try {
      current[rel] = sha256OfFile(path.join(SITE_DIR, rel));
    } catch (e) {
      errs.push(`OGP陳腐化検査: 入力 ${rel} が読めない(${e.message})`);
    }
  }
  if (errs.length) return errs;

  // スタンプファイル(bin/og.shが焼くたびに書く記録)
  const stampAbs = path.join(SITE_DIR, OG_STAMP_REL);
  let stamp;
  try {
    stamp = JSON.parse(fs.readFileSync(stampAbs, "utf8"));
  } catch (e) {
    return [
      `OGP陳腐化検査: ${OG_STAMP_REL} が無いか壊れている(${e.message})。bin/og.sh で焼き直すこと`,
    ];
  }
  const recorded = stamp && stamp.inputs;
  if (!recorded || typeof recorded !== "object") {
    return [`OGP陳腐化検査: ${OG_STAMP_REL} に inputs が無い。bin/og.sh で焼き直すこと`];
  }

  // スタンプが記録しているパス集合と、いまのOG_INPUT_RELSが完全に一致する
  // ことを先に見る。入力を増減したのにbin/og.shを一度も回していないと
  // ここで気づける(片方だけの比較では検出できない壊れ方)。
  const recordedKeys = Object.keys(recorded).sort();
  const currentKeys = [...OG_INPUT_RELS].sort();
  if (JSON.stringify(recordedKeys) !== JSON.stringify(currentKeys)) {
    return [
      `OGP陳腐化検査: ${OG_STAMP_REL} が記録している入力パス(${recordedKeys.join(", ")})が` +
        `いまの入力(${currentKeys.join(", ")})と一致しない。bin/og.sh で焼き直すこと`,
    ];
  }

  for (const rel of OG_INPUT_RELS) {
    const want = `sha256:${current[rel]}`;
    if (recorded[rel] !== want) {
      errs.push(
        `OGP画像が古い可能性: ${rel} の内容がスタンプ(${OG_STAMP_REL})記録時から変わっている。bin/og.sh で焼き直すこと`
      );
    }
  }
  return errs;
}

/* ── data/*.csv のスキーマ検査(2026-07-30) ───────────────────────────
 * csv.js の toNum() は空文字だけを null にし、空でない非数値セル
 * (転記ミスの "1.49x934" のような打ち間違い・全角数字・単位の混入)には
 * NaN を返す。呼び出し側のフィルタは大半が `!== null` なので NaN は素通り
 * し、Math.min/Math.max 経由でy軸の定義域が非数になり、1セル汚れるだけで
 * 線が1本も描かれないページ・カードができる。dec6075 でOGカードの経路
 * (og.html の renderFan()・bin/build.mjs の fanCardInfo()・
 * bin/og.sh の verify_dom)にはこれを塞ぐ網を入れたが、/chart 系や
 * /fertility のページ自体には数値セルの検査がどこにも無く、転記ミス1文字で
 * 線が消えたページが配信されても --check は緑のままだった。ここでその穴を
 * 塞ぐ。
 *
 * ■ なぜ toNum() 自体を直さない(throwさせる)のか
 *   ブラウザ側で throw させると、1セルの転記ミスで訪問者に真っ白なページが
 *   出る(現に扇/実績線が1本も描かれない状態を toNum() が静かに許している
 *   から今まで気づかれなかった、というだけで、throwに変えれば直るという
 *   話ではなく被害の種類が変わるだけ)。デプロイゲート(--check)で人間が
 *   気づける形で止めるほうが、訪問者に一切影響を出さずに同じ穴を塞げる。
 *   toNum() の挙動そのものは変えない。
 *
 * ■ なぜ列の型を「宣言」するのか(自動判別にしない理由)
 *   「その列に数値セルが1つでもあれば数値列とみなす」ようなヒューリス
 *   ティックだと、notes のような自由記述の列にたまたま年号だけを書いた行が
 *   混ざると数値列と誤認され、他の(文章が入っている)行が全部エラーになる。
 *   正当なデータで恒久的に赤くなる検査は、このリポジトリでは「安全性の
 *   欠陥」として扱う: bin/deploy.sh が --check をデプロイゲートにしている
 *   ため、赤が固定すると人が素の `npx wrangler pages deploy` に逃げ、
 *   機密ファイル混入スキャンを迂回する(過去に実際にAPIトークンを公開した
 *   事故がある)。列名→種別の対応を明示宣言しておけば、赤くなるのは
 *   「本当に壊れたデータ」か「分類し忘れた新しい列」のどちらかだけになり、
 *   どちらも人間がすぐ直せる。
 *
 * 種別は2つだけ:
 *   "number" — 空でないセルは DECIMAL_RE(厳密な10進表記)に当てはまる必要がある。
 *              **Number.isFinite(Number(cell)) では緩すぎる**(0x10が16、1e5が
 *              100000として通ってしまう)。理由はDECIMAL_RE直上のコメント参照
 *   "text"   — 中身を検査しない(URL・日付文字列・漢数字の法令番号・自由記述等)
 * この2つ以外の値を書いた場合(タイポ)は checkColumnKinds でエラーにする
 * (`!== "number"` で判定しているだけだと、"numer" と書いた列が黙って
 * text 扱いになり検査から外れる=宣言した気になっているぶん危ない)。
 *
 * 列名の接頭辞(forecast_ / actual_)だけで機械的に分類すると間違う実例が
 * 実際にある: gdp_forecast.csv の actual_basis / forecast_basis は
 * forecast_ / actual_ という接頭辞を持つが、中身は基準年の呼称等のテキスト
 * (2015base-ref / gnp 等)であって数値ではない。
 */
const CSV_COLUMNS = {
  "bond_issuance_forecast.csv": {
    fiscal_year: "number",
    forecast_tn: "number",
    actual_tn: "number",
    forecast_source_url: "text",
    actual_source_url: "text",
    notes: "text",
  },
  // 日銀「経済・物価情勢の展望」(展望レポート)の当初見通し(段階1: 各年度の
  // 4月号の大勢見通し中央値のみ。1月号のような直前の号は2000〜2015年度分の
  // 号が半期(4月・10月)しか無く年により前倒し幅が不揃いになるため、全期間で
  // 号のホライズンを揃えられる4月号(=FY開始月と同月)に統一している)。
  // forecast_real_low/high は表の幅(政策委員のレンジ)で、段階1ではグラフに
  // 帯として使わず値の保持のみ(将来、全号の推移を扇形で見せる段階2の下地)。
  // actual_real/actual_basis/actual_source_url は data/gdp_forecast.csv の
  // 同一年度の値をそのまま転記(BOJ自身は実績を公表しないため、実績側は
  // 政府見通しページと同じ一次資料・同じ数値を指す。将来 gdp_forecast.csv側の
  // 実績が改定されたら、こちらも同じ値に合わせて直すこと)。
  "boj_outlook_real.csv": {
    fiscal_year: "number",
    forecast_real: "number", // 中央値。中央値非公表の号(FY2001-2002)は空欄
    forecast_real_low: "number",
    forecast_real_high: "number",
    actual_real: "number",
    forecast_source_url: "text",
    forecast_issue: "text", // YYYY-04(常に4月号)
    actual_source_url: "text",
    actual_basis: "text", // 呼称は chart.js の T.basisLabels(gdp_forecast.csv と同じ語彙)
    notes: "text",
  },
  "boj_outlook_cpi.csv": {
    fiscal_year: "number",
    forecast_cpi: "number",
    forecast_cpi_low: "number",
    forecast_cpi_high: "number",
    actual_cpi: "number",
    forecast_source_url: "text",
    forecast_issue: "text",
    actual_source_url: "text",
    notes: "text",
  },
  // 展望レポートの段階2: 4月号だけに絞らない全号(2000-10〜2026-07、74号)の
  // 大勢見通しを収録した生データ。boj_outlook_real/cpi.csv(段階1)が「年度ごとに
  // 1つの値」を切り出しているのに対し、こちらは「1つの年度がどう見通されて
  // きたか」を issue(号)ごとに並べる側。/boj-outlook-vintages ページの収束図・
  // 表が読む。
  //
  // issue_kind: "main"(その号が新規に示した見通し) / "restated"(前号時点の
  // 見通しを当号の文中で再掲した値。restated_fromに再掲元の号)。restated行は
  // 当号時点の政策委員の見通しではなく、必ずしも当時と同じ前提で書き直されて
  // いる可能性があるため、「その時点で公表されていた値」としては使わない
  // (収束図・表はissue_kind=="main"のみを描く。restated行はCSVには残すが
  // 表示側でフィルタする)。
  //
  // real_median/cpi_median が空欄になる号: 2000-10〜2002-10(中央値非公表の
  // 時期)、および2020-04号(新型コロナの不確実性拡大を理由に号全体で中央値
  // 公表を見送り。原資料の注記による)。
  //
  // cpi_extax_* は消費税調整後の値だが、期間によって定義が違う(2014年度分
  // までは消費税率引き上げの直接影響を除いたもの、以降は「コアコア」
  // (生鮮食品・エネルギーを除く)を指す号がある)。同一列として扱っているが
  // 意味的に連続していないので、跨いで比較しないこと。
  "boj_outlook_vintages.csv": {
    issue: "text", // YYYY-MM(号の公表月)
    issue_kind: "text", // main / restated
    restated_from: "text", // issue_kind=="restated"の時のみ、再掲元の号
    target_fiscal_year: "number",
    real_low: "number",
    real_high: "number",
    real_median: "number",
    cpi_low: "number",
    cpi_high: "number",
    cpi_median: "number",
    cpi_extax_low: "number",
    cpi_extax_high: "number",
    cpi_extax_median: "number",
    source_url: "text",
    notes: "text",
  },
  // データ行0のヘッダのみのファイル。行が無くても列の分類は要る
  // (--check がここで誤爆しないことは実行結果自体が確認になる)。
  "births_actual.csv": {
    year: "number",
    actual_births: "number", // 人(3桁区切りは表示側だけ。CSVはカンマ不可)
    source_url: "text",
    notes: "text",
  },
  "births_forecast.csv": {
    vintage_year: "number",
    target_year: "number",
    projected_births: "number",
    // 統制語彙(total / japanese)。中身は基準の呼称であって数値ではない
    // (gdp_forecast.csv の forecast_basis と同じ形)。語彙そのものは
    // birthsBasisErrors() が別に検査する。
    forecast_basis: "text",
    forecast_source_url: "text",
    forecast_published_date: "text", // ISO日付文字列
    notes: "text",
  },
  "corrections.csv": {
    date: "text",
    target: "text",
    before: "text",
    after: "text",
    reason: "text",
    url: "text",
  },
  "gdp_first_release.csv": {
    fiscal_year: "number",
    first_real: "number",
    first_nominal: "number",
    // 統制語彙(1990base … 2020base)。呼称は chart.js の T.basisLabels から引き、
    // 辞書に無い値はビルドを止める(gdp_vintages.csv の basis と同じ扱い)。
    // 接尾辞の無い形が「その基準の公表当時の系列」、`-ref` が遡及参考系列、
    // `-final` が最新確報。初回確報は定義上いつも接尾辞なしになる。
    release_basis: "text",
    first_real_source_url: "text",
    first_nominal_source_url: "text",
    notes: "text",
  },
  "cpi_forecast.csv": {
    fiscal_year: "number",
    forecast_cpi: "number",
    actual_cpi: "number",
    forecast_source_url: "text",
    actual_source_url: "text",
    notes: "text",
  },
  "current_account_forecast.csv": {
    fiscal_year: "number",
    forecast_tn: "number",
    actual_tn: "number",
    forecast_source_url: "text",
    actual_source_url: "text",
    notes: "text",
  },
  "fertility_actual.csv": {
    year: "number",
    actual_tfr: "number",
    source_url: "text",
    notes: "text",
  },
  "fertility_forecast.csv": {
    vintage_year: "number",
    target_year: "number",
    assumed_tfr_mid: "number",
    assumed_tfr_high: "number",
    assumed_tfr_low: "number",
    forecast_source_url: "text",
    forecast_published_date: "text", // ISO日付文字列
    notes: "text",
  },
  "gdp_forecast.csv": {
    fiscal_year: "number",
    forecast_real: "number",
    forecast_nominal: "number",
    actual_real: "number",
    actual_nominal: "number",
    forecast_source_url: "text",
    forecast_published_date: "text", // ISO日付文字列
    actual_source_url: "text",
    notes: "text",
    // 接頭辞は forecast_ / actual_ と同じ形だが、中身は基準年の呼称
    // (2015base-ref/2020base-final/空、gnp/gdp)であって数値ではない。
    // 上のコメント参照: 接頭辞だけで機械的に分類すると誤る実例そのもの。
    actual_basis: "text",
    forecast_basis: "text",
  },
  // 1行=(年度 × 基準)の縦持ち。2026-08-04まで基準ごとに列を並べる横持ちで、
  // **出典URL列も notes 列も無い唯一の数値CSV**だった(data/README.md §1の
  // 「すべての数値行に一次資料へのURLを付す」を満たしていなかった)。横持ちの
  // まま出典を足すと基準×実質/名目で12本のURL列が要り、しかも1つの基準の
  // 出典は全年度で同じ1本なので同じ文字列が数十行に並ぶ。縦持ちにすると
  // 1行が「ある年度・ある基準の観測」になり、他のCSVと同じ形(値＋出典＋notes)
  // に収まる。基準が増えたときに列とコードを増やさずに済むのも縦持ち側の利点
  // (2020年基準は既に gdp_forecast.csv 側で使われており、次に来るのが分かって
  // いる)。
  "gdp_vintages.csv": {
    fiscal_year: "number",
    basis: "text", // 呼称は chart.js の T.basisLabels(actual_basis と同じ語彙)
    actual_real: "number",
    actual_nominal: "number",
    actual_real_source_url: "text",
    actual_nominal_source_url: "text",
    notes: "text",
  },
  "hoan_review.csv": {
    law_id: "text", // 例: 504AC1000000078 (英字混じりの法令ID)
    law_title: "text",
    law_num: "text", // 漢数字の法律番号(例: 令和四年法律第七十八号)
    promulgation_date: "text", // ISO日付文字列
    enforcement_date: "text", // ISO日付文字列
    enforcement_note: "text",
    review_years: "number", // 実測: 2/3/5/7/10 または空
    review_deadline: "text", // ISO日付文字列
    review_status: "text",
    status_note: "text",
    source_law_url: "text",
    translation_url: "text", // 公式英訳(JLT)へのリンク。訳が無ければ空
    translation_note: "text", // 統制語彙: 空 or "暫定版"
    last_checked: "text", // ISO日付文字列
  },
  "jgb_total_issuance_forecast.csv": {
    fiscal_year: "number",
    forecast_tn: "number",
    actual_tn: "number",
    forecast_source_url: "text",
    actual_source_url: "text",
    notes: "text",
  },
  "tax_revenue_forecast.csv": {
    fiscal_year: "number",
    forecast_tn: "number",
    actual_tn: "number",
    forecast_source_url: "text",
    actual_source_url: "text",
    notes: "text",
  },
  "unemployment_forecast.csv": {
    fiscal_year: "number",
    forecast_rate: "number",
    actual_rate: "number",
    forecast_source_url: "text",
    actual_source_url: "text",
    notes: "text",
  },
};

// 数値セルが満たすべき形。**`Number.isFinite(Number(cell))` では緩すぎる**ので
// 正規表現で見る(2026-07-30)。`Number()` は `0x10` を16、`1e5` を100000、
// `+1.5` や前後に空白のある `" 1.5"` もそのまま受け取るため、そういうセルは
// 「数値として読める」ことになり検査を素通りする。実データの意味からすると
// どれも転記ミスの兆候であって、黙って別の値として読まれるほうが危ない
// (`0x10` が16として集計に入るのが最悪の形)。
//
// 厳しくして誤爆しないことは実測で確認済み: 現行の全12CSVの数値セル3153件は
// **全件がこの形に当てはまる**(2026-07-30計測)。マイナスは許す(実質成長率など
// 負の値が正当に存在する)。将来この形に当てはまらない正当な値が出てきた場合、
// エラーメッセージが値をそのまま出すので何を緩めればよいかが分かる
// (直せない恒久的な赤にはならない)。
const DECIMAL_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;

function csvSchemaErrors() {
  const errs = [];
  const dataDir = path.join(SITE_DIR, "data");
  const declaredFiles = Object.keys(CSV_COLUMNS).sort();
  let actualFiles;
  try {
    // data/ には hoan_clauses/(ディレクトリ)や README.md もあるが、対象は
    // CSVのみ。**再帰で走査し、拡張子は大文字小文字を区別しない**
    // (2026-07-30に修正)。以前は `readdirSync(dataDir)` の非再帰かつ
    // `endsWith(".csv")` だったため、`data/EXTRA.CSV`(ExcelやNumbersが
    // 付けがちな大文字拡張子)と `data/hoan_clauses/stray.csv`(サブフォルダ
    // に置いた下書き)が**検査対象にすらならず、非数値セルを含んだまま
    // --check が完全に緑になった**(実測で確認)。`wrangler pages deploy .` は
    // 指定ディレクトリを丸ごとアップロードするので、検査されないCSVが
    // そのまま公開される。「git管理外＝公開したくないものが同じ罠にかかる」
    // という既往事故と同型の死角だった。
    // 見つけたパスは data/ からの相対パス(サブディレクトリなら
    // "hoan_clauses/stray.csv")で表す。CSV_COLUMNSのキーは直下のファイル名
    // なので、サブディレクトリのCSVは自動的に「未宣言」として弾かれる。
    const walk = (dir, prefix) =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory()
          ? walk(path.join(dir, d.name), `${prefix}${d.name}/`)
          : /\.csv$/i.test(d.name)
            ? [`${prefix}${d.name}`]
            : []
      );
    actualFiles = walk(dataDir, "").sort();
  } catch (e) {
    return [`CSVスキーマ検査: data/ が読めない(${e.message})`];
  }
  const declaredSet = new Set(declaredFiles);
  const actualSet = new Set(actualFiles);

  // 宣言の値そのものの検証(fail-closed。2026-07-30に追加)。
  // 下の数値検査は `columns[h] !== "number"` で分岐しているだけなので、
  // 種別に "numer" や "Number" のようなタイポを書くとその列は**エラーも
  // 警告も出さずに数値検査から外れる**。列名の一致だけを見る網羅性検査は
  // 通ってしまうので、気づく機会がどこにも無い(「宣言した気になっている」
  // ぶん、検査が無いより悪い)。
  for (const [f, cols] of Object.entries(CSV_COLUMNS)) {
    for (const [col, kind] of Object.entries(cols)) {
      if (kind !== "number" && kind !== "text") {
        errs.push(
          `CSVスキーマ: CSV_COLUMNS[${f}] の列 "${col}" の種別が "number"/"text" でない(値: ${JSON.stringify(kind)})`
        );
      }
    }
  }

  // 網羅性(fail-closed): 新しいCSVを足して分類し忘れる穴と、宣言だけ残って
  // 実ファイルが無くなる穴の両方を見る。
  for (const f of actualFiles) {
    if (!declaredSet.has(f)) {
      errs.push(`CSVスキーマ: data/${f} が CSV_COLUMNS に宣言されていない(列の型を分類すること)`);
    }
  }
  for (const f of declaredFiles) {
    if (!actualSet.has(f)) {
      errs.push(`CSVスキーマ: CSV_COLUMNS[${f}] の宣言があるが data/${f} が無い`);
    }
  }

  for (const f of actualFiles) {
    if (!declaredSet.has(f)) continue; // 未宣言は上で既に報告済み
    const columns = CSV_COLUMNS[f];
    const declaredCols = new Set(Object.keys(columns));
    const abs = path.join(dataDir, f);
    const text = fs.readFileSync(abs, "utf8");
    // parseCSV(csv.js)と同じ規則で分解する(素の split。クォート非対応)。
    const lines = text.trim().replace(/\r\n/g, "\n").split("\n");
    // trim() が先頭から落とした行数。行番号の報告をこの分だけ補正する
    // (2026-07-30に修正)。先頭に空行があると、報告する行番号が実ファイルより
    // その分だけ小さくなり、「何行目を直せばいいか」が食い違っていた(実測で
    // 確認: 物理6行目を汚して「5行目」と報告された)。parseCSVも同じtrimを
    // するので解釈自体は一致しており、ズレるのは診断メッセージだけ。
    const leadingBlank = text.replace(/\r\n/g, "\n").split("\n").findIndex((l) => l.trim() !== "");
    const lineOffset = leadingBlank > 0 ? leadingBlank : 0;
    const header = lines[0].split(",");
    const headerSet = new Set(header);

    let headerMismatch = false;
    // 列名の重複(2026-07-30に追加)。**これが無いと汚染データが正規の手順で
    // 緑のまま配信される**: csv.jsのparseCSVは
    // `headers.forEach((h, i) => (row[h] = cells[i] ?? ""))` なので**最後の
    // 出現が勝ち**、重複した列の値が本来の列を丸ごと上書きする。ところが
    // 下の網羅性検査は集合(Set)で見るため重複が潰れて「未分類」にも
    // 「宣言にあるがヘッダに無い」にも掛からず、列数検査は重複込みの
    // header.lengthを基準にするので行側も整合し、数値検査も各位置を個別に
    // 見るだけなので正しい10進値なら通る。実測では、ヘッダ末尾に既存の
    // forecast_tn をもう1つ足して全行に 999.9 を付けると、スキーマ検査の
    // 指摘は0件のまま chart/tax-revenue.html に 999.9 が48箇所焼き込まれた。
    // 「列を1本足すつもりで既存の列名を複製してしまう」という、ヘッダ1行の
    // ありふれた編集ミスで起きる。
    const seenCols = new Set();
    for (const h of header) {
      if (seenCols.has(h)) {
        headerMismatch = true;
        errs.push(
          `CSVスキーマ: data/${f} のヘッダに列 "${h}" が複数回ある。` +
            `csv.jsのparseCSVは後の出現が勝つため、この列の値が静かに置き換わる`
        );
      }
      seenCols.add(h);
    }
    for (const h of header) {
      if (!declaredCols.has(h)) {
        headerMismatch = true;
        errs.push(`CSVスキーマ: data/${f} の列 "${h}" が CSV_COLUMNS[${f}] に分類されていない`);
      }
    }
    for (const c of declaredCols) {
      if (!headerSet.has(c)) {
        headerMismatch = true;
        errs.push(
          `CSVスキーマ: CSV_COLUMNS[${f}] に列 "${c}" の宣言があるがヘッダに無い(列名の変更/削除の見直し漏れ)`
        );
      }
    }
    // ヘッダの集合が宣言とズレている間は、何列目が何の列かが定まらないため
    // 行単位の検査(列数・数値セル)をしても紛らわしいだけ。次のファイルへ。
    if (headerMismatch) continue;

    // parseCSV は素の line.split(",") で、引用符もエスケープも扱わない。
    // 値にカンマが1個入るだけで以降の列が全部ズレる(notesに読点代わりの
    // カンマを書いた瞬間に静かに壊れる)ため、ヘッダの列数との一致を見る。
    lines.slice(1).forEach((line, i) => {
      // 1行目はヘッダなので+2。lineOffsetはtrimが先頭から落とした空行の数
      // (上のlineOffset直上コメント参照)。
      const rowNum = lineOffset + i + 2;
      const cells = line.split(",");
      if (cells.length !== header.length) {
        errs.push(
          `CSVスキーマ: data/${f}:${rowNum}行目 の列数が${cells.length}(ヘッダは${header.length}列)。` +
            `カンマの混入か欠落の可能性`
        );
        return; // 列がズレている行の数値検査は意味を持たないので飛ばす
      }
      header.forEach((h, idx) => {
        if (columns[h] !== "number") return;
        const cell = cells[idx];
        if (cell === "") return; // 空セルは許容(csv.jsのtoNum()と同じ扱い)
        if (!DECIMAL_RE.test(cell)) {
          errs.push(
            `CSVスキーマ: data/${f}:${rowNum}行目 の列"${h}"が数値として読めない(値: "${cell}")`
          );
        }
      });
    });
  }

  return errs;
}

/* ── /cite の「データの直リンク」表とCSV_COLUMNSの同期(2026-07-31) ──────
 * cite.js の DATA_FILES(利用者に見せる「公開データはこれで全部」という
 * 一覧)は、これまで CSV_COLUMNS(このファイルの data/*.csv 網羅表、既に
 * --check で「宣言もれ / 宣言だけあって実ファイルが無い」を見ている)と
 * 一切突き合わせていなかった。data/ にCSVを1本足して CSV_COLUMNS にも
 * 宣言すれば --check は緑のまま通るのに、DATA_FILES に足し忘れると
 * /cite の表だけが黙って古いまま残る(利用者に「これが公開データの全部
 * です」と見せている表が実態とズレる)。CSV_COLUMNS を新設したときに
 * ちょうど塞いだはずの「足して宣言し忘れる穴」が、1層上(利用者向けの
 * 一覧)で再発している形なので、ここで塞ぐ。
 *
 * cite.js 側に写しは作らない。DATA_FILES は cite.js が唯一の出所で、
 * ここでは loadModule() で取り込んだ CITE.DATA_FILES をそのまま見る
 * (chart.js の METRICS 等、他の一覧をビルド側に複製しないのと同じ方針)。
 * 差分は両方向を見る: DATA_FILES にあって CSV_COLUMNS に無い(消えた
 * ファイルの行が表に残っている)側も、CSV_COLUMNS にあって DATA_FILES に
 * 無い(新しいファイルの行が表に無い)側も、どちらか片方だけでは穴が残る。
 */
// hoan_review.csv の law_num が全行 lawNumEn() で読めること、かつ換算結果が
// 同じ行の他の列と食い違わないことを見る。突き合わせ先は2つで、年と号を別々に
// 押さえている:
//   年 → promulgation_date の西暦(法令番号の年は公布年なので必ず一致する)
//   号 → law_id(e-Govの法令IDは "5" + 年2桁 + "AC" + … + 号3桁 の形で、
//        元号・年・号をそのまま埋め込んでいる。49行すべてでこの形を確認済み)
// ズレたら元号の換算表(ERA_BASE)か漢数字の解釈(kanjiToInt)が壊れている。
//
// 検査が要る理由: lawNumEn() は読めない番号に対して null を返して**併記を黙って
// 省く**設計なので、壊れても画面は「英語の番号が出ないだけ」になり、JA側は元から
// 出さないので何も変わらない。放っておくと気づけない。
//
// 号の突き合わせは後から足した。最初は年(promulgation_date)しか見ておらず、
// **漢数字の「十」の解釈を壊す負例が素通りした**(2026-08-03)。対象49法の年は
// 三〜七の一文字で「十」を含まないため、年の検査だけでは号の壊れ方に触れない。
// 逆方向で確認済み: ERA_BASE の令和を1つずらすと49行全部、「十」を壊すと
// 該当する号を持つ行が落ちる。
function hoanLawNumErrors() {
  let rows;
  try {
    rows = parseCSV(read("data/hoan_review.csv"));
  } catch (e) {
    return [`法令番号検査: data/hoan_review.csv が読めない(${e.message})`];
  }
  const errs = [];
  for (const r of rows) {
    const en = HOAN.lawNumEn(r.law_num);
    if (!en) {
      errs.push(
        `法令番号: "${r.law_num}" (${r.law_id}) を lawNumEn() が読めない。` +
          `EN側は英語の番号を黙って省くので画面には出ない。hoan.js の lawNumEn を見ること`
      );
      continue;
    }
    const m = /^Act No\. (\d+) of (\d+)$/.exec(en);
    if (!m) {
      errs.push(`法令番号: lawNumEn("${r.law_num}") の形が想定外(値: "${en}")`);
      continue;
    }
    const [no, year] = [Number(m[1]), Number(m[2])];
    const promulgated = Number((r.promulgation_date || "").slice(0, 4));
    if (promulgated && year !== promulgated) {
      errs.push(
        `法令番号: "${r.law_num}" (${r.law_id}) の換算が ${year}年 だが ` +
          `promulgation_date は ${promulgated}年。法令番号の年は公布年なので一致するはず`
      );
    }
    if (!String(r.law_id || "").endsWith(String(no).padStart(3, "0"))) {
      errs.push(
        `法令番号: "${r.law_num}" の換算が第${no}号 だが law_id "${r.law_id}" の` +
          `末尾3桁と合わない(law_idは号をそのまま埋め込んでいる)`
      );
    }
  }
  return errs;
}

/* ── 公式英訳の列(translation_url / translation_note)の検査 ──────────────
 * hoan.js の transLinkHtml は、translation_note が未知の値だったらリンクごと
 * 黙って落とす(誤った版表示を出すより安全なので、描画側としてはそれが正しい)。
 * その代わり**黙って落ちたことに誰も気づけない**ので、語彙と形はここで見る。
 *
 * 0件も異常として扱う。JLTの照会は検索フォームへのPOST(bin/build_hoan.py)なので、
 * 向こうの作りが変わればCSRFトークンや結果の形が変わり、「1件も当たらない」形で
 * 静かに壊れうる。sourceUrlReachErrors() が seen===0 を異常とみなすのと同じ理由。
 */
function hoanTranslationErrors() {
  let rows;
  try {
    rows = parseCSV(read("data/hoan_review.csv"));
  } catch (e) {
    return [`公式英訳検査: data/hoan_review.csv が読めない(${e.message})`];
  }
  const errs = [];
  let withUrl = 0;
  for (const r of rows) {
    const url = (r.translation_url || "").trim();
    const note = (r.translation_note || "").trim();
    if (url) {
      withUrl++;
      if (!url.startsWith(HOAN_TRANS_PREFIX) || !/^\d+$/.test(url.slice(HOAN_TRANS_PREFIX.length))) {
        errs.push(
          `公式英訳: ${r.law_id} の translation_url が想定の形でない(値: "${url}")。` +
            `${HOAN_TRANS_PREFIX}<数字> のはず`
        );
      }
    }
    if (note && note !== HOAN.TENTATIVE) {
      errs.push(
        `公式英訳: ${r.law_id} の translation_note "${note}" は統制語彙(空 or "${HOAN.TENTATIVE}")に無い。` +
          `hoan.js の transLinkHtml はこの行のリンクを黙って出さなくなる`
      );
    }
    if (note && !url) {
      errs.push(`公式英訳: ${r.law_id} は translation_note "${note}" を持つが translation_url が空`);
    }
  }
  if (rows.length && withUrl === 0) {
    errs.push(
      "公式英訳: translation_url が1件も入っていない" +
        "(0件はありえない。bin/build_hoan.py の JLT 照会が壊れている可能性が高い)"
    );
  }
  return errs;
}

// 全HTMLの href/src に付く ?v= が ASSET_V と一致することを見る(2026-08-04)。
//
// ASSET_V は bin/build.mjs にあるが、**手書きHTML(index/about/cite/contact/
// corrections/fertility/hoan)の ?v= はそこから生成されておらず、人間が同じ
// 文字列を書き写している**。生成物側(chart/*・en/**)は ASSET_V から作られる
// ので自動で揃うが、手書き側は揃いを守るものが何も無かった。実験では
// about.html の style.css?v= だけを古い値に戻しても --check は緑のまま通り、
// **そのページだけブラウザが古いCSS/JSを使い続ける**状態になった。
// og.html にも「?v=を手で揃える3箇所目になるのに揃いを守る検査は何も無く
// 形骸化していた」と書いてあり、その指摘が塞がれないまま残っていた。
//
// 対象は href="…?v=…" / src="…?v=…" の形だけに限る。og.html には ?v= を
// **付けない理由**を説明したコメントがあり(焼きに対してキャッシュバスターは
// 意味を持たないため)、素の "?v=" を拾う書き方だとそれに誤爆する。
//
// fail-closed: 1件も見つからない場合もエラーにする。手書きHTMLから ?v= が
// 消えることは通常ありえず、0件は「正規表現が現実に追いつけなくなった」以外
// の意味を持たない(handwrittenJaDriftErrors の 0件チェックと同じ考え方)。
// サイト配下の .html を全部拾う。dotfile と node_modules は対象外(前者は
// 配信物ではなく、後者は他人のHTML)。全ページを見る検査が3つあるので1箇所に置く。
function walkHtml(dir = SITE_DIR) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((d) => {
      if (d.name === "node_modules" || d.name.startsWith(".")) return [];
      const p = path.join(dir, d.name);
      return d.isDirectory() ? walkHtml(p) : /\.html$/i.test(d.name) ? [p] : [];
    })
    .sort();
}

function assetVersionErrors() {
  const errs = [];
  let seen = 0;
  for (const file of walkHtml()) {
    const html = fs.readFileSync(file, "utf8");
    for (const m of html.matchAll(/(?:href|src)="[^"]*\?v=([^"&]*)"/g)) {
      seen++;
      if (m[1] !== ASSET_V) {
        errs.push(
          `?v= の不一致: ${path.relative(SITE_DIR, file)} に "?v=${m[1]}" があるが ` +
            `bin/build.mjs の ASSET_V は "${ASSET_V}"。` +
            `そのページだけ古いCSS/JSがキャッシュから使われ続ける`
        );
      }
    }
  }
  if (seen === 0) {
    errs.push(
      "?v= の検査: HTMLから ?v= を1件も見つけられなかった(0件はありえない。" +
        "href/src の書き方が変わって正規表現が追いつけなくなった可能性が高い)"
    );
  }
  return errs;
}

// favicon が全ページに入っているかを見る(2026-08-12)。
//
// 生成物側は FAVICON_HEAD から作られるので自動で揃うが、手書きJA(index/about/
// cite/contact/corrections/fertility/hoan/births/boj-outlook-vintages)は同じ
// 文字列を書き写している。?v= と同じ「手書き側だけが取り残される」構図なので、
// 同じように機械で揃いを守る。片方のページだけタブのアイコンが出ない壊れ方は
// 目視で気づきにくい(そのページを開いた人にしか見えない)。
//
// og.html は対象外。OGP画像を焼くための元ページでサイト本体からリンクせず、
// ブラウザのタブに出ることが無いため(?v= を付けない理由と同じ筋)。
//
// fail-closed: 対象が0件になった場合もエラーにする(walkHtml() が壊れたときに
// 黙って通らないようにする。assetVersionErrors() と同じ考え方)。
function faviconErrors() {
  const errs = [];
  let seen = 0;
  const want = FAVICON_HEAD.split("\n");
  for (const file of walkHtml()) {
    const rel = path.relative(SITE_DIR, file);
    if (rel === "og.html") continue;
    seen++;
    const html = fs.readFileSync(file, "utf8");
    for (const tag of want) {
      if (!html.includes(tag)) {
        errs.push(`favicon 欠落: ${rel} に ${tag} が無い(FAVICON_HEAD と揃えること)`);
      }
    }
  }
  if (seen === 0) {
    errs.push("favicon の検査: 対象HTMLを1件も見つけられなかった(0件はありえない)");
  }
  return errs;
}

// index.html の .card-fallback(JSを実行しないクローラにとってトップから各指標へ
// 辿れる唯一の経路)が、home.js の INDICATOR_META と一致することを見る(2026-08-04)。
//
// JSが動く環境では home.js が #card-grid を丸ごとカードへ差し替えるので、
// .card-fallback の文字列がどれだけ古くても**画面上は正しく見える**。EN側は
// 生成物なので INDICATOR_META から自動で追随し、JA側だけが手書きのまま
// 取り残される(2026-08-01のCPI改題で実際に取り残した)。
//
// href と表示文字列の両方を、並び順込みで突き合わせる。順序まで見るのは、
// カードの並びがそのまま指標の並び順の宣言になっているため(集合で比べると
// 入れ替わりを見逃す)。
function cardFallbackErrors() {
  const html = read("index.html");
  const found = [...html.matchAll(/<a class="card-fallback" href="([^"]*)">([^<]*)<\/a>/g)].map(
    (m) => ({ href: m[1], text: m[2] })
  );
  const want = HOME.INDICATOR_META.map((m) => ({ href: m.chartHref, text: m.nameJa }));

  if (found.length === 0) {
    return [
      "card-fallback 検査: index.html から .card-fallback を1件も見つけられなかった" +
        "(0件はありえない。JSを実行しない相手からトップの索引が消えている可能性がある)",
    ];
  }
  const errs = [];
  if (found.length !== want.length) {
    errs.push(
      `card-fallback: index.html に ${found.length} 件あるが home.js の INDICATOR_META は ` +
        `${want.length} 件。JSが動く環境ではカードに差し替わるので画面では気づけない`
    );
  }
  for (let i = 0; i < Math.max(found.length, want.length); i++) {
    const f = found[i], w = want[i];
    if (!f || !w) continue; // 件数の不一致は上で1件にまとめて報告済み
    if (f.href !== w.href || f.text !== w.text) {
      errs.push(
        `card-fallback: index.html の${i + 1}番目が <a href="${f.href}">${f.text}</a> だが ` +
          `INDICATOR_META は <a href="${w.href}">${w.text}</a>(key: ${HOME.INDICATOR_META[i].key})`
      );
    }
  }
  return errs;
}

// 全HTMLで <meta name="description"> と <meta property="og:description"> が
// 一致することを見る(2026-08-04)。
//
// 元は「JAトップの og:description が無検査の手書き複製」というTODOだった。
// buildHome() は index.html の <meta name="description"> だけを原本として
// JSON-LD へ流しており、og:description は誰とも突き合わせていない(EN側は
// buildHomeEn() の const 1箇所から meta/og/JSON-LD すべてが生成されるので
// 複製が無い)。同じ複製はトップ以外の手書きJAページにもあるので、全ページに
// 広げてある。
//
// 検査を足した時点で実際に1件見つかった: hoan.html だけ og:description が
// **古い短い版のまま**残っており、JA側に説明文が3種類(meta description /
// og:description / JSON-LD)存在していた。EN側は生成物なので1つに揃っている。
// og を meta に揃えて解消した(2026-08-04)。
//
// meta description と JSON-LD の description まで一致を要求はしない。検索
// スニペット向けの短い説明とページの説明が違うのは正当だし、EN側の生成物は
// 一致しているので、そこを縛ると片方の設計に引きずられる。ここで潰したいのは
// 「同じ役割の文字列が2箇所にあって片方だけ古くなる」ほうだけ。
//
// fail-closed: description を持つのに og:description が無い(またはその逆)も
// エラー。og だけ消える壊れ方はSNSカードにしか出ないので目視では気づけない。
function ogDescriptionErrors() {
  const errs = [];
  let seen = 0;
  for (const file of walkHtml()) {
    const html = fs.readFileSync(file, "utf8");
    const rel = path.relative(SITE_DIR, file);
    const desc = /<meta name="description" content="([^"]*)"/.exec(html);
    const og = /<meta property="og:description" content="([^"]*)"/.exec(html);
    if (!desc && !og) continue; // og.html のようにどちらも持たないページは対象外
    seen++;
    if (!desc || !og) {
      errs.push(
        `og:description: ${rel} は description と og:description の片方しか持たない` +
          `(description=${!!desc} / og:description=${!!og})`
      );
      continue;
    }
    if (desc[1] !== og[1]) {
      errs.push(
        `og:description: ${rel} の og:description が description と食い違っている。` +
          `SNSカードにしか出ないので画面を見ても気づけない\n` +
          `    description   : ${desc[1].slice(0, 60)}…\n` +
          `    og:description: ${og[1].slice(0, 60)}…`
      );
    }
  }
  if (seen === 0) {
    errs.push(
      "og:description 検査: description を持つHTMLを1件も見つけられなかった" +
        "(0件はありえない。meta の書き方が変わって正規表現が追いつけなくなった可能性が高い)"
    );
  }
  return errs;
}

/* ── 出典URLが静的HTMLから辿れるか ─────────────────────────────
 * 「出典つきで確かめられる」はこのサイトの前提で、確かめるのにJSの実行を
 * 要求しないことまで含む。ところが2026-08-04まで /fertility の実績値の出典
 * (3件)と2002年推計の但し書きは fertility.js が組み立てていて、**静的HTMLの
 * どこにも出ていなかった**。推計側のURLだけはズレ一覧が別途持っていたので、
 * ページを見ても「出典が1件も無い」ようには見えず、気づきようが無かった。
 *
 * そこで data/*.csv のURL列に載っているURLが、サイトのどれかの静的HTMLに
 * 現れることを要求する。ページ単位ではなくサイト全体で見るのは、gdp_forecast の
 * `実質:URL 名目:URL` のような複合セルが2ページに分かれて出るため(片方ずつ
 * 正しく出ているのを「そのページに無い」と誤検出させない)。実測212件が全部
 * 現れる状態から始めている。
 *
 * 比較の前に &amp; を戻すこと。e-stat のURLはクエリを持つので、HTMLに
 * 埋まった側は必ずエスケープされている(これを忘れると全件エラーになる)。
 */
function sourceUrlReachErrors() {
  const html = walkHtml()
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n")
    .replace(/&amp;/g, "&");

  const errs = [];
  let seen = 0;
  for (const file of fs.readdirSync(path.join(SITE_DIR, "data")).sort()) {
    if (!file.endsWith(".csv")) continue;
    const rows = parseCSV(read(`data/${file}`));
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]).filter((c) => /url/i.test(c));
    const urls = new Set();
    for (const r of rows) {
      for (const c of cols) {
        for (const u of (r[c] || "").matchAll(/https?:\/\/[^\s"<>]+/g)) urls.add(u[0]);
      }
    }
    for (const u of urls) {
      seen++;
      if (!html.includes(u)) {
        errs.push(
          `出典URLが静的HTMLに無い: data/${file} の ${u}\n` +
            `    JSを実行しない相手にはこの出典が届いていない` +
            `(ページのJSが組み立てているだけになっていないか見ること)`
        );
      }
    }
  }
  if (seen === 0) {
    errs.push(
      "出典URLの検査: data/*.csv からURLを1件も取り出せなかった" +
        "(0件はありえない。列名の付け方が変わって /url/i で拾えなくなった可能性が高い)"
    );
  }
  return errs;
}

/* ── 出生数の基準(forecast_basis)の検査 ─────────────────────────
 * /births は推計側に2つの基準が混じる唯一のページで、実績(日本における
 * 日本人)と基準が揃うのは2017/2023の2版だけ。ズレの何%かが基準の違いで
 * 説明できてしまうので、どの版がどちらかは値そのものと同じ重みを持つ。
 *
 * ところが壊れても画面には出ない: births.js は「japanese 以外はすべて印を
 * 付ける」側に倒してあるので、`total` を `totl` と打ち間違えても印は付いた
 * ままで、CSVスキーマ検査も text 列は中身を見ない。逆に `japanese` を打ち
 * 間違えると**印が消えて基準が揃っているように見える**——こちらは静かに嘘に
 * なる。だから語彙そのものをここで見る。
 *
 * 併せて (1) 1つの版の中で基準が混じっていないこと(基準は版の属性で、
 * birthsData() は先頭行の値を版全体の基準として使っている)、(2) 0件でない
 * こと(列名が変わって1件も読めなくなったら止める)、(3) births.js の
 * BASIS_JAPANESE が語彙の中にあること(ここが外れると全版に印が付く)を見る。
 */
const BIRTHS_BASIS_VOCAB = ["total", "japanese"];

function birthsBasisErrors() {
  const errs = [];
  if (!BIRTHS_BASIS_VOCAB.includes(BIRTH.BASIS_JAPANESE)) {
    errs.push(
      `births.js の BASIS_JAPANESE が "${BIRTH.BASIS_JAPANESE}" で、forecast_basis の語彙(${BIRTHS_BASIS_VOCAB.join(" / ")})に無い。` +
        `全部の版に「総人口ベース」の印が付いた状態になる`
    );
  }
  const rows = parseCSV(read("data/births_forecast.csv"));
  const byVintage = new Map();
  rows.forEach((r, i) => {
    const basis = r.forecast_basis;
    if (!BIRTHS_BASIS_VOCAB.includes(basis)) {
      errs.push(
        `data/births_forecast.csv ${i + 2}行目の forecast_basis が "${basis}" ` +
          `(語彙は ${BIRTHS_BASIS_VOCAB.join(" / ")})。実績との基準の一致/不一致が誤って表示される`
      );
      return;
    }
    const v = r.vintage_year;
    if (!byVintage.has(v)) byVintage.set(v, new Set());
    byVintage.get(v).add(basis);
  });
  for (const [v, set] of byVintage) {
    if (set.size > 1) {
      errs.push(
        `data/births_forecast.csv: ${v}年推計の forecast_basis が1つに定まらない(${[...set].join(" / ")})。` +
          `基準は版の属性で、表示側は先頭行の値を版全体の基準として使う`
      );
    }
  }
  if (rows.length === 0) {
    errs.push(
      "出生数の基準の検査: data/births_forecast.csv から1行も読めなかった(0件はありえない)"
    );
  }
  return errs;
}

function citeDataFilesErrors() {
  const errs = [];
  const declared = new Set(Object.keys(CSV_COLUMNS));
  const listed = new Set(CITE.DATA_FILES.map((d) => d.file));
  for (const f of listed) {
    if (!declared.has(f)) {
      errs.push(
        `cite.js: DATA_FILES に "${f}" があるが CSV_COLUMNS に無い(data/に存在しないファイルの可能性。DATA_FILES から該当行を消すか、CSV_COLUMNSの宣言漏れを直すこと)`
      );
    }
  }
  for (const f of declared) {
    if (!listed.has(f)) {
      errs.push(
        `cite.js: CSV_COLUMNS[${f}] が data/ にあるのに DATA_FILES に無い(/cite の「データの直リンク」表に行を追加すること)`
      );
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
files.set(path.join(SITE_DIR, "births.html"), buildBirths());
files.set(path.join(SITE_DIR, "boj-outlook-vintages.html"), buildBojVintages());
files.set(path.join(SITE_DIR, "hoan.html"), buildHoan());
files.set(path.join(SITE_DIR, "corrections.html"), buildCorrections());
files.set(path.join(SITE_DIR, "index.html"), buildHome(keys));
// /en/ 以下(2026-07-29追加)。JA側と同じ生成器を lang="en" で呼ぶか、元ファイルが
// 無いページ(home/fertility/hoan/about/corrections/contact)は buildXxxEn() で
// 丸ごと組み立てる。詳細は各関数の直上コメントを参照。
for (const k of keys) files.set(path.join(EN_OUT_DIR, `${k}.html`), buildPage(k, METRICS[k], "en"));
files.set(path.join(EN_OUT_DIR, "index.html"), buildIndex(keys, "en"));
files.set(path.join(EN_DIR, "fertility.html"), buildFertilityEn());
files.set(path.join(EN_DIR, "births.html"), buildBirthsEn());
files.set(path.join(EN_DIR, "boj-outlook-vintages.html"), buildBojVintagesEn());
files.set(path.join(EN_DIR, "hoan.html"), buildHoanEn());
files.set(path.join(EN_DIR, "index.html"), buildHomeEn(keys));
files.set(path.join(EN_DIR, "about.html"), buildAboutEn());
files.set(path.join(EN_DIR, "corrections.html"), buildCorrectionsEn());
files.set(path.join(EN_DIR, "contact.html"), buildContactEn());
files.set(path.join(EN_DIR, "cite.html"), buildCiteEn());
// sitemap.xml の lastmod は他の生成ページの「いま生成した文字列」を直接見る
// (outputDate()。詳細はそのコメントを参照)ので、今度こそ本当に順序が意味を
// 持つ: files に他の全ページが積み終わったあとで呼ぶ必要がある(このMapに
// まだ無いパスを buildSitemap が要求したら genDate() が例外で止める)。
files.set(path.join(SITE_DIR, "sitemap.xml"), buildSitemap(keys, files));
files.set(path.join(SITE_DIR, "llms.txt"), llmsTxtContent(keys));

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

// --og-list: bin/og.sh が焼くべきカード一覧(と、その入力ファイル一覧)を
// 標準出力へTSVで返す。bin/og.sh 側に同じ集合を手書きで持たせない(1箇所に
// する)ための唯一の受け渡し経路。ここは --check の分岐(if (check) 直前)と
// あえて並べて置いている: このスクリプトはトップレベルで全ページを
// メモリ上に生成してから初めて --check/--og-list を分岐する作りなので、
// --og-list だけを先に処理して抜けるという最適化はしていない(無駄に
// フルビルドが走るが、掛かる時間は誤差なので許容する)。
// 出力形式(2026-07-30、C・D・出生率カード対応で改定。各行の1列目が種別の接頭辞):
//   INPUT\t<相対パス>
//     … OG_INPUT_RELSの各要素(先頭で全行出す)
//   CARD\t<query>\t<出力先相対パス>\t<期待最小年度>\t<hasForecast:0/1>\t<hasActual:0/1>\t<type>\t<vintageCount>
//     … OG_CARDSの各カード。type("metric"/"fan")はbin/og.shのverify_domが
//       どの検査をすべきかの分岐に使う(OG_CARDS直上コメント参照)。
//       vintageCountはtype="fan"のときだけ意味を持つ(扇の本数の期待値。
//       type="metric"では常に0で未使用)。
//   END\t<INPUT行の件数>\t<CARD行の件数>
//     … 最終行のセンチネル
// 以前はカード行に接頭辞が無く、"INPUT"以外の行を無条件にカード扱いして
// いた(D)。誰かがこの分岐より前にデバッグの console.log を1行足すだけで
// その行がカードとして扱われ、タブを含まない行ならbin/og.sh側で出力先が
// 空になり `mv "$tmp_png" "$ROOT/"` で site/ 直下にPNGが置かれ次のデプロイで
// 配信されかねなかった。"CARD" という接頭辞を明示し、bin/og.sh側は
// INPUT/CARD/ENDのいずれでもない行が来たらエラーで止まるようにした
// (「知らない行=カード」というフォールバックを無くす)。
// 末尾のENDセンチネルは、プロセス置換(bin/og.shが以前使っていた
// `done < <(node ...)`)の終了コードをset -eが拾えない問題(C)への対策。
// bin/og.sh側は一時ファイルへリダイレクトしてnodeの終了コードを見るように
// 変えた上で、さらに「最終行がENDであること」「実際に読めた行数が宣言された
// 件数と一致すること」を確かめることで、部分出力(リストが途中で切れた場合)
// も検出できるようにしている。
if (process.argv.includes("--og-list")) {
  const lines = [];
  for (const rel of OG_INPUT_RELS) lines.push(`INPUT\t${rel}`);
  for (const c of OG_CARDS) {
    lines.push(`CARD\t${c.query}\t${c.out}\t${c.minYear}\t${c.hasForecast}\t${c.hasActual}\t${c.type}\t${c.vintageCount}`);
  }
  lines.push(`END\t${OG_INPUT_RELS.length}\t${OG_CARDS.length}`);
  process.stdout.write(lines.join("\n") + "\n");
  process.exit(0);
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
  // OGP画像の陳腐化は生成物ではないog.htmlが起点なので、上のどの検査とも
  // 独立に必ず見る(stale/orphans/refs/id/drift/homeFillsのいずれにも掛からない)。
  const ogErrs = ogStalenessErrors();
  // assets/のog*.pngが「焼くべき22枚」とちょうど一致するかも同様に独立
  // (ogStalenessErrorsは入力ファイルのハッシュしか見ておらず、出力側の
  // 過不足はここでしか捕まえられない)。
  const ogFileErrs = ogFileErrors();
  // CSVスキーマ(列の型宣言・宣言の網羅性・行の列数・数値セル)も他のどの検査
  // とも独立(生成物にもOGP画像にも関わらない、data/*.csvそのものの壊れ方)。
  const csvSchemaErrs = csvSchemaErrors();
  // /cite の DATA_FILES ↔ CSV_COLUMNS の同期も、生成物にもOGP画像にもdata/の
  // 内容そのものにも関わらない別種の壊れ方なので、csvSchemaErrs とは独立に
  // 必ず見る。
  const citeDataFilesErrs = citeDataFilesErrors();
  // 出生数の基準(forecast_basis)も独立。CSVスキーマ検査は text 列の中身を見ず、
  // 描画側は未知の値でも印を出す/出さないどちらかに倒れるだけなので画面に出ない。
  const birthsBasisErrs = birthsBasisErrors();
  // 法令番号の英語換算も、生成物の新旧にもCSVのスキーマにも掛からない別種の
  // 壊れ方(値は正しい形をしているのに換算だけ間違う)なので独立に見る。
  const hoanNumErrs = hoanLawNumErrors();
  // 公式英訳の列も独立(法令番号の換算が正しくCSVのスキーマも通っている状態で、
  // 統制語彙の外れやURLの形だけが崩れる。描画側は黙って落とすので画面に出ない)。
  const hoanTransErrs = hoanTranslationErrors();
  // ?v=(ASSET_V)の揃いも、生成物の新旧・CSV・法令番号のいずれとも関係しない
  // 別種の壊れ方(HTMLは最新でも、参照先のバージョンだけが古い)なので独立に見る。
  const assetVErrs = assetVersionErrors();
  // favicon の揃いも独立(?v= が合っていてもタグごと欠けていれば効かない)。
  const faviconErrs = faviconErrors();
  // JAトップの .card-fallback ↔ INDICATOR_META も独立(生成物は最新・?v=も揃って
  // いる状態で、手書きのリンク文字列だけが取り残される壊れ方)。
  const cardFbErrs = cardFallbackErrors();
  // description ↔ og:description の一致も独立(SNSカードにしか出ないので、
  // 生成物が最新でも画面が正しくても検出されない壊れ方)。
  const ogDescErrs = ogDescriptionErrors();
  // 出典URLが静的HTMLから辿れるかも独立(生成物は最新・文言も一致している状態で、
  // 「その出典をJSしか組み立てていない」という形で欠ける)。
  const srcReachErrs = sourceUrlReachErrors();
  if (
    stale.length ||
    orphans.length ||
    orphansEn.length ||
    refs.length ||
    idErrs.length ||
    driftErrs.length ||
    homeFillsErrs.length ||
    ogErrs.length ||
    ogFileErrs.length ||
    csvSchemaErrs.length ||
    citeDataFilesErrs.length ||
    birthsBasisErrs.length ||
    hoanNumErrs.length ||
    hoanTransErrs.length ||
    assetVErrs.length ||
    faviconErrs.length ||
    cardFbErrs.length ||
    ogDescErrs.length ||
    srcReachErrs.length
  ) {
    if (stale.length) console.error(`✗ 生成物が古い: ${stale.join(", ")}`);
    if (orphans.length) console.error(`✗ 余分なファイル: chart/${orphans.join(", chart/")}`);
    if (orphansEn.length) console.error(`✗ 余分なファイル: en/chart/${orphansEn.join(", en/chart/")}`);
    refs.forEach((e) => console.error(`✗ ${e}`));
    idErrs.forEach((e) => console.error(`✗ ${e}`));
    driftErrs.forEach((e) => console.error(`✗ ${e}`));
    homeFillsErrs.forEach((e) => console.error(`✗ ${e}`));
    ogErrs.forEach((e) => console.error(`✗ ${e}`));
    ogFileErrs.forEach((e) => console.error(`✗ ${e}`));
    csvSchemaErrs.forEach((e) => console.error(`✗ ${e}`));
    citeDataFilesErrs.forEach((e) => console.error(`✗ ${e}`));
    birthsBasisErrs.forEach((e) => console.error(`✗ ${e}`));
    hoanNumErrs.forEach((e) => console.error(`✗ ${e}`));
    hoanTransErrs.forEach((e) => console.error(`✗ ${e}`));
    assetVErrs.forEach((e) => console.error(`✗ ${e}`));
    faviconErrs.forEach((e) => console.error(`✗ ${e}`));
    cardFbErrs.forEach((e) => console.error(`✗ ${e}`));
    ogDescErrs.forEach((e) => console.error(`✗ ${e}`));
    srcReachErrs.forEach((e) => console.error(`✗ ${e}`));
    if (stale.length || orphans.length || orphansEn.length) console.error("  node bin/build.mjs を実行してからデプロイすること");
    process.exit(1);
  }
  console.log(
    `✓ ${files.size} ページは最新（sitemap / トップのリンク / idの対応 / 手書きJAページのT.jaとの対応 / HOME_FILLSとhome.jsの対応 / OGP画像の焼き直しとassets/の過不足 / data/*.csvのスキーマ(列の型・網羅性・行の列数・数値セル) / cite.jsのDATA_FILESとCSV_COLUMNSの対応 / 出生数のforecast_basisの語彙 / 法令番号の英語換算(公布年・law_idとの突き合わせ) / 公式英訳の列(統制語彙・URLの形) / 全HTMLの?v=とASSET_Vの一致 / 全HTMLのfaviconの有無 / JAトップのcard-fallbackとINDICATOR_METAの一致 / descriptionとog:descriptionの一致 / data/*.csvの出典URLが静的HTMLから辿れることとも一致）`
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
    `✓ ${files.size} ページを更新（chart/ ${chartKnown.size} 本 + en/chart/ ${chartKnownEn.size} 本 + fertility/births/hoan/about/corrections/contact(ja+en) + index.html(ja+en) + sitemap.xml）`
  );
  // 生成そのものは成功しても、辿らせる側が欠けていれば索引には出ない。
  // 落ちるほどではないので警告にとどめ、デプロイは --check 側で止める。
  crossRefErrors(keys).forEach((e) => console.warn(`⚠ ${e}`));
  idCoverageErrors().forEach((e) => console.warn(`⚠ ${e}`));
  handwrittenJaDriftErrors().forEach((e) => console.warn(`⚠ ${e}`));
  homeFillsCoverageErrors().forEach((e) => console.warn(`⚠ ${e}`));
  ogStalenessErrors().forEach((e) => console.warn(`⚠ ${e}`));
  ogFileErrors().forEach((e) => console.warn(`⚠ ${e}`));
  csvSchemaErrors().forEach((e) => console.warn(`⚠ ${e}`));
  citeDataFilesErrors().forEach((e) => console.warn(`⚠ ${e}`));
  birthsBasisErrors().forEach((e) => console.warn(`⚠ ${e}`));
  // 2026-08-03〜04に足した5件も、ここに並べないとデプロイ直前の --check まで
  // 出てこない(気づくのが遅いほど直すのが面倒になる)。どれも書き出し後の
  // ファイルを読むので、この位置でなければならない。
  hoanLawNumErrors().forEach((e) => console.warn(`⚠ ${e}`));
  hoanTranslationErrors().forEach((e) => console.warn(`⚠ ${e}`));
  assetVersionErrors().forEach((e) => console.warn(`⚠ ${e}`));
  faviconErrors().forEach((e) => console.warn(`⚠ ${e}`));
  cardFallbackErrors().forEach((e) => console.warn(`⚠ ${e}`));
  ogDescriptionErrors().forEach((e) => console.warn(`⚠ ${e}`));
  sourceUrlReachErrors().forEach((e) => console.warn(`⚠ ${e}`));
}
