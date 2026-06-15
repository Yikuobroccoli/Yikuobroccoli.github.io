
const DATA = window.DASHBOARD_DATA;

const COLORS = [
  "#11756d", "#ad3f35", "#355f96", "#b57217", "#4b7f45", "#705c9c",
  "#7d6b2f", "#3e7aa1", "#9b4f72", "#5a6b4a", "#4d6172", "#8d6043",
  "#2f7f98", "#8b5f9d"
];

const state = {
  range: "all",
  zoomStart: 0,
  zoomEnd: null,
  selected: new Set(["G", "V", "M"]),
  pctSelected: new Set(["pct_5y", "pct_10y"]),
  eventType: "growth_extreme",
  horizon: 20,
};

const $ = (id) => document.getElementById(id);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const fmt = (v, d = 2) => isNum(v) ? v.toLocaleString("zh-CN", { maximumFractionDigits: d, minimumFractionDigits: d }) : "-";
const pct = (v, d = 1) => isNum(v) ? `${(v * 100).toFixed(d)}%` : "-";
const signedPct = (v, d = 1) => isNum(v) ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%` : "-";

function stateName(code) {
  const map = {
    growth_watch_90_95: "成长观察区 90%-95%",
    growth_light_95_975: "轻度成长极端 95%-97.5%",
    growth_medium_975_99: "中度成长极端 97.5%-99%",
    growth_high_99_100: "高度成长极端 99%-100%",
    growth_max_100: "满分成长极端 100%",
    value_watch_5_10: "价值观察区 5%-10%",
    value_light_25_5: "轻度价值极端 2.5%-5%",
    value_high_0_25: "高度价值极端 0%-2.5%",
    value_near_min: "接近价值端底部",
    neutral: "中性区间",
  };
  return map[code] || code || "-";
}

function pathName(code) {
  const map = {
    growth_derating: "成长杀跌 + 价值相对占优",
    risk_off: "风险收缩，价值相对抗跌",
    trend_extension: "成长趋势延续或相对抗跌",
    bull_rotation: "牛市内部价值补涨",
    bull_rotation_growth: "成长修复/成长补涨",
    risk_off_value_weaker: "风险收缩，价值相对更弱",
    trend_extension_value: "价值趋势延续",
  };
  return map[code] || code || "-";
}

function currentHint(row) {
  const p5 = row.pct_5y;
  const p10 = row.pct_10y;
  const doubleGrowth = p5 >= 0.95 && p10 >= 0.95;
  if ((p5 >= 0.99) || (p10 >= 0.99)) {
    return ["高强度成长过热", "接近历史顶部区域，优先审视成长超配，并用价值/红利/大盘仓位做再平衡。"];
  }
  if (doubleGrowth) {
    return ["成长双窗口极端", "5年和10年同时进入成长极端，减少继续追高，把重点放在历史路径和回撤风险上。"];
  }
  if (p5 >= 0.95 || p10 >= 0.95) {
    return ["轻度成长极端", "主要是过热预警。当前不等同于2020-2021年的高强度成长泡沫区，但应降低追高冲动。"];
  }
  if (p5 >= 0.90 || p10 >= 0.90) {
    return ["成长偏热观察", "成长相对价值处于偏热区，适合监控再平衡阈值，但不应机械判断反转。"];
  }
  if (p5 <= 0.05 || p10 <= 0.05) {
    return ["价值极端区", "成长相对价值处在低位，成长修复赔率上升，但需要大盘环境配合。"];
  }
  return ["中性状态", "当前不在主要极端区，维持观察，重点看风格价差是否继续接近阈值。"];
}

function baseRangeData() {
  const data = DATA.daily;
  if (state.range === "all") return data;
  const years = { "5y": 5, "3y": 3, "1y": 1 }[state.range];
  const last = new Date(data[data.length - 1].date);
  const start = new Date(last);
  start.setFullYear(start.getFullYear() - years);
  return data.filter(d => new Date(d.date) >= start);
}

function zoomBounds() {
  const base = baseRangeData();
  if (!base.length) return [0, 0];
  const max = base.length - 1;
  let start = Number.isInteger(state.zoomStart) ? state.zoomStart : 0;
  let end = Number.isInteger(state.zoomEnd) ? state.zoomEnd : max;
  start = Math.max(0, Math.min(max, start));
  end = Math.max(0, Math.min(max, end));
  if (start > end) [start, end] = [end, start];
  if (end - start < 4 && max >= 4) {
    end = Math.min(max, start + 4);
    start = Math.max(0, end - 4);
  }
  state.zoomStart = start;
  state.zoomEnd = end;
  return [start, end];
}

function rangeData() {
  const base = baseRangeData();
  const [start, end] = zoomBounds();
  return base.slice(start, end + 1);
}

function resetZoom() {
  state.zoomStart = 0;
  state.zoomEnd = null;
}

function clearNode(node) {
  node.innerHTML = "";
}

function extent(values) {
  const xs = values.filter(isNum);
  if (!xs.length) return [0, 1];
  let min = Math.min(...xs);
  let max = Math.max(...xs);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

function lineChart(target, series, opts = {}) {
  const node = $(target);
  clearNode(node);
  const rows = opts.rows || rangeData();
  if (!rows.length || !series.length) {
    node.innerHTML = '<div class="empty">没有可显示的数据</div>';
    return;
  }
  const width = Math.max(node.clientWidth || 680, 320);
  const height = opts.height || (node.classList.contains("tall") ? 360 : 300);
  const margin = { top: 24, right: 28, bottom: 34, left: 54 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const allY = [];
  const prepared = series.map(s => {
    const points = rows.map((row, i) => ({ i, date: row.date, y: s.value(row, i) })).filter(p => isNum(p.y));
    points.forEach(p => allY.push(p.y));
    return { ...s, points };
  }).filter(s => s.points.length);
  const [yMin, yMax] = extent(allY);
  const x = (i) => margin.left + (rows.length <= 1 ? 0 : i / (rows.length - 1) * innerW);
  const y = (v) => margin.top + (yMax - v) / (yMax - yMin) * innerH;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", opts.label || "line chart");

  for (let k = 0; k <= 4; k++) {
    const gy = margin.top + (innerH * k / 4);
    const val = yMax - (yMax - yMin) * k / 4;
    svg.insertAdjacentHTML("beforeend", `<line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${gy}" y2="${gy}"></line><text x="8" y="${gy + 4}" fill="#687169" font-size="11">${opts.yFormat ? opts.yFormat(val) : fmt(val, 2)}</text>`);
  }

  const ticks = [0, Math.floor(rows.length * .25), Math.floor(rows.length * .5), Math.floor(rows.length * .75), rows.length - 1];
  ticks.forEach(i => {
    const tx = x(i);
    svg.insertAdjacentHTML("beforeend", `<text x="${tx}" y="${height - 10}" fill="#687169" font-size="11" text-anchor="middle">${rows[i].date.slice(0, 7)}</text>`);
  });

  prepared.forEach((s, idx) => {
    const d = s.points.map((p, j) => `${j === 0 ? "M" : "L"}${x(p.i).toFixed(2)},${y(p.y).toFixed(2)}`).join(" ");
    svg.insertAdjacentHTML("beforeend", `<path class="line-series" d="${d}" stroke="${s.color || COLORS[idx % COLORS.length]}"></path>`);
  });

  const legend = prepared.map((s, i) => {
    const lx = margin.left + i * 132;
    const ly = 14 + Math.floor(i / 4) * 16;
    return `<g class="legend"><rect x="${lx}" y="${ly - 8}" width="10" height="10" fill="${s.color || COLORS[i % COLORS.length]}"></rect><text x="${lx + 15}" y="${ly}">${s.name}</text></g>`;
  }).join("");
  svg.insertAdjacentHTML("beforeend", legend);
  node.appendChild(svg);
}

function comboChart(target, rows, selectedKeys) {
  const node = $(target);
  clearNode(node);
  if (!rows.length) {
    node.innerHTML = '<div class="empty">没有可显示的数据</div>';
    return;
  }
  const width = Math.max(node.clientWidth || 920, 360);
  const height = 440;
  const margin = { top: 48, right: 62, bottom: 38, left: 58 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "指数与百分位联动图");

  const indexSeries = selectedKeys.map(key => {
    const base = rows.find(r => isNum(r[key]))?.[key];
    const color = COLORS[DATA.indexOrder.indexOf(key) % COLORS.length];
    const points = rows.map((row, i) => {
      const raw = row[key];
      const normalized = isNum(raw) && base ? raw / base * 100 : null;
      return { i, date: row.date, raw, y: normalized };
    }).filter(p => isNum(p.y));
    return { key, name: DATA.indexLabels[key] || key, color, points };
  }).filter(s => s.points.length);

  const leftVals = indexSeries.flatMap(s => s.points.map(p => p.y));
  const [leftMin, leftMax] = extent(leftVals.length ? leftVals : [95, 105]);
  const rightMin = 0;
  const rightMax = 100;
  const x = (i) => margin.left + (rows.length <= 1 ? 0 : i / (rows.length - 1) * innerW);
  const yLeft = (v) => margin.top + (leftMax - v) / (leftMax - leftMin) * innerH;
  const yRight = (v) => margin.top + (rightMax - v) / (rightMax - rightMin) * innerH;
  const path = (points, yScale) => points.map((p, j) => `${j === 0 ? "M" : "L"}${x(p.i).toFixed(2)},${yScale(p.y).toFixed(2)}`).join(" ");

  const pctSeries = [
    { key: "pct_5y", name: "pct_5y", color: "#11756d", points: rows.map((row, i) => ({ i, y: row.pct_5y * 100 })).filter(p => isNum(p.y)) },
    { key: "pct_10y", name: "pct_10y", color: "#ad3f35", points: rows.map((row, i) => ({ i, y: row.pct_10y * 100 })).filter(p => isNum(p.y)) },
  ].filter(s => state.pctSelected.has(s.key));
  const showPctAxis = pctSeries.length > 0;
  const thresholds = showPctAxis ? [
    { name: "95%", color: "#b57217", points: rows.map((_, i) => ({ i, y: 95 })) },
    { name: "5%", color: "#355f96", points: rows.map((_, i) => ({ i, y: 5 })) },
  ] : [];

  for (let k = 0; k <= 4; k++) {
    const gy = margin.top + innerH * k / 4;
    const leftVal = leftMax - (leftMax - leftMin) * k / 4;
    const rightVal = rightMax - (rightMax - rightMin) * k / 4;
    svg.insertAdjacentHTML("beforeend", `
      <line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${gy}" y2="${gy}"></line>
      <text x="8" y="${gy + 4}" fill="#687169" font-size="11">${fmt(leftVal, 0)}</text>
      ${showPctAxis ? `<text x="${width - 8}" y="${gy + 4}" fill="#687169" font-size="11" text-anchor="end">${rightVal.toFixed(0)}%</text>` : ""}
    `);
  }

  const ticks = [0, Math.floor(rows.length * .25), Math.floor(rows.length * .5), Math.floor(rows.length * .75), rows.length - 1];
  ticks.forEach(i => {
    const tx = x(i);
    svg.insertAdjacentHTML("beforeend", `<text x="${tx}" y="${height - 12}" fill="#687169" font-size="11" text-anchor="middle">${rows[i].date.slice(0, 7)}</text>`);
  });

  indexSeries.forEach(s => {
    svg.insertAdjacentHTML("beforeend", `<path class="line-series" d="${path(s.points, yLeft)}" stroke="${s.color}"></path>`);
  });
  pctSeries.forEach(s => {
    svg.insertAdjacentHTML("beforeend", `<path class="pct-series" d="${path(s.points, yRight)}" stroke="${s.color}"></path>`);
  });
  thresholds.forEach(s => {
    svg.insertAdjacentHTML("beforeend", `<path class="threshold-series" d="${path(s.points, yRight)}" stroke="${s.color}"></path>`);
  });

  const visibleEvents = DATA.events.filter(e => rows.some(r => r.date === e.event_date));
  visibleEvents.forEach(e => {
    const i = rows.findIndex(r => r.date === e.event_date);
    if (i >= 0) {
      const color = e.event_type === "growth_extreme" ? "#ad3f35" : "#355f96";
      const tx = x(i);
      svg.insertAdjacentHTML("beforeend", `<line x1="${tx}" x2="${tx}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="${color}" stroke-width="1" opacity="0.18"></line>`);
    }
  });

  const legendItems = [
    ...indexSeries.map(s => ({ name: s.name, color: s.color, dash: false })),
    ...pctSeries.map(s => ({ name: s.name, color: s.color, dash: true })),
    ...(showPctAxis ? [{ name: "95% / 5%阈值", color: "#8a7c61", dash: true }] : []),
  ];
  legendItems.slice(0, 18).forEach((s, i) => {
    const lx = margin.left + (i % 6) * 128;
    const ly = 16 + Math.floor(i / 6) * 16;
    const dash = s.dash ? 'stroke-dasharray="4 3"' : "";
    svg.insertAdjacentHTML("beforeend", `<g class="legend"><line x1="${lx}" x2="${lx + 13}" y1="${ly - 4}" y2="${ly - 4}" stroke="${s.color}" stroke-width="2" ${dash}></line><text x="${lx + 18}" y="${ly}">${s.name}</text></g>`);
  });

  const hoverLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  hoverLine.setAttribute("class", "hover-line");
  hoverLine.setAttribute("y1", margin.top);
  hoverLine.setAttribute("y2", height - margin.bottom);
  svg.appendChild(hoverLine);

  const dots = [];
  [...indexSeries.map(s => ({ ...s, scale: yLeft })), ...pctSeries.map(s => ({ ...s, scale: yRight }))].forEach(s => {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("r", "4");
    dot.setAttribute("fill", s.color);
    dot.setAttribute("class", "hover-dot");
    svg.appendChild(dot);
    dots.push({ dot, series: s });
  });

  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  overlay.setAttribute("x", margin.left);
  overlay.setAttribute("y", margin.top);
  overlay.setAttribute("width", innerW);
  overlay.setAttribute("height", innerH);
  overlay.setAttribute("fill", "transparent");
  overlay.style.cursor = "crosshair";
  svg.appendChild(overlay);

  node.appendChild(svg);
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  node.appendChild(tooltip);

  function showHover(evt) {
    const rect = svg.getBoundingClientRect();
    const mx = (evt.clientX - rect.left) * width / rect.width;
    const rel = Math.max(0, Math.min(1, (mx - margin.left) / innerW));
    const i = Math.round(rel * (rows.length - 1));
    const row = rows[i];
    const hx = x(i);
    hoverLine.setAttribute("x1", hx);
    hoverLine.setAttribute("x2", hx);
    hoverLine.style.opacity = "1";
    dots.forEach(({ dot, series }) => {
      const point = series.points.find(p => p.i === i);
      if (point && isNum(point.y)) {
        dot.setAttribute("cx", hx);
        dot.setAttribute("cy", series.scale(point.y));
        dot.style.opacity = "1";
      } else {
        dot.style.opacity = "0";
      }
    });
    const indexRows = selectedKeys.map(key => {
      const base = rows.find(r => isNum(r[key]))?.[key];
      const raw = row[key];
      const norm = isNum(raw) && base ? raw / base * 100 : null;
      return `<span>${DATA.indexLabels[key] || key}</span><b>${fmt(raw, 2)} / ${fmt(norm, 1)}</b>`;
    }).join("");
    tooltip.innerHTML = `
      <strong>${row.date}</strong>
      <div class="tip-grid">
        <span>S=ln(G/V)</span><b>${fmt(row.S, 4)}</b>
        <span>pct_5y</span><b>${pct(row.pct_5y, 1)}</b>
        <span>pct_10y</span><b>${pct(row.pct_10y, 1)}</b>
        <span>状态</span><b>${stateName(row.percentile_state)}</b>
        ${indexRows}
      </div>
    `;
    const nodeRect = node.getBoundingClientRect();
    const localX = evt.clientX - nodeRect.left;
    const localY = evt.clientY - nodeRect.top;
    const tipW = Math.min(360, Math.max(240, nodeRect.width - 18));
    const leftMax = Math.max(8, nodeRect.width - tipW - 8);
    const topMax = Math.max(8, nodeRect.height - 250);
    tooltip.style.left = `${Math.min(leftMax, Math.max(8, localX + 12))}px`;
    tooltip.style.top = `${Math.min(topMax, Math.max(8, localY + 12))}px`;
    tooltip.style.opacity = "1";
  }

  function hideHover() {
    hoverLine.style.opacity = "0";
    dots.forEach(({ dot }) => dot.style.opacity = "0");
    tooltip.style.opacity = "0";
  }

  overlay.addEventListener("mousemove", showHover);
  overlay.addEventListener("mouseleave", hideHover);
}

function barChart(target, rows, opts = {}) {
  const node = $(target);
  clearNode(node);
  if (!rows.length) {
    node.innerHTML = '<div class="empty">没有可显示的数据</div>';
    return;
  }
  const width = Math.max(node.clientWidth || 560, 320);
  const height = opts.height || 300;
  const margin = { top: 18, right: 26, bottom: 72, left: 58 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const vals = rows.map(r => r.value).filter(isNum);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const padMax = max === min ? max + 1 : max + (max - min) * .1;
  const padMin = max === min ? min - 1 : min - (max - min) * .1;
  const scaleY = (v) => margin.top + (padMax - v) / (padMax - padMin) * innerH;
  const bw = innerW / rows.length * .62;
  const gap = innerW / rows.length;
  const zero = scaleY(0);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  for (let k = 0; k <= 4; k++) {
    const gy = margin.top + innerH * k / 4;
    const val = padMax - (padMax - padMin) * k / 4;
    svg.insertAdjacentHTML("beforeend", `<line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${gy}" y2="${gy}"></line><text x="8" y="${gy + 4}" fill="#687169" font-size="11">${opts.yFormat ? opts.yFormat(val) : fmt(val, 2)}</text>`);
  }
  svg.insertAdjacentHTML("beforeend", `<line x1="${margin.left}" x2="${width - margin.right}" y1="${zero}" y2="${zero}" stroke="#97a098"></line>`);
  rows.forEach((r, i) => {
    const cx = margin.left + gap * i + gap / 2;
    const barH = Math.abs(scaleY(r.value) - zero);
    const yTop = r.value >= 0 ? scaleY(r.value) : zero;
    const color = r.color || (r.value >= 0 ? "#11756d" : "#ad3f35");
    svg.insertAdjacentHTML("beforeend", `<rect x="${cx - bw / 2}" y="${yTop}" width="${bw}" height="${barH}" fill="${color}" rx="3"></rect><text x="${cx}" y="${height - 45}" fill="#687169" font-size="11" text-anchor="middle" transform="rotate(-28 ${cx} ${height - 45})">${r.label}</text><text x="${cx}" y="${yTop - 5}" fill="#2b332e" font-size="11" text-anchor="middle">${opts.labelFormat ? opts.labelFormat(r.value) : fmt(r.value, 2)}</text>`);
  });
  node.appendChild(svg);
}

function table(target, columns, rows) {
  const node = $(target);
  if (!rows.length) {
    node.innerHTML = '<div class="empty">没有可显示的数据</div>';
    return;
  }
  const head = columns.map(c => `<th>${c.label}</th>`).join("");
  const body = rows.map(row => `<tr>${columns.map(c => `<td>${c.format ? c.format(row[c.key], row) : (row[c.key] ?? "-")}</td>`).join("")}</tr>`).join("");
  node.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderStatus() {
  const latest = DATA.latest;
  $("latestDate").textContent = `最新数据：${latest.date}`;
  const first = DATA.daily[0].date;
  $("sampleRange").textContent = `样本：${first} 至 ${latest.date}`;
  $("metricS").textContent = fmt(latest.S, 4);
  $("metricState").textContent = stateName(latest.percentile_state);
  $("metricPct5").textContent = pct(latest.pct_5y, 1);
  $("metricPct10").textContent = pct(latest.pct_10y, 1);
  $("gaugePct5").style.width = `${Math.max(0, Math.min(100, latest.pct_5y * 100))}%`;
  $("gaugePct10").style.width = `${Math.max(0, Math.min(100, latest.pct_10y * 100))}%`;
  const [title, body] = currentHint(latest);
  $("rebalanceTitle").textContent = title;
  $("rebalanceBody").textContent = body;
  $("dateLookup").value = latest.date;
  renderDayDetail(latest.date);
  document.querySelectorAll(".allocation-item").forEach(el => el.classList.remove("active"));
  const active = latest.pct_5y >= .99 || latest.pct_10y >= .99 ? "growth-max"
    : latest.pct_5y >= .95 || latest.pct_10y >= .95 ? "growth-extreme"
    : latest.pct_5y >= .90 || latest.pct_10y >= .90 ? "growth-watch"
    : latest.pct_5y <= .05 || latest.pct_10y <= .05 ? "value-extreme"
    : "";
  if (active) document.querySelector(`[data-zone="${active}"]`)?.classList.add("active");
}

function renderDayDetail(date) {
  const row = DATA.daily.find(d => d.date === date) || DATA.latest;
  const items = [
    ["日期", row.date],
    ["S", fmt(row.S, 4)],
    ["pct_5y", pct(row.pct_5y, 1)],
    ["pct_10y", pct(row.pct_10y, 1)],
    ["G 成长", fmt(row.G, 2)],
    ["V 价值", fmt(row.V, 2)],
    ["M 大盘", fmt(row.M, 2)],
    ["状态", stateName(row.percentile_state)],
    ["p95_5y", fmt(row.p95_5y, 4)],
    ["p95_10y", fmt(row.p95_10y, 4)],
    ["p05_5y", fmt(row.p05_5y, 4)],
    ["p05_10y", fmt(row.p05_10y, 4)],
  ];
  $("dayDetail").innerHTML = items.map(([k, v]) => `<div class="detail-item"><span>${k}</span><strong>${v}</strong></div>`).join("");
}

function renderStateCharts() {
  lineChart("spreadChart", [
    { name: "S=ln(G/V)", color: "#11756d", value: d => d.S },
    { name: "10年95%线", color: "#b57217", value: d => d.p95_10y },
    { name: "10年5%线", color: "#355f96", value: d => d.p05_10y },
  ], { yFormat: v => fmt(v, 2), label: "style spread" });
  lineChart("pctChart", [
    { name: "pct_5y", color: "#11756d", value: d => d.pct_5y * 100 },
    { name: "pct_10y", color: "#ad3f35", value: d => d.pct_10y * 100 },
    { name: "95%", color: "#b57217", value: () => 95 },
    { name: "5%", color: "#355f96", value: () => 5 },
  ], { yFormat: v => `${v.toFixed(0)}%`, label: "rolling percentile" });
}

function renderTimelineControls() {
  const base = baseRangeData();
  const [start, end] = zoomBounds();
  const max = Math.max(0, base.length - 1);
  const startInput = $("zoomStart");
  const endInput = $("zoomEnd");
  if (!startInput || !endInput || !base.length) return;
  startInput.max = max;
  endInput.max = max;
  startInput.value = start;
  endInput.value = end;
  $("zoomStartLabel").textContent = `起点：${base[start]?.date || "-"}`;
  $("zoomEndLabel").textContent = `终点：${base[end]?.date || "-"}`;
}

function renderZoomedDailyViews() {
  renderTimelineControls();
  renderStateCharts();
  renderIndexChart();
}

function renderIndexButtons() {
  $("indexButtons").innerHTML = DATA.indexOrder.map((key, i) => `
    <button class="index-button ${state.selected.has(key) ? "active" : ""}" data-index="${key}">
      <span class="swatch" style="background:${COLORS[i % COLORS.length]}"></span>${DATA.indexLabels[key] || key}
    </button>
  `).join("");
  document.querySelectorAll(".index-button").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.index;
      state.selected.has(key) ? state.selected.delete(key) : state.selected.add(key);
      renderIndexButtons();
      renderIndexChart();
    });
  });
}

function renderPctButtons() {
  const buttons = [
    { key: "pct_5y", label: "5年百分位", color: "#11756d" },
    { key: "pct_10y", label: "10年百分位", color: "#ad3f35" },
  ];
  $("pctButtons").innerHTML = buttons.map(btn => `
    <button class="pct-button ${state.pctSelected.has(btn.key) ? "active" : ""}" data-pct="${btn.key}">
      <span class="swatch" style="background:${btn.color}"></span>${btn.label}
    </button>
  `).join("");
  document.querySelectorAll(".pct-button").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.pct;
      state.pctSelected.has(key) ? state.pctSelected.delete(key) : state.pctSelected.add(key);
      renderPctButtons();
      renderIndexChart();
    });
  });
}

function renderIndexChart() {
  const rows = rangeData();
  const selected = [...state.selected].filter(k => DATA.indexOrder.includes(k));
  comboChart("indexChart", rows, selected);
  const latest = DATA.latest;
  table("latestIndexTable", [
    { key: "name", label: "指数" },
    { key: "value", label: `${latest.date}点位`, format: v => fmt(v, 2) },
  ], selected.map(k => ({ name: DATA.indexLabels[k] || k, value: latest[k] })));
}

function renderStrength() {
  const h = state.horizon;
  const type = state.eventType;
  const rows = DATA.strength.filter(r => r.event_type === type && r.horizon === h && ["R_G", "R_V", "R_M", "SR_GV"].includes(r.variable));
  const sr = rows.filter(r => r.variable === "SR_GV");
  const chartRows = sr.map(r => ({
    label: stateName(r.extreme_level),
    value: r.mean,
    color: r.mean >= 0 ? "#11756d" : "#ad3f35",
  }));
  barChart("strengthChart", chartRows, { yFormat: v => signedPct(v, 0), labelFormat: v => signedPct(v, 1) });

  const events = DATA.events
    .filter(e => e.event_type === type)
    .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)))
    .slice(0, 16);
  table("eventTable", [
    { key: "event_date", label: "日期" },
    { key: "extreme_level", label: "等级", format: v => stateName(v) },
    { key: "pct_5y", label: "pct_5y", format: v => pct(v, 1) },
    { key: "pct_10y", label: "pct_10y", format: v => pct(v, 1) },
    { key: `SR_GV_${h}`, label: `SR_GV_${h}`, format: v => signedPct(v, 1) },
    { key: `R_G_${h}`, label: `G_${h}`, format: v => signedPct(v, 1) },
    { key: `R_V_${h}`, label: `V_${h}`, format: v => signedPct(v, 1) },
  ], events);
}

function renderPath() {
  const h = state.horizon;
  const type = state.eventType;
  const current = DATA.currentEvent || {};
  const currentPath = DATA.events.find(e => e.event_date === current.event_date);
  const pathKey = `path_type_${h}`;
  const pathValue = currentPath?.[pathKey] || currentPath?.path_type_20 || "-";
  $("currentPath").innerHTML = `
    <strong>${pathName(pathValue)}</strong>
    <p>最近识别事件：${current.event_date || "-"}，${stateName(current.extreme_level)}，${current.window_confirmation === "double_window" ? "双窗口确认" : "单窗口确认"}。20日已实现：成长 ${signedPct(current.R_G_20, 1)}、价值 ${signedPct(current.R_V_20, 1)}、大盘 ${signedPct(current.R_M_20, 1)}、SR_GV ${signedPct(current.SR_GV_20, 1)}。</p>
  `;
  const rows = DATA.paths.filter(r => r.event_type === type && r.horizon === h);
  barChart("pathChart", rows.map(r => ({
    label: pathName(r.path_type),
    value: r.share,
    color: "#355f96",
  })), { yFormat: v => pct(v, 0), labelFormat: v => pct(v, 0) });
  table("pathTable", [
    { key: "path_type", label: "路径", format: v => pathName(v) },
    { key: "N", label: "次数" },
    { key: "share", label: "占比", format: v => pct(v, 1) },
    { key: "mean_R_G", label: "成长", format: v => signedPct(v, 1) },
    { key: "mean_R_V", label: "价值", format: v => signedPct(v, 1) },
    { key: "mean_R_M", label: "大盘", format: v => signedPct(v, 1) },
    { key: "mean_SR_GV", label: "SR_GV", format: v => signedPct(v, 1) },
  ], rows);
}

function renderRobustness() {
  const rows = DATA.robustness
    .filter(r => r.event_type === state.eventType && r.horizon === state.horizon)
    .slice(0, 12);
  table("robustnessTable", [
    { key: "test_type", label: "稳健性设定" },
    { key: "pair", label: "组合" },
    { key: "N", label: "事件数" },
    { key: "mean_SR", label: "平均SR", format: v => signedPct(v, 1) },
    { key: "repair_rate", label: "修复率", format: v => pct(v, 1) },
  ], rows);
  const quality = Object.fromEntries(DATA.dataQuality.map(r => [r.check_name, r.check_value]));
  $("sourceNote").textContent = `数据源：Stata 输出表。样本 ${quality.sample_start_date || DATA.daily[0].date} 至 ${quality.sample_end_date || DATA.latest.date}；主日频样本 ${quality.main_daily_rows || DATA.daily.length} 行；冷却后事件 ${quality.cooled_event_count || DATA.events.length} 个。看板生成时间：${DATA.generatedAt}。`;
}

function renderAll() {
  document.querySelectorAll("[data-range]").forEach(btn => btn.classList.toggle("active", btn.dataset.range === state.range));
  renderStatus();
  renderTimelineControls();
  renderStateCharts();
  renderIndexButtons();
  renderPctButtons();
  renderIndexChart();
  renderStrength();
  renderPath();
  renderRobustness();
}

function wireControls() {
  document.querySelectorAll("[data-range]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.range = btn.dataset.range;
      resetZoom();
      renderAll();
    });
  });
  $("eventTypeSelect").addEventListener("change", e => {
    state.eventType = e.target.value;
    renderStrength();
    renderPath();
    renderRobustness();
  });
  $("horizonSelect").addEventListener("change", e => {
    state.horizon = Number(e.target.value);
    renderStrength();
    renderPath();
    renderRobustness();
  });
  $("dateLookup").addEventListener("change", e => renderDayDetail(e.target.value));
  $("zoomStart").addEventListener("input", e => {
    state.zoomStart = Number(e.target.value);
    renderZoomedDailyViews();
  });
  $("zoomEnd").addEventListener("input", e => {
    state.zoomEnd = Number(e.target.value);
    renderZoomedDailyViews();
  });
  $("resetZoom").addEventListener("click", () => {
    resetZoom();
    renderZoomedDailyViews();
  });
  $("coreOnly").addEventListener("click", () => {
    state.selected = new Set(["G", "V", "M"]);
    renderIndexButtons();
    renderIndexChart();
  });
  $("selectAll").addEventListener("click", () => {
    state.selected = new Set(DATA.indexOrder);
    renderIndexButtons();
    renderIndexChart();
  });
  $("clearAll").addEventListener("click", () => {
    state.selected = new Set();
    renderIndexButtons();
    renderIndexChart();
  });
}

wireControls();
renderAll();
