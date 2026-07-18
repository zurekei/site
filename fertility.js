const SVG_NS = "http://www.w3.org/2000/svg";
const CHART_W = 960;
const CHART_H = 480;
const PAD = { top: 20, right: 64, bottom: 32, left: 44 };

// UI strings for this page. The indicator name ("Total fertility rate")
// is kept in sync with home.js's INDICATOR_META nameEn by hand.
const T = {
  ja: {
    back: "← 指標一覧",
    title: "合計特殊出生率 — 歴代推計 vs 実績",
    desc: "国立社会保障・人口問題研究所「日本の将来推計人口」が版ごとに置いた合計特殊出生率の仮定(中位)を重ねたもの。線の色が薄いほど古い推計、濃いほど新しい推計。",
    chartAriaLabel: "合計特殊出生率の歴代推計と実績",
    legendActual: "実績",
    vintageSuffix: "年推計",
    sourceActualPrefix: "実績: ",
    footerSrc: "src: 国立社会保障・人口問題研究所「日本の将来推計人口」",
    footerAbout: "このサイトについて",
  },
  en: {
    back: "← Indicators",
    title: "Total fertility rate — successive projections vs actual",
    desc: "Fertility assumptions (medium variant) from successive editions of NIPSSR's population projections, overlaid. Lighter lines are older projections; darker lines are more recent.",
    chartAriaLabel: "Successive fertility-rate projections and the actual rate",
    legendActual: "Actual",
    vintageSuffix: " projection",
    sourceActualPrefix: "Actual: ",
    footerSrc: "src: NIPSSR / Population Projections for Japan",
    footerAbout: "About this site",
  },
};

function vintageLabel(vintageYear, lang) {
  return lang === "ja" ? `${vintageYear}${T.ja.vintageSuffix}` : `${vintageYear}${T.en.vintageSuffix}`;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

// consecutive-year runs only — a gap between runs (e.g. missing actual data)
// must never be bridged by a straight line, or it fabricates a trend that was
// never measured
function buildSegments(points, yearKey = "year") {
  const segments = [];
  let current = [];
  points.forEach((p) => {
    if (current.length > 0 && p[yearKey] - current[current.length - 1][yearKey] > 1) {
      segments.push(current);
      current = [];
    }
    current.push(p);
  });
  if (current.length > 0) segments.push(current);
  return segments;
}

function pathFromSegments(segments, xScale, yScale, yearKey, valKey) {
  return segments
    .map((seg) => `M ${seg.map((p) => `${xScale(p[yearKey])},${yScale(p[valKey])}`).join(" L ")}`)
    .join(" ");
}

async function main() {
  let lang = "ja";

  const [forecastRaw, actualRaw] = await Promise.all([
    loadCSV("data/fertility_forecast.csv"),
    loadCSV("data/fertility_actual.csv"),
  ]);

  const forecastRows = forecastRaw
    .map((r) => ({
      vintageYear: Number(r.vintage_year),
      targetYear: Number(r.target_year),
      mid: toNum(r.assumed_tfr_mid),
      sourceUrl: r.forecast_source_url,
      publishedDate: r.forecast_published_date,
      notes: r.notes,
    }))
    .filter((r) => r.mid !== null);

  const actualRows = actualRaw
    .map((r) => ({ year: Number(r.year), tfr: toNum(r.actual_tfr), sourceUrl: r.source_url }))
    .filter((r) => r.tfr !== null)
    .sort((a, b) => a.year - b.year);

  const vintages = [...new Set(forecastRows.map((r) => r.vintageYear))].sort((a, b) => a - b);
  const byVintage = vintages.map((vy) => ({
    vintageYear: vy,
    rows: forecastRows.filter((r) => r.vintageYear === vy).sort((a, b) => a.targetYear - b.targetYear),
  }));

  const allYears = forecastRows.map((r) => r.targetYear).concat(actualRows.map((r) => r.year));
  const xMin = Math.min(...allYears);
  const xMax = Math.max(...allYears);

  const allValues = forecastRows.map((r) => r.mid).concat(actualRows.map((r) => r.tfr));
  const yMin = Math.min(...allValues, 1);
  const yMax = Math.max(...allValues);
  const yPad = (yMax - yMin) * 0.08 || 0.1;
  const yDomain = [Math.max(0, yMin - yPad), yMax + yPad];

  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;
  const xScale = (year) => PAD.left + ((year - xMin) / (xMax - xMin)) * innerW;
  const yScale = (val) => PAD.top + innerH - ((val - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerH;

  const svg = document.getElementById("fertility-chart");
  svg.setAttribute("viewBox", `0 0 ${CHART_W} ${CHART_H}`);

  for (let y = Math.ceil(xMin / 10) * 10; y <= xMax; y += 10) {
    const x = xScale(y);
    svg.appendChild(svgEl("line", { class: "axis-line", x1: x, x2: x, y1: PAD.top, y2: CHART_H - PAD.bottom }));
    const label = svgEl("text", { class: "axis-label", x, y: CHART_H - PAD.bottom + 16, "text-anchor": "middle" });
    label.textContent = y;
    svg.appendChild(label);
  }

  const yStep = 0.2;
  for (let v = Math.ceil(yDomain[0] / yStep) * yStep; v <= yDomain[1]; v += yStep) {
    const y = yScale(v);
    svg.appendChild(svgEl("line", { class: "grid-line-y", x1: PAD.left, x2: CHART_W - PAD.right, y1: y, y2: y }));
    const label = svgEl("text", { class: "axis-label", x: PAD.left - 8, y: y + 3, "text-anchor": "end" });
    label.textContent = v.toFixed(1);
    svg.appendChild(label);
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // opacity scales with vintage age: older assumptions fade back, the
  // current (newest) projection stays most visible — this distinguishes
  // "how long ago was this guessed", not a value judgment on the guess
  const opacityFor = (vy) => {
    const idx = vintages.indexOf(vy);
    const span = vintages.length - 1 || 1;
    return 0.22 + (idx / span) * 0.6;
  };

  const actualSegments = buildSegments(actualRows, "year");
  const actualPath = svgEl("path", {
    class: "line-actual",
    d: pathFromSegments(actualSegments, xScale, yScale, "year", "tfr"),
  });
  svg.appendChild(actualPath);
  actualSegments
    .filter((seg) => seg.length === 1)
    .forEach((seg) => svg.appendChild(svgEl("circle", { class: "line-actual-dot", cx: xScale(seg[0].year), cy: yScale(seg[0].tfr), r: 1.75 })));

  // end-of-line labels often land within a few px of each other since several
  // vintages converge to a similar long-run assumption — push overlapping
  // labels apart vertically so they stay legible
  const labelTargets = byVintage.map(({ vintageYear, rows }) => {
    const last = rows[rows.length - 1];
    return { vintageYear, x: xScale(last.targetYear) + 6, y: yScale(last.mid) + 3 };
  });
  labelTargets.sort((a, b) => a.y - b.y);
  const MIN_LABEL_GAP = 12;
  for (let i = 1; i < labelTargets.length; i++) {
    if (labelTargets[i].y - labelTargets[i - 1].y < MIN_LABEL_GAP) {
      labelTargets[i].y = labelTargets[i - 1].y + MIN_LABEL_GAP;
    }
  }
  // pushing later labels down can walk the last one past the chart's bottom
  // edge — pull the whole cluster back up by the overflow amount
  const maxLabelY = CHART_H - PAD.bottom - 4;
  const overflow = labelTargets[labelTargets.length - 1].y - maxLabelY;
  if (overflow > 0) labelTargets.forEach((l) => (l.y -= overflow));
  const labelYByVintage = new Map(labelTargets.map((l) => [l.vintageYear, l.y]));

  const vintagePaths = byVintage.map(({ vintageYear, rows }) => {
    const path = svgEl("path", {
      class: "line-forecast-vintage",
      d: `M ${rows.map((r) => `${xScale(r.targetYear)},${yScale(r.mid)}`).join(" L ")}`,
      opacity: reduceMotion ? opacityFor(vintageYear) : 0,
    });
    svg.appendChild(path);
    const last = rows[rows.length - 1];
    const label = svgEl("text", {
      class: "vintage-label",
      x: xScale(last.targetYear) + 6,
      y: labelYByVintage.get(vintageYear),
      opacity: reduceMotion ? opacityFor(vintageYear) : 0,
    });
    label.textContent = `${vintageYear}`;
    svg.appendChild(label);
    return { vintageYear, path, label };
  });

  if (!reduceMotion) {
    const actualLen = actualPath.getTotalLength();
    actualPath.style.strokeDasharray = `${actualLen}`;
    actualPath.style.strokeDashoffset = `${actualLen}`;
    // force the browser to commit the dashoffset above as a real starting
    // state before the transition is attached, otherwise both style writes
    // can land in the same paint and the draw-in never visibly animates
    actualPath.getBoundingClientRect();
    requestAnimationFrame(() => {
      actualPath.style.transition = "stroke-dashoffset 1.4s ease";
      actualPath.style.strokeDashoffset = "0";
    });

    const ACTUAL_DRAW_MS = 1400;
    vintagePaths.forEach(({ vintageYear, path, label }, i) => {
      const delay = ACTUAL_DRAW_MS + i * 220;
      setTimeout(() => {
        path.style.transition = "opacity 0.5s ease";
        path.style.opacity = opacityFor(vintageYear);
        label.style.transition = "opacity 0.5s ease";
        label.style.opacity = opacityFor(vintageYear);
      }, delay);
    });
  }

  function buildLegendHtml() {
    return (
      `<span class="legend-item"><span class="legend-swatch legend-swatch-actual"></span>${T[lang].legendActual}</span>` +
      byVintage
        .map(
          ({ vintageYear }) =>
            `<span class="legend-item"><span class="legend-swatch legend-swatch-vintage" style="opacity:${opacityFor(vintageYear).toFixed(2)}"></span>${vintageLabel(vintageYear, lang)}</span>`
        )
        .join("")
    );
  }

  function buildSourceHtml() {
    const sourceLines = [];
    const seenUrls = new Set();
    byVintage.forEach(({ vintageYear, rows }) => {
      const url = safeUrl(rows[0].sourceUrl);
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        const note = rows[0].notes ? `(${escapeHTML(rows[0].notes)})` : "";
        sourceLines.push(`${vintageLabel(vintageYear, lang)}: <a href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(url)}</a>${note}`);
      }
    });
    const actualUrls = [...new Set(actualRows.map((r) => r.sourceUrl).filter(Boolean))];
    actualUrls.forEach((u) => {
      const url = safeUrl(u);
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        sourceLines.push(`${T[lang].sourceActualPrefix}<a href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(url)}</a>`);
      }
    });
    return sourceLines.join("<br>");
  }

  function applyI18n() {
    const t = T[lang];
    document.getElementById("t-back").textContent = t.back;
    document.getElementById("fert-title").textContent = t.title;
    document.getElementById("fert-desc").textContent = t.desc;
    document.getElementById("fertility-chart").setAttribute("aria-label", t.chartAriaLabel);
    document.getElementById("t-footer-src").textContent = t.footerSrc;
    document.getElementById("t-footer-about").textContent = t.footerAbout;
    document.getElementById("fertility-legend").innerHTML = buildLegendHtml();
    document.getElementById("fertility-source").innerHTML = buildSourceHtml();
    document.getElementById("lang-ja").classList.toggle("active", lang === "ja");
    document.getElementById("lang-en").classList.toggle("active", lang === "en");
    document.documentElement.lang = lang;
  }

  document.getElementById("lang-ja").addEventListener("click", () => { lang = "ja"; applyI18n(); });
  document.getElementById("lang-en").addEventListener("click", () => { lang = "en"; applyI18n(); });

  applyI18n();
}

main();
