function parseCSV(text) {
  const lines = text.trim().replace(/\r\n/g, "\n").split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function toNum(s) {
  return s === "" || s === undefined ? null : Number(s);
}

// Aggregate over/under-forecast stats for a forecast/actual pair, counted
// only over rows where both values are present (non-null). Shared by
// home.js (card summary) and chart.js (per-metric readout) so the two
// figures are always computed the same way. Ties (actual === forecast) are
// counted separately as `equal` — callers must show them, since above+below
// alone does not add up to `count` and a reader who subtracts would find
// years missing. Returns null when there are no years with both values, so
// callers can hide the summary rather than show a fabricated zero.
//
// opts.fromYear restricts the count to rows with year >= fromYear. Used where
// the early part of a series is structurally uninformative — see the
// bond-issuance metric, whose FY1947-1964 rows are all 0 planned vs 0 issued
// and would otherwise be counted as years the plan was met exactly.
function computeGapStats(rows, forecastKey, actualKey, opts = {}) {
  const fromYear = opts.fromYear ?? null;
  const paired = rows.filter(
    (r) =>
      r[forecastKey] !== null &&
      r[forecastKey] !== undefined &&
      r[actualKey] !== null &&
      r[actualKey] !== undefined &&
      (fromYear === null || r.year >= fromYear)
  );
  if (paired.length === 0) return null;
  let above = 0;
  let below = 0;
  let equal = 0;
  let sumGap = 0;
  paired.forEach((r) => {
    const diff = r[actualKey] - r[forecastKey];
    if (diff > 0) above++;
    else if (diff < 0) below++;
    else equal++;
    sumGap += diff;
  });
  return { count: paired.length, above, below, equal, meanGap: sumGap / paired.length };
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function safeUrl(url) {
  return /^https?:\/\//.test(url) ? url : null;
}

// パスは必ずルート絶対(`/data/...`)で渡す。相対で渡すと `/en/` 配下のページから
// `/en/data/...` を取りに行くことになり、**Cloudflare Pages は存在しないパスにも
// トップページのHTMLを200で返す**ので、CSVのつもりでHTMLをパースする。
// 2026-08-01まで hero.js / home.js / fertility.js / hoan.js / corrections.js が
// 相対パスのままで、これらを読むEN側の4ページ(`/en/`・`/en/fertility`・
// `/en/hoan`・`/en/corrections`)が実際に踏んでいた(`/en/hoan` はHTMLをCSVとして
// 読んだ結果を「273 laws」全行 `undefined` の表として描画し、`/en/` のキャプションは
// `FYNaN–NaN` になっていた)。chart.js の METRICS は元から絶対パスだったので
// `/en/chart/*` は無傷。「EN側が全部壊れていた」ではない。
//
// 呼び出し側で握り潰さず throw するのは、この壊れ方が「何も出ない」より
// 質が悪いため。各ページの静的HTMLには bin/build.mjs が数値または素のリンクを
// 焼き込んであるので、ここで throw すればJSによる差し替えが起きず、静的な正しい
// 中身がそのまま残る(真っ白にはならない)。ただし「必ず数値が残る」ではない:
// トップの指標カードは設計上 card-fallback = 名前のみのリンクで、数値は
// 焼き込んでいない。CSVの中身の正しさはデプロイゲート側の csvSchemaErrors() が
// 見る担当で、ここが見るのは「そもそも別物を掴んだか」だけ。
async function loadCSV(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`loadCSV: ${res.status} ${res.statusText} — ${path}`);
  const text = await res.text();
  if (/^\s*</.test(text)) throw new Error(`loadCSV: HTMLが返った(パスが違う可能性) — ${path}`);
  return parseCSV(text);
}
