const SOURCE = window.DASHBOARD_DATA;

const COLORS = [
  "#11756d", "#ad3f35", "#355f96", "#b57217", "#4b7f45", "#705c9c",
  "#7d6b2f", "#3e7aa1", "#9b4f72", "#5a6b4a", "#4d6172", "#8d6043",
  "#2f7f98", "#8b5f9d"
];

const INDEX_LABELS = SOURCE.indexLabels;
const INDEX_ORDER = SOURCE.indexOrder;

const INDICATORS = [
  { key: "tail_intensity_5y", label: "5年双边偏离", color: "#11756d", format: "pct" },
  { key: "tail_intensity_10y", label: "10年双边偏离", color: "#ad3f35", format: "pct" },
  { key: "pct_5y", label: "5年方向百分位", color: "#3e7aa1", format: "pct" },
  { key: "pct_10y", label: "10年方向百分位", color: "#8d6043", format: "pct" },
  { key: "M_pct_5y", label: "大盘5年分位", color: "#705c9c", format: "pct" },
  { key: "M_drawdown_252", label: "大盘1年回撤", color: "#ad3f35", format: "pct" },
  { key: "R_M_pre60", label: "大盘前60日收益", color: "#4b7f45", format: "pct" },
  { key: "R_M_pre120", label: "大盘前120日收益", color: "#b57217", format: "pct" },
];

const state = {
  range: "all",
  zoomStart: 0,
  zoomEnd: null,
  selectedIndices: new Set(["G", "V", "M"]),
  selectedIndicators: new Set(["tail_intensity_10y", "pct_10y", "M_pct_5y"]),
  horizon: 20,
  eventFilter: "all",
};

const $ = (id) => document.getElementById(id);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const fmt = (v, d = 2) => isNum(v) ? v.toLocaleString("zh-CN", { maximumFractionDigits: d, minimumFractionDigits: d }) : "-";
const pct = (v, d = 1) => isNum(v) ? `${(v * 100).toFixed(d)}%` : "-";
const signedPct = (v, d = 1) => isNum(v) ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%` : "-";

function pctRank(values, current) {
  const xs = values.filter(isNum);
  if (!xs.length || !isNum(current)) return null;
  return xs.filter(v => v <= current).length / xs.length;
}

function avg(values) {
  const xs = values.filter(isNum);
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function maxLast(rows, key, start, end) {
  let m = null;
  for (let i = start; i <= end; i++) {
    const v = rows[i]?.[key];
    if (isNum(v)) m = m === null ? v : Math.max(m, v);
  }
  return m;
}

function deriveDaily() {
  const rows = SOURCE.daily.map(r => ({ ...r }));
  rows.forEach((row, i) => {
    row.tail_intensity_5y = isNum(row.pct_5y) ? Math.max(row.pct_5y, 1 - row.pct_5y) : null;
    row.tail_intensity_10y = isNum(row.pct_10y) ? Math.max(row.pct_10y, 1 - row.pct_10y) : null;
    row.tail_intensity_max = Math.max(row.tail_intensity_5y || 0, row.tail_intensity_10y || 0);
    row.tail_intensity_avg = avg([row.tail_intensity_5y, row.tail_intensity_10y]);
    row.style_pct_avg = avg([row.pct_5y, row.pct_10y]);
    row.style_direction = row.style_pct_avg >= 0.5 ? "growth_led" : "value_led";
    row.style_direction_cn = row.style_direction === "growth_led" ? "成长主导" : "价值主导";
    row.style_polarization_level = polarizationLevel(row.tail_intensity_max);
    row.R_M_pre60 = i >= 60 && isNum(rows[i - 60].M) ? row.M / rows[i - 60].M - 1 : null;
    row.R_M_pre120 = i >= 120 && isNum(rows[i - 120].M) ? row.M / rows[i - 120].M - 1 : null;
    row.R_M_pre252 = i >= 252 && isNum(rows[i - 252].M) ? row.M / rows[i - 252].M - 1 : null;
    const hiStart = Math.max(0, i - 251);
    const high252 = maxLast(rows, "M", hiStart, i);
    row.M_drawdown_252 = isNum(high252) && high252 !== 0 ? row.M / high252 - 1 : null;
    const maStart = Math.max(0, i - 251);
    row.M_MA252 = avg(rows.slice(maStart, i + 1).map(d => d.M));
    row.M_above_MA252 = isNum(row.M_MA252) && isNum(row.M) ? row.M >= row.M_MA252 : null;
    const pctStart = Math.max(0, i - 1249);
    row.M_pct_5y = pctRank(rows.slice(pctStart, i + 1).map(d => d.M), row.M);
    row.market_stage = marketStage(row);
    row.quadrant = quadrant(row);
  });
  return rows;
}

function polarizationLevel(v) {
  if (!isNum(v)) return "无法判断";
  if (v < 0.90) return "正常区";
  if (v < 0.95) return "观察区";
  if (v < 0.975) return "轻度极化";
  if (v < 0.99) return "中度极化";
  return "高度极化";
}

function marketStage(row) {
  const high = (row.M_pct_5y >= 0.75 && (row.R_M_pre120 > 0 || row.M_above_MA252)) || (row.M_drawdown_252 > -0.06 && row.R_M_pre252 > 0.10);
  const low = row.M_pct_5y <= 0.30 || row.M_drawdown_252 <= -0.20 || (!row.M_above_MA252 && row.R_M_pre120 < 0);
  if (high) return "大盘高位/上涨后期";
  if (low) return "大盘低位/风险偏好弱";
  return "大盘中位/过渡";
}

function quadrant(row) {
  const dir = row.style_direction;
  const stage = row.market_stage;
  if (dir === "growth_led" && stage.includes("高位")) return "growth_high";
  if (dir === "growth_led" && stage.includes("低位")) return "growth_low";
  if (dir === "value_led" && stage.includes("高位")) return "value_high";
  if (dir === "value_led" && stage.includes("低位")) return "value_low";
  return dir === "growth_led" ? "growth_mid" : "value_mid";
}

function quadrantName(q) {
  return {
    growth_high: "成长主导极化 + 大盘高位",
    growth_low: "成长主导极化 + 大盘低位",
    value_high: "价值主导极化 + 大盘高位",
    value_low: "价值主导极化 + 大盘低位",
    growth_mid: "成长主导 + 大盘中位",
    value_mid: "价值主导 + 大盘中位",
  }[q] || q;
}

function quadrantMeaning(q) {
  return {
    growth_high: "成长拥挤，牛市成长段可能过热；关注成长回撤、价值补涨和大盘调整。",
    growth_low: "防御性成长占优，价值被压制；大盘修复后关注价值补涨。",
    value_high: "价值/周期/金融主导的后期行情；优先警惕大盘顶部反转。",
    value_low: "成长被深度压制，风险偏好低；大盘反弹时关注成长修复。",
    growth_mid: "成长相对占优，但大盘阶段未给出强顶部或底部信号。",
    value_mid: "价值相对占优，但大盘阶段未给出强顶部或底部信号。",
  }[q] || "";
}

const daily = deriveDaily();
const dailyByDate = new Map(daily.map(d => [d.date, d]));

function deriveEvents() {
  return SOURCE.events.map(e => {
    const d = dailyByDate.get(e.event_date) || {};
    const out = { ...e, ...d };
    [20, 60, 120, 252].forEach(h => {
      out[`dual_path_${h}`] = dualPath(out, h);
      out[`style_reversal_${h}`] = styleReversal(out, h);
      out[`market_turn_${h}`] = marketTurn(out, h);
    });
    return out;
  });
}

function styleReversal(row, h) {
  const sr = row[`SR_GV_${h}`];
  const ds = row[`delta_S_${h}`];
  if (!isNum(sr) && !isNum(ds)) return null;
  if (row.style_direction === "growth_led") return (isNum(sr) && sr < 0) || (isNum(ds) && ds < 0);
  return (isNum(sr) && sr > 0) || (isNum(ds) && ds > 0);
}

function marketTurn(row, h) {
  const rm = row[`R_M_${h}`];
  const pre = row.R_M_pre120;
  if (!isNum(rm) || !isNum(pre)) return "未判定";
  if (pre > 0 && rm < 0) return "大盘顶部反转";
  if (pre < 0 && rm > 0) return "大盘底部反转";
  return "未触发";
}

function dualPath(row, h) {
  const rm = row[`R_M_${h}`];
  const mt = marketTurn(row, h);
  const sr = styleReversal(row, h);
  if (!isNum(rm) || sr === null) return "样本未完成";
  if (mt === "大盘顶部反转") return "大盘顶部反转";
  if (mt === "大盘底部反转") return "大盘底部反转";
  if (sr && rm >= 0) return "风格均值回复 + 大盘上涨";
  if (sr && rm < 0) return "风格均值回复 + 大盘下跌";
  if (!sr && rm >= 0) return "风格趋势延续 + 大盘上涨";
  return "风格趋势延续 + 大盘下跌";
}

const events = deriveEvents();

function baseRangeData() {
  if (state.range === "all") return daily;
  const years = { "5y": 5, "3y": 3, "1y": 1 }[state.range];
  const last = new Date(daily[daily.length - 1].date);
  const start = new Date(last);
  start.setFullYear(start.getFullYear() - years);
  return daily.filter(d => new Date(d.date) >= start);
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

function extent(values, fallback = [0, 1]) {
  const xs = values.filter(isNum);
  if (!xs.length) return fallback;
  let min = Math.min(...xs);
  let max = Math.max(...xs);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

function renderStatus() {
  const latest = daily[daily.length - 1];
  const first = daily[0];
  $("latestDate").textContent = `最新数据：${latest.date}`;
  $("sampleRange").textContent = `样本：${first.date} 至 ${latest.date}`;
  $("metricIntensity").textContent = pct(latest.tail_intensity_max, 1);
  $("metricIntensityNote").textContent = `${latest.style_polarization_level}；5年 ${pct(latest.tail_intensity_5y, 1)}，10年 ${pct(latest.tail_intensity_10y, 1)}`;
  $("metricDirection").textContent = latest.style_direction_cn;
  $("metricDirectionNote").textContent = `pct_5y ${pct(latest.pct_5y, 1)}，pct_10y ${pct(latest.pct_10y, 1)}`;
  $("metricMarket").textContent = latest.market_stage;
  $("metricMarketNote").textContent = `M分位 ${pct(latest.M_pct_5y, 1)}，1年回撤 ${signedPct(latest.M_drawdown_252, 1)}`;
  $("metricQuadrant").textContent = quadrantName(latest.quadrant);
  $("metricRiskNote").textContent = currentRiskNote(latest);
  renderCurrentDetail(latest);
  renderQuadrants(latest);
  renderInterpretation(latest);
}

function currentRiskNote(row) {
  if (row.tail_intensity_max < 0.95) return "目前主要是观察区，不是高强度反转预警。";
  if (row.tail_intensity_max < 0.975) return `${quadrantName(row.quadrant)}，但仅属轻度极化；有反转观察意义，尚不是高强度预警。`;
  if (row.quadrant === "value_high") return "价值主导极化叠加大盘高位，更应关注大盘顶部风险。";
  if (row.quadrant === "growth_high") return "成长主导极化叠加大盘高位，关注成长拥挤和大盘调整。";
  if (row.quadrant === "value_low") return "价值主导极化叠加大盘低位，关注大盘反弹中的成长修复。";
  if (row.quadrant === "growth_low") return "成长主导极化叠加大盘低位，关注风险偏好修复后的风格再平衡。";
  return "风格结构已偏离，但大盘阶段仍处过渡区。";
}

function renderCurrentDetail(row) {
  const items = [
    ["S=ln(G/V)", fmt(row.S, 4)],
    ["pct_5y / pct_10y", `${pct(row.pct_5y, 1)} / ${pct(row.pct_10y, 1)}`],
    ["tail_5y / tail_10y", `${pct(row.tail_intensity_5y, 1)} / ${pct(row.tail_intensity_10y, 1)}`],
    ["前60日/120日大盘", `${signedPct(row.R_M_pre60, 1)} / ${signedPct(row.R_M_pre120, 1)}`],
    ["前252日大盘", signedPct(row.R_M_pre252, 1)],
    ["M 5年分位", pct(row.M_pct_5y, 1)],
    ["M 252日回撤", signedPct(row.M_drawdown_252, 1)],
    ["年线位置", row.M_above_MA252 ? "年线上方" : "年线下方"],
    ["中证800 M", fmt(row.M, 2)],
    ["成长 G", fmt(row.G, 2)],
    ["价值 V", fmt(row.V, 2)],
    ["当前解释", currentRiskNote(row)],
  ];
  $("currentDetail").innerHTML = items.map(([k, v]) => `<div class="detail-item"><span>${k}</span><strong>${v}</strong></div>`).join("");
}

function renderPickButtons() {
  $("indexButtons").innerHTML = INDEX_ORDER.map((key, i) => `
    <button class="pick-button ${state.selectedIndices.has(key) ? "active" : ""}" data-index="${key}">
      <span class="swatch" style="background:${COLORS[i % COLORS.length]}"></span>${INDEX_LABELS[key] || key}
    </button>
  `).join("");
  document.querySelectorAll("[data-index]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.index;
      state.selectedIndices.has(key) ? state.selectedIndices.delete(key) : state.selectedIndices.add(key);
      renderPickButtons();
      renderMainChart();
    });
  });

  $("indicatorButtons").innerHTML = INDICATORS.map(ind => `
    <button class="pick-button ${state.selectedIndicators.has(ind.key) ? "active" : ""}" data-indicator="${ind.key}">
      <span class="swatch" style="background:${ind.color}"></span>${ind.label}
    </button>
  `).join("");
  document.querySelectorAll("[data-indicator]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.indicator;
      state.selectedIndicators.has(key) ? state.selectedIndicators.delete(key) : state.selectedIndicators.add(key);
      renderPickButtons();
      renderMainChart();
    });
  });
}

function renderTimelineControls() {
  const base = baseRangeData();
  const [start, end] = zoomBounds();
  const max = Math.max(0, base.length - 1);
  $("zoomStart").max = max;
  $("zoomEnd").max = max;
  $("zoomStart").value = start;
  $("zoomEnd").value = end;
  $("zoomStartLabel").textContent = `起点：${base[start]?.date || "-"}`;
  $("zoomEndLabel").textContent = `终点：${base[end]?.date || "-"}`;
}

function mainChartSeries(rows) {
  const selectedIndices = [...state.selectedIndices].filter(k => INDEX_ORDER.includes(k));
  const indexSeries = selectedIndices.map(key => {
    const base = rows.find(r => isNum(r[key]))?.[key];
    return {
      key,
      name: INDEX_LABELS[key] || key,
      color: COLORS[INDEX_ORDER.indexOf(key) % COLORS.length],
      points: rows.map((row, i) => {
        const raw = row[key];
        const normalized = isNum(raw) && base ? raw / base * 100 : null;
        return { i, raw, y: normalized };
      }).filter(p => isNum(p.y)),
    };
  }).filter(s => s.points.length);

  const indicatorSeries = INDICATORS.filter(ind => state.selectedIndicators.has(ind.key)).map(ind => ({
    ...ind,
    points: rows.map((row, i) => ({ i, raw: row[ind.key], y: isNum(row[ind.key]) ? row[ind.key] * 100 : null })).filter(p => isNum(p.y)),
  })).filter(s => s.points.length);
  return { indexSeries, indicatorSeries, selectedIndices };
}

function renderMainChart() {
  const node = $("mainChart");
  clearNode(node);
  const rows = rangeData();
  if (!rows.length) {
    node.innerHTML = '<div class="empty">没有可显示的数据</div>';
    return;
  }
  renderTimelineControls();
  const hoverDetail = $("mainHoverDetail");
  const { indexSeries, indicatorSeries, selectedIndices } = mainChartSeries(rows);
  updateHoverDetail(rows[rows.length - 1], rows, selectedIndices);
  const width = Math.max(node.clientWidth || 960, 360);
  const height = 460;
  const margin = { top: 52, right: indicatorSeries.length ? 68 : 28, bottom: 38, left: 58 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "风格极化主图");
  const leftVals = indexSeries.flatMap(s => s.points.map(p => p.y));
  const [leftMin, leftMax] = extent(leftVals, [90, 110]);
  const indVals = indicatorSeries.flatMap(s => s.points.map(p => p.y));
  let [rightMin, rightMax] = extent(indVals, [0, 100]);
  if (indicatorSeries.length && indVals.some(v => v < 0)) rightMin = Math.min(rightMin, -40);
  if (indicatorSeries.length && indVals.some(v => v > 75)) rightMax = Math.max(rightMax, 100);
  const x = (i) => margin.left + (rows.length <= 1 ? 0 : i / (rows.length - 1) * innerW);
  const yLeft = (v) => margin.top + (leftMax - v) / (leftMax - leftMin) * innerH;
  const yRight = (v) => margin.top + (rightMax - v) / (rightMax - rightMin) * innerH;
  const path = (points, yScale) => points.map((p, j) => `${j === 0 ? "M" : "L"}${x(p.i).toFixed(2)},${yScale(p.y).toFixed(2)}`).join(" ");

  for (let k = 0; k <= 4; k++) {
    const gy = margin.top + innerH * k / 4;
    const leftVal = leftMax - (leftMax - leftMin) * k / 4;
    const rightVal = rightMax - (rightMax - rightMin) * k / 4;
    svg.insertAdjacentHTML("beforeend", `
      <line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${gy}" y2="${gy}"></line>
      <text x="8" y="${gy + 4}" fill="#687169" font-size="11">${fmt(leftVal, 0)}</text>
      ${indicatorSeries.length ? `<text x="${width - 8}" y="${gy + 4}" fill="#687169" font-size="11" text-anchor="end">${rightVal.toFixed(0)}%</text>` : ""}
    `);
  }

  const ticks = [0, Math.floor(rows.length * .25), Math.floor(rows.length * .5), Math.floor(rows.length * .75), rows.length - 1];
  ticks.forEach(i => {
    svg.insertAdjacentHTML("beforeend", `<text x="${x(i)}" y="${height - 12}" fill="#687169" font-size="11" text-anchor="middle">${rows[i].date.slice(0, 7)}</text>`);
  });

  const visibleEvents = events.filter(e => rows.some(r => r.date === e.event_date));
  visibleEvents.forEach(e => {
    const i = rows.findIndex(r => r.date === e.event_date);
    if (i >= 0) {
      const color = e.style_direction === "growth_led" ? "#ad3f35" : "#355f96";
      svg.insertAdjacentHTML("beforeend", `<line class="event-marker" x1="${x(i)}" x2="${x(i)}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="${color}"></line>`);
    }
  });

  indexSeries.forEach(s => svg.insertAdjacentHTML("beforeend", `<path class="line-series" d="${path(s.points, yLeft)}" stroke="${s.color}"></path>`));
  indicatorSeries.forEach(s => svg.insertAdjacentHTML("beforeend", `<path class="indicator-series" d="${path(s.points, yRight)}" stroke="${s.color}"></path>`));

  [...indexSeries.map(s => ({ ...s, dash: false })), ...indicatorSeries.map(s => ({ ...s, dash: true }))].slice(0, 18).forEach((s, i) => {
    const lx = margin.left + (i % 6) * 130;
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
  [...indexSeries.map(s => ({ ...s, scale: yLeft })), ...indicatorSeries.map(s => ({ ...s, scale: yRight }))].forEach(s => {
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

  function updateHoverDetail(row, visibleRows, visibleIndices) {
    const indexRows = visibleIndices.map(key => {
      const base = visibleRows.find(r => isNum(r[key]))?.[key];
      const raw = row[key];
      const norm = isNum(raw) && base ? raw / base * 100 : null;
      return `<span>${INDEX_LABELS[key] || key}</span><b>${fmt(raw, 2)} / ${fmt(norm, 1)}</b>`;
    }).join("");
    const indicatorRows = INDICATORS.filter(ind => state.selectedIndicators.has(ind.key)).map(ind => `<span>${ind.label}</span><b>${signedPct(row[ind.key], 1)}</b>`).join("");
    hoverDetail.innerHTML = `
      <strong>${row.date}</strong>
      <div class="tip-grid">
        <span>风格方向</span><b>${row.style_direction_cn}</b>
        <span>极化等级</span><b>${row.style_polarization_level}</b>
        <span>S=ln(G/V)</span><b>${fmt(row.S, 4)}</b>
        <span>pct_5y / pct_10y</span><b>${pct(row.pct_5y, 1)} / ${pct(row.pct_10y, 1)}</b>
        <span>大盘阶段</span><b>${row.market_stage}</b>
        ${indicatorRows}
        ${indexRows}
      </div>
    `;
  }

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
    updateHoverDetail(row, rows, selectedIndices);
  }

  function hideHover() {
    hoverLine.style.opacity = "0";
    dots.forEach(({ dot }) => dot.style.opacity = "0");
  }

  overlay.addEventListener("mousemove", showHover);
  overlay.addEventListener("mouseleave", hideHover);
}

function renderQuadrants(latest) {
  const cards = [
    ["growth_high", "成长主导极化 + 大盘高位", "成长拥挤，关注成长回撤、价值补涨、大盘调整。"],
    ["growth_low", "成长主导极化 + 大盘低位", "防御性成长占优，大盘修复后关注价值补涨。"],
    ["value_high", "价值主导极化 + 大盘高位", "后期价值/周期行情，优先警惕大盘顶部反转。"],
    ["value_low", "价值主导极化 + 大盘低位", "成长被深度压制，大盘反弹时关注成长修复。"],
  ];
  $("quadrantGrid").innerHTML = cards.map(([key, title, body]) => `
    <div class="quadrant-card ${latest.quadrant === key ? "active" : ""}">
      <strong>${title}</strong><span>${body}</span>
    </div>
  `).join("");
}

function pathColor(path) {
  if (path.includes("顶部")) return "#ad3f35";
  if (path.includes("底部")) return "#11756d";
  if (path.includes("均值回复")) return "#355f96";
  return "#b57217";
}

function filteredEvents() {
  const latest = daily[daily.length - 1];
  return events.filter(e => {
    if (state.eventFilter === "same_direction") return e.style_direction === latest.style_direction;
    if (state.eventFilter === "same_quadrant") return e.quadrant === latest.quadrant;
    return true;
  });
}

function renderPathViews() {
  const h = state.horizon;
  const rows = filteredEvents().filter(e => e[`dual_path_${h}`] !== "样本未完成");
  const counts = new Map();
  rows.forEach(e => counts.set(e[`dual_path_${h}`], (counts.get(e[`dual_path_${h}`]) || 0) + 1));
  const total = rows.length || 1;
  const chartRows = [...counts.entries()].map(([label, count]) => ({ label, value: count / total, count, color: pathColor(label) }));
  barChart("pathChart", chartRows, { yFormat: v => pct(v, 0), labelFormat: v => pct(v, 0) });
  const tableRows = rows.slice().sort((a, b) => String(b.event_date).localeCompare(String(a.event_date))).slice(0, 18);
  table("eventTable", [
    { key: "event_date", label: "日期" },
    { key: "style_direction_cn", label: "方向" },
    { key: "style_polarization_level", label: "极化" },
    { key: "market_stage", label: "大盘阶段" },
    { key: `dual_path_${h}`, label: `${h}日路径` },
    { key: `SR_GV_${h}`, label: "SR_GV", format: v => signedPct(v, 1) },
    { key: `R_M_${h}`, label: "大盘", format: v => signedPct(v, 1) },
    { key: "tail_intensity_max", label: "强度", format: v => pct(v, 1) },
  ], tableRows);
}

function barChart(target, rows, opts = {}) {
  const node = $(target);
  clearNode(node);
  if (!rows.length) {
    node.innerHTML = '<div class="empty">没有可显示的数据</div>';
    return;
  }
  const width = Math.max(node.clientWidth || 520, 320);
  const height = 310;
  const margin = { top: 16, right: 24, bottom: 78, left: 56 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const max = Math.max(...rows.map(r => r.value), 0.01);
  const y = (v) => margin.top + (max - v) / max * innerH;
  const gap = innerW / rows.length;
  const bw = gap * 0.56;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  for (let k = 0; k <= 4; k++) {
    const gy = margin.top + innerH * k / 4;
    const val = max - max * k / 4;
    svg.insertAdjacentHTML("beforeend", `<line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${gy}" y2="${gy}"></line><text x="8" y="${gy + 4}" fill="#687169" font-size="11">${opts.yFormat ? opts.yFormat(val) : fmt(val, 2)}</text>`);
  }
  rows.forEach((r, i) => {
    const cx = margin.left + i * gap + gap / 2;
    const by = y(r.value);
    svg.insertAdjacentHTML("beforeend", `<rect x="${cx - bw / 2}" y="${by}" width="${bw}" height="${height - margin.bottom - by}" fill="${r.color}" rx="3"></rect><text x="${cx}" y="${height - 50}" fill="#687169" font-size="11" text-anchor="middle" transform="rotate(-28 ${cx} ${height - 50})">${r.label}</text><text x="${cx}" y="${by - 5}" fill="#2b332e" font-size="11" text-anchor="middle">${opts.labelFormat ? opts.labelFormat(r.value) : fmt(r.value, 2)}</text>`);
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

function renderInterpretation(row) {
  const cards = [
    ["结构判断", `当前是${row.style_direction_cn}，双边偏离强度为${pct(row.tail_intensity_max, 1)}，处于${row.style_polarization_level}。低百分位不自动等于成长买点，高百分位也不自动等于价值买点。`],
    ["大盘语境", `中证800处于${row.market_stage}，前120日收益为${signedPct(row.R_M_pre120, 1)}，距离252日高点${signedPct(row.M_drawdown_252, 1)}。同样的风格极化在高位和低位含义不同。`],
    ["看板用途", "本看板用于识别市场结构是否失衡，并对照历史路径；它不输出确定性行情预测，也不把百分位机械转成买卖信号。"],
  ];
  $("interpretation").innerHTML = cards.map(([title, body]) => `<div class="interpretation-card"><strong>${title}</strong><p>${body}</p></div>`).join("");
  $("sourceNote").textContent = `数据来自 Stata 输出表；日频样本 ${daily[0].date} 至 ${daily[daily.length - 1].date}，事件样本 ${events.length} 个。`;
}

function renderAll() {
  document.querySelectorAll("[data-range]").forEach(btn => btn.classList.toggle("active", btn.dataset.range === state.range));
  renderStatus();
  renderPickButtons();
  renderTimelineControls();
  renderMainChart();
  renderPathViews();
}

function wireControls() {
  document.querySelectorAll("[data-range]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.range = btn.dataset.range;
      resetZoom();
      renderAll();
    });
  });
  $("zoomStart").addEventListener("input", e => {
    state.zoomStart = Number(e.target.value);
    renderMainChart();
  });
  $("zoomEnd").addEventListener("input", e => {
    state.zoomEnd = Number(e.target.value);
    renderMainChart();
  });
  $("resetZoom").addEventListener("click", () => {
    resetZoom();
    renderMainChart();
  });
  $("coreOnly").addEventListener("click", () => {
    state.selectedIndices = new Set(["G", "V", "M"]);
    renderPickButtons();
    renderMainChart();
  });
  $("selectAll").addEventListener("click", () => {
    state.selectedIndices = new Set(INDEX_ORDER);
    renderPickButtons();
    renderMainChart();
  });
  $("clearAll").addEventListener("click", () => {
    state.selectedIndices = new Set();
    renderPickButtons();
    renderMainChart();
  });
  $("horizonSelect").addEventListener("change", e => {
    state.horizon = Number(e.target.value);
    renderPathViews();
  });
  $("eventFilter").addEventListener("change", e => {
    state.eventFilter = e.target.value;
    renderPathViews();
  });
}

wireControls();
renderAll();
