const SVG_NS = "http://www.w3.org/2000/svg";
const CHART_W = 960;
const CHART_H = 480;
const PAD = { top: 20, right: 64, bottom: 32, left: 44 };

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function toNum(s) {
  return s === "" || s === undefined ? null : Number(s);
}

async function main() {
  const res = await fetch("data/gdp_forecast.csv");
  const text = await res.text();
  const rows = parseCSV(text)
    .map((r) => ({
      year: Number(r.fiscal_year),
      forecastReal: toNum(r.forecast_real),
      actualReal: toNum(r.actual_real),
      forecastSourceUrl: r.forecast_source_url,
      actualSourceUrl: r.actual_source_url,
    }))
    .sort((a, b) => a.year - b.year);

  const actualPoints = rows.filter((r) => r.actualReal !== null);
  const forecastYears = rows.filter((r) => r.forecastReal !== null);

  const allYears = rows.map((r) => r.year);
  const xMin = Math.min(...allYears);
  const xMax = Math.max(...allYears);

  const allValues = rows.flatMap((r) => [r.forecastReal, r.actualReal]).filter((v) => v !== null);
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

  // zero line
  svg.appendChild(
    svgEl("line", {
      class: "zero-line",
      x1: PAD.left,
      x2: CHART_W - PAD.right,
      y1: yScale(0),
      y2: yScale(0),
    })
  );

  // x axis ticks (every 5 years)
  for (let y = Math.ceil(xMin / 5) * 5; y <= xMax; y += 5) {
    const x = xScale(y);
    svg.appendChild(svgEl("line", { class: "axis-line", x1: x, x2: x, y1: PAD.top, y2: CHART_H - PAD.bottom }));
    const label = svgEl("text", { class: "axis-label", x, y: CHART_H - PAD.bottom + 16, "text-anchor": "middle" });
    label.textContent = y;
    svg.appendChild(label);
  }

  // y axis ticks + horizontal gridlines
  const yStep = yDomain[1] - yDomain[0] > 15 ? 5 : 2;
  for (let v = Math.ceil(yDomain[0] / yStep) * yStep; v <= yDomain[1]; v += yStep) {
    const y = yScale(v);
    if (v !== 0) {
      svg.appendChild(svgEl("line", { class: "grid-line-y", x1: PAD.left, x2: CHART_W - PAD.right, y1: y, y2: y }));
    }
    const label = svgEl("text", { class: "axis-label", x: PAD.left - 8, y: y + 3, "text-anchor": "end" });
    label.textContent = `${v}%`;
    svg.appendChild(label);
  }

  // actual line
  const linePath = actualPoints.map((r) => `${xScale(r.year)},${yScale(r.actualReal)}`).join(" L ");
  svg.appendChild(svgEl("path", { class: "line-actual", d: `M ${linePath}` }));

  // small dot marker at each actual data year
  actualPoints.forEach((r) => {
    svg.appendChild(svgEl("circle", { class: "line-actual-dot", cx: xScale(r.year), cy: yScale(r.actualReal), r: 1.75 }));
  });

  // end-of-line label for the actual series (fixed, near the last actual point)
  const lastActual = actualPoints[actualPoints.length - 1];
  const actualLabel = svgEl("text", {
    class: "end-label end-label-actual",
    x: xScale(lastActual.year) + 8,
    y: yScale(lastActual.actualReal) + 4,
  });
  actualLabel.textContent = "実績";
  svg.appendChild(actualLabel);

  // end-of-line label for the forecast marker (moves with the selected year)
  const forecastLabel = svgEl("text", { class: "end-label end-label-forecast", opacity: 0 });
  forecastLabel.textContent = "見通し";
  svg.appendChild(forecastLabel);

  // forecast/actual markers + link line for the selected year
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
  const vSource = document.getElementById("v-source");

  slider.min = 0;
  slider.max = forecastYears.length - 1;
  slider.value = forecastYears.length - 1;

  function render(idx) {
    const r = forecastYears[idx];
    yearReadout.textContent = `${r.year}年度`;

    const yearX = xScale(r.year);
    // when both markers exist they sit at the same x; offset each a few px
    // so a close forecast/actual pair never fully hides one behind the other
    const offset = r.actualReal !== null ? 4 : 0;
    const fx = yearX - offset;
    const fy = yScale(r.forecastReal);
    forecastPoint.setAttribute("cx", fx);
    forecastPoint.setAttribute("cy", fy);
    forecastPoint.setAttribute("opacity", 1);

    forecastLabel.setAttribute("x", yearX + 8);
    forecastLabel.setAttribute("y", fy + 4);
    forecastLabel.setAttribute("opacity", 1);

    vForecast.textContent = `実質 ${r.forecastReal > 0 ? "+" : ""}${r.forecastReal.toFixed(1)}%`;

    if (r.actualReal !== null) {
      const ax = yearX + offset;
      const ay = yScale(r.actualReal);
      actualPoint.setAttribute("cx", ax);
      actualPoint.setAttribute("cy", ay);
      actualPoint.setAttribute("opacity", 1);

      linkLine.setAttribute("x1", fx);
      linkLine.setAttribute("y1", fy);
      linkLine.setAttribute("x2", ax);
      linkLine.setAttribute("y2", ay);
      linkLine.setAttribute("opacity", 1);

      vActual.textContent = `実質 ${r.actualReal > 0 ? "+" : ""}${r.actualReal.toFixed(1)}%`;
      const diff = r.actualReal - r.forecastReal;
      vDiff.textContent = `${diff > 0 ? "+" : ""}${diff.toFixed(1)}pt`;
    } else {
      actualPoint.setAttribute("opacity", 0);
      linkLine.setAttribute("opacity", 0);
      vActual.textContent = "実績未確定(年度未終了)";
      vDiff.textContent = "—";
    }

    const links = [];
    if (r.forecastSourceUrl) links.push(`見通し出典: <a href="${r.forecastSourceUrl}" target="_blank" rel="noopener">${r.forecastSourceUrl}</a>`);
    if (r.actualSourceUrl) links.push(`実績出典: <a href="${r.actualSourceUrl}" target="_blank" rel="noopener">${r.actualSourceUrl}</a>`);
    vSource.innerHTML = links.join("<br>");
  }

  slider.addEventListener("input", () => render(Number(slider.value)));
  render(forecastYears.length - 1);
}

main();
