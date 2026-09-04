/* ============================================================
   chart.js — tiny dependency-free SVG bar chart
   No external libraries: keeps the app fully static and offline.
   ============================================================ */

const Chart = (() => {
  // opts: { labels: [...], values: [...], targetValue (optional line),
  //         max (optional, default 100), height, formatValue(fn) }
  function renderBarChart(container, opts) {
    const labels = opts.labels || [];
    const values = opts.values || [];
    const max = opts.max ?? 100;
    const w = Math.max(container.clientWidth || 600, labels.length * 46);
    const h = opts.height || 200;
    const padTop = 14, padBottom = 26, padLeft = 8, padRight = 8;
    const plotH = h - padTop - padBottom;
    const barSlot = (w - padLeft - padRight) / Math.max(labels.length, 1);
    const barW = Math.min(barSlot * 0.55, 34);

    const yFor = (v) => padTop + plotH - (Math.max(0, Math.min(v, max)) / max) * plotH;

    let bars = "";
    let axisLabels = "";
    values.forEach((v, i) => {
      const x = padLeft + i * barSlot + (barSlot - barW) / 2;
      const y = v === null ? padTop + plotH : yFor(v);
      const barH = v === null ? 0 : (padTop + plotH - y);
      bars += `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="2"></rect>`;
      const label = labels[i] ?? "";
      axisLabels += `<text x="${(x + barW / 2).toFixed(1)}" y="${h - 8}" font-size="10" text-anchor="middle">${label}</text>`;
      if (v !== null) {
        bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" font-size="10" text-anchor="middle">${Math.round(v)}</text>`;
      }
    });

    let gridlines = "";
    [0, 25, 50, 75, 100].forEach((g) => {
      if (g > max) return;
      const y = yFor(g);
      gridlines += `<line class="gridline" x1="${padLeft}" x2="${w - padRight}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
    });

    let targetLine = "";
    if (opts.targetValue !== undefined && opts.targetValue !== null) {
      const y = yFor(opts.targetValue);
      targetLine = `<line class="target-line" x1="${padLeft}" x2="${w - padRight}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
    }

    container.innerHTML = `
      <svg class="svg-chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="xMinYMid meet">
        ${gridlines}
        ${targetLine}
        ${bars}
        ${axisLabels}
      </svg>`;
  }

  return { renderBarChart };
})();
