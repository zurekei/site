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

async function loadCSV(path) {
  const res = await fetch(path);
  const text = await res.text();
  return parseCSV(text);
}
