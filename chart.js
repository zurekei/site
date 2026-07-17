const SVG_NS = "http://www.w3.org/2000/svg";
const CHART_W = 960;
const CHART_H = 480;
const PAD = { top: 20, right: 64, bottom: 32, left: 44 };

const METRICS = {
  "gdp-real": {
    title: "実質GDP成長率",
    desc: "政府の当初見通し(実質)と、確定した実績を並べたもの。",
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
    desc: "政府の当初見通し(名目)と、確定した実績を並べたもの。",
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
    desc: "政府の当初見通しと、確定した実績を並べたもの。",
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
    desc: "政府の当初見通しと、確定した実績を並べたもの。",
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
    desc: "財務省の当初予算における税収見積もりと、確定した決算額を並べたもの。",
    csv: "data/tax_revenue_forecast.csv",
    forecastCol: "forecast_tn",
    actualCol: "actual_tn",
    forecastSourceCol: "forecast_source_url",
    actualSourceCol: "actual_source_url",
    unit: "兆円",
    signed: false,
  },
};

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

async function main() {
  const params = new URLSearchParams(location.search);
  const metricKey = params.get("m") || "gdp-real";
  const metric = Object.hasOwn(METRICS, metricKey) ? METRICS[metricKey] : METRICS["gdp-real"];

  document.getElementById("page-title").textContent = `${metric.title} — ズレ計`;
  document.getElementById("chart-title").textContent = metric.title;
  document.getElementById("chart-desc").textContent = metric.desc;

  const rawRows = await loadCSV(metric.csv);
  const rows = rawRows
    .map((r) => ({
      year: Number(r.fiscal_year),
      forecastVal: toNum(r[metric.forecastCol]),
      actualVal: toNum(r[metric.actualCol]),
      forecastSourceUrl: r[metric.forecastSourceCol],
      actualSourceUrl: extractSourceUrl(r[metric.actualSourceCol], metric.actualSourceLabel),
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

  const yStep = yDomain[1] - yDomain[0] > 15 ? 5 : 2;
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
  // entries) get a neutral factual label instead of a fabricated straight-line trend
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
      label.textContent = "データ未収集";
      svg.appendChild(label);
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
    actualLabel.textContent = "実績";
    svg.appendChild(actualLabel);
  }

  // years whose forecast/actual gap sits notably above the series' own
  // typical spread (mean + 1 stddev of |diff|) — a threshold computed from
  // the data itself, not a fixed magic number, so it stays meaningful across
  // metrics with very different units (%, 兆円). Listed as plain numbers
  // below the chart rather than on it, so charts with many outliers don't
  // get visually noisy.
  const deviations = actualPoints
    .filter((r) => r.forecastVal !== null)
    .map((r) => ({ ...r, diff: r.actualVal - r.forecastVal }));
  const gapYearsEl = document.getElementById("gap-years");
  if (gapYearsEl && deviations.length >= 3) {
    const absDiffs = deviations.map((d) => Math.abs(d.diff));
    const mean = absDiffs.reduce((a, b) => a + b, 0) / absDiffs.length;
    const variance = absDiffs.reduce((a, b) => a + (b - mean) ** 2, 0) / absDiffs.length;
    const threshold = mean + Math.sqrt(variance);
    const largeGaps = deviations
      .filter((d) => Math.abs(d.diff) > threshold)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    if (largeGaps.length > 0) {
      gapYearsEl.innerHTML =
        `<span class="gap-years-label">ズレが平均+1標準偏差を超えた年度</span>` +
        largeGaps
          .map(
            (d) =>
              `<span class="gap-years-item">${d.year}年度 ${d.diff > 0 ? "+" : ""}${d.diff.toFixed(1)}${metric.unit}</span>`
          )
          .join("");
    }
  }

  const forecastLabel = svgEl("text", { class: "end-label end-label-forecast", opacity: 0 });
  forecastLabel.textContent = "見通し";
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
  const vSource = document.getElementById("v-source");

  slider.min = 0;
  slider.max = forecastYears.length - 1;
  let defaultIdx = forecastYears.length - 1;
  for (let i = forecastYears.length - 1; i >= 0; i--) {
    if (forecastYears[i].actualVal !== null) {
      defaultIdx = i;
      break;
    }
  }
  slider.value = defaultIdx;

  function render(idx) {
    const r = forecastYears[idx];
    yearReadout.textContent = `${r.year}年度`;

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
      vActual.textContent = "実績未確定(年度未終了)";
      vDiff.textContent = "—";
    }

    const links = [];
    const forecastUrl = safeUrl(r.forecastSourceUrl);
    const actualUrl = safeUrl(r.actualSourceUrl);
    if (forecastUrl) links.push(`見通し出典: <a href="${escapeHTML(forecastUrl)}" target="_blank" rel="noopener">${escapeHTML(forecastUrl)}</a>`);
    if (actualUrl) links.push(`実績出典: <a href="${escapeHTML(actualUrl)}" target="_blank" rel="noopener">${escapeHTML(actualUrl)}</a>`);
    vSource.innerHTML = links.join("<br>");
  }

  slider.addEventListener("input", () => render(Number(slider.value)));
  render(defaultIdx);
}

main();
