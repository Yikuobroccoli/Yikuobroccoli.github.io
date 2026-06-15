# A股成长/价值风格极化与市场反转风险看板

打开 `index.html` 使用。

这个新版看板不再把成长/价值百分位解释为单边“谁便宜”，而是先识别市场风格结构是否极化：

- `tail_intensity_5y = max(pct_5y, 1 - pct_5y)`
- `tail_intensity_10y = max(pct_10y, 1 - pct_10y)`
- `style_direction` 区分成长主导或价值主导
- `M_pct_5y`、`M_drawdown_252`、`R_M_pre60/120/252` 用于判断大盘阶段

主图支持：

- 可选指数
- 可选指标
- 可拖动时间轴切片
- 鼠标悬浮查看当日点位、百分位、双边偏离强度和大盘阶段

数据来源为本目录下的 `dashboard_data.js`，该数据包由 Stata 输出表生成，并已去除本机绝对路径，适合发布到 GitHub Pages。
