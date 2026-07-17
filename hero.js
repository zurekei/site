// トップページ開幕演出: 「いま何年か」のカーソルが1980→2025を掃引し、
// 見通し線(琥珀)が先に伸び、実績線(白)が数年遅れで追いかける。どちらも実線。
// 見通しは年度初に出て、実績は1年以上あとに確定する——その時間差の構造を
// そのまま動きにしたもの。
// 評価語・色による善悪の示唆は置かない(色は見通し/実績の区別のみ)。
(async function heroMain() {
  const svg = document.getElementById("hero-chart");
  if (!svg) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const W = 960;
  const H = 340;
  const PAD = { top: 18, right: 64, bottom: 30, left: 44 };

  function el(tag, attrs) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  const rows = (await loadCSV("data/gdp_forecast.csv"))
    .map((r) => ({
      year: Number(r.fiscal_year),
      f: toNum(r.forecast_real),
      a: toNum(r.actual_real),
    }))
    .sort((x, y) => x.year - y.year);

  const years = rows.map((r) => r.year);
  const xMin = Math.min(...years);
  const xMax = Math.max(...years);
  const vals = rows.flatMap((r) => [r.f, r.a]).filter((v) => v !== null);
  const pad = (Math.max(...vals) - Math.min(...vals)) * 0.1;
  const yMin = Math.min(...vals, 0) - pad;
  const yMax = Math.max(...vals, 0) + pad;

  const x = (yr) => PAD.left + ((yr - xMin) / (xMax - xMin)) * (W - PAD.left - PAD.right);
  const y = (v) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - (v - yMin) / (yMax - yMin));

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- axes ---
  const axesGroup = el("g", { opacity: reduceMotion ? 1 : 0 });
  axesGroup.appendChild(el("line", { class: "zero-line", x1: PAD.left, x2: W - PAD.right, y1: y(0), y2: y(0) }));
  for (let yr = Math.ceil(xMin / 5) * 5; yr <= xMax; yr += 5) {
    axesGroup.appendChild(el("line", { class: "axis-line", x1: x(yr), x2: x(yr), y1: PAD.top, y2: H - PAD.bottom }));
    const t = el("text", { class: "axis-label", x: x(yr), y: H - PAD.bottom + 16, "text-anchor": "middle" });
    t.textContent = yr;
    axesGroup.appendChild(t);
  }
  for (let v = -4; v <= 6; v += 2) {
    if (v !== 0) axesGroup.appendChild(el("line", { class: "grid-line-y", x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v) }));
    const t = el("text", { class: "axis-label", x: PAD.left - 8, y: y(v) + 3, "text-anchor": "end" });
    t.textContent = `${v}%`;
    axesGroup.appendChild(t);
  }
  svg.appendChild(axesGroup);

  // --- 描画の「時間の進み」はクリップ矩形の右端で表す。2本の線の先端位置を
  //     同じ座標系で独立に制御できるよう、stroke-dashoffsetではなくclipを使う ---
  const defs = el("defs", {});
  const forecastClipRect = el("rect", { x: 0, y: 0, width: reduceMotion ? W : 0, height: H });
  const actualClipRect = el("rect", { x: 0, y: 0, width: reduceMotion ? W : 0, height: H });
  const fClip = el("clipPath", { id: "hero-clip-forecast" });
  fClip.appendChild(forecastClipRect);
  const aClip = el("clipPath", { id: "hero-clip-actual" });
  aClip.appendChild(actualClipRect);
  defs.appendChild(fClip);
  defs.appendChild(aClip);
  svg.appendChild(defs);

  // --- forecast line (見通しを繋いだ1本の破線) ---
  const forecastPts = rows.filter((r) => r.f !== null);
  const forecastPath = el("path", {
    class: "line-forecast",
    d: `M ${forecastPts.map((r) => `${x(r.year)},${y(r.f)}`).join(" L ")}`,
    "clip-path": "url(#hero-clip-forecast)",
  });
  svg.appendChild(forecastPath);

  // --- actual line ---
  const actualPts = rows.filter((r) => r.a !== null);
  const actualPath = el("path", {
    class: "line-actual",
    d: `M ${actualPts.map((r) => `${x(r.year)},${y(r.a)}`).join(" L ")}`,
    "clip-path": "url(#hero-clip-actual)",
  });
  svg.appendChild(actualPath);

  // --- sparks (ズレが大きい年は、実績線の通過後ずっと明滅し続ける) ---
  // 対象は |実績-見通し| が平均+1標準偏差を超える年。統計的な基準のみで選び、
  // 色や形で善悪は示唆しない。reduce-motion時は明滅させず静的なリングを置く
  const diffs = rows
    .filter((r) => r.f !== null && r.a !== null)
    .map((r) => ({ year: r.year, a: r.a, gap: Math.abs(r.a - r.f) }));
  const gapMean = diffs.reduce((s, d) => s + d.gap, 0) / diffs.length;
  const gapSd = Math.sqrt(diffs.reduce((s, d) => s + (d.gap - gapMean) ** 2, 0) / diffs.length);
  const sparks = diffs
    .filter((d) => d.gap > gapMean + gapSd)
    .map((d) => {
      const node = el("circle", {
        class: "hero-spark",
        cx: x(d.year),
        cy: y(d.a),
        r: reduceMotion ? 6 : 3.5,
        opacity: reduceMotion ? 0.55 : 0,
      });
      svg.appendChild(node);
      return { year: d.year, node, triggered: reduceMotion };
    });

  const lastForecast = forecastPts[forecastPts.length - 1];
  const forecastLabel = el("text", {
    class: "end-label end-label-forecast",
    x: x(lastForecast.year) + 8,
    y: y(lastForecast.f) + 4,
    opacity: reduceMotion ? 1 : 0,
  });
  forecastLabel.id = "hero-label-forecast";
  forecastLabel.textContent = "見通し";
  svg.appendChild(forecastLabel);

  const lastActual = actualPts[actualPts.length - 1];
  const actualLabel = el("text", {
    class: "end-label end-label-actual",
    x: x(lastActual.year) + 8,
    y: y(lastActual.a) + 4,
    opacity: reduceMotion ? 1 : 0,
  });
  actualLabel.id = "hero-label-actual";
  actualLabel.textContent = "実績";
  svg.appendChild(actualLabel);

  if (reduceMotion) return;

  // コピーはCSS上デフォルトで見える状態(reduce-motion時の静的表示のため)。
  // 演出時のみJSで初期非表示にしてフェードインさせる
  const copyEl = document.getElementById("hero-copy");
  if (copyEl) {
    copyEl.style.opacity = 0;
    copyEl.style.transform = "translateY(10px)";
  }

  const LAG_YEARS = 3;
  const YEAR_MS = 110;
  const START_DELAY = 400;

  function startSequence() {
    axesGroup.style.transition = "opacity 0.4s ease";
    setTimeout(() => (axesGroup.style.opacity = 1), 20);

    let t0 = null;
    function frame(now) {
      if (t0 === null) t0 = now;
      const elapsed = now - t0 - START_DELAY;
      if (elapsed < 0) {
        requestAnimationFrame(frame);
        return;
      }
      // 「いま何年か」: 見通し線の先端。実績線はLAG_YEARS遅れて追う
      const cursor = xMin + elapsed / YEAR_MS;
      const fFront = Math.min(cursor, xMax);
      const aFront = Math.min(cursor - LAG_YEARS, xMax);

      forecastClipRect.setAttribute("width", Math.max(0, x(fFront)));
      actualClipRect.setAttribute("width", Math.max(0, x(aFront)));

      sparks.forEach((s) => {
        if (!s.triggered && aFront >= s.year) {
          s.triggered = true;
          s.node.classList.add("on");
        }
      });

      if (cursor < xMax + LAG_YEARS) {
        requestAnimationFrame(frame);
      } else {
        forecastLabel.style.transition = "opacity 0.5s ease";
        forecastLabel.style.opacity = 1;
        actualLabel.style.transition = "opacity 0.5s ease";
        actualLabel.style.opacity = 1;
        if (copyEl) {
          setTimeout(() => {
            copyEl.style.transition = "opacity 0.9s ease, transform 0.9s ease";
            copyEl.style.opacity = 1;
            copyEl.style.transform = "translateY(0)";
          }, 300);
        }
      }
    }
    requestAnimationFrame(frame);
  }

  // バックグラウンドタブで開かれた場合、見られないまま演出が終わらないよう
  // タブが見えるまで開始を遅らせる(rAF駆動なので非表示中は自然に停止する)
  if (document.visibilityState === "hidden") {
    document.addEventListener("visibilitychange", function onVis() {
      if (document.visibilityState === "visible") {
        document.removeEventListener("visibilitychange", onVis);
        startSequence();
      }
    });
  } else {
    startSequence();
  }
})();
