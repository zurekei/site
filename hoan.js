// 法案タブ: 見直し条項の期限テーブル。data/hoan_review.csv を読み、期限順に描画する。
// 条文原文は data/hoan_clauses/{law_id}.txt をクリック時に遅延取得する。
// 言語(ja/en)は localStorage "zurekei-lang" で index ページと共有する。

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

const T = {
  ja: {
    back: "← 指標一覧",
    title: "法律の見直し条項 — 期限と検討状況",
    desc: "多くの法律は、その附則に「施行後◯年を目途に検討を加える」という見直し条項を置いている。見直しの期限は「施行日＋◯年」で機械的に算出できる。ここでは期限順に並べ、期限が到来した法律を上に置く。数値・条文・出典のみを並べ、評価は書かない。",
    note: "「未確認」は検討が行われていないことを意味しない。検討の有無（審議会・報告書・改正等）は形態が多様なため自動判定しておらず、ここでは期限の到来までを機械的に記録している。",
    yearLabel: "年",
    colLaw: "法律",
    colEnact: "施行日",
    colDeadline: "見直し期限",
    colStatus: "状況",
    footerSrc: "src: e-Gov 法令検索(デジタル庁) 法令API",
    footerCorrections: "訂正履歴",
    footerAbout: "このサイトについて",
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
let lang = localStorage.getItem("zurekei-lang") === "en" ? "en" : "ja";
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
  return `
    <tr class="hoan-row" data-id="${escapeHTML(r.law_id)}" tabindex="0" aria-expanded="false">
      <td class="col-title">
        <div class="hoan-lawtitle">${escapeHTML(r.law_title)}</div>
        <div class="hoan-lawnum mono">${escapeHTML(r.law_num)}</div>
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
      const res = await fetch(`data/hoan_clauses/${id}.txt`);
      const text = res.ok ? await res.text() : tr().clauseError;
      // 原文(法令の条文)は言語に依存しない一次資料なのでそのままキャッシュする
      if (res.ok) clauseCache[id] = text;
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

function setLang(l) {
  lang = l;
  localStorage.setItem("zurekei-lang", l);
  applyAll();
}

async function main() {
  ROWS = await loadCSV("data/hoan_review.csv");
  document.getElementById("lang-ja").addEventListener("click", () => setLang("ja"));
  document.getElementById("lang-en").addEventListener("click", () => setLang("en"));
  // 年フィルタの change リスナは要素が使い回されるため一度だけ張る
  document.getElementById("year-filter").addEventListener("change", (e) => {
    activeYear = e.target.value;
    render();
  });
  applyAll();
}

main();
