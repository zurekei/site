// このページだけ他ページと違い、辞書 T を持っていなかった("詳細 →" 等が直書き)。
// /en/ 版を機械生成するには、他ページと同じ「T.ja / T.en を持ち、静的HTMLの文言と
// 1対1で対応させる」形にする必要があるため、2026-07-29に他ページへ合わせた。
// 英訳はこの数語のみ新規(既存ページの語調に合わせている)。
const T = {
  ja: {
    back: "← 指標一覧",
    title: "訂正履歴",
    lead: "このサイトは、誤りを見つけたときに黙って直すのではなく、記録を残して訂正します。データの転記ミス・出典の誤り・計算式の誤りなどを、発見次第ここに記載します。",
    detailLink: "詳細 →",
    empty: "現時点で訂正の記録はありません。",
    policyTitle: "訂正の方針",
    policyRecorded: "記録するのは、このサイトの側の誤りです。CSVへの転記ミス、出典URLの誤り、年度や単位の取り違え、計算の誤り、グラフの描画が元データと食い違っていた場合が該当します。誤りが見つかったときは、値を直すのと同時に、日付・対象・変更前の値・変更後の値・理由を1件としてこのページに残します。変更前の値は消しません。",
    policyNotRecorded: "出典の側が数値を改めた場合は、訂正ではなくデータの更新として扱います。実績値の確報化や基準改定がこれにあたり、元の値も改定後の値も、それぞれの時点の公表としては正しいためです。掲載している数値と出典が変わらない修正(誤字の直し・表記の統一・リンク先の張り替え)も記録しません。",
    policyKeep: "一度記録した訂正は削除しません。訂正そのものに誤りがあった場合も、過去の記録は書き換えず、新しい1件として追加します。",
    policyReport: '誤りにお気づきの場合は、<a href="contact.html">お問い合わせフォーム</a>からご連絡ください。該当ページと、正しいと考えられる値の出典を添えていただけると確認が早くなります。',
    footerSrc: "src: 内閣府 / 国民経済計算(SNA)",
    footerAbout: "このサイトについて",
    footerContact: "お問い合わせ",
  },
  en: {
    back: "← Indicators",
    title: "Corrections",
    lead: "When this site finds an error, it doesn't fix it quietly — it keeps a record and corrects it. Transcription mistakes, sourcing errors, and calculation errors are listed here as soon as they're found.",
    detailLink: "Details →",
    empty: "No corrections have been recorded yet.",
    policyTitle: "How corrections are handled",
    policyRecorded: "What is recorded here are this site's own errors: transcription mistakes in the CSVs, wrong source URLs, a fiscal year or a unit taken for another, arithmetic errors, and charts that disagree with the data behind them. When one is found, the value is fixed and, at the same time, an entry is added here with the date, what it affected, the old value, the new value, and the reason. The old value is never removed.",
    policyNotRecorded: "When the source itself revises a figure, that is treated as a data update rather than a correction. Provisional figures becoming final, and rebasing, fall into this category: the original figure and the revised one were each correct as published at the time. Fixes that leave the published figures and sources unchanged (typos, wording, replacing a dead link) are not recorded either.",
    policyKeep: "Entries are never deleted. If a correction itself turns out to be wrong, the existing entry is left as it is and a new one is added.",
    policyReport: 'If you spot an error, please get in touch via the <a href="contact.html">contact form</a>. Naming the page, and giving a source for the figure you believe to be correct, makes it quicker to check.',
    footerSrc: "src: Cabinet Office of Japan / SNA",
    footerAbout: "About this site",
    footerContact: "Contact",
  },
};

function renderEntry(r, lang) {
  const t = T[lang];
  const url = safeUrl(r.url);
  const link = url
    ? `<a class="correction-link" href="${escapeHTML(url)}" target="_blank" rel="noopener">${escapeHTML(t.detailLink)}</a>`
    : "";
  return `
    <div class="correction-item">
      <div class="correction-date mono">${escapeHTML(r.date)}</div>
      <div class="correction-target">${escapeHTML(r.target)}</div>
      <div class="correction-diff">
        <span class="correction-before">${escapeHTML(r.before)}</span>
        <span class="correction-arrow">→</span>
        <span class="correction-after">${escapeHTML(r.after)}</span>
      </div>
      <div class="correction-reason">${escapeHTML(r.reason)}</div>
      ${link}
    </div>`;
}

function applyStatic(lang) {
  const t = T[lang];
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  set("t-back", t.back);
  set("corrections-title", t.title);
  set("corrections-lead", t.lead);
  set("corrections-policy-title", t.policyTitle);
  set("corrections-policy-recorded", t.policyRecorded);
  set("corrections-policy-not-recorded", t.policyNotRecorded);
  set("corrections-policy-keep", t.policyKeep);
  document.getElementById("corrections-policy-report").innerHTML = t.policyReport;
  set("t-footer-src", t.footerSrc);
  set("t-footer-about", t.footerAbout);
  set("t-footer-contact", t.footerContact);
  document.getElementById("lang-ja").classList.toggle("active", lang === "ja");
  document.getElementById("lang-en").classList.toggle("active", lang === "en");
  // 言語トグルは実リンク(<a>)なのでクリックすれば別URLへ遷移する。切り替え自体に
  // JSは要らない(以前はlocalStorageに選択を書き込んでいたが、読み返す処理が
  // どこにも無い書くだけの死んだコードだったため2026-07-30に削除。詳細はhome.js
  // の同じ変更のコメントを参照)。
}

async function main() {
  // 言語はURLが決める(document.documentElement.lang は生成時にページごとに ja/en が
  // 入っている)。localStorage は使わない — 使うと英語版が localStorage の古い値で
  // 日本語に戻ってしまう(2026-07-29に踏んだ)。
  // document への参照は main() の中だけに閉じる(loadModule はトップレベルで
  // document 等のブラウザAPIに触れないことを前提にしているため。詳細は
  // contact.js の main() ラップのコメントを参照)。
  const lang = document.documentElement.lang === "en" ? "en" : "ja";

  applyStatic(lang);

  const rows = await loadCSV("/data/corrections.csv");
  const list = document.getElementById("corrections-list");

  if (rows.length === 0) {
    list.innerHTML = `<p class="correction-empty">${escapeHTML(T[lang].empty)}</p>`;
    return;
  }

  const sorted = rows.slice().sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = sorted.map((r) => renderEntry(r, lang)).join("");
}

main();
