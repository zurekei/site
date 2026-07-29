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

  const rows = await loadCSV("data/corrections.csv");
  const list = document.getElementById("corrections-list");

  if (rows.length === 0) {
    list.innerHTML = `<p class="correction-empty">${escapeHTML(T[lang].empty)}</p>`;
    return;
  }

  const sorted = rows.slice().sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = sorted.map((r) => renderEntry(r, lang)).join("");
}

main();
