const T = {
  ja: {
    back: "← 指標一覧",
    title: "このサイトについて",
    lead: "このサイトは、政府や公的機関が発表した「見通し」と、その後の「実績」を並べて記録し続けるサイトです。それ以上のことはしません。",
    summary: "続きを読む(なぜ作ったか・このサイトの方針)",
    o1: "始まりは素朴な疑問でした。政治家も官僚も優秀な人たちのはずなのに、なぜ政策は庶民の実感とズレていくのか。調べていくと、陰謀や無能といった分かりやすい犯人は見つかりませんでした。代わりに見つかったのは、もっと地味な構造です。",
    o2: "日本では、政府の経済・財政・人口の見通しが外れても、それを記録し続ける仕組みがありません。経済成長率の見通しは何十年も実績を上回り続けてきました。出生率の推計は、改定のたびに下方修正されてきました。税収の見積もりは外れ、補正され、忘れられてきました。個々の検証レポートは優れたものが何度も出ています。しかし単発で終わります。検証を「続ける」ことが、誰の仕事でも、誰の業績でもないからです。",
    o3: "予測が外れても誰も記録しない社会では、次の予測も同じように歪みます。そして歪んだ見通しの上で、予算が組まれ、制度が設計され、30年が経ちました。私は、政策の失敗の多くは悪意ではなく、この「答え合わせの不在」から生まれると考えています。",
    doesTitle: "このサイトがすること・しないこと",
    d1: "することは一つです。公的な見通しの数値と、実績の数値と、その出典を、毎年並べること。",
    d2: "しないことは、たくさんあります。断罪しません。特定の政党や省庁や個人を攻撃しません。政策を提言しません。「楽観的すぎる」といった評価の言葉も、データのページには書きません。数字がどう見えるかは、見た人が決めることです。訂正するときは、黙って直さず履歴を残します。このサイト自身も検証可能でなければ、意味がないからです。",
    whoseTitle: "本来これは誰の仕事か",
    w1: "多くの国には、政府から独立して財政や経済の見通しを検証する公的機関があります。イギリスのOBR、アメリカのCBO、オランダのCPB。日本には、これに相当する常設の独立機関がありません。",
    w2: "このサイトは、その空白を一個人が埋めようとする試みです。埋まるはずがないことは分かっています。それでも、「予測と実績のズレが記録され続けている」という事実がひとつあるだけで、次の見通しは少しだけ歪みにくくなるはずです。",
    goalTitle: "目標",
    g1: "このサイトの目標は、日本に独立した検証機関が生まれて、ここが不要になることです。その日まで、キツツキのように、毎年同じ木をつつき続けます。",
    methodsTitle: "データと方法",
    thIndicator: "指標",
    thForecast: "見通しの出典",
    thActual: "実績の出典",
    freqTitle: "更新頻度",
    freqBody: "年1回、手動で更新する。政府の経済見通し(当初)は例年12月末〜1月に公表され、それに合わせて追加する。決算・確報値などの実績は、年度終了後の7〜12月頃に確定するものが多く、確定次第反映する。",
    correctionsTitle: "訂正方針",
    correctionsBody: '誤りに気づいた場合は、値を黙って書き換えず、変更前後の値と理由を記録した上で訂正する。→ <a href="corrections.html">訂正履歴</a>',
    dataTitle: "データ本体",
    dataBody: 'このサイトの数値は、リポジトリ内のCSVファイルを唯一の原本(ソースオブトゥルース)としている。各行に一次資料の出典URLを付けている。→ <a href="https://github.com/zurekei/site/tree/main/data" target="_blank" rel="noopener">GitHub上のdata/</a>',
    footerSrc: "src: 内閣府 / 国民経済計算(SNA)",
    footerCorrections: "訂正履歴",
    footerIndex: "指標一覧へ",
  },
  en: {
    back: "← Indicators",
    title: "About this site",
    lead: "This site records the “forecasts” issued by the government and public bodies, side by side with the “actuals” that follow. That is all it does.",
    summary: "Read more (why this exists, and how it's run)",
    o1: "It started with a simple question. Politicians and bureaucrats are, presumably, capable people — so why does policy keep drifting from what ordinary people actually experience? Looking into it, I didn't find an easy villain like conspiracy or incompetence. What I found instead was something much more mundane: a structural gap.",
    o2: "In Japan, there is no mechanism that keeps recording it when the government's economic, fiscal, or population forecasts miss. Economic growth forecasts have run above actual growth for decades. Fertility rate projections have been revised downward at every revision. Tax revenue estimates have missed, been corrected mid-year, and been forgotten. Individual, well-made verification reports do come out from time to time. But they end there, as one-off pieces. Keeping the verification going isn't anyone's job, and it isn't anyone's achievement.",
    o3: "In a society where no one records a missed forecast, the next forecast tends to be distorted the same way. Budgets have been built and institutions designed on top of these distorted forecasts for thirty years. I don't think most policy failures come from bad faith — I think they come from this absence of checking the answer.",
    doesTitle: "What this site does, and doesn't do",
    d1: "It does one thing: lay the official forecast figure, the actual figure, and the source for each, side by side, every year.",
    d2: "There's a long list of things it doesn't do. It doesn't pass judgment. It doesn't attack any particular party, ministry, or person. It doesn't propose policy. It doesn't put evaluative words like “too optimistic” on the data pages either — how the numbers look is for the reader to decide. When something needs correcting, I don't fix it quietly; I keep a record of the change. This site has to be verifiable itself, or none of it means anything.",
    whoseTitle: "Whose job should this really be",
    w1: "Many countries have a public body, independent of the government, that checks fiscal and economic forecasts: the OBR in the UK, the CBO in the US, the CPB in the Netherlands. Japan has no permanent independent institution that plays this role.",
    w2: "This site is one individual's attempt to fill that gap. I know it can't actually fill it. But even just the fact that the gap between forecast and actual keeps being recorded should make the next forecast a little harder to distort.",
    goalTitle: "The goal",
    g1: "The goal of this site is for Japan to get an independent verification body, and for this site to become unnecessary. Until that day, I'll keep pecking at the same tree every year, like a woodpecker.",
    methodsTitle: "Data and methods",
    thIndicator: "Indicator",
    thForecast: "Forecast source",
    thActual: "Actual source",
    freqTitle: "Update frequency",
    freqBody: "Updated once a year, by hand. The government's initial economic outlook is usually published in late December or January, and the new forecast is added around then. Settlement figures and confirmed actuals are mostly finalized from around July to December after the fiscal year ends, and are added once confirmed.",
    correctionsTitle: "Corrections policy",
    correctionsBody: 'When an error is found, the value isn’t quietly changed — the correction is recorded, with the old value, the new value, and the reason. → <a href="corrections.html">Corrections</a>',
    dataTitle: "The data itself",
    dataBody: 'Every figure on this site traces back to CSV files in the repository, which are the single source of truth. Each row carries a link to its primary source. → <a href="https://github.com/zurekei/site/tree/main/data" target="_blank" rel="noopener">data/ on GitHub</a>',
    footerSrc: "src: Cabinet Office of Japan / SNA",
    footerCorrections: "Corrections",
    footerIndex: "Indicators",
  },
};

// 出典表: 見通し/実績それぞれの出典機関・資料名。home.js の INDICATOR_META /
// data/*.csv の notes・URL 列に記載された内容と一致させること(創作しない)。
const METHODS_ROWS = [
  {
    ja: ["実質GDP成長率 / 名目GDP成長率", "内閣府「経済見通しと経済財政運営の基本的態度」(当初、毎年1月頃閣議決定)", "内閣府「国民経済計算(SNA)」確報値"],
    en: ["Real GDP growth / Nominal GDP growth", "Cabinet Office, “Economic Outlook and Basic Stance for Economic and Fiscal Management” (initial, decided by the Cabinet around January each year)", "Cabinet Office, System of National Accounts (SNA), confirmed figures"],
  },
  {
    ja: ["消費者物価 (CPI)", "内閣府「経済見通しと経済財政運営の基本的態度」", "総務省統計局「消費者物価指数」年度平均、長期時系列データ(e-Stat)"],
    en: ["Consumer prices (CPI)", "Cabinet Office, “Economic Outlook and Basic Stance for Economic and Fiscal Management”", "Ministry of Internal Affairs and Communications, Statistics Bureau, Consumer Price Index, fiscal-year averages, long-term time series (e-Stat)"],
  },
  {
    ja: ["完全失業率", "内閣府「経済見通しと経済財政運営の基本的態度」(主要経済指標表)", "総務省統計局「労働力調査」長期時系列表"],
    en: ["Unemployment rate", "Cabinet Office, “Economic Outlook and Basic Stance for Economic and Fiscal Management” (main economic indicators table)", "Ministry of Internal Affairs and Communications, Statistics Bureau, Labour Force Survey, long-term time series tables"],
  },
  {
    ja: ["経常収支", "内閣府「経済見通しと経済財政運営の基本的態度」(主要経済指標表)", "財務省「国際収支状況」年度別時系列(BPM6ベース)"],
    en: ["Current account", "Cabinet Office, “Economic Outlook and Basic Stance for Economic and Fiscal Management” (main economic indicators table)", "Ministry of Finance, Balance of Payments statistics, fiscal-year time series (BPM6 basis)"],
  },
  {
    ja: ["一般会計税収", "財務省「一般会計税収の予算額と決算額の推移」当初予算額", "財務省 決算額(同資料)"],
    en: ["Tax revenue (general account)", "Ministry of Finance, “Trends in Budgeted and Settled General Account Tax Revenue,” initial budget figure", "Ministry of Finance, settlement (final accounts) figure, same source"],
  },
  {
    ja: ["国債発行額", "財務省「一般会計公債発行額の推移」当初予算額", "財務省 決算(実績)額(同資料)"],
    en: ["Government bond issuance", "Ministry of Finance, “Trends in General Account Bond Issuance,” initial budget figure", "Ministry of Finance, settlement (actual) figure, same source"],
  },
  {
    ja: ["国債発行総額", "財務省「国債発行計画」当初予算ベースの総額", "財務省「国債発行額の推移(実績ベース)」"],
    en: ["Total JGB issuance", "Ministry of Finance, initial JGB issuance plan (initial-budget basis, total)", "Ministry of Finance, “JGB Issuance Amounts (Actual)”"],
  },
  {
    ja: ["合計特殊出生率", "国立社会保障・人口問題研究所(社人研)「日本の将来推計人口」歴代推計の中位仮定", "厚生労働省「人口動態統計」(社人研「人口統計資料集」収録値を含む)"],
    en: ["Total fertility rate", "National Institute of Population and Social Security Research (IPSS), “Population Projections for Japan,” medium-fertility assumption across successive vintages", "Ministry of Health, Labour and Welfare, Vital Statistics of Japan (partly as compiled in the IPSS Population Statistics of Japan)"],
  },
];

function renderMethodsRows(lang) {
  return METHODS_ROWS.map((row) => {
    const [indicator, forecast, actual] = row[lang];
    return `<tr><th>${indicator}</th><td>${forecast}</td><td>${actual}</td></tr>`;
  }).join("");
}

function main() {
  let lang = "ja";

  function applyI18n() {
    const t = T[lang];
    document.getElementById("t-back").textContent = t.back;
    document.getElementById("about-title").textContent = t.title;
    document.getElementById("about-lead").textContent = t.lead;
    document.getElementById("about-summary").textContent = t.summary;
    document.getElementById("p-o1").textContent = t.o1;
    document.getElementById("p-o2").textContent = t.o2;
    document.getElementById("p-o3").textContent = t.o3;
    document.getElementById("h2-does").textContent = t.doesTitle;
    document.getElementById("p-d1").textContent = t.d1;
    document.getElementById("p-d2").textContent = t.d2;
    document.getElementById("h2-whose").textContent = t.whoseTitle;
    document.getElementById("p-w1").textContent = t.w1;
    document.getElementById("p-w2").textContent = t.w2;
    document.getElementById("h2-goal").textContent = t.goalTitle;
    document.getElementById("p-g1").textContent = t.g1;
    document.getElementById("methods-title").textContent = t.methodsTitle;
    document.getElementById("th-indicator").textContent = t.thIndicator;
    document.getElementById("th-forecast").textContent = t.thForecast;
    document.getElementById("th-actual").textContent = t.thActual;
    document.getElementById("methods-tbody").innerHTML = renderMethodsRows(lang);
    document.getElementById("freq-title").textContent = t.freqTitle;
    document.getElementById("freq-body").textContent = t.freqBody;
    document.getElementById("corrections-title").textContent = t.correctionsTitle;
    document.getElementById("corrections-body").innerHTML = t.correctionsBody;
    document.getElementById("data-title").textContent = t.dataTitle;
    document.getElementById("data-body").innerHTML = t.dataBody;
    document.getElementById("t-footer-src").textContent = t.footerSrc;
    document.getElementById("t-footer-corrections").textContent = t.footerCorrections;
    document.getElementById("t-footer-index").textContent = t.footerIndex;
    document.getElementById("lang-ja").classList.toggle("active", lang === "ja");
    document.getElementById("lang-en").classList.toggle("active", lang === "en");
    document.documentElement.lang = lang;
  }

  document.getElementById("lang-ja").addEventListener("click", () => { lang = "ja"; applyI18n(); });
  document.getElementById("lang-en").addEventListener("click", () => { lang = "en"; applyI18n(); });

  applyI18n();
}

main();
