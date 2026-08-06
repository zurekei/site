// このファイルは contact.js/about.js と同じ構造(document.documentElement.lang で
// 言語を決め、静的HTMLに焼いた地の文をJSが同じ値で再適用する)を踏襲している。
// 本文はJA/EN ともビルド時点で静的HTMLに焼き込み済みなので、ここでのi18n適用は
// 見た目には何も変えない冪等な処理だが、T.ja/T.en を「唯一の文言の原本」にして
// bin/build.mjs の handwrittenJaDriftErrors() がJA静的HTMLとの食い違いを検査
// できるようにするための仕組み(このリポジトリ全体の方針。about.jsの同じ変更の
// コメントを参照)。
const T = {
  ja: {
    back: "← 指標一覧",
    title: "引用のしかた",
    lead: "このサイトのデータと本文は、出典を示せば自由に使えます（CC BY 4.0）。事前の連絡や許諾は要りません。",

    h2Primary: "まず一次資料を",
    primaryP1:
      'このサイトの数値は、すべて政府の公表資料からの転記です。各ページの表には、行ごとに出典のURLとページ番号が入っています。数値そのものを引くときは、できるだけ一次資料を当たってください。転記には誤りが混じりえます（見つかったものは消さずに<a href="/corrections">訂正履歴</a>に記録しています）。',
    primaryP2:
      "ズレ計を引くのが適しているのは、数値そのものよりも、見通しと実績の対応づけ・並べ方・その期間の記録のほうです。",

    h2Format: "引用の書き方",
    formatIntro: "3つの粒度を、そのままコピーして使える形で示します。",
    exampleSiteLabel: "サイト全体",
    exampleSite: "ズレ計『政府経済見通しと実績のズレ』https://zurekei.org（参照 YYYY-MM-DD）",
    examplePageLabel: "個別のページ",
    examplePage: "ズレ計「一般会計税収」https://zurekei.org/chart/tax-revenue（参照 YYYY-MM-DD）",
    exampleDataLabel: "データを直接",
    exampleData: "ズレ計 tax_revenue_forecast.csv https://zurekei.org/data/tax_revenue_forecast.csv（参照 YYYY-MM-DD）",
    exampleNote: "YYYY-MM-DDの部分は、実際にご覧になった日付（例: 2026-07-31）に置き換えてください。",
    dateNote:
      "参照日は必ず書いてください。このサイトは政府の公表に合わせて年に数回更新され、確報が出れば過去の行も書き換わります。参照日が無いと、見た数値がどの確定段階のものか後から特定できません。",

    h2Data: "データの直リンク",
    dataIntro:
      'data/ 以下で公開しているCSVファイルへの直リンクです。列の意味は<a href="/data/README.md" target="_blank" rel="noopener">data/README.md</a>を参照してください。',
    thFile: "ファイル",
    thContent: "内容",
    thPage: "対応ページ",

    h2License: "ライセンスの内訳",
    licenseIntro:
      'このサイトのライセンスの内訳は次のとおりです。詳細は<a href="/about">このサイトについて</a>のライセンス節、<a href="https://zurekei.org/LICENSE" target="_blank" rel="noopener">LICENSE</a>・<a href="https://zurekei.org/LICENSE-DATA" target="_blank" rel="noopener">LICENSE-DATA</a>・<a href="https://zurekei.org/NOTICE" target="_blank" rel="noopener">NOTICE</a>を参照してください。',
    licenseList:
      // 「など」を落とさないこと。CLAUDE.mdの決めどおり、対象リストは網羅一覧では
      // なく例示として書く(限定列挙に読めると、挙げ忘れたものを自ら権利放棄した
      // ように見える)。項目は about.js の licenseBody と揃えてある。
      '<li>サイトが作った部分（指標の選定と並べ方、注記、見直し条項の検討状況の分類、出典URLの対応づけ、本文など）: <a href="https://creativecommons.org/licenses/by/4.0/deed.ja" target="_blank" rel="noopener">CC BY 4.0</a></li><li>個々の数値: 事実であり著作権の対象ではないため、CC BYの対象に含めていません</li><li><a href="/hoan">見直し条項</a>ページの条文原文: 著作権法13条により著作権の対象外です</li><li>コード: <a href="https://zurekei.org/LICENSE" target="_blank" rel="noopener">MIT</a></li><li>引用元の一次資料（政府刊行物・PDF等）の権利: 各公表元にあります</li><li>表示は「ズレ計 (https://zurekei.org)」のように</li>',

    h2Urls: "URLは壊しません",
    urlsP1: "正規のURLは拡張子なしの形です（例: /chart/tax-revenue）。",
    urlsP2:
      "/chart?m=... の旧形式はJavaScriptで転送されますが、引用にはこちらではなく正規のURLを使ってください。転送はJavaScriptによるものなので、JavaScriptを実行しないクローラやSNSのプレビューはたどれず、指標一覧ページに着いてしまいます。",

    h2Errors: "誤りを見つけたら",
    errorsP1:
      'データや本文の誤りに気づいたら<a href="/contact">お問い合わせフォーム</a>からご連絡ください。訂正は値を消さずに<a href="/corrections">訂正履歴</a>に記録します。',

    footerIndex: "指標一覧へ",
    footerCorrections: "訂正履歴",
    footerAbout: "このサイトについて",
  },
  en: {
    back: "← Indicators",
    title: "How to cite",
    lead: "The data and text on this site are free to use with attribution (CC BY 4.0). No advance notice or permission is required.",

    h2Primary: "Check the primary source first",
    primaryP1:
      'Every figure on this site is transcribed from a government publication. Each page’s table carries a source URL and page number for every row. When citing a figure itself, please go to the primary source where possible. Transcription errors can happen — any we find are recorded, not deleted, in the <a href="/en/corrections">corrections log</a>.',
    primaryP2:
      "What zurekei is best cited for isn't the bare figures so much as the pairing of forecast and actual, how they're laid out, and the ongoing record over time.",

    h2Format: "How to cite",
    formatIntro: "Three levels of granularity, each in a form you can copy directly.",
    exampleSiteLabel: "The site as a whole",
    // 題名は実際のページの <title> / h1 をそのまま使う。ここで「それらしい英題」を
    // 作ると、引用の正確さを説くページが、サイトのどこにも無い題名を配ることになる
    // (2026-07-31のレビューで実際にそうなっていた)。
    exampleSite: 'Zurekei, "The gap between government forecasts and actual outcomes," https://zurekei.org/en/ (accessed YYYY-MM-DD)',
    examplePageLabel: "A single page",
    examplePage: 'Zurekei, "Tax revenue," https://zurekei.org/en/chart/tax-revenue (accessed YYYY-MM-DD)',
    exampleDataLabel: "The data directly",
    exampleData: "Zurekei, tax_revenue_forecast.csv, https://zurekei.org/data/tax_revenue_forecast.csv (accessed YYYY-MM-DD)",
    exampleNote: "Replace YYYY-MM-DD above with the date you actually viewed the page (e.g. 2026-07-31).",
    dateNote:
      "Please always include the access date. This site is updated a few times a year to match government releases, and once a final figure is published, past rows get rewritten. Without an access date, there's no way to later tell which finalization stage the figure you saw belonged to.",

    h2Data: "Data files, linked directly",
    dataIntro:
      'Direct links to the CSV files published under data/. See <a href="https://zurekei.org/data/README.md" target="_blank" rel="noopener">data/README.md</a> for what each column means.',
    thFile: "File",
    thContent: "Contents",
    thPage: "Page",

    h2License: "License, broken down",
    licenseIntro:
      'Here is the licensing breakdown for this site. For more detail, see the license section on <a href="/en/about">About this site</a>, or <a href="https://zurekei.org/LICENSE" target="_blank" rel="noopener">LICENSE</a>, <a href="https://zurekei.org/LICENSE-DATA" target="_blank" rel="noopener">LICENSE-DATA</a>, and <a href="https://zurekei.org/NOTICE" target="_blank" rel="noopener">NOTICE</a>.',
    licenseList:
      '<li>The part this site made (such as which indicators were picked and how they’re laid out, the annotations and the classification of each review clause’s status, the mapping from each figure to its source URL, the prose): <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a></li><li>The individual figures: facts, not subject to copyright, so not covered by CC BY here</li><li>The statutory text on the <a href="/en/hoan">review clauses</a> page: not copyrightable to begin with, under Article 13 of Japan’s Copyright Act</li><li>The code: <a href="https://zurekei.org/LICENSE" target="_blank" rel="noopener">MIT</a></li><li>Rights to the primary sources cited (government publications, PDFs, etc.): belong to whoever published them</li><li>An example attribution: “zurekei (https://zurekei.org)”</li>',

    h2Urls: "URLs don't break",
    urlsP1: "The canonical URL is the extension-less form (e.g. /en/chart/tax-revenue).",
    urlsP2:
      "The old /chart?m=... form still redirects via JavaScript, but please cite the canonical URL instead. Because the redirect runs in JavaScript, crawlers and social-media link previews that don't execute it land on the indicator list page instead.",

    h2Errors: "Found an error?",
    errorsP1:
      'If you spot an error in the data or the text, please get in touch via the <a href="/en/contact">contact form</a>. Corrections are recorded, not deleted, in the <a href="/en/corrections">corrections log</a>.',

    footerIndex: "Indicators",
    footerCorrections: "Corrections",
    footerAbout: "About this site",
  },
};

// data/ 直下のCSV(14本、data/hoan_clauses/*.txt は法令原文であってCSVではない
// ので対象外)への直リンク表。bin/build.mjs の CSV_COLUMNS(スキーマ検査の対象
// 一覧)と同じ14ファイルを網羅する — 増減したらこちらも直すこと。
// bin/build.mjs の --check が citeDataFilesErrors() でこの file の集合と
// CSV_COLUMNS のキーの集合を突き合わせるので、増減して片方だけ直すと赤くなる
// (2026-07-31。それまでは目視で合わせるしかなく、機械的な同期は無かった)。
const DATA_FILES = [
  {
    file: "gdp_forecast.csv",
    ja: "実質GDP成長率・名目GDP成長率の見通しと実績",
    en: "Real and nominal GDP growth — forecast and actual",
    pages: ["gdp-real", "gdp-nominal"],
  },
  {
    file: "gdp_vintages.csv",
    ja: "実質GDP・名目GDPの基準改定ヴィンテージ（背景の改定幅表示に使用）",
    en: "Real/nominal GDP revision vintages by base year (used for the revision-range band)",
    pages: ["gdp-real", "gdp-nominal"],
  },
  {
    file: "gdp_first_release.csv",
    ja: "実質GDP・名目GDP成長率の初回確報（その年度の実績として最初に公表された値）",
    en: "Real/nominal GDP growth as first released (the figure first published for that fiscal year)",
    pages: ["gdp-real", "gdp-nominal"],
  },
  {
    file: "cpi_forecast.csv",
    ja: "消費者物価(総合)の上昇率の見通しと実績",
    en: "Consumer price inflation — forecast and actual",
    pages: ["cpi"],
  },
  {
    file: "boj_outlook_real.csv",
    ja: "日銀展望レポートの実質GDP見通し(4月号・中央値)と実績",
    en: "BOJ Outlook Report's real GDP forecast (April issue, median) and actual",
    pages: ["boj-outlook-real"],
  },
  {
    file: "boj_outlook_cpi.csv",
    ja: "日銀展望レポートの消費者物価見通し(4月号・中央値)と実績",
    en: "BOJ Outlook Report's CPI forecast (April issue, median) and actual",
    pages: ["boj-outlook-cpi"],
  },
  {
    file: "unemployment_forecast.csv",
    ja: "完全失業率の見通しと実績",
    en: "Unemployment rate — forecast and actual",
    pages: ["unemployment"],
  },
  {
    file: "current_account_forecast.csv",
    ja: "経常収支の見通しと実績",
    en: "Current account — forecast and actual",
    pages: ["current-account"],
  },
  {
    file: "tax_revenue_forecast.csv",
    ja: "一般会計税収の見通しと実績",
    en: "Tax revenue (general account) — forecast and actual",
    pages: ["tax-revenue"],
  },
  {
    file: "bond_issuance_forecast.csv",
    ja: "国債発行額（一般会計）の見通しと実績",
    en: "Government bond issuance — forecast and actual",
    pages: ["bond-issuance"],
  },
  {
    file: "jgb_total_issuance_forecast.csv",
    ja: "国債発行総額の見通しと実績",
    en: "Total JGB issuance — forecast and actual",
    pages: ["jgb-total"],
  },
  {
    file: "fertility_forecast.csv",
    ja: "合計特殊出生率の歴代推計（仮定）",
    en: "Total fertility rate — successive projection assumptions",
    pages: ["fertility"],
  },
  {
    file: "fertility_actual.csv",
    ja: "合計特殊出生率の実績",
    en: "Total fertility rate — actual",
    pages: ["fertility"],
  },
  {
    file: "births_forecast.csv",
    ja: "出生数の歴代推計（出生中位）",
    en: "Number of births — successive projections (medium-fertility variant)",
    pages: ["births"],
  },
  {
    file: "births_actual.csv",
    ja: "出生数の実績",
    en: "Number of births — actual",
    pages: ["births"],
  },
  {
    file: "hoan_review.csv",
    ja: "法律の見直し条項の検討状況",
    en: "Statutory review clauses — status",
    pages: ["hoan"],
  },
  {
    file: "corrections.csv",
    ja: "訂正履歴",
    en: "Corrections log",
    pages: ["corrections"],
  },
];

// 指標キー→ /chart/<key> というURL規則は chart.js 側にもあるが、あちらは
// METRICS(グラフの定義)の一部として存在し、fertility/hoan/corrections は
// METRICSに含まれない。ここは「引用表の対応ページ」というこのページ固有の
// 一覧なので、写しを作らず独立に持つ(儀式的にchart.js全体を読み込ませてまで
// 共有する理由が無い)。
const PAGE_PATH = {
  "gdp-real": { ja: "/chart/gdp-real", en: "/en/chart/gdp-real" },
  "gdp-nominal": { ja: "/chart/gdp-nominal", en: "/en/chart/gdp-nominal" },
  cpi: { ja: "/chart/cpi", en: "/en/chart/cpi" },
  "boj-outlook-real": { ja: "/chart/boj-outlook-real", en: "/en/chart/boj-outlook-real" },
  "boj-outlook-cpi": { ja: "/chart/boj-outlook-cpi", en: "/en/chart/boj-outlook-cpi" },
  unemployment: { ja: "/chart/unemployment", en: "/en/chart/unemployment" },
  "current-account": { ja: "/chart/current-account", en: "/en/chart/current-account" },
  "tax-revenue": { ja: "/chart/tax-revenue", en: "/en/chart/tax-revenue" },
  "bond-issuance": { ja: "/chart/bond-issuance", en: "/en/chart/bond-issuance" },
  "jgb-total": { ja: "/chart/jgb-total", en: "/en/chart/jgb-total" },
  fertility: { ja: "/fertility", en: "/en/fertility" },
  births: { ja: "/births", en: "/en/births" },
  hoan: { ja: "/hoan", en: "/en/hoan" },
  corrections: { ja: "/corrections", en: "/en/corrections" },
};

// 静的な数値表(bin/build.mjs が生成し、cite.html/en/cite.html に埋め込む)。
// about.js の renderMethodsRows() と同じ理由(文言・対応表の出所をここ1箇所に
// する)で、ビルド側に写しを持たせず loadModule() 経由でこの関数そのものを
// 取り込む。
function renderDataRows(lang) {
  return DATA_FILES.map((d) => {
    const desc = lang === "ja" ? d.ja : d.en;
    const sep = lang === "ja" ? "・" : ", ";
    const links = d.pages
      .map((k) => {
        const href = PAGE_PATH[k][lang];
        return `<a href="${href}">${href}</a>`;
      })
      .join(sep);
    return `<tr><th><a href="/data/${d.file}">${d.file}</a></th><td>${desc}</td><td>${links}</td></tr>`;
  }).join("");
}

function main() {
  // 言語はURL(=生成時に確定したdocument.documentElement.lang)が決める。詳細は
  // home.js の同じ変更のコメントを参照。
  let lang = document.documentElement.lang === "en" ? "en" : "ja";

  function applyI18n() {
    const t = T[lang];
    document.getElementById("t-back").textContent = t.back;
    document.getElementById("cite-title").textContent = t.title;
    document.getElementById("cite-lead").textContent = t.lead;

    document.getElementById("h2-primary").textContent = t.h2Primary;
    document.getElementById("primary-p1").innerHTML = t.primaryP1;
    document.getElementById("primary-p2").textContent = t.primaryP2;

    document.getElementById("h2-format").textContent = t.h2Format;
    document.getElementById("format-intro").textContent = t.formatIntro;
    document.getElementById("example-site-label").textContent = t.exampleSiteLabel;
    document.getElementById("example-site").textContent = t.exampleSite;
    document.getElementById("example-page-label").textContent = t.examplePageLabel;
    document.getElementById("example-page").textContent = t.examplePage;
    document.getElementById("example-data-label").textContent = t.exampleDataLabel;
    document.getElementById("example-data").textContent = t.exampleData;
    document.getElementById("example-note").textContent = t.exampleNote;
    document.getElementById("date-note").textContent = t.dateNote;

    document.getElementById("h2-data").textContent = t.h2Data;
    document.getElementById("data-intro").innerHTML = t.dataIntro;
    document.getElementById("th-file").textContent = t.thFile;
    document.getElementById("th-content").textContent = t.thContent;
    document.getElementById("th-page").textContent = t.thPage;
    document.getElementById("cite-data-tbody").innerHTML = renderDataRows(lang);

    document.getElementById("h2-license").textContent = t.h2License;
    document.getElementById("license-intro").innerHTML = t.licenseIntro;
    document.getElementById("cite-license-list").innerHTML = t.licenseList;

    document.getElementById("h2-urls").textContent = t.h2Urls;
    document.getElementById("urls-p1").textContent = t.urlsP1;
    document.getElementById("urls-p2").textContent = t.urlsP2;

    document.getElementById("h2-errors").textContent = t.h2Errors;
    document.getElementById("errors-p1").innerHTML = t.errorsP1;

    document.getElementById("t-footer-index").textContent = t.footerIndex;
    document.getElementById("t-footer-corrections").textContent = t.footerCorrections;
    document.getElementById("t-footer-about").textContent = t.footerAbout;

    document.getElementById("lang-ja").classList.toggle("active", lang === "ja");
    document.getElementById("lang-en").classList.toggle("active", lang === "en");
    document.documentElement.lang = lang;
  }

  // lang-ja/lang-en は他ページの URL への実リンク(<a>)。切り替えはブラウザの通常の
  // ナビゲーションに任せるので、クリック自体にJSは要らない(home.js の同じ変更の
  // コメントを参照)。

  applyI18n();
}

main();
