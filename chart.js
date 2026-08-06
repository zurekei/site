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
    // Which pair of series the aggregate is counting, per metric.statsVocab.
    // Only "forecast" is a prediction: for the budget and plan indicators the
    // left-hand series is an appropriation or an issuance plan, so a revision
    // by supplementary budget is a decision, not a missed forecast, and the
    // wording must not describe it as one.
    gapVocab: {
      forecast: { above: "実績が見通しを上回った年", below: "下回った年", equal: "見通しどおり" },
      budget: { above: "決算が当初予算を上回った年", below: "下回った年", equal: "当初予算どおり" },
      plan: { above: "実績が当初計画を上回った年", below: "下回った年", equal: "当初計画どおり" },
    },
    gapSummaryAvg: "平均のズレ",
    gapSummaryCountPrefix: "対象",
    gapSummaryCountSuffix: "年度分",
    gapSummaryUnit: "回",
    // 実績がどの基準の系列かの呼称。gdp_forecast.csv の actual_basis(実績線が
    // 接いでいる2系列)と gdp_vintages.csv の basis(背景の帯の元になる6系列)は
    // 同じ語彙なので辞書も1つにしてある。`2015base-ref` は両方に出る同一の系列。
    basisLabels: {
      "1990base": "1990年基準",
      "1995base": "1995年基準",
      "2000base": "2000年基準",
      "2005base": "2005年基準",
      "2011base": "2011年基準",
      "2015base": "2015年基準",
      "2020base": "2020年基準",
      "2005base-ref": "2005年基準・参考系列",
      "2011base-ref": "2011年基準・参考系列",
      "2015base-ref": "2015年基準・参考系列",
      "2020base-final": "2020年基準・確報",
    },
    actualBasisPrefix: "実績の基準: ",
    forecastBasisLabels: { gnp: "GNPベース(国民総生産)", gdp: "GDPベース(国内総生産)" },
    forecastBasisPrefix: "見通しの基準: ",
    forecastEraBandLabel: "GNPベース期",
    vintageRangePrefix: "実績の改定幅(基準別): ",
    vintageSeriesSuffix: "系列",
    // 背景の帯の出典(bin/build.mjs が静的HTMLに埋める。JSでは組み立てない)。
    // 帯は基準別の系列を束ねたもので、行ごとの出典は data/gdp_vintages.csv が
    // 持つ。ここに置くのは基準ごとに1行へ畳んで見せるための文言だけ。
    vintageSourcePrefix: "背景の帯(実績の改定幅)の出典 — 基準別の系列:",
    // 初回確報(その年度の実績として最初に公表された値)。表の見出しと、年ごとの
    // 読み出しの両方で使う。
    firstRelease: "初回確報",
    firstReleasePrefix: "初回確報: ",
    firstReleaseDriftPrefix: "改定ドリフト(初回確報→実績): ",
    footerSrc: "src: 内閣府 / 国民経済計算(SNA)",
    footerAbout: "このサイトについて",
    footerContact: "お問い合わせ",
    // 静的な数値表(bin/build.mjs が生成)の見出し。見通し/実績/ズレ の3つは
    // 上の forecast/actual/gap をそのまま使うので、ここには無い分だけ置く。
    thYear: "年度",
    thSource: "出典",
    tableToggle: (n) => `年度ごとの数値を表で見る（${n}年度分）`,
    tableCaptionSuffix: "｜年度ごとの見通し・実績・ズレ",
    tableCsvLabel: "元データ: ",
    // 元データのリンクの隣に置く「引用のしかた」への導線(2026-07-31)。
    // build.mjs 側でも同じ文言を使う(fertilitySection())。写しを作らず
    // build.mjs が `const { T } = R` 経由でこのT自体を読むので、1箇所に
    // 定義すれば両方に効く。フッターに置かない理由(CLAUDE.mdの判断)は
    // build.mjs のコメントを参照。
    citeLinkText: "引用のしかた",
    // グラフの <noscript> 案内文。JSが動く限りこの文言はどこにも表示されず
    // applyI18n() からも参照されないため、これまで辞書に無く build.mjs に
    // 直書きされていた。/en/ ページを機械生成するには英語側の文言も要るため、
    // 2026-07-29にここへ移した(文言の出所を1箇所にする、という他のキーと
    // 同じ理由)。
    chartNoscript: "グラフの描画には JavaScript が必要です。数値は下の表にあります。",
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
    gapVocab: {
      forecast: { above: "Years actual came in above forecast", below: "below", equal: "matched the forecast" },
      budget: { above: "Years the settlement came in above the initial budget", below: "below", equal: "matched the initial budget" },
      plan: { above: "Years actual came in above the initial plan", below: "below", equal: "matched the initial plan" },
    },
    gapSummaryAvg: "mean gap",
    gapSummaryCountPrefix: "n=",
    gapSummaryCountSuffix: " fiscal years",
    gapSummaryUnit: "",
    basisLabels: {
      "1990base": "1990 base",
      "1995base": "1995 base",
      "2000base": "2000 base",
      "2005base": "2005 base",
      "2011base": "2011 base",
      "2015base": "2015 base",
      "2020base": "2020 base",
      "2005base-ref": "2005 base, reference series",
      "2011base-ref": "2011 base, reference series",
      "2015base-ref": "2015 base, reference series",
      "2020base-final": "2020 base, final",
    },
    actualBasisPrefix: "Actual basis: ",
    forecastBasisLabels: { gnp: "GNP basis", gdp: "GDP basis" },
    forecastBasisPrefix: "Forecast basis: ",
    forecastEraBandLabel: "GNP-basis era",
    vintageRangePrefix: "Revision range across bases: ",
    vintageSeriesSuffix: " vintages",
    vintageSourcePrefix: "Sources for the background band (the revision range), one series per statistical base year:",
    firstRelease: "First release",
    firstReleasePrefix: "First release: ",
    firstReleaseDriftPrefix: "Revision drift (first release → actual): ",
    footerSrc: "src: Cabinet Office of Japan / SNA",
    footerAbout: "About this site",
    footerContact: "Contact",
    thYear: "Fiscal year",
    thSource: "Source",
    tableToggle: (n) => `Show the figures as a table (${n} fiscal years)`,
    tableCaptionSuffix: " — forecast, actual and gap by fiscal year",
    tableCsvLabel: "Source data: ",
    citeLinkText: "How to cite",
    chartNoscript: "This chart requires JavaScript to draw. The figures are in the table below.",
  },
};

// このファイルは bin/build.mjs からも「そのまま」読み込まれ、指標ページの
// 静的HTMLを生成する側の唯一の定義になる。ビルド側に写しは無いので、指標を足す・
// 直すのはここだけでよい（表とグラフが違う数字を出す事故が原理的に起きない）。
// csv のパスがルート絶対なのは、ページが /chart/<key> に置かれているため。相対に
// 戻すと /chart/data/... を取りに行き、Pages は存在しないパスにもトップページの
// HTML を 200 で返すので、CSVのつもりでHTMLを読む壊れ方をする。
const METRICS = {
  "gdp-real": {
    title: "実質GDP成長率",
    titleEn: "Real GDP growth",
    desc: "内閣府「経済見通しと経済財政運営の基本的態度」の当初見通し(実質)と、同じく内閣府「国民経済計算(SNA)」の確定した実績を並べたもの。実質経済成長率とも呼ぶ。",
    descEn: "The government's initial forecast (real) laid alongside the confirmed actual. Also called the real economic growth rate.",
    note: "注: 1993年度以前の見通しはGNP(国民総生産)ベースで、実績のGDPとは概念が異なる(グラフ上は淡い帯でGNPベース期を示す)。実績は最新の改定値で、FY1994以前は2015年基準の参考系列(簡易遡及)、FY1995以降は2020年基準の確報を接いでいる(細い縦線で境目を示す)。当時公表された値とは異なる年度がある。背景の淡い帯は、実績値が基準改定でどれだけ動いたかの幅(基準別系列の最小〜最大)を示す。細い点線は初回確報、すなわちその年度の実績として最初に公表された値で、実績線との差が公表後の改定で動いた分にあたる。見通しとのズレのうち、どこまでが予測を外した分でどこからが実績が動いた分かは、この2本を見比べて読む。FY1999〜2002は当時の年版が内閣府のサイトに残っておらず、FY1997以前は年版そのものが無いため、この線は途切れる。",
    noteEn: "Note: forecasts through FY1993 are on a GNP basis, which differs in concept from the GDP actuals (shaded band). The actual line stitches two revised vintages—a 2015-base reference series through FY1994 and the 2020-base final series from FY1995 (the seam is marked by a thin vertical line)—so it differs from the figures published at the time in some years. The faint background ribbon shows how much the actual itself has been revised across statistical base-years (min–max across bases). The fine dotted line is the first release — the figure first published as that year's actual — so its distance from the actual line is how much the actual moved after publication. Reading the two together separates the part of the gap that was a forecasting miss from the part that was the actual moving. The line breaks for FY1999–2002, whose editions are no longer on the Cabinet Office's site, and before FY1998, for which no edition exists online.",
    archiveNote: "FY1997以前の実質GDP見通しは内閣府の見通しアーカイブ(FY1998年度分〜)には存在しない。経済企画庁長官の経済演説(国会会議録・衆議院本会議)から、FY1980〜1997の18年分を独自に収集した。",
    archiveNoteEn: "The real GDP forecast for FY1997 and earlier is not in the Cabinet Office's online forecast archive, which begins at FY1998. It was collected independently from the Diet record of the Director-General of the Economic Planning Agency's economic address to the House of Representatives, covering all 18 fiscal years from FY1980 through FY1997.",
    csv: "/data/gdp_forecast.csv",
    forecastCol: "forecast_real",
    actualCol: "actual_real",
    forecastSourceCol: "forecast_source_url",
    forecastSourceLabel: "実質",
    actualSourceCol: "actual_source_url",
    actualSourceLabel: "実質",
    vintageCsv: "/data/gdp_vintages.csv",
    // gdp_vintages.csv は1行=(年度 × 基準)の縦持ちなので、基準ごとに列を並べる
    // 必要が無く、読む列は実質/名目の1つだけでよい。出典URLの列名は
    // `<vintageCol>_source_url` として機械的に導く(bin/build.mjs の
    // vintageSourceHtml)。基準が増えても行が増えるだけで、ここは変わらない。
    vintageCol: "actual_real",
    // 初回確報(その年度の成長率として最初に公表された値)。vintageCsv が
    // 「後年に基準別へ推計し直した幅」なのに対し、こちらは「当時公表された値」
    // そのもので、実績線との差が改定ドリフトにあたる。出典URLの列名は
    // `<firstReleaseCol>_source_url` として機械的に導く(vintageCol と同じ規約)。
    firstReleaseCsv: "/data/gdp_first_release.csv",
    firstReleaseCol: "first_real",
    unit: "%",
  },
  "gdp-nominal": {
    title: "名目GDP成長率",
    titleEn: "Nominal GDP growth",
    desc: "内閣府「経済見通しと経済財政運営の基本的態度」の当初見通し(名目)と、同じく内閣府「国民経済計算(SNA)」の確定した実績を並べたもの。名目経済成長率とも呼ぶ。",
    descEn: "The government's initial forecast (nominal) laid alongside the confirmed actual. Also called the nominal economic growth rate.",
    note: "注: 1993年度以前の見通しはGNP(国民総生産)ベースで、実績のGDPとは概念が異なる(グラフ上は淡い帯でGNPベース期を示す)。実績は最新の改定値で、FY1994以前は2015年基準の参考系列(簡易遡及)、FY1995以降は2020年基準の確報を接いでいる(細い縦線で境目を示す)。当時公表された値とは異なる年度がある。背景の淡い帯は、実績値が基準改定でどれだけ動いたかの幅(基準別系列の最小〜最大)を示す。細い点線は初回確報、すなわちその年度の実績として最初に公表された値で、実績線との差が公表後の改定で動いた分にあたる。見通しとのズレのうち、どこまでが予測を外した分でどこからが実績が動いた分かは、この2本を見比べて読む。FY1999〜2002は当時の年版が内閣府のサイトに残っておらず、FY1997以前は年版そのものが無いため、この線は途切れる。",
    noteEn: "Note: forecasts through FY1993 are on a GNP basis, which differs in concept from the GDP actuals (shaded band). The actual line stitches two revised vintages—a 2015-base reference series through FY1994 and the 2020-base final series from FY1995 (the seam is marked by a thin vertical line)—so it differs from the figures published at the time in some years. The faint background ribbon shows how much the actual itself has been revised across statistical base-years (min–max across bases). The fine dotted line is the first release — the figure first published as that year's actual — so its distance from the actual line is how much the actual moved after publication. Reading the two together separates the part of the gap that was a forecasting miss from the part that was the actual moving. The line breaks for FY1999–2002, whose editions are no longer on the Cabinet Office's site, and before FY1998, for which no edition exists online.",
    archiveNote: "FY1997以前の名目GDP見通しも内閣府の見通しアーカイブには存在しない。FY1982〜1987は国会会議録の委員会質疑・政府答弁から、FY1989〜1997は財務省『平成財政史』の記述から、FY1988は同じく財務省『昭和財政史(昭和49〜63年度)』の記述から収集した。",
    archiveNoteEn: "The nominal GDP forecast for FY1997 and earlier is likewise absent from the Cabinet Office's archive. FY1982–1987 was collected from Diet committee questioning and government responses, FY1989–1997 from the Ministry of Finance's Heisei Zaisei-shi (Fiscal History of the Heisei Era), and FY1988 from the same ministry's Showa Zaisei-shi (Fiscal History of the Showa Era, FY1974–1988).",
    csv: "/data/gdp_forecast.csv",
    forecastCol: "forecast_nominal",
    actualCol: "actual_nominal",
    forecastSourceCol: "forecast_source_url",
    forecastSourceLabel: "名目",
    actualSourceCol: "actual_source_url",
    actualSourceLabel: "名目",
    vintageCsv: "/data/gdp_vintages.csv",
    vintageCol: "actual_nominal",
    firstReleaseCsv: "/data/gdp_first_release.csv",
    firstReleaseCol: "first_nominal",
    unit: "%",
  },
  "unemployment": {
    title: "完全失業率",
    titleEn: "Unemployment rate",
    desc: "内閣府の経済見通しにおける完全失業率の見込みと、総務省統計局「労働力調査」年度平均による確定した実績を並べたもの。",
    descEn: "The government's initial forecast laid alongside the confirmed actual.",
    csv: "/data/unemployment_forecast.csv",
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
    desc: "内閣府の経済見通しにおける経常収支の見込みと、財務省「国際収支状況」年度別時系列による確定した実績を並べたもの。",
    descEn: "The government's initial forecast laid alongside the confirmed actual.",
    csv: "/data/current_account_forecast.csv",
    forecastCol: "forecast_tn",
    actualCol: "actual_tn",
    forecastSourceCol: "forecast_source_url",
    actualSourceCol: "actual_source_url",
    unit: "兆円",
    // "trillion yen" は表のセルで幅を取りすぎる(このデータの最大値は250超)ので、
    // %/pt に倣い数値へ直接続けて読める短い接尾辞にする。空白は数値と単位の間には
    // 置かず(既存の "pt" と同じ流儀)、単位内の語の間にだけ置く: "23.7tn yen"。
    unitEn: "tn yen",
    signed: false,
  },
  "tax-revenue": {
    title: "一般会計税収",
    titleEn: "Tax revenue",
    desc: "財務省「一般会計税収の予算額と決算額の推移」の当初予算額と、同資料による決算額(直近年度は確定前の概数)を並べたもの。",
    descEn: "The Ministry of Finance's initial budget estimate for tax revenue, laid alongside the confirmed settlement figure.",
    csv: "/data/tax_revenue_forecast.csv",
    forecastCol: "forecast_tn",
    actualCol: "actual_tn",
    forecastSourceCol: "forecast_source_url",
    actualSourceCol: "actual_source_url",
    unit: "兆円",
    unitEn: "tn yen",
    signed: false,
    statsVocab: "budget",
  },
  "bond-issuance": {
    title: "国債発行額(一般会計)",
    titleEn: "Government bond issuance",
    desc: "財務省の当初予算における公債発行予定額(いわゆる新規国債発行額)と、決算における実績発行額を並べたもの。復興債・年金特例公債など別枠区分の公債は含まない(原資料の区分に従う)。",
    descEn: "The Ministry of Finance's initial budget plan for new government bond issuance, laid alongside the actual issuance recorded in the settlement. Bonds tracked in separate categories, such as reconstruction bonds or pension special-issue bonds, are not included, following the classification used in the primary source.",
    csv: "/data/bond_issuance_forecast.csv",
    forecastCol: "forecast_tn",
    actualCol: "actual_tn",
    forecastSourceCol: "forecast_source_url",
    actualSourceCol: "actual_source_url",
    unit: "兆円",
    unitEn: "tn yen",
    signed: false,
    gapLabel: { ja: "当初予算に計画なし", en: "No issuance planned in the initial budget" },
    statsVocab: "budget",
    // FY1947-1964 are all 0 planned vs 0 issued (Japan issued no bonds in that
    // era). Counting them as years the budget was met exactly would inflate the
    // total to 77 and bury the actual record, so the aggregate starts at the
    // first year with a planned issuance. The chart itself still draws the full
    // series from FY1947.
    statsFromYear: 1965,
    statsScopeNote: {
      ja: "※国債の発行がなかったFY1964以前を除く",
      en: "(excludes FY1964 and earlier, when no bonds were issued)",
    },
  },
  "jgb-total": {
    title: "国債発行総額",
    titleEn: "Total JGB issuance",
    desc: "財務省の当初の国債発行計画(総額)と、実績の発行総額を並べたもの。建設国債・特例国債・復興債等・財投債・借換債を含む(収入金ベース、原資料の区分に従う)。",
    descEn: "The Ministry of Finance's initial JGB issuance plan (total), laid alongside actual total issuance. Includes construction bonds, deficit-financing bonds, reconstruction and other special bonds, FILP bonds, and refunding bonds (revenue basis, following the classification used in the primary source).",
    csv: "/data/jgb_total_issuance_forecast.csv",
    forecastCol: "forecast_tn",
    actualCol: "actual_tn",
    forecastSourceCol: "forecast_source_url",
    actualSourceCol: "actual_source_url",
    unit: "兆円",
    unitEn: "tn yen",
    signed: false,
    statsVocab: "plan",
  },
  cpi: {
    title: "消費者物価(総合)の上昇率",
    titleEn: "Consumer price inflation (CPI)",
    desc: "内閣府の経済見通しにおける消費者物価(総合)の上昇率の見込みと、総務省統計局「消費者物価指数」年度平均の前年度比による確定した実績を並べたもの。いわゆる物価上昇率。",
    descEn: "The government's initial forecast for the rate of consumer price inflation, laid alongside the confirmed year-on-year change published by the Ministry of Internal Affairs and Communications' Statistics Bureau.",
    archiveNote: "FY1997以前の消費者物価見通しも内閣府の見通しアーカイブには存在しないため、同じ経済演説から収集した。演説が消費者物価にふれない年度(FY1989、FY1993〜1997)は、同じ閣議決定を予算委員会で説明した経済企画庁調整局長の発言から収集している。",
    archiveNoteEn: "The consumer price forecast for FY1997 and earlier is likewise absent from the Cabinet Office's archive; it was collected from the same economic addresses. For years the address did not mention consumer prices (FY1989, FY1993–1997), the figure comes from the Economic Planning Agency's presentation of the same Cabinet decision to the Diet's Budget Committee.",
    csv: "/data/cpi_forecast.csv",
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

// この関数だけが METRICS の unit/unitEn を解決する唯一の経路(静的HTMLも実行時の
// 描画も loadModule 経由でこの1つの chart.js を評価するので、ここを直せば両方
// 直る)。% のように日英で同じ単位は unitEn を省略してよいが、その省略を
// 「書き忘れ」と区別する必要がある。unit 自体が ASCII のみ(=そもそも訳が要らない
// 記号)ならフォールバックしてよいが、unit に日本語(非ASCII)が混じっているのに
// unitEn が無い場合は、英語ページへ日本語の単位がそのまま漏れる書き忘れなので、
// 黙って通さずここで止める(2026-07-30、兆円が/en/へ漏れていた件の再発防止)。
function metricUnit(metric, lang) {
  if (lang !== "en") return metric.unit;
  if (metric.unitEn) return metric.unitEn;
  if (/[^\x00-\x7f]/.test(metric.unit)) {
    throw new Error(`metric unit "${metric.unit}" has no unitEn for the English page`);
  }
  return metric.unit;
}

// unit used for the aggregate mean-gap figure: percentage-point metrics
// read "pt" (matching the per-year gap readout), amount metrics keep their
// own (language-appropriate) unit.
function gapUnitSuffix(metric, lang) {
  return metric.unit === "%" ? "pt" : metricUnit(metric, lang);
}

// one-line summary of how often, and by how much, the actual has diverged
// from the forecast — computed from computeGapStats() (csv.js), which only
// counts fiscal years where both a forecast and an actual exist. Returns ""
// when there are no such years, so the caller can hide the line entirely
// rather than show a fabricated "0 out of 0".
function gapSummaryText(stats, metric, lang) {
  if (!stats) return "";
  const t = T[lang];
  const vocab = t.gapVocab[metric.statsVocab] || t.gapVocab.forecast;
  const unit = gapUnitSuffix(metric, lang);
  // signed mean (実績 − 見通し の規約通り), same sign convention as the
  // per-year gap readout — not a magnitude. Round before reading the sign so a
  // mean that rounds to zero prints "±0.0" instead of a misleading "-0.0".
  const rounded = Math.round(stats.meanGap * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "±";
  const avg = `${sign}${Math.abs(rounded).toFixed(1)}`;
  const item = lang === "ja"
    ? (label, n) => `${label} ${n}${t.gapSummaryUnit}`
    : (label, n) => `${label}: ${n}`;

  const parts = [item(vocab.above, stats.above), item(vocab.below, stats.below)];
  // ties are printed only when there are any: most indicators have none, and a
  // "0回" would be noise. When they exist the count is required, otherwise
  // above + below silently falls short of the stated total.
  if (stats.equal > 0) parts.push(item(vocab.equal, stats.equal));
  parts.push(`${t.gapSummaryAvg} ${avg}${unit}`);
  parts.push(`${t.gapSummaryCountPrefix}${stats.count}${t.gapSummaryCountSuffix}`);

  // per-metric note explaining a restricted counting window (metric.statsFromYear)
  const scope = metric.statsScopeNote ? ` ${metric.statsScopeNote[lang]}` : "";
  return parts.join(" / ") + scope;
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
  // Which indicator this page is comes from the document, not the URL: the page
  // was generated for exactly one metric and says so on <body data-metric>.
  // Reading it from the path instead would break the moment the URL shape
  // changes, and there is nothing to fall back to here — a page with no
  // data-metric is a build error, not a user typing a bad address, so bail
  // loudly rather than silently rendering the wrong indicator's numbers under
  // another indicator's heading and table.
  const metricKey = document.body.dataset.metric;
  const metric = METRICS[metricKey];
  if (!metric) {
    console.error(`unknown metric on <body data-metric>: ${metricKey}`);
    return;
  }

  // 言語はURL(=生成時に確定したdocument.documentElement.lang)が決める。詳細は
  // home.js の同じ変更のコメントを参照(2026-07-29、/en/ページ追加時)。
  let lang = document.documentElement.lang === "en" ? "en" : "ja";

  const rawRows = await loadCSV(metric.csv);
  const rows = rawRows
    .map((r) => ({
      year: Number(r.fiscal_year),
      forecastVal: toNum(r[metric.forecastCol]),
      actualVal: toNum(r[metric.actualCol]),
      forecastSourceUrl: extractSourceUrl(r[metric.forecastSourceCol], metric.forecastSourceLabel),
      actualSourceUrl: extractSourceUrl(r[metric.actualSourceCol], metric.actualSourceLabel),
      notes: r.notes || "",
      basis: r.actual_basis || "",
      forecastBasis: r.forecast_basis || "",
    }))
    .sort((a, b) => a.year - b.year);

  // vintage envelope data (optional, per-metric): min–max of the actual across
  // statistical base-years, for years where >=2 base vintages exist. Keyed by year.
  // 縦持ち(1行=年度×基準)なので、年ごとに畳んでから幅を取る。
  const vintageByYear = new Map();
  if (metric.vintageCsv) {
    const vrows = await loadCSV(metric.vintageCsv);
    const byYear = new Map();
    vrows.forEach((vr) => {
      const v = toNum(vr[metric.vintageCol]);
      if (v === null) return;
      const year = Number(vr.fiscal_year);
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year).push(v);
    });
    byYear.forEach((vals, year) => {
      if (vals.length >= 2) {
        vintageByYear.set(year, { min: Math.min(...vals), max: Math.max(...vals), count: vals.length });
      }
    });
  }

  // first-release data (optional, per-metric): the growth rate as it was first
  // published for that fiscal year. Keyed by year.
  // 年版(確報)ごとに1行なので畳む処理は要らない。収録が飛ぶ年度があるため
  // (FY1999〜2002の年版はウェブ上に残っていない)、線は連続しているとは限らない。
  const firstReleaseByYear = new Map();
  if (metric.firstReleaseCsv) {
    const frows = await loadCSV(metric.firstReleaseCsv);
    frows.forEach((fr) => {
      const v = toNum(fr[metric.firstReleaseCol]);
      if (v === null) return;
      firstReleaseByYear.set(Number(fr.fiscal_year), { val: v, basis: fr.release_basis || "" });
    });
  }

  const actualPoints = rows.filter((r) => r.actualVal !== null);
  const forecastYears = rows.filter((r) => r.forecastVal !== null);

  // aggregate over/under counts for the whole series (not the selected year),
  // computed once — see computeGapStats() in csv.js. metric.statsFromYear, where
  // set, narrows the window; the note explaining why is shown alongside.
  const gapStats = computeGapStats(rows, "forecastVal", "actualVal", { fromYear: metric.statsFromYear });

  const allYears = rows.map((r) => r.year);
  const xMin = Math.min(...allYears);
  const xMax = Math.max(...allYears);

  const vintageExtremes = [...vintageByYear.values()].flatMap((v) => [v.min, v.max]);
  const firstReleaseValues = [...firstReleaseByYear.values()].map((f) => f.val);
  const allValues = rows
    .flatMap((r) => [r.forecastVal, r.actualVal])
    .filter((v) => v !== null)
    .concat(vintageExtremes, firstReleaseValues);
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

  // background band marking the era whose forecasts are on a different conceptual
  // basis (GNP vs GDP) — data-driven via forecast_basis, so metrics without the
  // distinction draw no band. Drawn first so grid and data lines sit on top.
  let basisBandLabel = null;
  const gnpForecastYears = forecastYears.filter((p) => p.forecastBasis === "gnp");
  if (gnpForecastYears.length > 0) {
    const halfYearPx = innerW / (xMax - xMin) / 2;
    const bandX1 = Math.max(PAD.left, xScale(gnpForecastYears[0].year) - halfYearPx);
    const bandX2 = xScale(gnpForecastYears[gnpForecastYears.length - 1].year) + halfYearPx;
    svg.appendChild(svgEl("rect", { class: "basis-band", x: bandX1, y: PAD.top, width: bandX2 - bandX1, height: innerH }));
    basisBandLabel = svgEl("text", { class: "basis-band-label", x: bandX1 + 6, y: PAD.top + 12, "text-anchor": "start" });
    basisBandLabel.textContent = T[lang].forecastEraBandLabel;
    svg.appendChild(basisBandLabel);
  }

  // vintage envelope: how much the actual itself has been revised across
  // statistical base-years. A faint min–max ribbon drawn behind the grid and
  // data lines, over contiguous runs of years that have >=2 base vintages.
  if (vintageByYear.size > 0) {
    const vYears = [...vintageByYear.keys()].sort((a, b) => a - b);
    const runs = [];
    let run = [];
    vYears.forEach((y) => {
      if (run.length && y - run[run.length - 1] > 1) { runs.push(run); run = []; }
      run.push(y);
    });
    if (run.length) runs.push(run);
    runs.forEach((r) => {
      if (r.length < 2) return;
      const top = r.map((y) => `${xScale(y)},${yScale(vintageByYear.get(y).max)}`);
      const bottom = r.slice().reverse().map((y) => `${xScale(y)},${yScale(vintageByYear.get(y).min)}`);
      svg.appendChild(svgEl("path", { class: "vintage-band", d: `M ${top.join(" L ")} L ${bottom.join(" L ")} Z` }));
    });
  }

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
    label.textContent = `${v}${metricUnit(metric, lang)}`;
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

  // 初回確報の線。実績線より先に描いて下に敷く(手前に来るべきなのは今の実績で、
  // これはその手前の姿)。収録の飛び(FY1999〜2002)は buildSegments が分割するので、
  // 繋がっていない年度が繋がって見えることはない。
  if (firstReleaseByYear.size > 0) {
    const frPoints = [...firstReleaseByYear.entries()]
      .map(([year, f]) => ({ year, firstVal: f.val }))
      .sort((a, b) => a.year - b.year);
    const frSegments = buildSegments(frPoints);
    svg.appendChild(svgEl("path", { class: "line-first-release", d: pathFromSegments(frSegments, "firstVal") }));
    frSegments
      .filter((seg) => seg.length === 1)
      .forEach((seg) => {
        svg.appendChild(
          svgEl("circle", { class: "line-first-release-dot", cx: xScale(seg[0].year), cy: yScale(seg[0].firstVal), r: 1.75 })
        );
      });
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
    // actual series may stitch multiple statistical vintages (e.g. GDP: a
    // 2015-base reference series through FY1994, then the 2020-base final
    // series from FY1995). Draw each vintage separately so the basis change
    // reads as a break rather than a smooth—and misleading—continuous line.
    const refPoints = actualPoints.filter((p) => p.basis === "2015base-ref");
    const mainPoints = actualPoints.filter((p) => p.basis !== "2015base-ref");
    if (mainPoints.length > 0) {
      svg.appendChild(svgEl("path", { class: "line-actual", d: pathFromSegments(buildSegments(mainPoints), "actualVal") }));
    }
    if (refPoints.length > 0) {
      svg.appendChild(svgEl("path", { class: "line-actual-ref", d: pathFromSegments(buildSegments(refPoints), "actualVal") }));
    }
    // faint seam marker at the basis boundary
    if (refPoints.length > 0 && mainPoints.length > 0) {
      const seamX = (xScale(refPoints[refPoints.length - 1].year) + xScale(mainPoints[0].year)) / 2;
      svg.appendChild(svgEl("line", { class: "seam-line", x1: seamX, x2: seamX, y1: PAD.top, y2: CHART_H - PAD.bottom }));
    }

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

    vForecast.textContent = fmtVal(r.forecastVal, metricUnit(metric, lang), metric.signed);

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

      vActual.textContent = fmtVal(r.actualVal, metricUnit(metric, lang), metric.signed);
      const diff = r.actualVal - r.forecastVal;
      vDiff.textContent = `${diff > 0 ? "+" : ""}${diff.toFixed(1)}${gapUnitSuffix(metric, lang)}`;
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
    if (r.forecastBasis && T[lang].forecastBasisLabels[r.forecastBasis]) links.push(`${T[lang].forecastBasisPrefix}${T[lang].forecastBasisLabels[r.forecastBasis]}`);
    if (actualUrl) links.push(`${T[lang].actualSourcePrefix}<a href="${escapeHTML(actualUrl)}" target="_blank" rel="noopener">${escapeHTML(actualUrl)}</a>`);
    if (r.basis && T[lang].basisLabels[r.basis]) links.push(`${T[lang].actualBasisPrefix}${T[lang].basisLabels[r.basis]}`);
    // 初回確報と、そこから今の実績までの動き(改定ドリフト)。見通しとのズレが
    // 「予測を外した分」と「実績が動いた分」のどちらなのかは、この2つを並べて
    // 初めて読める。
    const fr = firstReleaseByYear.get(r.year);
    if (fr) {
      const u = metricUnit(metric, lang);
      links.push(`${T[lang].firstReleasePrefix}${fmtVal(fr.val, u, metric.signed)}`);
      if (r.actualVal !== null) {
        const drift = r.actualVal - fr.val;
        links.push(
          `${T[lang].firstReleaseDriftPrefix}${drift > 0 ? "+" : ""}${drift.toFixed(1)}${gapUnitSuffix(metric, lang)}`
        );
      }
    }
    const vRange = vintageByYear.get(r.year);
    if (vRange) {
      const u = metricUnit(metric, lang);
      // 〜(波ダッシュ)は日本語の範囲表記なので、英語ページでは en dash に
      // 差し替える(単位そのものと同じく、レンダリングされる文字列自体が
      // 言語ごとに変わるべき箇所)。
      const rangeSep = lang === "ja" ? "〜" : "–";
      links.push(`${T[lang].vintageRangePrefix}${vRange.min.toFixed(1)}${u}${rangeSep}${vRange.max.toFixed(1)}${u} (${vRange.count}${T[lang].vintageSeriesSuffix})`);
    }
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

  // The numbers table is written into the HTML at build time, in Japanese, so the
  // page carries its data without JS — that is the whole reason it exists. What
  // JS adds is only the language switch: retranslate the parts that are words,
  // and leave the figures and source URLs alone (they are language-independent).
  // Nothing here rebuilds or re-reads the table, so the table a crawler sees and
  // the table a reader sees are the same rows.
  const dataTable = document.querySelector(".data-table");

  function applyTableI18n() {
    if (!dataTable) return;
    const t = T[lang];
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set("t-th-year", t.thYear);
    set("t-th-forecast", t.forecast);
    set("t-th-actual", t.actual);
    set("t-th-gap", t.gap);
    set("t-th-source", t.thSource);
    set("t-table-csv", t.tableCsvLabel);
    set("t-cite-link", t.citeLinkText);
    set("t-table-caption", (lang === "ja" ? metric.title : metric.titleEn) + t.tableCaptionSuffix);

    const yearCells = dataTable.querySelectorAll("th[data-year]");
    set("t-table-toggle", t.tableToggle(yearCells.length));
    yearCells.forEach((el) => { el.textContent = fmtFY(Number(el.dataset.year), lang); });

    // cells that hold a phrase instead of a number, keyed by why the value is absent
    const placeholder = {
      pending: t.actualPending,
      unavailable: t.actualUnavailable,
      gap: gapLabelText(metric, lang),
    };
    dataTable.querySelectorAll("[data-ph]").forEach((el) => {
      el.textContent = placeholder[el.dataset.ph] ?? el.textContent;
    });
    const srcLabel = { forecast: t.forecast, actual: t.actual, "first-release": t.firstRelease };
    dataTable.querySelectorAll("a[data-src]").forEach((el) => {
      el.textContent = srcLabel[el.dataset.src] ?? el.textContent;
    });
  }

  function applyI18n() {
    const t = T[lang];
    document.getElementById("chart-title").textContent = lang === "ja" ? metric.title : metric.titleEn;
    document.getElementById("chart-desc").textContent = lang === "ja" ? metric.desc : metric.descEn;
    const noteEl = document.getElementById("chart-note");
    const noteText = lang === "ja" ? metric.note : metric.noteEn;
    if (noteText) {
      noteEl.textContent = noteText;
      noteEl.hidden = false;
    } else {
      noteEl.hidden = true;
    }
    document.getElementById("t-back").textContent = t.back;
    document.getElementById("t-stat-forecast").textContent = t.forecast;
    document.getElementById("t-stat-actual").textContent = t.actual;
    document.getElementById("t-stat-gap").textContent = t.gap;
    document.getElementById("t-footer-src").textContent = t.footerSrc;
    document.getElementById("t-footer-about").textContent = t.footerAbout;
    document.getElementById("t-footer-contact").textContent = t.footerContact;
    const summaryEl = document.getElementById("chart-summary");
    if (summaryEl) {
      const summaryText = gapSummaryText(gapStats, metric, lang);
      summaryEl.textContent = summaryText;
      summaryEl.hidden = !summaryText;
    }
    const archiveEl = document.getElementById("archive-note");
    if (archiveEl) {
      const archiveText = lang === "ja" ? metric.archiveNote : metric.archiveNoteEn;
      archiveEl.textContent = archiveText || "";
      archiveEl.hidden = !archiveText;
    }
    if (actualLabel) actualLabel.textContent = t.actual;
    if (basisBandLabel) basisBandLabel.textContent = t.forecastEraBandLabel;
    forecastLabel.textContent = t.forecast;
    gapLabelEls.forEach((el) => { el.textContent = gapLabelText(metric, lang); });
    document.getElementById("lang-ja").classList.toggle("active", lang === "ja");
    document.getElementById("lang-en").classList.toggle("active", lang === "en");
    document.documentElement.lang = lang;
    applyTableI18n();
    render(currentIdx);
  }

  // lang-ja/lang-en は他ページの URL への実リンク(<a>)。切り替えはブラウザの通常の
  // ナビゲーションに任せるので、クリック自体にJSは要らない(以前はlocalStorageに
  // 選択を書き込んでいたが、読み返す処理がどこにも無い書くだけの死んだコードだった
  // ため2026-07-30に削除。詳細はhome.jsの同じ変更のコメントを参照)。

  applyI18n();
}

main();
