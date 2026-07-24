// 法案タブ: 見直し条項の期限テーブル。data/hoan_review.csv を読み、期限順に描画する。
// 条文原文は data/hoan_clauses/{law_id}.txt をクリック時に遅延取得する。

const STATUS = {
  due:         { label: "期限到来・未確認", cls: "st-due",  order: 0 },
  pending:     { label: "期限前",           cls: "st-pend", order: 1 },
  no_deadline: { label: "定めなし",         cls: "st-none", order: 2 },
  reviewed:    { label: "検討確認済み",     cls: "st-rev",  order: -1 },
};

const FILTERS = [
  { key: "all",         label: "すべて" },
  { key: "due",         label: "期限到来・未確認" },
  { key: "pending",     label: "期限前" },
  { key: "no_deadline", label: "定めなし" },
];

let ROWS = [];
let activeStatus = "all";
let activeYear = "all";
const clauseCache = {};

function yearOf(r) {
  return (r.promulgation_date || "").slice(0, 4);
}

function statusMeta(r) {
  return STATUS[r.review_status] || STATUS.pending;
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
  const total = rows.length;
  document.getElementById("summary").textContent =
    `${total} 件（うち 期限到来・未確認 ${due} 件）`;
}

function rowHTML(r) {
  const meta = statusMeta(r);
  const deadline = r.review_deadline || "定めなし";
  const yrs = r.review_years ? `施行後${r.review_years}年` : "期限の定めなし";
  const staged = r.enforcement_note ? `<span class="hoan-staged mono">${escapeHTML(r.enforcement_note)}</span>` : "";
  const url = safeUrl(r.source_law_url);
  const src = url
    ? `<a class="hoan-srclink mono" href="${escapeHTML(url)}" target="_blank" rel="noopener">e-Gov ↗</a>`
    : "";
  return `
    <tr class="hoan-row" data-id="${escapeHTML(r.law_id)}" tabindex="0" aria-expanded="false">
      <td class="col-title">
        <div class="hoan-lawtitle">${escapeHTML(r.law_title)}</div>
        <div class="hoan-lawnum mono">${escapeHTML(r.law_num)}</div>
      </td>
      <td class="col-date mono">${escapeHTML(r.enforcement_date || "—")}${staged}</td>
      <td class="col-date mono">${escapeHTML(deadline)}<div class="hoan-yrs mono">${escapeHTML(yrs)}</div></td>
      <td class="col-status"><span class="hoan-badge ${meta.cls}">${meta.label}</span></td>
    </tr>
    <tr class="hoan-detail" data-detail="${escapeHTML(r.law_id)}" hidden>
      <td colspan="4">
        <div class="hoan-clause-head mono">見直し条項（原文） ${src}</div>
        <pre class="hoan-clause" id="clause-${escapeHTML(r.law_id)}">読み込み中…</pre>
      </td>
    </tr>`;
}

function render() {
  const rows = sortRows(visible());
  const tbody = document.getElementById("rows");
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="hoan-empty">該当する法律はありません。</td></tr>`;
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
      const text = res.ok ? await res.text() : "（原文を取得できませんでした）";
      clauseCache[id] = text;
      pre.textContent = text;
    } catch (e) {
      pre.textContent = "（原文を取得できませんでした）";
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

function buildControls() {
  const sf = document.getElementById("status-filter");
  sf.innerHTML = FILTERS.map(
    (f) => `<button class="hoan-fbtn mono${f.key === "all" ? " is-active" : ""}" data-status="${f.key}">${f.label}</button>`
  ).join("");
  sf.querySelectorAll(".hoan-fbtn").forEach((b) => {
    b.addEventListener("click", () => {
      activeStatus = b.getAttribute("data-status");
      sf.querySelectorAll(".hoan-fbtn").forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      render();
    });
  });

  const years = Array.from(new Set(ROWS.map(yearOf))).sort();
  const yf = document.getElementById("year-filter");
  yf.innerHTML =
    `<option value="all">すべて</option>` +
    years.map((y) => `<option value="${y}">${y}</option>`).join("");
  yf.addEventListener("change", () => {
    activeYear = yf.value;
    render();
  });
}

async function main() {
  ROWS = await loadCSV("data/hoan_review.csv");
  buildControls();
  render();
}

main();
