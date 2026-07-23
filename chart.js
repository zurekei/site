const SVG_NS = "http://www.w3.org/2000/svg";
const CHART_W = 960;
const CHART_H = 480;
const PAD = { top: 20, right: 64, bottom: 32, left: 58 };

// UI strings for this page. Indicator names (title/titleEn) are kept in sync
// with home.js's INDICATOR_META nameEn by hand — no shared import, so check
// both when renaming an indicator.
const T = {
  ja: {
    back: "← 指標一覧",
    forecast: "見通し",
    actual: "実績",
    gap: "ズレ",
    actualPending: "実績未確定(年度未終了)",
    actualUnavailable: "実績なし",
    dataNotCollected: "データ未収集",
    forecastSourcePrefix: "見通し出典: ",
    actualSourcePrefix: "実績出典: ",
    footerSrc: "src: 内閣府 / 国民経済計算(SNA)",
    footerAbout: "このサイトについて",
  },
  en: {
    back: "← Indicators",
    forecast: "Forecast",
    actual: "Actual",
    gap: "Gap",
    actualPending: "Actual not yet finalized (fiscal year in progress)",
    actualUnavailable: "No actual value",
    dataNotCollected: "Data not yet collected",
    forecastSourcePrefix: "Forecast source: ",
    actualSourcePrefix: "Actual source: ",
    footerSrc: "src: Cabinet Office of Japan / SNA",
    footerAbout: "About this site",
  },
};

const METRICS = {
  "gdp-real": {
    title: "実質GDP成長率",
    titleEn: "Real GDP growth",
    desc: "政府の当初見通し(実質)と、確定した実績を並べたもの。",
    descEn: "The government's initial forecast (real) laid alongside the confirmed actual.",
    csv: "data/gdp_forecast.csv",
    forecastCol: "forecast_real",
    actualCol: "actual_real",
    forecastSourceCol: "forecast_source_url",
    actualSourceCol: "actual_source_url",
    actualSourceLabel: "実質",
    unit: "%",
  },
  "gdp-nominal": {
    title: "名目GDP成長率",
    titleEn: "Nominal GDP growth",
    desc: "政府の当初見通し(名目)と、確定した実績を並べたもの。",
    descEn: "The government's initial forecast (nominal) laid alongside the confirmed actual.",
    csv: "data/gdp_forecast.csv",
    forecastCol: "forecast_nominal",
    actualCol: "actual_nominal",
    forecastSourceCol: "forecast_source_url",
    actualSourceCol: "actual_source_url",
    actualSourceLabel: "名目",
    unit: "%",
  },
  "unemployment": {
    title: "完全失業率",
    titleEn: "Unemployment rate",
    desc: "政府の当初見通しと、確定した実績を並べたもの。",
    descEn: "The government's initial forecast laid alongside the confirmed actual.",
    csv: "data/unemployment_forecast.csv",
    forecastCol: "forecast_rate",
    actualCol: "actual_rate",
    forecastSourceCol: "forecast_source_url",
    actualSourceCol: "actual_source_url",
    unit: "%",
    signed: false,
  },
  "current-account": {
    title: "経常収支",
    titleEn: "Current account",
    desc: "政府の当初見通しと、確定した実績を並べたもの。",
    descEn: "The government's initial forecast laid alongside the confirmed actual.",
    csv: "data/current_account_forecast.csv",
    forecastCol: "forecast_tn",
    actualCol: "actual_tn",
    forecastSourceCol: "forecast_source_url",
    actualSourceCol: "actual_source_url",
    unit: "兆円",
    signed: false,
  },
  "tax-revenue": {
    title: "一般会計税収",
    titleEn: "Tax revenue",
    desc: "財務省の当初予算における税収見積もりと、確定した決算額を並べたもの。",
    descEn: "The Ministry of Finance's initial budget estimate for tax revenue, laid alongside the confirmed settlement figure.",
    csv: "data/tax_revenue_forecast.csv",
    forecastCol: "forecast_tn",
    actualCol: "actual_tn",
    forecastSourceCol: "forecast_source_url",
    actualSourceCol: "actual_source_url",
    unit: "兆円",
    signed: false,
  },
  "bond-issuance": {
    title: "国債発行額(一般会計)",
    titleEn: "Government bond issuance",
    desc: "財務省の当初予算における公債発行予定額と、決算における実績発行額を並べたもの。復興債・年金特例公債など別枠区分の公債は含まない(原資料の区分に従う)。",
    descEn: "The Ministry of Finance's initial budget plan for bond issuance, laid alongside the actual issuance recorded in the settlement. Bonds tracked in separate categories, such as reconstruction bonds or pension special-issue bonds, are not included, following the classification used in the primary source.",
    csv: "data/bond_issuance_forecast.csv",
    forecastCol: "forecast_tn",
    actualCol: "actual_tn",
    forecastSourceCol: "forecast_source_url",
    actualSourceCol: "actual_source_url",
    unit: "兆円",
    signed: false,
    gapLabel: { ja: "当初予算に計画なし", en: "No issuance planned in the initial budget" },
  },
  "jgb-total": {
    title: "国債発行総額",
    titleEn: "Total JGB issuance",
    desc: "財務省の当初の国債発行計画(総額)と、実績の発行総額を並べたもの。建設国債・特例国債・復興債等・財投債・借換債を含む(収入金ベース、原資料の区分に従う)。",
    descEn: "The Ministry of Finance's initial JGB issuance plan (total), laid alongside actual total issuance. Includes construction bonds, deficit-financing bonds, reconstruction and other special bonds, FILP bonds, and refunding bonds (revenue basis, following the classification used in the primary source).",
    csv: "data/jgb_total_issuance_forecast.csv",
    forecastCol: "forecast_tn",
    actualCol: "actual_tn",
    forecastSourceCol: "forecast_source_url",
    actualSourceCol: "actual_source_url",
    unit: "兆円",
    signed: false,
  },
  cpi: {
    title: "消費者物価指数(総合)",
    titleEn: "Consumer prices (CPI)",
    desc: "政府の当初見通しと、総務省統計局が公表する確定した実績を並べたもの。",
    descEn: "The government's initial forecast laid alongside the confirmed actual published by the Ministry of Internal Affairs and Communications' Statistics Bureau.",
    csv: "data/cpi_forecast.csv",
    forecastCol: "forecast_cpi",
    actualCol: "actual_cpi",
    forecastSourceCol: "forecast_source_url",
    actualSourceCol: "actual_source_url",
    unit: "%",
  },
};

function fmtFY(year, lang) {
  return lang === "ja" ? `${year}年度` : `FY${year}`;
}

function gapLabelText(metric, lang) {
  return metric.gapLabel ? metric.gapLabel[lang] : T[lang].dataNotCollected;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function fmtVal(v, unit, signed) {
  if (signed === false) return `${v.toFixed(1)}${unit}`;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}${unit}`;
}

// some CSV columns pack multiple labeled URLs into one field (e.g. GDP's
// actual_source_url holds both "実質:URL 名目:URL" since the two metrics
// share a source column) — pull out the URL for this metric's label
function extractSourceUrl(raw, label) {
  if (!raw || !label) return raw;
  const m = raw.match(new RegExp(`${label}:(\\S+)`));
  return m ? m[1] : raw;
}

// notes fields pack several tagged segments together (e.g. "[実績]リーマン
// ショック年度。 / [見通し原文]こうした結果、...", also seen: [見通し], [出典],
// [参考]) — [見通し原文] is a verbatim copy of the forecast document's wording,
// which just restates the number already shown as v-forecast, and the other
// non-[実績] tags are transcription/sourcing asides for auditors. Only [実績]
// segments are surfaced to a reader alongside the chart; unrecognized/typo'd
// tags are silently dropped rather than shown raw.
function extractEventNote(raw) {
  if (!raw) return "";
  return raw
    .split(" / ")
    .filter((seg) => seg.startsWith("[実績]"))
    .map((seg) => seg.slice("[実績]".length).trim())
    .join(" ");
}

async function main() {
  const params = new URLSearchParams(location.search);
  const metricKey = params.get("m") || "gdp-real";
  const metric = Object.hasOwn(METRICS, metricKey) ? METRICS[metricKey] : METRICS["gdp-real"];

  // the static <title>/meta description in chart.html stay JA regardless of
  // the in-page language toggle (per site convention: static head tags are
  // JA-authoritative); only this dynamic per-metric document.title follows.
  document.getElementById("page-title").textContent = `${metric.title} — ズレ計`;

  let lang = "ja";

  const rawRows = await loadCSV(metric.csv);
  const rows = rawRows
    .map((r) => ({
      year: Number(r.fiscal_year),
      forecastVal: toNum(r[metric.forecastCol]),
      actualVal: toNum(r[metric.actualCol]),
      forecastSourceUrl: r[metric.forecastSourceCol],
      actualSourceUrl: extractSourceUrl(r[metric.actualSourceCol], metric.actualSourceLabel),
      notes: r.notes || "",
    }))
    .sort((a, b) => a.year - b.year);

  const actualPoints = rows.filter((r) => r.actualVal !== null);
  const forecastYears = rows.filter((r) => r.forecastVal !== null);

  const allYears = rows.map((r) => r.year);
  const xMin = Math.min(...allYears);
  const xMax = Math.max(...allYears);

  const allValues = rows.flatMap((r) => [r.forecastVal, r.actualVal]).filter((v) => v !== null);
  const yMin = Math.min(...allValues, 0);
  const yMax = Math.max(...allValues, 0);
  const yPad = (yMax - yMin) * 0.12 || 1;
  const yDomain = [yMin - yPad, yMax + yPad];

  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;

  const xScale = (year) => PAD.left + ((year - xMin) / (xMax - xMin)) * innerW;
  const yScale = (val) => PAD.top + innerH - ((val - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerH;

  const svg = document.getElementById("chart");
  svg.setAttribute("viewBox", `0 0 ${CHART_W} ${CHART_H}`);

  svg.appendChild(
    svgEl("line", { class: "zero-line", x1: PAD.left, x2: CHART_W - PAD.right, y1: yScale(0), y2: yScale(0) })
  );

  for (let y = Math.ceil(xMin / 5) * 5; y <= xMax; y += 5) {
    const x = xScale(y);
    svg.appendChild(svgEl("line", { class: "axis-line", x1: x, x2: x, y1: PAD.top, y2: CHART_H - PAD.bottom }));
    const label = svgEl("text", { class: "axis-label", x, y: CHART_H - PAD.bottom + 16, "text-anchor": "middle" });
    label.textContent = y;
    svg.appendChild(label);
  }

  const yRange = yDomain[1] - yDomain[0];
  const yStep = yRange > 60 ? 10 : yRange > 15 ? 5 : 2;
  for (let v = Math.ceil(yDomain[0] / yStep) * yStep; v <= yDomain[1]; v += yStep) {
    const y = yScale(v);
    if (v !== 0) {
      svg.appendChild(svgEl("line", { class: "grid-line-y", x1: PAD.left, x2: CHART_W - PAD.right, y1: y, y2: y }));
    }
    const label = svgEl("text", { class: "axis-label", x: PAD.left - 8, y: y + 3, "text-anchor": "end" });
    label.textContent = `${v}${metric.unit}`;
    svg.appendChild(label);
  }

  function buildSegments(points) {
    const segments = [];
    let current = [];
    points.forEach((r) => {
      if (current.length > 0 && r.year - current[current.length - 1].year > 1) {
        segments.push(current);
        current = [];
      }
      current.push(r);
    });
    if (current.length > 0) segments.push(current);
    return segments;
  }

  function pathFromSegments(segments, valKey) {
    return segments
      .map((seg) => `M ${seg.map((r) => `${xScale(r.year)},${yScale(r[valKey])}`).join(" L ")}`)
      .join(" ");
  }

  // years never covered by a published forecast (gaps > 1yr between forecastYears
  // entries) get a neutral factual label instead of a fabricated straight-line trend.
  // labels are collected into gapLabelEls so applyI18n() can retranslate them later.
  const gapLabelEls = [];
  function drawGapLabels(segments) {
    for (let i = 1; i < segments.length; i++) {
      const prevYear = segments[i - 1][segments[i - 1].length - 1].year;
      const nextYear = segments[i][0].year;
      const label = svgEl("text", {
        class: "gap-label",
        x: (xScale(prevYear) + xScale(nextYear)) / 2,
        y: CHART_H - PAD.bottom - 10,
        "text-anchor": "middle",
      });
      label.textContent = gapLabelText(metric, lang);
      svg.appendChild(label);
      gapLabelEls.push(label);
    }
  }

  if (forecastYears.length > 0) {
    const forecastSegments = buildSegments(forecastYears);
    svg.appendChild(svgEl("path", { class: "line-forecast", d: pathFromSegments(forecastSegments, "forecastVal") }));
    forecastSegments
      .filter((seg) => seg.length === 1)
      .forEach((seg) => {
        svg.appendChild(svgEl("circle", { class: "line-forecast-dot", cx: xScale(seg[0].year), cy: yScale(seg[0].forecastVal), r: 1.75 }));
      });
    drawGapLabels(forecastSegments);
  }

  let actualLabel = null;
  if (actualPoints.length > 0) {
    svg.appendChild(svgEl("path", { class: "line-actual", d: pathFromSegments(buildSegments(actualPoints), "actualVal") }));

    actualPoints.forEach((r) => {
      svg.appendChild(svgEl("circle", { class: "line-actual-dot", cx: xScale(r.year), cy: yScale(r.actualVal), r: 1.75 }));
    });

    const lastActual = actualPoints[actualPoints.length - 1];
    actualLabel = svgEl("text", {
      class: "end-label end-label-actual",
      x: xScale(lastActual.year) + 8,
      y: yScale(lastActual.actualVal) + 4,
    });
    actualLabel.textContent = T[lang].actual;
    svg.appendChild(actualLabel);
  }

  const forecastLabel = svgEl("text", { class: "end-label end-label-forecast", opacity: 0 });
  forecastLabel.textContent = T[lang].forecast;
  svg.appendChild(forecastLabel);

  const linkLine = svgEl("line", { class: "link-line", opacity: 0 });
  const forecastPoint = svgEl("circle", { class: "line-forecast-point", r: 5, opacity: 0 });
  const actualPoint = svgEl("circle", { class: "line-actual-point", r: 5, opacity: 0 });
  svg.appendChild(linkLine);
  svg.appendChild(forecastPoint);
  svg.appendChild(actualPoint);

  const slider = document.getElementById("year-select");
  const yearReadout = document.getElementById("year-readout");
  const vForecast = document.getElementById("v-forecast");
  const vActual = document.getElementById("v-actual");
  const vDiff = document.getElementById("v-diff");
  const vNotes = document.getElementById("v-notes");
  const vSource = document.getElementById("v-source");

  // the slider only steps through years that HAVE a forecast (forecastYears),
  // which can start well after xMin (e.g. nominal GDP has actuals back to 1981
  // but no forecast for 1982-1997) — so the slider's own value range covers a
  // narrower span than the chart's x-axis. Inset the track by exactly the
  // pixel fraction the chart itself would place those start/end years at, so
  // the thumb always sits directly under the year it represents. The slider's
  // value is the calendar year rather than an index into forecastYears, which
  // keeps the thumb linear in year — and therefore aligned with the x-axis —
  // even for metrics whose forecasts have interior gaps.
  const controlsEl = document.querySelector(".controls");
  if (controlsEl && forecastYears.length > 1) {
    const fracLeft = xScale(forecastYears[0].year) / CHART_W;
    const fracRight = 1 - xScale(forecastYears[forecastYears.length - 1].year) / CHART_W;
    controlsEl.style.padding = `0 ${(fracRight * 100).toFixed(3)}% 0 ${(fracLeft * 100).toFixed(3)}%`;
  }

  slider.min = forecastYears[0].year;
  slider.max = forecastYears[forecastYears.length - 1].year;
  slider.step = 1;
  let defaultIdx = forecastYears.length - 1;
  for (let i = forecastYears.length - 1; i >= 0; i--) {
    if (forecastYears[i].actualVal !== null) {
      defaultIdx = i;
      break;
    }
  }
  let currentIdx = defaultIdx;
  slider.value = forecastYears[defaultIdx].year;

  // a year landing inside a forecast gap resolves to the nearest year that has
  // one; ties go to the earlier year
  function nearestForecastIdx(year) {
    let best = 0;
    let bestDist = Infinity;
    forecastYears.forEach((r, i) => {
      const d = Math.abs(r.year - year);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  function render(idx) {
    const r = forecastYears[idx];
    yearReadout.textContent = fmtFY(r.year, lang);
    if (vNotes) vNotes.textContent = extractEventNote(r.notes);

    const yearX = xScale(r.year);
    const fx = yearX;
    const fy = yScale(r.forecastVal);
    forecastPoint.setAttribute("cx", fx);
    forecastPoint.setAttribute("cy", fy);
    forecastPoint.setAttribute("opacity", 1);

    let forecastLabelY = fy + 4;
    forecastLabel.setAttribute("x", yearX + 8);
    forecastLabel.setAttribute("opacity", 1);

    if (actualLabel) {
      const lastActual = actualPoints[actualPoints.length - 1];
      const ay = yScale(lastActual.actualVal);
      let actualLabelY = ay + 4;
      const nearActualLabel = Math.abs(yearX - xScale(lastActual.year)) < 40;
      const MIN_GAP = 14;
      if (nearActualLabel && Math.abs(forecastLabelY - actualLabelY) < MIN_GAP) {
        const mid = (forecastLabelY + actualLabelY) / 2;
        if (forecastLabelY <= actualLabelY) {
          forecastLabelY = mid - MIN_GAP / 2;
          actualLabelY = mid + MIN_GAP / 2;
        } else {
          forecastLabelY = mid + MIN_GAP / 2;
          actualLabelY = mid - MIN_GAP / 2;
        }
      }
      actualLabel.setAttribute("y", actualLabelY);
    }
    forecastLabel.setAttribute("y", forecastLabelY);

    vForecast.textContent = fmtVal(r.forecastVal, metric.unit, metric.signed);

    if (r.actualVal !== null) {
      const ax = yearX;
      const ay = yScale(r.actualVal);
      actualPoint.setAttribute("cx", ax);
      actualPoint.setAttribute("cy", ay);
      actualPoint.setAttribute("opacity", 1);

      linkLine.setAttribute("x1", fx);
      linkLine.setAttribute("y1", fy);
      linkLine.setAttribute("x2", ax);
      linkLine.setAttribute("y2", ay);
      linkLine.setAttribute("opacity", 1);

      vActual.textContent = fmtVal(r.actualVal, metric.unit, metric.signed);
      const diff = r.actualVal - r.forecastVal;
      vDiff.textContent = `${diff > 0 ? "+" : ""}${diff.toFixed(1)}pt`;
    } else {
      actualPoint.setAttribute("opacity", 0);
      linkLine.setAttribute("opacity", 0);
      // a missing actual means "the fiscal year hasn't ended yet" only for years
      // past the last one with an actual; earlier holes are years where no actual
      // was ever published (e.g. FY1980 real GDP growth, which has no prior year
      // to compute against), and calling those "in progress" would be wrong
      const lastActualYear = actualPoints.length ? actualPoints[actualPoints.length - 1].year : -Infinity;
      vActual.textContent = r.year > lastActualYear ? T[lang].actualPending : T[lang].actualUnavailable;
      vDiff.textContent = "—";
    }

    const links = [];
    const forecastUrl = safeUrl(r.forecastSourceUrl);
    const actualUrl = safeUrl(r.actualSourceUrl);
    if (forecastUrl) links.push(`${T[lang].forecastSourcePrefix}<a href="${escapeHTML(forecastUrl)}" target="_blank" rel="noopener">${escapeHTML(forecastUrl)}</a>`);
    if (actualUrl) links.push(`${T[lang].actualSourcePrefix}<a href="${escapeHTML(actualUrl)}" target="_blank" rel="noopener">${escapeHTML(actualUrl)}</a>`);
    vSource.innerHTML = links.join("<br>");
  }

  slider.addEventListener("input", () => {
    const raw = Number(slider.value);
    let idx = nearestForecastIdx(raw);
    // a single arrow-key step inside a gap wider than one year rounds straight
    // back to the year we are already on — move to the neighbouring forecast
    // year instead, so the keyboard can cross gaps at all
    if (idx === currentIdx && Math.abs(raw - forecastYears[currentIdx].year) === 1) {
      if (raw > forecastYears[currentIdx].year && currentIdx < forecastYears.length - 1) idx = currentIdx + 1;
      else if (raw < forecastYears[currentIdx].year && currentIdx > 0) idx = currentIdx - 1;
    }
    currentIdx = idx;
    slider.value = forecastYears[idx].year;
    render(idx);
  });

  function applyI18n() {
    const t = T[lang];
    document.getElementById("chart-title").textContent = lang === "ja" ? metric.title : metric.titleEn;
    document.getElementById("chart-desc").textContent = lang === "ja" ? metric.desc : metric.descEn;
    document.getElementById("t-back").textContent = t.back;
    document.getElementById("t-stat-forecast").textContent = t.forecast;
    document.getElementById("t-stat-actual").textContent = t.actual;
    document.getElementById("t-stat-gap").textContent = t.gap;
    document.getElementById("t-footer-src").textContent = t.footerSrc;
    document.getElementById("t-footer-about").textContent = t.footerAbout;
    if (actualLabel) actualLabel.textContent = t.actual;
    forecastLabel.textContent = t.forecast;
    gapLabelEls.forEach((el) => { el.textContent = gapLabelText(metric, lang); });
    document.getElementById("lang-ja").classList.toggle("active", lang === "ja");
    document.getElementById("lang-en").classList.toggle("active", lang === "en");
    document.documentElement.lang = lang;
    render(currentIdx);
  }

  document.getElementById("lang-ja").addEventListener("click", () => { lang = "ja"; applyI18n(); });
  document.getElementById("lang-en").addEventListener("click", () => { lang = "en"; applyI18n(); });

  applyI18n();
}

main();
