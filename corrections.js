function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function safeUrl(url) {
  return /^https?:\/\//.test(url) ? url : null;
}

function renderEntry(r) {
  const url = safeUrl(r.url);
  const link = url
    ? `<a class="correction-link" href="${escapeHTML(url)}" target="_blank" rel="noopener">詳細 →</a>`
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

async function main() {
  const rows = await loadCSV("data/corrections.csv");
  const list = document.getElementById("corrections-list");

  if (rows.length === 0) {
    list.innerHTML = `<p class="correction-empty">現時点で訂正の記録はありません。</p>`;
    return;
  }

  const sorted = rows.slice().sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = sorted.map(renderEntry).join("");
}

main();
