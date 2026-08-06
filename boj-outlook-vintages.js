const SVG_NS = "http://www.w3.org/2000/svg";
const CHART_W = 960;
const CHART_H = 380;
const PAD = { top: 20, right: 64, bottom: 32, left: 44 };

// UI strings for this page. Structurally this is the same "successive
// estimates vs actual" pattern as fertility.js/births.js, but the axes are
// swapped: there, one line = one vintage (forecast-issuing edition), x = the
// year being forecast. Here, one line = one target fiscal year, x = the
// issue (号) that made the forecast — because a BOJ Outlook Report issue
// only forecasts ~2-3 years ahead (not decades), grouping by vintage would
// produce dozens of near-illegible 2-3-point lines instead of one line per
// target year showing how that year's forecast evolved over time.
const T = {
  ja: {
    back: "← 指標一覧",
    title: "日銀展望レポート — 号ごとの見通しの収束",
    desc: "日本銀行「経済・物価情勢の展望」(展望レポート)は年3〜4回、政策委員の大勢見通し(中央値)を更新する。/chart/boj-outlook-real・/chart/boj-outlook-cpi が年度ごとに1つの値(4月号)だけを切り出しているのに対し、このページは全号の見通しを号の公表時点ごとに並べ、同じ年度の見通しが号を追うごとにどう動いたかを見せる。",
    scopeNoteHead: "このページについて",
    scopeNote:
      "各線は1つの年度を指し、その年度をその時点でどう見通していたかを号の公表順に結ぶ。線の色が薄いほど古い年度、濃いほど新しい年度。破線は見通しではなく確定した実績への接続(対応する実績が無い年度は破線が出ない)。前号時点の見通しを本文中で再掲しただけの行(restated)は、その号が新たに示した見通しではないため対象外にしている。中央値そのものが非公表だった号(2000年10月号〜2002年10月号、および2020年4月号)は線が途切れる。",
    chartAriaLabelReal: "実質GDP見通しの、号ごとの収束",
    chartAriaLabelCpi: "消費者物価見通しの、号ごとの収束",
    sectionTitleReal: "実質GDP",
    sectionTitleCpi: "消費者物価(CPI、総合)",
    legendActual: "実績",
    fyLabel: (fy) => `${fy}年度`,
    seeAlsoReal: "年度ごとの実質GDP見通し(4月号)を見る →",
    seeAlsoCpi: "年度ごとの消費者物価見通し(4月号)を見る →",
    footerSrc: "src: 日本銀行「経済・物価情勢の展望」",
    footerAbout: "このサイトについて",
    footerContact: "お問い合わせ",
    tableToggle: (n) => `全号の見通しを表で見る（${n}件）`,
    tableCaption: "日銀展望レポート｜号ごとの実質GDP・消費者物価見通し(大勢見通し中央値)",
    thIssue: "号",
    thTargetYear: "対象年度",
    thReal: "実質GDP",
    thCpi: "CPI",
    tableRoundNote:
      "表の実質GDP・CPIはいずれも「中央値(下限〜上限)」。中央値非公表の号・restated(再掲)行は表に含めていない。",
    tableCsvLabel: "元データ: ",
    chartNoscript: "グラフの描画には JavaScript が必要です。数値は下の表にあります。",
  },
  en: {
    back: "← Indicators",
    title: "BOJ Outlook Report — convergence of forecasts across issues",
    desc: "The Bank of Japan's Outlook for Economic Activity and Prices (展望レポート) updates its Policy Board median forecast 3-4 times a year. Where /chart/boj-outlook-real and /chart/boj-outlook-cpi each pick out a single value per fiscal year (the April issue), this page lays out every issue's forecast by publication date, showing how the forecast for a given year moved from issue to issue.",
    scopeNoteHead: "About this page",
    scopeNote:
      "Each line is one fiscal year, connecting how it was forecast at each issue in publication order. Lighter lines are older target years, darker lines are more recent. A dashed segment is not a forecast — it connects the last forecast to the eventual actual figure (years without a matching actual have no dashed segment). Rows that merely restate a prior issue's figure in the body text (restated) are excluded, since they are not a new forecast from that issue. Issues that did not publish a median at all (Oct 2000 - Oct 2002, and Apr 2020) leave a gap in the line.",
    chartAriaLabelReal: "Real GDP forecast convergence, by issue",
    chartAriaLabelCpi: "CPI forecast convergence, by issue",
    sectionTitleReal: "Real GDP",
    sectionTitleCpi: "CPI (all-items)",
    legendActual: "Actual",
    fyLabel: (fy) => `FY${fy}`,
    seeAlsoReal: "See the per-fiscal-year real GDP forecast (April issue) →",
    seeAlsoCpi: "See the per-fiscal-year CPI forecast (April issue) →",
    footerSrc: "src: Bank of Japan, Outlook for Economic Activity and Prices",
    footerAbout: "About this site",
    footerContact: "Contact",
    tableToggle: (n) => `Show every issue's forecast as a table (${n} rows)`,
    tableCaption: "BOJ Outlook Report | real GDP and CPI forecast (Policy Board median) by issue",
    thIssue: "Issue",
    thTargetYear: "Target FY",
    thReal: "Real GDP",
    thCpi: "CPI",
    tableRoundNote:
      "Real GDP and CPI are both shown as \"median (low-high)\". Issues without a published median, and restated rows, are not included in the table.",
    tableCsvLabel: "Source data: ",
    chartNoscript: "This chart requires JavaScript to draw. The figures are in the table below.",
  },
};

// "YYYY-MM" -> decimal year (2016-01 -> 2016.0, 2016-04 -> 2016.25, ...),
// so elapsed time between issues reads honestly (semi-annual gaps look
// twice as wide as quarterly ones, because they are).
function issueToX(issue) {
  const [y, m] = issue.split("-").map(Number);
  return y + (m - 1) / 12;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

// consecutive-issue runs only — a gap (e.g. the 2020-04 blank-median issue)
// must never be bridged by a straight line, or it fabricates a data point
// that was never published
function buildSegments(points) {
  const segments = [];
  let current = [];
  points.forEach((p) => {
    current.push(p);
  });
  if (current.length > 0) segments.push(current);
  return segments;
}

function pathFromPoints(points) {
  return `M ${points.map((p) => `${p.px},${p.py}`).join(" L ")}`;
}

// Renders one metric's chart (real or cpi) into the given <svg>/legend pair.
// `groups`: array of { fy, points: [{x, y}], actual: {x, y} | null }, fy ascending.
function renderChart(svg, legendEl, groups, lang, ariaLabel) {
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${CHART_W} ${CHART_H}`);
  svg.setAttribute("aria-label", ariaLabel);

  const allPoints = groups.flatMap((g) => g.points.concat(g.actual ? [g.actual] : []));
  const xMin = Math.min(...allPoints.map((p) => p.x));
  const xMax = Math.max(...allPoints.map((p) => p.x));
  const allValues = allPoints.map((p) => p.y);
  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const yPad = (yMax - yMin) * 0.1 || 0.5;
  const yDomain = [yMin - yPad, yMax + yPad];

  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;
  const xScale = (x) => PAD.left + ((x - xMin) / (xMax - xMin)) * innerW;
  const yScale = (v) => PAD.top + innerH - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerH;

  for (let y = Math.ceil(xMin / 5) * 5; y <= xMax; y += 5) {
    const x = xScale(y);
    svg.appendChild(svgEl("line", { class: "axis-line", x1: x, x2: x, y1: PAD.top, y2: CHART_H - PAD.bottom }));
    const label = svgEl("text", { class: "axis-label", x, y: CHART_H - PAD.bottom + 16, "text-anchor": "middle" });
    label.textContent = Math.round(y);
    svg.appendChild(label);
  }
  // zero line, when it's inside the domain, helps read negative forecasts
  if (yDomain[0] < 0 && yDomain[1] > 0) {
    const y0 = yScale(0);
    svg.appendChild(svgEl("line", { class: "grid-line-y", x1: PAD.left, x2: CHART_W - PAD.right, y1: y0, y2: y0 }));
  }
  const yStep = (yDomain[1] - yDomain[0]) > 6 ? 2 : 1;
  for (let v = Math.ceil(yDomain[0] / yStep) * yStep; v <= yDomain[1]; v += yStep) {
    if (v === 0 && yDomain[0] < 0 && yDomain[1] > 0) continue;
    const y = yScale(v);
    svg.appendChild(svgEl("line", { class: "grid-line-y", x1: PAD.left, x2: CHART_W - PAD.right, y1: y, y2: y }));
    const label = svgEl("text", { class: "axis-label", x: PAD.left - 8, y: y + 3, "text-anchor": "end" });
    label.textContent = v.toFixed(0);
    svg.appendChild(label);
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const opacityFor = (idx, span) => 0.25 + (idx / (span || 1)) * 0.55;

  const entries = [];
  const labelTargets = [];
  groups.forEach(({ fy, points, actual }, idx) => {
    const opacity = opacityFor(idx, groups.length - 1);
    const px = points.map((p) => ({ px: xScale(p.x), py: yScale(p.y) }));
    const path = svgEl("path", {
      class: "line-forecast-vintage",
      d: pathFromPoints(px),
      opacity: reduceMotion ? opacity : 0,
    });
    svg.appendChild(path);

    let tailPath = null;
    if (actual) {
      const last = points[points.length - 1];
      tailPath = svgEl("path", {
        class: "line-actual-ref",
        d: `M ${xScale(last.x)},${yScale(last.y)} L ${xScale(actual.x)},${yScale(actual.y)}`,
        opacity: reduceMotion ? opacity : 0,
      });
      svg.appendChild(tailPath);
      tailPath._dot = svgEl("circle", {
        class: "line-actual-dot",
        cx: xScale(actual.x),
        cy: yScale(actual.y),
        r: 2,
        opacity: reduceMotion ? opacity : 0,
      });
      svg.appendChild(tailPath._dot);
    }

    const endX = actual ? actual.x : points[points.length - 1].x;
    const endY = actual ? actual.y : points[points.length - 1].y;
    const entry = { path, tailPath, opacity, label: null };
    entries.push(entry);
    labelTargets.push({ fy, x: xScale(endX) + 6, y: yScale(endY) + 3, entry });
  });

  // End-of-line labels can land within a few px of each other, but — unlike
  // fertility.js, where every vintage line ends near the same rightmost x —
  // here each label sits at its own line's own x position, scattered across
  // the full width. A single sitewide sort-by-y-and-push (fertility's
  // approach) would drag a label far from its line whenever some other,
  // distant label happens to share a similar y. So collisions are only
  // resolved within local x-clusters: group labels whose x is within
  // X_CLUSTER of each other, then push-apart only inside each cluster.
  const X_CLUSTER = 34;
  const MIN_LABEL_GAP = 11;
  const byX = [...labelTargets].sort((a, b) => a.x - b.x);
  const clusters = [];
  let current = [];
  byX.forEach((l) => {
    if (current.length && l.x - current[current.length - 1].x > X_CLUSTER) {
      clusters.push(current);
      current = [];
    }
    current.push(l);
  });
  if (current.length) clusters.push(current);

  clusters.forEach((cluster) => {
    if (cluster.length < 2) return;
    cluster.sort((a, b) => a.y - b.y);
    for (let i = 1; i < cluster.length; i++) {
      if (cluster[i].y - cluster[i - 1].y < MIN_LABEL_GAP) {
        cluster[i].y = cluster[i - 1].y + MIN_LABEL_GAP;
      }
    }
    const maxLabelY = CHART_H - PAD.bottom - 4;
    const overflow = cluster[cluster.length - 1].y - maxLabelY;
    if (overflow > 0) cluster.forEach((l) => (l.y -= overflow));
    const minLabelY = PAD.top + 8;
    const underflow = minLabelY - cluster[0].y;
    if (underflow > 0) cluster.forEach((l) => (l.y += underflow));
  });

  labelTargets.forEach(({ fy, x, y, entry }) => {
    const label = svgEl("text", {
      class: "vintage-label",
      x,
      y,
      opacity: reduceMotion ? entry.opacity : 0,
    });
    label.textContent = `${fy}`;
    svg.appendChild(label);
    entry.label = label;
  });

  if (!reduceMotion) {
    entries.forEach(({ path, tailPath, label, opacity }, i) => {
      const delay = i * 60;
      setTimeout(() => {
        path.style.transition = "opacity 0.5s ease";
        path.style.opacity = opacity;
        if (tailPath) {
          tailPath.style.transition = "opacity 0.5s ease";
          tailPath.style.opacity = opacity;
          tailPath._dot.style.transition = "opacity 0.5s ease";
          tailPath._dot.style.opacity = opacity;
        }
        label.style.transition = "opacity 0.5s ease";
        label.style.opacity = opacity;
      }, delay);
    });
  }

  const legendHtml =
    `<span class="legend-item"><span class="legend-swatch legend-swatch-actual" style="border-top:1.5px dashed var(--navy);height:0;background:none"></span>${T[lang].legendActual}</span>` +
    `<span class="legend-item"><span class="legend-swatch legend-swatch-vintage"></span>${lang === "ja" ? "対象年度(薄い=古い/濃い=新しい)" : "target FY (lighter = older, darker = more recent)"}</span>`;
  legendEl.innerHTML = legendHtml;
}

async function main() {
  let lang = document.documentElement.lang === "en" ? "en" : "ja";
  const t = T[lang];

  const [vintages, realActual, cpiActual] = await Promise.all([
    loadCSV("/data/boj_outlook_vintages.csv"),
    loadCSV("/data/boj_outlook_real.csv"),
    loadCSV("/data/boj_outlook_cpi.csv"),
  ]);

  const mainRows = vintages
    .filter((r) => r.issue_kind === "main")
    .map((r) => ({
      issue: r.issue,
      x: issueToX(r.issue),
      fy: Number(r.target_fiscal_year),
      real: toNum(r.real_median),
      cpi: toNum(r.cpi_median),
    }));

  const actualByFy = {
    real: new Map(realActual.map((r) => [Number(r.fiscal_year), toNum(r.actual_real)]).filter(([, v]) => v !== null)),
    cpi: new Map(cpiActual.map((r) => [Number(r.fiscal_year), toNum(r.actual_cpi)]).filter(([, v]) => v !== null)),
  };

  function groupsFor(metric) {
    const rows = mainRows.filter((r) => r[metric] !== null);
    const fys = [...new Set(rows.map((r) => r.fy))].sort((a, b) => a - b);
    return fys.map((fy) => {
      const points = rows
        .filter((r) => r.fy === fy)
        .sort((a, b) => a.x - b.x)
        .map((r) => ({ x: r.x, y: r[metric] }));
      const actualVal = actualByFy[metric].get(fy);
      // the "actual" tail sits one quarter after the last forecast issue —
      // there is no real announcement-date data to place it more precisely,
      // this just keeps it visually separated from the forecast line itself.
      const actual = actualVal !== undefined ? { x: points[points.length - 1].x + 0.25, y: actualVal } : null;
      return { fy, points, actual };
    });
  }

  renderChart(
    document.getElementById("boj-vintages-chart-real"),
    document.getElementById("boj-vintages-legend-real"),
    groupsFor("real"),
    lang,
    t.chartAriaLabelReal
  );
  renderChart(
    document.getElementById("boj-vintages-chart-cpi"),
    document.getElementById("boj-vintages-legend-cpi"),
    groupsFor("cpi"),
    lang,
    t.chartAriaLabelCpi
  );

  // 静的な数値表・出典は bin/build.mjs が data/*.csv から HTML に埋め込む(JSでは
  // 組み直さない。fertility.js の applyBuiltI18n と同じ理由)。
  function applyBuiltI18n() {
    document.querySelectorAll(".data-section [data-en], #boj-vintages-source [data-en]").forEach((el) => {
      if (el.dataset.ja === undefined) el.dataset.ja = el.textContent;
      el.textContent = lang === "en" ? el.dataset.en : el.dataset.ja;
    });
  }

  function applyI18n() {
    document.getElementById("t-back").textContent = t.back;
    document.getElementById("bojv-title").textContent = t.title;
    document.getElementById("bojv-desc").textContent = t.desc;
    document.getElementById("bojv-scope-note").textContent = t.scopeNote;
    document.getElementById("t-footer-src").textContent = t.footerSrc;
    document.getElementById("t-footer-about").textContent = t.footerAbout;
    document.getElementById("t-footer-contact").textContent = t.footerContact;
    document.getElementById("lang-ja").classList.toggle("active", lang === "ja");
    document.getElementById("lang-en").classList.toggle("active", lang === "en");
    document.documentElement.lang = lang;
    applyBuiltI18n();
  }

  applyI18n();
}

main();
