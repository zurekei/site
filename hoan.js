// 法案タブ: 見直し条項の期限テーブル。data/hoan_review.csv を読み、期限順に描画する。
// 条文原文は data/hoan_clauses/{law_id}.txt をクリック時に遅延取得する。
// 言語(ja/en)は document.documentElement.lang(=URL)で決める。かつてこのコメントは
// 「localStorage "zurekei-lang" で index ページと共有する」と書いていたが、実際には
// このファイルはlocalStorageをどこからも読んでおらず(下のlang-ja/lang-enクリック時に
// 書くだけ)、共有は実装されたことが無かった。実在しない機能を説明するコメントだった
// ので2026-07-30に書き直した。

// cls / order は言語に依存しないためここに、表示ラベルは T 側に置く。
const STATUS = {
  due:         { cls: "st-due",  order: 0 },
  pending:     { cls: "st-pend", order: 1 },
  no_deadline: { cls: "st-none", order: 2 },
  reviewed:    { cls: "st-rev",  order: -1 },
};

const FILTER_KEYS = ["all", "due", "pending", "no_deadline"];

// enforcement_note は統制語彙(空 or "段階施行")。原文の一次資料ではなく本サイトが付す注記ラベルなので、
// ステータスバッジと同じく EN では訳す。未知の値はそのまま(原文)フォールバックする。
const NOTE_LABEL = {
  ja: { "段階施行": "段階施行" },
  en: { "段階施行": "Staged enforcement" },
};

// 法令名は EN でも訳さない。公式の英訳(法務省「日本法令外国語訳データベース
// システム」)があるのは対象49法のうち18法=37%しかなく(2026-08-03に法令番号で
// 全件照会して実測)、当てると表が英日のまだらになる。しかも未訳が多いのは新しい
// 法律のほうで、このページの対象は「直近5年の制定法」なので不利は解消しない。
// 全部日本語のまま lang="ja" を付けるのが、一貫していて誤解も生まない。
//
// 一方で**法令番号は訳ではなく換算で英語化できる**ので、そこだけ併記する。
// 元号表記は日本語圏の外では読めないが、"Act No. 78 of 2022" は英語圏で法令を
// 指すときの標準形(日本法令外国語訳DB自身もこの形を使う)。西暦は元号の初年から
// 機械的に決まり、訳の判断が入らない。
// 日本語表記のほうは消さないこと。消すと e-Gov で引けなくなる(法令番号は
// 一次資料の識別子であって、表示用の文字列ではない)。
const ERA_BASE = { "明治": 1867, "大正": 1911, "昭和": 1925, "平成": 1988, "令和": 2018 };
const KANJI_DIGIT = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };

function kanjiToInt(s) {
  let n = 0, cur = 0;
  for (const ch of s) {
    if (ch === "元") cur = 1;                                  // 令和元年 = 令和1年
    else if (KANJI_DIGIT[ch]) cur = KANJI_DIGIT[ch];
    else if (ch === "十") { n += (cur || 1) * 10; cur = 0; }
    else if (ch === "百") { n += (cur || 1) * 100; cur = 0; }
    else return null;
  }
  return n + cur;
}

// "令和四年法律第七十八号" -> "Act No. 78 of 2022"
// 読めない形は null を返し、呼び出し側は併記を省く(誤った番号を出すより出さない)。
// 法令番号の年は公布年なので、算出した西暦は promulgation_date の年と必ず一致する。
// この不変条件は bin/build.mjs の --check が全行について確認している。
function lawNumEn(lawNum) {
  const m = /^(明治|大正|昭和|平成|令和)(.+?)年法律第(.+?)号$/.exec(lawNum || "");
  if (!m) return null;
  const year = kanjiToInt(m[2]);
  const no = kanjiToInt(m[3]);
  if (!year || !no) return null;
  return `Act No. ${no} of ${ERA_BASE[m[1]] + year}`;
}

const T = {
  ja: {
    back: "← 指標一覧",
    title: "法律の見直し条項 — 期限と検討状況",
    desc: "多くの法律は、その附則に「施行後◯年を目途に検討を加える」という見直し条項(検討条項とも呼ばれる)を置いている。見直しの期限は「施行日＋◯年」で機械的に算出できる。ここでは期限順に並べ、期限が到来した法律を上に置く。数値・条文・出典のみを並べ、評価は書かない。",
    note: "「未確認」は検討が行われていないことを意味しない。検討の有無（審議会・報告書・改正等）は形態が多様なため自動判定しておらず、ここでは期限の到来までを機械的に記録している。",
    yearLabel: "年",
    colLaw: "法律",
    colEnact: "施行日",
    colDeadline: "見直し期限",
    colStatus: "状況",
    footerSrc: "src: e-Gov 法令検索(デジタル庁) 法令API",
    footerCorrections: "訂正履歴",
    footerAbout: "このサイトについて",
    footerContact: "お問い合わせ",
    all: "すべて",
    yearAll: "すべて",
    empty: "該当する法律はありません。",
    clauseHead: "見直し条項（原文）",
    clauseLoading: "読み込み中…",
    clauseError: "（原文を取得できませんでした）",
    srcLink: "e-Gov ↗",
    noDeadline: "定めなし",
    noDeadlineYears: "期限の定めなし",
    enforceMissing: "—",
    yearsAfter: (n) => `施行後${n}年`,
    summary: (total, due) => `${total} 件（うち 期限到来・未確認 ${due} 件）`,
    status: {
      due: "期限到来・未確認",
      pending: "期限前",
      no_deadline: "定めなし",
      reviewed: "検討確認済み",
    },
  },
  en: {
    back: "← All indicators",
    title: "Statutory review clauses — deadlines and status",
    desc: 'Many laws place a review clause in their supplementary provisions: "review shall be undertaken within N years of enforcement." The deadline is derived mechanically as enforcement date plus N years. Rows are ordered by deadline, with laws whose deadline has passed placed on top. Only figures, clause text, and sources are shown; no evaluation is added.',
    note: '"Unconfirmed" does not mean no review has taken place. Whether a review occurred (advisory councils, reports, amendments, and so on) takes many forms and is not judged automatically here; this page mechanically records only whether the deadline has arrived.',
    yearLabel: "Year",
    colLaw: "Law",
    colEnact: "Enforced",
    colDeadline: "Review deadline",
    colStatus: "Status",
    footerSrc: "src: e-Gov Law Search (Digital Agency) Law API",
    footerCorrections: "Corrections",
    footerAbout: "About this site",
    footerContact: "Contact",
    all: "All",
    yearAll: "All",
    empty: "No laws match.",
    clauseHead: "Review clause (original Japanese text)",
    clauseLoading: "Loading…",
    clauseError: "(Original text could not be retrieved)",
    srcLink: "e-Gov ↗",
    noDeadline: "none",
    noDeadlineYears: "no deadline set",
    enforceMissing: "—",
    yearsAfter: (n) => `${n} yr${Number(n) === 1 ? "" : "s"} after enforcement`,
    summary: (total, due) => `${total} law${total === 1 ? "" : "s"} (${due} past deadline, unconfirmed)`,
    status: {
      due: "Past deadline, unconfirmed",
      pending: "Before deadline",
      no_deadline: "No deadline",
      reviewed: "Review confirmed",
    },
  },
};

let ROWS = [];
let activeStatus = "all";
let activeYear = "all";
// 言語はURL(=生成時に確定したdocument.documentElement.lang)が決める。詳細は
// home.js の同じ変更のコメントを参照(2026-07-29、/en/ページ追加時)。代入は
// main() の中でだけ行う(loadModule はトップレベルで document 等のブラウザAPIに
// 触れないことを前提にしているため。宣言だけをここに残すのは、tr() 等の他の
// 関数がこの変数をクロージャで参照する構造を変えずに済ませるため)。
let lang;
const clauseCache = {};

function tr() {
  return T[lang];
}

function yearOf(r) {
  return (r.promulgation_date || "").slice(0, 4);
}

function statusMeta(r) {
  return STATUS[r.review_status] || STATUS.pending;
}

function statusLabel(r) {
  const t = tr();
  return t.status[r.review_status] || t.status.pending;
}

function sortRows(rows) {
  return rows.slice().sort((a, b) => {
    const oa = statusMeta(a).order, ob = statusMeta(b).order;
    if (oa !== ob) return oa - ob;
    const da = a.review_deadline || "9999-99-99";
    const db = b.review_deadline || "9999-99-99";
    return da.localeCompare(db);
  });
}

function visible() {
  return ROWS.filter((r) => {
    if (activeStatus !== "all" && r.review_status !== activeStatus) return false;
    if (activeYear !== "all" && yearOf(r) !== activeYear) return false;
    return true;
  });
}

function renderSummary(rows) {
  const due = rows.filter((r) => r.review_status === "due").length;
  document.getElementById("summary").textContent = tr().summary(rows.length, due);
}

function rowHTML(r) {
  const t = tr();
  const meta = statusMeta(r);
  const deadline = r.review_deadline || t.noDeadline;
  const yrs = r.review_years ? t.yearsAfter(r.review_years) : t.noDeadlineYears;
  const noteText = r.enforcement_note ? (NOTE_LABEL[lang][r.enforcement_note] || r.enforcement_note) : "";
  const staged = noteText ? `<span class="hoan-staged mono">${escapeHTML(noteText)}</span>` : "";
  const url = safeUrl(r.source_law_url);
  const src = url
    ? `<a class="hoan-srclink mono" href="${escapeHTML(url)}" target="_blank" rel="noopener">${t.srcLink}</a>`
    : "";
  // lang="ja" は bin/build.mjs の静的版が付けているのと同じ理由・同じ範囲で付ける
  // (訳していない日本語をEN文書の中に置くため)。JS側に付け忘れていて、JSが動くと
  // 属性が消える不揃いがあった(2026-08-03)。
  const jaLang = lang === "en" ? ` lang="ja"` : "";
  const numEn = lang === "en" ? lawNumEn(r.law_num) : null;
  const numEnHtml = numEn ? ` <span class="hoan-lawnum-en">(${escapeHTML(numEn)})</span>` : "";
  return `
    <tr class="hoan-row" data-id="${escapeHTML(r.law_id)}" tabindex="0" aria-expanded="false">
      <td class="col-title">
        <div class="hoan-lawtitle"${jaLang}>${escapeHTML(r.law_title)}</div>
        <div class="hoan-lawnum mono"><span${jaLang}>${escapeHTML(r.law_num)}</span>${numEnHtml}</div>
      </td>
      <td class="col-date mono">${escapeHTML(r.enforcement_date || t.enforceMissing)}${staged}</td>
      <td class="col-date mono">${escapeHTML(deadline)}<div class="hoan-yrs mono">${escapeHTML(yrs)}</div></td>
      <td class="col-status"><span class="hoan-badge ${meta.cls}">${escapeHTML(statusLabel(r))}</span></td>
    </tr>
    <tr class="hoan-detail" data-detail="${escapeHTML(r.law_id)}" hidden>
      <td colspan="4">
        <div class="hoan-clause-head mono">${escapeHTML(t.clauseHead)} ${src}</div>
        <pre class="hoan-clause" id="clause-${escapeHTML(r.law_id)}">${escapeHTML(t.clauseLoading)}</pre>
      </td>
    </tr>`;
}

function render() {
  const rows = sortRows(visible());
  const tbody = document.getElementById("rows");
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="hoan-empty">${escapeHTML(tr().empty)}</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(rowHTML).join("");
  }
  renderSummary(rows);
  bindRows();
}

async function toggleDetail(id) {
  const detail = document.querySelector(`tr[data-detail="${CSS.escape(id)}"]`);
  const row = document.querySelector(`tr[data-id="${CSS.escape(id)}"]`);
  if (!detail) return;
  const opening = detail.hidden;
  detail.hidden = !opening;
  row.setAttribute("aria-expanded", String(opening));
  row.classList.toggle("is-open", opening);
  if (opening && !clauseCache[id]) {
    const pre = document.getElementById(`clause-${id}`);
    try {
      const res = await fetch(`/data/hoan_clauses/${id}.txt`);
      const raw = res.ok ? await res.text() : null;
      // res.ok だけでは足りない。**Cloudflare Pages は存在しないパスにもトップページの
      // HTMLを200で返す**ので、条文txtが1本欠けていると res.ok は真になり、
      // 「日本語トップのHTML全文が条文として表示され、しかも clauseCache に
      // 焼き付く」という壊れ方をする。csv.js の loadCSV に足したのと同じ判定を
      // ここにも置く(同じ欠陥クラスなので片方だけ塞がない)。条文原文が `<` で
      // 始まることはない。
      const ok = raw !== null && !/^\s*</.test(raw);
      const text = ok ? raw : tr().clauseError;
      // 原文(法令の条文)は言語に依存しない一次資料なのでそのままキャッシュする
      if (ok) clauseCache[id] = text;
      pre.textContent = text;
    } catch (e) {
      pre.textContent = tr().clauseError;
    }
  }
}

function bindRows() {
  document.querySelectorAll(".hoan-row").forEach((tr) => {
    const id = tr.getAttribute("data-id");
    tr.addEventListener("click", () => toggleDetail(id));
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleDetail(id);
      }
    });
  });
}

function buildStatusFilter() {
  const t = tr();
  const sf = document.getElementById("status-filter");
  sf.innerHTML = FILTER_KEYS.map((key) => {
    const label = key === "all" ? t.all : t.status[key];
    return `<button class="hoan-fbtn mono${key === activeStatus ? " is-active" : ""}" data-status="${key}">${escapeHTML(label)}</button>`;
  }).join("");
  sf.querySelectorAll(".hoan-fbtn").forEach((b) => {
    b.addEventListener("click", () => {
      activeStatus = b.getAttribute("data-status");
      sf.querySelectorAll(".hoan-fbtn").forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      render();
    });
  });
}

function buildYearOptions() {
  const years = Array.from(new Set(ROWS.map(yearOf))).sort();
  const yf = document.getElementById("year-filter");
  yf.innerHTML =
    `<option value="all">${escapeHTML(tr().yearAll)}</option>` +
    years.map((y) => `<option value="${y}">${y}</option>`).join("");
  yf.value = activeYear;
}

function applyStatic() {
  const t = tr();
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  set("t-back", t.back);
  set("t-title", t.title);
  set("t-desc", t.desc);
  set("t-note", t.note);
  set("t-year-label", t.yearLabel);
  set("t-col-law", t.colLaw);
  set("t-col-enact", t.colEnact);
  set("t-col-deadline", t.colDeadline);
  set("t-col-status", t.colStatus);
  set("t-footer-src", t.footerSrc);
  set("t-footer-corrections", t.footerCorrections);
  set("t-footer-about", t.footerAbout);
  set("t-footer-contact", t.footerContact);
  document.getElementById("lang-ja").classList.toggle("active", lang === "ja");
  document.getElementById("lang-en").classList.toggle("active", lang === "en");
  document.documentElement.lang = lang;
}

function applyAll() {
  applyStatic();
  buildStatusFilter();
  buildYearOptions();
  render();
}

async function main() {
  lang = document.documentElement.lang === "en" ? "en" : "ja";
  ROWS = await loadCSV("/data/hoan_review.csv");
  // lang-ja/lang-en は他ページの URL への実リンク(<a>)。切り替えはブラウザの通常の
  // ナビゲーションに任せるので、クリック自体にJSは要らない(home.js の同じ変更の
  // コメントを参照)。
  // 年フィルタの change リスナは要素が使い回されるため一度だけ張る
  document.getElementById("year-filter").addEventListener("change", (e) => {
    activeYear = e.target.value;
    render();
  });
  applyAll();
  // 絞り込みは中身が入ってから出す。JSが動かない場合は隠れたままになるが、
  // 表そのものは HTML に静的に入っている（bin/build.mjs が書き出す）ので読める。
  document.getElementById("controls").hidden = false;
}

main();
