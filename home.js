const T = {
  ja: {
    tag: "FORECAST × ACTUAL",
    nav: "[指標]",
    navData: "[データ]",
    navAbout: "[about]",
    lead: "政府は各年度のはじめに経済の「見通し」を示し、約一年後に「実績」が確定する。ズレ計は、その二つを並べて時系列で記録するだけの場所。",
    calloutTitle: "ズレの読み方",
    calloutBody: "ズレは「実績 − 見通し」の差であり、良し悪しの評価ではない。景気変動・災害・資源価格・政策変更など、見通しの前提が外れると生じる。プラスは実績が見通しを上回ったこと、マイナスは下回ったことを意味する。",
    indicatorsLabel: "指標一覧 · 7",
    indicatorsLatest: "最新年度 / 見通し vs 実績",
    plan: "見通し",
    actual: "実績",
    gap: "ズレ",
    pending: "データ収集中",
    noActual: "未確定",
    noLinkNote: "実績データ収集後に詳細チャートを公開予定",
    fertilityNote: "歴代7推計(1992〜2023) vs 実績",
    sourceLabel: "出典",
    src: "src: 内閣府 / 国民経済計算(SNA)",
    aboutLink: "このサイトについて",
    correctionsLink: "訂正履歴",
  },
  en: {
    tag: "FORECAST × ACTUAL",
    nav: "[Indicators]",
    navData: "[Data]",
    navAbout: "[About]",
    lead: "At the start of each fiscal year the government issues an economic forecast; about a year later the actual figures are confirmed. Zurekei simply records the two, side by side, over time.",
    calloutTitle: "Reading the gap",
    calloutBody: 'The gap is simply "actual − forecast" — not a verdict. It appears when the assumptions behind a forecast miss: swings in the economy, disasters, commodity prices, policy changes. A plus means the actual came in above the forecast; a minus, below.',
    indicatorsLabel: "INDICATORS · 7",
    indicatorsLatest: "Latest FY / Forecast vs Actual",
    plan: "Forecast",
    actual: "Actual",
    gap: "Gap",
    pending: "Collecting data",
    noActual: "pending",
    noLinkNote: "Detail chart will be published once actual data is collected",
    fertilityNote: "7 vintages (1992–2023) vs actual",
    sourceLabel: "Source",
    src: "src: Cabinet Office of Japan / SNA",
    aboutLink: "About this site",
    correctionsLink: "Corrections",
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
    key: "cpi",
    nameJa: "消費者物価 (CPI)", nameEn: "Consumer prices (CPI)",
    descJa: "家計が購入する財・サービスの価格変動。", descEn: "Change in prices of goods and services households buy.",
    unit: "%", kind: "series",
    csv: "data/cpi_forecast.csv", forecastCol: "forecast_cpi", actualCol: "actual_cpi",
    chartHref: null,
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
    key: "unemployment",
    nameJa: "完全失業率", nameEn: "Unemployment rate",
    descJa: "働く意思がありながら職に就けない人の割合。", descEn: "Share of the labor force actively seeking work.",
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
    key: "fertility",
    nameJa: "合計特殊出生率", nameEn: "Total fertility rate",
    descJa: "社人研の歴代人口推計が置いた出生率の仮定と、実績の比較。", descEn: "Fertility assumptions across generations of official population projections, vs. actual.",
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

  const withForecast = rows.filter((r) => r[meta.forecastCol] !== null);
  const latest = withForecast[withForecast.length - 1] || null;
  const spark = buildSparkline(rows, meta.forecastCol, meta.actualCol);

  return { latest, spark };
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
    return `
      <a class="card" href="${meta.chartHref}">
        <div class="card-top"><span class="card-name mono">${name}</span></div>
        <div class="card-desc">${desc}</div>
        <div class="card-note card-note-fertility">${t.fertilityNote}</div>
      </a>`;
  }

  const { latest, spark } = data;
  const fy = latest ? `'${String(latest.year).slice(-2)}` : "—";
  const planVal = latest ? latest[meta.forecastCol] : null;
  const actualVal = latest ? latest[meta.actualCol] : null;
  const gapVal = planVal !== null && actualVal !== null ? actualVal - planVal : null;

  const planStr = fmtSigned(planVal, meta.unit, meta.signed) ?? "—";
  const actualStr = actualVal !== null ? fmtSigned(actualVal, meta.unit, meta.signed) : t.noActual;
  const gapStr = fmtSigned(gapVal, meta.unit) ?? "—";

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
    <svg class="card-spark" viewBox="0 0 300 80">
      ${spark.fc.map((pts) => `<polyline class="spark-forecast" points="${pts}"></polyline>`).join("")}
      ${spark.ac.map((pts) => `<polyline class="spark-actual" points="${pts}"></polyline>`).join("")}
      ${spark.fcDots.map((p) => `<circle class="spark-forecast-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2"></circle>`).join("")}
      ${spark.acDots.map((p) => `<circle class="spark-actual-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2"></circle>`).join("")}
    </svg>`;

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
  await Promise.all(
    seriesMeta.map(async (m) => {
      seriesData[m.key] = await loadSeries(m);
    })
  );

  let lang = "ja";

  function applyI18n() {
    const t = T[lang];
    document.getElementById("t-tag").textContent = t.tag;
    document.getElementById("t-nav").textContent = t.nav;
    document.getElementById("t-nav-data").textContent = t.navData;
    document.getElementById("t-nav-about").textContent = t.navAbout;
    document.getElementById("t-lead").textContent = t.lead;
    document.getElementById("t-callout-title").textContent = t.calloutTitle;
    document.getElementById("t-callout-body").textContent = t.calloutBody;
    document.getElementById("t-indicators-label").textContent = t.indicatorsLabel;
    document.getElementById("t-indicators-latest").textContent = t.indicatorsLatest;
    document.getElementById("t-legend-forecast").textContent = t.plan;
    document.getElementById("t-legend-actual").textContent = t.actual;
    document.getElementById("t-footer-src").textContent = t.src;
    document.getElementById("t-footer-corrections").textContent = t.correctionsLink;
    document.getElementById("t-footer-about").textContent = t.aboutLink;
    document.getElementById("lang-ja").classList.toggle("active", lang === "ja");
    document.getElementById("lang-en").classList.toggle("active", lang === "en");
    document.documentElement.lang = lang;

    const grid = document.getElementById("card-grid");
    grid.innerHTML = INDICATOR_META.map((m) => renderCard(m, lang, seriesData[m.key])).join("");
  }

  document.getElementById("lang-ja").addEventListener("click", () => { lang = "ja"; applyI18n(); });
  document.getElementById("lang-en").addEventListener("click", () => { lang = "en"; applyI18n(); });

  applyI18n();
}

main();
