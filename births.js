const SVG_NS = "http://www.w3.org/2000/svg";
const CHART_W = 960;
const CHART_H = 480;
const PAD = { top: 20, right: 72, bottom: 32, left: 60 };

// ⚠ 描画まわり(svgEl / buildSegments / pathFromSegments と main() の軸・
// ラベル衝突回避・描き込みアニメーション)は fertility.js とほぼ同じものが
// 2箇所にある。今のところ意図的に共通化していない:
//   - 共通化すると /fertility と /births が1つのファイルに依存することになり、
//     どちらか一方の見た目を触るともう一方に必ず影響が出る。扇形の2ページしか
//     無いうちは、影響範囲が閉じている方の価値が上回ると判断した
//   - 危ないのはコードの重複より「同じ文字列・同じ数値が2箇所にある」重複で
//     (../CLAUDE.md の「検査の穴」参照)、こちらは辞書もCSVも別物なので当たらない
// **3枚目の扇形ページを作るときは共通化する。** そのときは軸の描画と
// ラベル衝突回避を別ファイルに出し、ページ側は辞書と目盛りの規則だけ持つ形にする。

// このページが扱うのは出生数(人数)。合計特殊出生率(比率)は /fertility。
// 指標名(nameJa / nameEn)は home.js の INDICATOR_META と手で揃える。
const T = {
  ja: {
    back: "← 指標一覧",
    title: "出生数 — 歴代推計 vs 実績",
    desc: "国立社会保障・人口問題研究所「日本の将来推計人口」が版ごとに置いた出生数の推計(出生中位)を重ねたもの。線の色が薄いほど古い推計、濃いほど新しい推計。",
    // 範囲注記。/fertility の scopeNote と対になっていて、あちらは「出生率で
    // あって出生数ではない」、こちらは「出生数であって出生率ではない」と書く。
    // 基準の但し書きもここに置く(推計側に2つの基準が混じるのはこのページ固有の
    // 事情で、読む前に知っている必要がある)。原本はこの1箇所で、
    // bin/build.mjs の birthsScopeNote() が静的HTMLへ焼き込む。
    scopeNote:
      "このページが並べているのは年間の出生数（人数）であり、合計特殊出生率（1人の女性が生涯に産む子どもの数）ではない。出生率は「合計特殊出生率」のページにある。実績は人口動態統計の「日本における日本人」。推計のうち＊印を付けた版は日本に住む外国人を含む総人口ベースで、実績とは基準が異なる（差は2021年で約1.8万人＝出生数の約2%）。",
    chartAriaLabel: "出生数の歴代推計と実績",
    legendActual: "実績",
    vintageSuffix: "年推計",
    basisMark: "＊",
    sourceActualPrefix: "実績: ",
    footerSrc: "src: 国立社会保障・人口問題研究所「日本の将来推計人口」",
    footerAbout: "このサイトについて",
    footerContact: "お問い合わせ",
    // 軸ラベル。10000で割って「万」を付ける。
    axisUnit: (man) => `${man}万`,
    // ── 静的な数値表（bin/build.mjs が生成し、births.html に埋め込む）──
    // 表はJSでは組み立てない。理由は fertility.js の同じ位置のコメントを参照。
    tableToggle: (n) => `歴代推計と実績を表で見る（${n}年分）`,
    tableCaption: "出生数｜歴代推計(出生中位)と実績",
    thYear: "年",
    thActual: "実績",
    gapHead: "実績と重なる期間で見た、推計ごとの平均のズレ",
    gapLine: (label, n, mean, below, above) =>
      `${label}｜重なる${n}年で 平均 ${mean}（実績が下回った ${below}年 / 上回った ${above}年）`,
    tableRoundNote:
      "単位は人。空欄はその推計が扱っていない年。1992年推計・1997年推計は1000人単位で公表されているため下3桁が0になる。＊印の版は総人口ベース（上の注記を参照）。",
    tableCsvLabel: "元データ: ",
    chartNoscript: "グラフの描画には JavaScript が必要です。数値は下の表にあります。",
  },
  en: {
    back: "← Indicators",
    title: "Number of births — successive projections vs actual",
    desc: "Projected annual births (medium-fertility variant) from successive editions of NIPSSR's population projections, overlaid. Lighter lines are older projections; darker lines are more recent.",
    scopeNote:
      "What this page lays out is the annual number of births, not the total fertility rate (the average number of children a woman would bear over her lifetime), which has its own page. The actual series counts Japanese nationals in Japan, as published in the Vital Statistics. Projections marked with an asterisk are on a total-population basis that includes foreign residents, so their basis differs from the actual series (the gap was about 18,000 births — roughly 2% — in 2021).",
    chartAriaLabel: "Successive projections of annual births and the actual figure",
    legendActual: "Actual",
    vintageSuffix: " projection",
    basisMark: "*",
    sourceActualPrefix: "Actual: ",
    footerSrc: "src: NIPSSR / Population Projections for Japan",
    footerAbout: "About this site",
    footerContact: "Contact",
    axisUnit: (man) => `${(man / 100).toFixed(1)}M`,
    tableToggle: (n) => `Show the figures as a table (${n} years)`,
    tableCaption: "Annual births — each projection (medium-fertility variant) and the actual figure",
    thYear: "Year",
    thActual: "Actual",
    gapHead: "Mean gap per projection, over the years where an actual figure exists",
    gapLine: (label, n, mean, below, above) =>
      `${label} | mean ${mean} over ${n} overlapping years (actual below the projection in ${below}, above in ${above})`,
    tableRoundNote:
      "Figures are numbers of births. A blank cell means that projection does not cover that year. The 1992 and 1997 projections were published in thousands, so their last three digits are zeros. Projections marked with an asterisk are on a total-population basis (see the note above).",
    tableCsvLabel: "Source data: ",
    chartNoscript: "This chart requires JavaScript to draw. The figures are in the table below.",
  },
};

// 総人口ベース(日本における外国人を含む)の版に付ける印。実績は日本人ベース
// なので、この印が付いた版は実績と基準が違う。値は data/births_forecast.csv の
// forecast_basis 列の語彙で、`japanese` 以外はすべて印を付ける
// (知らない値が来たら「基準が揃っている」側に倒さない。bin/build.mjs の
// birthsBasisErrors() が語彙そのものを検査する)。
const BASIS_JAPANESE = "japanese";

function vintageLabel(vintageYear, lang, basis) {
  const t = T[lang];
  const mark = basis === BASIS_JAPANESE ? "" : t.basisMark;
  return `${vintageYear}${t.vintageSuffix}${mark}`;
}

// 表・凡例・ズレ一覧で共通に使う出生数の書式。3桁区切りの整数。
function fmtBirths(n) {
  return Math.round(n).toLocaleString("en-US");
}

// ズレの平均は符号付きで出す(実績 - 推計)。マイナス=実績が推計を下回った。
function fmtBirthsGap(n) {
  const r = Math.round(n);
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r).toLocaleString("en-US")}`;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

// consecutive-year runs only — a gap between runs must never be bridged by a
// straight line, or it fabricates a trend that was never measured
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
  // 言語はURL(=生成時に確定したdocument.documentElement.lang)が決める。
  let lang = document.documentElement.lang === "en" ? "en" : "ja";

  const [forecastRaw, actualRaw] = await Promise.all([
    loadCSV("/data/births_forecast.csv"),
    loadCSV("/data/births_actual.csv"),
  ]);

  const forecastRows = forecastRaw
    .map((r) => ({
      vintageYear: Number(r.vintage_year),
      targetYear: Number(r.target_year),
      births: toNum(r.projected_births),
      basis: r.forecast_basis,
    }))
    .filter((r) => r.births !== null);

  // 出典URL・注記の列はここでは読まない。出典行は bin/build.mjs が組み立てて
  // HTMLに埋めてある(fertility.js の同じ位置のコメントを参照)。
  const actualRows = actualRaw
    .map((r) => ({ year: Number(r.year), births: toNum(r.actual_births) }))
    .filter((r) => r.births !== null)
    .sort((a, b) => a.year - b.year);

  const vintages = [...new Set(forecastRows.map((r) => r.vintageYear))].sort((a, b) => a - b);
  const byVintage = vintages.map((vy) => {
    const rows = forecastRows
      .filter((r) => r.vintageYear === vy)
      .sort((a, b) => a.targetYear - b.targetYear);
    return { vintageYear: vy, basis: rows[0].basis, rows };
  });

  const allYears = forecastRows.map((r) => r.targetYear).concat(actualRows.map((r) => r.year));
  const xMin = Math.min(...allYears);
  const xMax = Math.max(...allYears);

  const allValues = forecastRows.map((r) => r.births).concat(actualRows.map((r) => r.births));
  const yStep = 200000;
  const yDomain = [
    Math.floor(Math.min(...allValues) / yStep) * yStep,
    Math.ceil(Math.max(...allValues) / yStep) * yStep,
  ];

  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;
  const xScale = (year) => PAD.left + ((year - xMin) / (xMax - xMin)) * innerW;
  const yScale = (val) => PAD.top + innerH - ((val - yDomain[0]) / (yDomain[1] - yDomain[0])) * innerH;

  const svg = document.getElementById("births-chart");
  svg.setAttribute("viewBox", `0 0 ${CHART_W} ${CHART_H}`);

  for (let y = Math.ceil(xMin / 10) * 10; y <= xMax; y += 10) {
    const x = xScale(y);
    svg.appendChild(svgEl("line", { class: "axis-line", x1: x, x2: x, y1: PAD.top, y2: CHART_H - PAD.bottom }));
    const label = svgEl("text", { class: "axis-label", x, y: CHART_H - PAD.bottom + 16, "text-anchor": "middle" });
    label.textContent = y;
    svg.appendChild(label);
  }

  const yLabels = [];
  for (let v = yDomain[0]; v <= yDomain[1]; v += yStep) {
    const y = yScale(v);
    svg.appendChild(svgEl("line", { class: "grid-line-y", x1: PAD.left, x2: CHART_W - PAD.right, y1: y, y2: y }));
    const label = svgEl("text", { class: "axis-label", x: PAD.left - 8, y: y + 3, "text-anchor": "end" });
    yLabels.push({ el: label, man: v / 10000 });
    svg.appendChild(label);
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // opacity scales with vintage age — same rule as /fertility: it says "how
  // long ago was this projected", not "how good was it".
  const opacityFor = (vy) => {
    const idx = vintages.indexOf(vy);
    const span = vintages.length - 1 || 1;
    return 0.2 + (idx / span) * 0.4;
  };

  const actualSegments = buildSegments(actualRows, "year");
  const actualPath = svgEl("path", {
    class: "line-actual",
    d: pathFromSegments(actualSegments, xScale, yScale, "year", "births"),
  });
  svg.appendChild(actualPath);
  actualSegments
    .filter((seg) => seg.length === 1)
    .forEach((seg) =>
      svg.appendChild(svgEl("circle", { class: "line-actual-dot", cx: xScale(seg[0].year), cy: yScale(seg[0].births), r: 1.75 }))
    );

  // end-of-line labels can land within a few px of each other — push
  // overlapping labels apart vertically so they stay legible
  const labelTargets = byVintage.map(({ vintageYear, rows }) => {
    const last = rows[rows.length - 1];
    return { vintageYear, x: xScale(last.targetYear) + 6, y: yScale(last.births) + 3 };
  });
  labelTargets.sort((a, b) => a.y - b.y);
  const MIN_LABEL_GAP = 12;
  for (let i = 1; i < labelTargets.length; i++) {
    if (labelTargets[i].y - labelTargets[i - 1].y < MIN_LABEL_GAP) {
      labelTargets[i].y = labelTargets[i - 1].y + MIN_LABEL_GAP;
    }
  }
  const maxLabelY = CHART_H - PAD.bottom - 4;
  const overflow = labelTargets[labelTargets.length - 1].y - maxLabelY;
  if (overflow > 0) labelTargets.forEach((l) => (l.y -= overflow));
  const labelYByVintage = new Map(labelTargets.map((l) => [l.vintageYear, l.y]));

  const vintagePaths = byVintage.map(({ vintageYear, rows }) => {
    const path = svgEl("path", {
      class: "line-forecast-vintage",
      d: `M ${rows.map((r) => `${xScale(r.targetYear)},${yScale(r.births)}`).join(" L ")}`,
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
    // state before the transition is attached (see fertility.js)
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
          ({ vintageYear, basis }) =>
            `<span class="legend-item"><span class="legend-swatch legend-swatch-vintage" style="opacity:${opacityFor(vintageYear).toFixed(2)}"></span>${vintageLabel(vintageYear, lang, basis)}</span>`
        )
        .join("")
    );
  }

  // 数値表と出典行は bin/build.mjs が data/*.csv から HTML に埋め込んでいる。
  // JSでは組み直さない(理由は fertility.js の同じ位置のコメントを参照)。
  function applyBuiltI18n() {
    document.querySelectorAll(".data-section [data-en], #births-source [data-en]").forEach((el) => {
      if (el.dataset.ja === undefined) el.dataset.ja = el.textContent;
      el.textContent = lang === "en" ? el.dataset.en : el.dataset.ja;
    });
  }

  function applyI18n() {
    const t = T[lang];
    document.getElementById("t-back").textContent = t.back;
    document.getElementById("births-title").textContent = t.title;
    document.getElementById("births-desc").textContent = t.desc;
    document.getElementById("births-scope-note").textContent = t.scopeNote;
    document.getElementById("births-chart").setAttribute("aria-label", t.chartAriaLabel);
    document.getElementById("t-footer-src").textContent = t.footerSrc;
    document.getElementById("t-footer-about").textContent = t.footerAbout;
    document.getElementById("t-footer-contact").textContent = t.footerContact;
    document.getElementById("births-legend").innerHTML = buildLegendHtml();
    yLabels.forEach(({ el, man }) => (el.textContent = t.axisUnit(man)));
    document.getElementById("lang-ja").classList.toggle("active", lang === "ja");
    document.getElementById("lang-en").classList.toggle("active", lang === "en");
    document.documentElement.lang = lang;
    applyBuiltI18n();
  }

  // lang-ja/lang-en は他ページのURLへの実リンク(<a>)。切り替えはブラウザの
  // 通常のナビゲーションに任せる(home.js の同じ変更のコメントを参照)。

  applyI18n();
}

main();
