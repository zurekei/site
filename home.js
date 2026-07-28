const T = {
  ja: {
    tag: "FORECAST × ACTUAL",
    nav: "[指標]",
    navHoan: "[法案]",
    navData: "[データ]",
    navAbout: "[about]",
    lead: "政府は各年度のはじめに経済の「見通し」を示し、約一年後に「実績」が確定する。ズレ計は、その二つを並べて時系列で記録するだけの場所。",
    calloutTitle: "ズレの読み方",
    calloutBody: "ズレは「実績 − 見通し」の差であり、良し悪しの評価ではない。景気変動・災害・資源価格・政策変更など、見通しの前提が外れると生じる。プラスは実績が見通しを上回ったこと、マイナスは下回ったことを意味する。",
    indicatorsLabel: "指標一覧 · 9",
    indicatorsLatest: "確定した直近年度 / 見通し vs 実績",
    plan: "見通し",
    actual: "実績",
    gap: "ズレ",
    pending: "データ収集中",
    noActual: "未確定",
    awaitingActual: "（実績待ち）",
    noLinkNote: "実績データ収集後に詳細チャートを公開予定",
    fertilityNote: "歴代7推計(1992〜2023) vs 実績",
    sourceLabel: "出典",
    heroCopy: "見通しと実績のズレを、\n記録し続ける。",
    heroCaption: (min, max) => `名目GDP成長率 — 当初見通しと実績 ${min}–${max}年度`,
    heroGapBelow: (below, total) => `名目GDP成長率: ${total}年度中、実績が見通しを下回った年 ${below}回`,
    src: "src: 内閣府 / 国民経済計算(SNA)",
    aboutLink: "このサイトについて",
    correctionsLink: "訂正履歴",
    hoanEntryLabel: "別の計器",
    hoanEntryTitle: "法律の見直し条項 — 期限と検討状況",
    hoanEntryDesc: "附則の「施行後◯年を目途に検討」という見直し条項を、施行日から算出した期限順に並べる。",
    hoanEntryNote: (total, due) => `${total}件中、期限到来・未確認 ${due}件`,
    nextUpdate: "次回更新予定: 2026年12月頃(令和7年度 国民経済計算年次推計・令和9年度予算案)",
  },
  en: {
    tag: "FORECAST × ACTUAL",
    nav: "[Indicators]",
    navHoan: "[bills]",
    navData: "[Data]",
    navAbout: "[About]",
    lead: "At the start of each fiscal year, the government issues an economic forecast; about a year later, the actual figures are confirmed. Zurekei simply records the two side by side, over time.",
    calloutTitle: "Reading the gap",
    calloutBody: 'The gap is "actual − forecast" — not a verdict. It arises when conditions diverge from the assumptions underlying a forecast: business-cycle swings, disasters, commodity prices, policy changes. A positive gap means the actual came in above the forecast; a negative, below.',
    indicatorsLabel: "INDICATORS · 9",
    indicatorsLatest: "Latest settled FY / Forecast vs Actual",
    plan: "Forecast",
    actual: "Actual",
    gap: "Gap",
    pending: "Collecting data",
    noActual: "not final",
    awaitingActual: " (awaiting actual)",
    noLinkNote: "Detail chart to follow once actual data is available",
    fertilityNote: "7 vintages (1992–2023) vs actual",
    sourceLabel: "Source",
    heroCopy: "A running record of the gap\nbetween forecast and actual.",
    heroCaption: (min, max) => `Nominal GDP growth — initial forecast vs actual, FY${min}–${max}`,
    heroGapBelow: (below, total) => `Nominal GDP growth: actual came in below forecast in ${below} of ${total} fiscal years`,
    src: "src: Cabinet Office of Japan / SNA",
    aboutLink: "About this site",
    correctionsLink: "Corrections",
    hoanEntryLabel: "Another instrument",
    hoanEntryTitle: "Statutory review clauses — deadlines and status",
    hoanEntryDesc: 'A review clause in supplementary provisions — "review to be considered around N years after enforcement" — ordered by the deadline calculated from the enforcement date.',
    hoanEntryNote: (total, due) => `${due} of ${total} laws past review deadline, unconfirmed`,
    nextUpdate: "Next update: around Dec 2026 (FY2025 national accounts annual estimates / FY2027 budget)",
  },
};

const INDICATOR_META = [
  {
    key: "gdp-real",
    nameJa: "実質GDP成長率", nameEn: "Real GDP growth",
    descJa: "物価変動を除いた、経済全体の成長率。", descEn: "Overall economic growth, adjusted for price changes.",
    unit: "%", kind: "series",
    csv: "data/gdp_forecast.csv", forecastCol: "forecast_real", actualCol: "actual_real",
    chartHref: "chart.html?m=gdp-real",
  },
  {
    key: "gdp-nominal",
    nameJa: "名目GDP成長率", nameEn: "Nominal GDP growth",
    descJa: "物価変動を含む、金額ベースの成長率。", descEn: "Growth in monetary terms, including price changes.",
    unit: "%", kind: "series",
    csv: "data/gdp_forecast.csv", forecastCol: "forecast_nominal", actualCol: "actual_nominal",
    chartHref: "chart.html?m=gdp-nominal",
  },
  {
    key: "cpi",
    nameJa: "消費者物価 (CPI)", nameEn: "Consumer prices (CPI)",
    descJa: "家計が購入する財・サービスの価格変動。", descEn: "Change in prices of the goods and services households buy.",
    unit: "%", kind: "series",
    csv: "data/cpi_forecast.csv", forecastCol: "forecast_cpi", actualCol: "actual_cpi",
    chartHref: "chart.html?m=cpi",
  },
  {
    key: "unemployment",
    nameJa: "完全失業率", nameEn: "Unemployment rate",
    descJa: "働く意思がありながら職に就けない人の割合。", descEn: "Share of the labor force without a job and actively seeking one.",
    unit: "%", kind: "series", signed: false,
    csv: "data/unemployment_forecast.csv", forecastCol: "forecast_rate", actualCol: "actual_rate",
    chartHref: "chart.html?m=unemployment",
  },
  {
    key: "current-account",
    nameJa: "経常収支", nameEn: "Current account",
    descJa: "海外との取引で生じる収支の合計。", descEn: "Net balance of transactions with the rest of the world.",
    unit: "兆円", kind: "series", signed: false,
    csv: "data/current_account_forecast.csv", forecastCol: "forecast_tn", actualCol: "actual_tn",
    chartHref: "chart.html?m=current-account",
  },
  {
    key: "tax-revenue",
    nameJa: "一般会計税収", nameEn: "Tax revenue",
    descJa: "国の一般会計に入る税の総額。", descEn: "Total tax revenue flowing into the general account.",
    unit: "兆円", kind: "series", signed: false,
    csv: "data/tax_revenue_forecast.csv", forecastCol: "forecast_tn", actualCol: "actual_tn",
    chartHref: "chart.html?m=tax-revenue",
  },
  {
    key: "bond-issuance",
    nameJa: "国債発行額", nameEn: "Government bond issuance",
    descJa: "国の一般会計が発行する新規国債(建設国債+特例国債)の額。", descEn: "New bonds issued by the general account (construction and deficit-financing bonds).",
    unit: "兆円", kind: "series", signed: false,
    csv: "data/bond_issuance_forecast.csv", forecastCol: "forecast_tn", actualCol: "actual_tn",
    // keep in sync with METRICS["bond-issuance"].statsFromYear in chart.js —
    // FY1947-1964 are 0 planned vs 0 issued and are not counted
    statsFromYear: 1965,
    chartHref: "chart.html?m=bond-issuance",
  },
  {
    key: "jgb-total",
    nameJa: "国債発行総額", nameEn: "Total JGB issuance",
    descJa: "借換債・財投債等を含む、国債発行の総額。", descEn: "Total JGB issuance, including refunding and FILP bonds.",
    unit: "兆円", kind: "series", signed: false,
    csv: "data/jgb_total_issuance_forecast.csv", forecastCol: "forecast_tn", actualCol: "actual_tn",
    chartHref: "chart.html?m=jgb-total",
  },
  {
    key: "fertility",
    nameJa: "合計特殊出生率", nameEn: "Total fertility rate",
    descJa: "社人研の歴代人口推計が置いた出生率の仮定と、実績の比較。", descEn: "Fertility assumptions built into successive NIPSSR population projections, compared with the actual rate.",
    kind: "fertility",
    chartHref: "fertility.html",
  },
];

function fmtSigned(v, unit, signed = true) {
  if (v === null || v === undefined) return null;
  if (!signed) return `${v.toFixed(1)}${unit}`;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(1)}${unit}`;
}

function buildSparkline(rows, forecastCol, actualCol) {
  const fVals = rows.map((r) => r[forecastCol]).filter((v) => v !== null);
  const aVals = rows.map((r) => r[actualCol]).filter((v) => v !== null);
  const all = fVals.concat(aVals);
  if (all.length < 2) return { fc: [], fcDots: [], ac: [], acDots: [] };

  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const W = 300;
  const H = 80;
  const PADY = 8;
  const scaleY = (v) => H - PADY - ((v - min) / span) * (H - PADY * 2);

  // splits into multiple segments on non-contiguous years, so gaps in the
  // underlying data (e.g. CPI's collected years) aren't drawn as a fabricated trend.
  // a segment of length 1 draws no visible line, so its point is returned separately
  // as a dot to render explicitly (otherwise an isolated data point vanishes silently)
  function pathFor(col) {
    const withVals = rows.filter((r) => r[col] !== null);
    if (withVals.length === 0) return { lines: [], dots: [] };
    const points = withVals.map((r, idx) => ({
      year: r.year,
      x: withVals.length === 1 ? W / 2 : (idx / (withVals.length - 1)) * (W - 16) + 8,
      y: scaleY(r[col]),
    }));
    const segments = [];
    let current = [];
    points.forEach((p, idx) => {
      if (current.length > 0 && p.year - points[idx - 1].year > 1) {
        segments.push(current);
        current = [];
      }
      current.push(p);
    });
    if (current.length > 0) segments.push(current);
    return {
      lines: segments.filter((seg) => seg.length > 1).map((seg) => seg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")),
      dots: segments.filter((seg) => seg.length === 1).map((seg) => seg[0]),
    };
  }

  const fc = pathFor(forecastCol);
  const ac = pathFor(actualCol);
  return { fc: fc.lines, fcDots: fc.dots, ac: ac.lines, acDots: ac.dots };
}

// Fertility's card mini-chart has a different shape than the other indicators:
// one actual series against *several* forecast vintages (not a 1:1 forecast/actual
// pair), so it can't reuse buildSparkline above. Mirrors the scaling approach of
// fertility.js's full chart (shared x/y domain across all vintages + actual) but
// projected into the same 300x80 card-spark viewBox as the other cards.
function buildFertilitySparkline(actualRows, forecastRows) {
  const years = actualRows.map((r) => r.year).concat(forecastRows.map((r) => r.targetYear));
  if (years.length < 2) return { actual: [], vintages: [] };

  const xMin = Math.min(...years);
  const xMax = Math.max(...years);
  const vals = actualRows.map((r) => r.tfr).concat(forecastRows.map((r) => r.mid));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const W = 300;
  const H = 80;
  const PADY = 8;
  const scaleX = (y) => (xMax === xMin ? W / 2 : ((y - xMin) / (xMax - xMin)) * (W - 16) + 8);
  const scaleY = (v) => H - PADY - ((v - min) / span) * (H - PADY * 2);

  // same non-contiguous-year splitting as buildSparkline, so a gap in a series
  // is never bridged by a fabricated straight line
  function segmentsFor(rows, yearKey, valKey) {
    const sorted = rows.slice().sort((a, b) => a[yearKey] - b[yearKey]);
    const segments = [];
    let current = [];
    sorted.forEach((r, idx) => {
      if (current.length > 0 && r[yearKey] - sorted[idx - 1][yearKey] > 1) {
        segments.push(current);
        current = [];
      }
      current.push(r);
    });
    if (current.length > 0) segments.push(current);
    return segments
      .filter((seg) => seg.length > 1)
      .map((seg) => seg.map((r) => `${scaleX(r[yearKey]).toFixed(1)},${scaleY(r[valKey]).toFixed(1)}`).join(" "));
  }

  const actual = segmentsFor(actualRows, "year", "tfr");

  const vintages = [...new Set(forecastRows.map((r) => r.vintageYear))].sort((a, b) => a - b);
  const vintageSpan = vintages.length - 1 || 1;
  const vintageLines = vintages.map((vy, idx) => {
    const rows = forecastRows.filter((r) => r.vintageYear === vy).sort((a, b) => a.targetYear - b.targetYear);
    const points = rows.map((r) => `${scaleX(r.targetYear).toFixed(1)},${scaleY(r.mid).toFixed(1)}`).join(" ");
    // older vintages fade further back, same intent as fertility.js's opacityFor,
    // but capped lower (~0.38-0.60) since this chart is small and the actual
    // line needs to stay the thing the eye lands on
    const opacity = (0.38 + (idx / vintageSpan) * 0.22).toFixed(2);
    return { points, opacity };
  });

  return { actual, vintages: vintageLines };
}

async function loadFertilityCard() {
  const [forecastRaw, actualRaw] = await Promise.all([
    loadCSV("data/fertility_forecast.csv"),
    loadCSV("data/fertility_actual.csv"),
  ]);
  const forecastRows = forecastRaw
    .map((r) => ({ vintageYear: Number(r.vintage_year), targetYear: Number(r.target_year), mid: toNum(r.assumed_tfr_mid) }))
    .filter((r) => r.mid !== null);
  const actualRows = actualRaw
    .map((r) => ({ year: Number(r.year), tfr: toNum(r.actual_tfr) }))
    .filter((r) => r.tfr !== null);
  return { spark: buildFertilitySparkline(actualRows, forecastRows) };
}

// Same total/due definition as hoan.js's renderSummary() (due = review_status
// === "due", total = row count) so the entry card's count always agrees with
// the bills page it links to.
async function loadHoanSummary() {
  const rows = await loadCSV("data/hoan_review.csv");
  const total = rows.length;
  const due = rows.filter((r) => r.review_status === "due").length;
  return { total, due };
}

async function loadSeries(meta) {
  const raw = await loadCSV(meta.csv);
  const rows = raw
    .map((r) => ({
      year: Number(r.fiscal_year),
      [meta.forecastCol]: toNum(r[meta.forecastCol]),
      [meta.actualCol]: toNum(r[meta.actualCol]),
      forecastSourceUrl: r.forecast_source_url || null,
      actualSourceUrl: r.actual_source_url || null,
    }))
    .sort((a, b) => a.year - b.year);

  // The card leads with the most recent year whose gap is actually settled, not
  // with the most recent forecast. A new forecast lands every January and the
  // matching actual does not arrive until the following July-December, so keying
  // the card off the newest forecast would leave every card reading "実績未確定 /
  // ズレ—" for over half the year — a front page about the gap, showing no gap.
  // The newest forecast is still worth showing (it is what the government is
  // looking at now), so it goes on its own line as `pending`.
  const paired = rows.filter((r) => r[meta.forecastCol] !== null && r[meta.actualCol] !== null);
  const settled = paired[paired.length - 1] || null;
  const withForecast = rows.filter((r) => r[meta.forecastCol] !== null);
  const newestForecast = withForecast[withForecast.length - 1] || null;
  // only a forecast for a year *after* the settled one is still awaiting its
  // actual. Where several years are outstanding (国債発行額 has FY2025 and FY2026
  // both open) the newest is shown — that is the one the government is on.
  const pending =
    newestForecast && (!settled || newestForecast.year > settled.year) ? newestForecast : null;
  const latest = settled || newestForecast;
  const spark = buildSparkline(rows, meta.forecastCol, meta.actualCol);
  const stats = computeGapStats(rows, meta.forecastCol, meta.actualCol, { fromYear: meta.statsFromYear });
  const years = rows.map((r) => r.year);
  const yearRange = years.length ? { min: Math.min(...years), max: Math.max(...years) } : null;

  return { latest, pending, spark, stats, yearRange };
}

// compact one-line version of the same over/under-forecast counts shown in
// full on the chart page (see gapSummaryText() in chart.js / computeGapStats()
// in csv.js) — counts only, no average gap, to keep the card small. Ties are
// shown only when there are any, but they must be shown then: without them
// above + below does not reach the stated year count. The wording names no
// subject ("上回り" / "above"), so one phrasing reads correctly for all three
// kinds of pair the chart page spells out per metric (見通し vs 実績,
// 当初予算 vs 決算, 当初計画 vs 実績) — see T.gapVocab in chart.js.
function cardGapSummaryText(stats, lang) {
  if (!stats) return "";
  return lang === "ja"
    ? `上回り ${stats.above}・下回り ${stats.below}${stats.equal > 0 ? `・同値 ${stats.equal}` : ""} / ${stats.count}年`
    : `above ${stats.above} · below ${stats.below}${stats.equal > 0 ? ` · tied ${stats.equal}` : ""} / ${stats.count} yrs`;
}

function renderCard(meta, lang, data) {
  const t = T[lang];
  const name = lang === "ja" ? meta.nameJa : meta.nameEn;
  const desc = lang === "ja" ? meta.descJa : meta.descEn;

  if (meta.kind === "pending") {
    return `
      <div class="card card-pending">
        <div class="card-top"><span class="card-name mono">${name}</span></div>
        <div class="card-desc">${desc}</div>
        <div class="card-pending-badge">${t.pending}</div>
      </div>`;
  }

  if (meta.kind === "fertility") {
    const spark = data && data.spark;
    const sparkSvg = spark
      ? `
    <svg class="card-spark" viewBox="0 0 300 80">
      ${spark.vintages.map((v) => `<polyline class="spark-fertility-vintage" points="${v.points}" style="opacity:${v.opacity}"></polyline>`).join("")}
      ${spark.actual.map((pts) => `<polyline class="spark-fertility-actual" points="${pts}"></polyline>`).join("")}
    </svg>`
      : "";
    return `
      <a class="card" href="${meta.chartHref}">
        <div class="card-top"><span class="card-name mono">${name}</span></div>
        <div class="card-desc">${desc}</div>
        ${sparkSvg}
        <div class="card-note card-note-fertility">${t.fertilityNote}</div>
      </a>`;
  }

  const { latest, pending, spark, stats } = data;
  const fy = latest ? `'${String(latest.year).slice(-2)}` : "—";
  const planVal = latest ? latest[meta.forecastCol] : null;
  const actualVal = latest ? latest[meta.actualCol] : null;
  const gapVal = planVal !== null && actualVal !== null ? actualVal - planVal : null;

  const planStr = fmtSigned(planVal, meta.unit, meta.signed) ?? "—";
  const actualStr = actualVal !== null ? fmtSigned(actualVal, meta.unit, meta.signed) : t.noActual;
  const gapStr = fmtSigned(gapVal, meta.unit) ?? "—";
  const gapSummaryStr = cardGapSummaryText(stats, lang);
  // the year the government is currently on, when its actual has not landed yet.
  // Deliberately one plain line rather than a second stat row: the settled gap
  // above it is the point of the card, and this must not compete with it.
  const pendingLine = pending
    ? `<div class="card-pending-line mono">'${String(pending.year).slice(-2)} ${t.plan} ${
        fmtSigned(pending[meta.forecastCol], meta.unit, meta.signed) ?? "—"
      }${t.awaitingActual}</div>`
    : "";

  const inner = `
    <div class="card-top">
      <span class="card-name mono">${name}</span>
      <span class="card-fy mono">${fy}</span>
    </div>
    <div class="card-desc">${desc}</div>
    <div class="card-stats">
      <div><div class="stat-label">${t.plan}</div><div class="stat-value">${planStr}</div></div>
      <div><div class="stat-label">${t.actual}</div><div class="stat-value">${actualStr}</div></div>
      <div><div class="stat-label stat-label-gap">${t.gap}</div><div class="stat-value stat-value-gap">${gapStr}</div></div>
    </div>
    ${pendingLine}
    <svg class="card-spark" viewBox="0 0 300 80">
      ${spark.fc.map((pts) => `<polyline class="spark-forecast" points="${pts}"></polyline>`).join("")}
      ${spark.ac.map((pts) => `<polyline class="spark-actual" points="${pts}"></polyline>`).join("")}
      ${spark.fcDots.map((p) => `<circle class="spark-forecast-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2"></circle>`).join("")}
      ${spark.acDots.map((p) => `<circle class="spark-actual-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2"></circle>`).join("")}
    </svg>
    ${gapSummaryStr ? `<div class="card-gap-summary mono">${gapSummaryStr}</div>` : ""}`;

  if (meta.chartHref) {
    return `<a class="card" href="${meta.chartHref}">${inner}</a>`;
  }
  const sourceUrl = (latest && (latest.actualSourceUrl || latest.forecastSourceUrl)) || null;
  const sourceLine = sourceUrl
    ? `<a class="card-source-link" href="${sourceUrl}" target="_blank" rel="noopener">${t.sourceLabel} →</a>`
    : "";
  return `<div class="card card-nolink">${inner}<div class="card-note">${t.noLinkNote}</div>${sourceLine}</div>`;
}

async function main() {
  const seriesMeta = INDICATOR_META.filter((m) => m.kind === "series");
  const seriesData = {};
  const [, fertilityCard, hoanSummary] = await Promise.all([
    Promise.all(
      seriesMeta.map(async (m) => {
        seriesData[m.key] = await loadSeries(m);
      })
    ),
    loadFertilityCard(),
    loadHoanSummary(),
  ]);
  seriesData["fertility"] = fertilityCard;

  let lang = localStorage.getItem("zurekei-lang") === "en" ? "en" : "ja";

  function applyI18n() {
    const t = T[lang];
    document.getElementById("t-tag").textContent = t.tag;
    document.getElementById("t-nav").textContent = t.nav;
    document.getElementById("t-nav-hoan").textContent = t.navHoan;
    document.getElementById("t-nav-data").textContent = t.navData;
    document.getElementById("t-nav-about").textContent = t.navAbout;
    document.getElementById("t-lead").textContent = t.lead;
    document.getElementById("t-callout-title").textContent = t.calloutTitle;
    document.getElementById("t-callout-body").textContent = t.calloutBody;
    document.getElementById("t-indicators-label").textContent = t.indicatorsLabel;
    document.getElementById("t-indicators-latest").textContent = t.indicatorsLatest;
    document.getElementById("t-legend-forecast").textContent = t.plan;
    document.getElementById("t-legend-actual").textContent = t.actual;
    document.getElementById("t-hoan-entry-label").textContent = t.hoanEntryLabel;
    document.getElementById("t-hoan-entry-title").textContent = t.hoanEntryTitle;
    document.getElementById("t-hoan-entry-desc").textContent = t.hoanEntryDesc;
    document.getElementById("t-hoan-entry-note").textContent = t.hoanEntryNote(hoanSummary.total, hoanSummary.due);
    document.getElementById("t-next-update").textContent = t.nextUpdate;
    // 年範囲はCSVから動的に出す(gdp-nominalカードで読み込み済みのgdp_forecast.csv
    // をそのまま使う。実質/名目とも同じファイル・同じfiscal_year列なので範囲は共通)
    const heroRange = seriesData["gdp-nominal"] && seriesData["gdp-nominal"].yearRange;
    if (heroRange) {
      document.getElementById("hero-caption").textContent = t.heroCaption(heroRange.min, heroRange.max);
    }
    document.getElementById("hero-copy-headline").textContent = t.heroCopy;
    // hero.js が描画完了する前に applyI18n が走るため、ラベルは存在チェック付きで反映
    const heroActual = document.getElementById("hero-label-actual");
    if (heroActual) heroActual.textContent = t.actual;
    const heroForecast = document.getElementById("hero-label-forecast");
    if (heroForecast) heroForecast.textContent = t.plan;
    // hero.js が計算した集計値(above/below/total)をdataset経由で受け取り、
    // 言語ごとの文言を組み立てる。同じく存在チェック付き(hero.jsの描画順に依存しない)
    // composed directly from seriesData (already loaded/computed above via
    // computeGapStats) rather than reading anything hero.js wrote to the DOM —
    // avoids a draw-order race where hero.js's JA default could still be
    // showing after an EN switch. "total" is stats.count (years where both a
    // forecast and an actual exist), not the CSV's full row count — FY1980,
    // FY1988, and FY2025 aren't comparable and are correctly excluded.
    const heroStats = seriesData["gdp-nominal"] && seriesData["gdp-nominal"].stats;
    const heroSummary = document.getElementById("hero-copy-summary");
    if (heroSummary && heroStats) {
      heroSummary.textContent = t.heroGapBelow(heroStats.below, heroStats.count);
    }
    document.getElementById("t-footer-src").textContent = t.src;
    document.getElementById("t-footer-corrections").textContent = t.correctionsLink;
    document.getElementById("t-footer-about").textContent = t.aboutLink;
    document.getElementById("lang-ja").classList.toggle("active", lang === "ja");
    document.getElementById("lang-en").classList.toggle("active", lang === "en");
    document.documentElement.lang = lang;

    const grid = document.getElementById("card-grid");
    grid.innerHTML = INDICATOR_META.map((m) => renderCard(m, lang, seriesData[m.key])).join("");
  }

  document.getElementById("lang-ja").addEventListener("click", () => { lang = "ja"; localStorage.setItem("zurekei-lang", "ja"); applyI18n(); });
  document.getElementById("lang-en").addEventListener("click", () => { lang = "en"; localStorage.setItem("zurekei-lang", "en"); applyI18n(); });

  applyI18n();
}

main();
