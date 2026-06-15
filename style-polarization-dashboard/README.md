# A股成长/价值风格极化与市场反转风险看板

这是一个可直接部署到 GitHub Pages 的静态看板包。入口文件是 `index.html`，数据文件是 `dashboard_data.js`。

## 部署到 GitHub Pages

1. 在 GitHub 新建一个仓库，例如 `style-polarization-dashboard`。
2. 把本文件夹内的全部文件上传到仓库根目录，包括 `.nojekyll`。
3. 进入仓库 `Settings` -> `Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/root`，保存。
6. 等 GitHub Pages 构建完成后，访问 `https://你的用户名.github.io/仓库名/`。

## 文件说明

- `index.html`：新版风格极化与市场反转风险看板。
- `polarization.css`：新版看板样式。
- `polarization.js`：新版看板交互逻辑。
- `dashboard_data.js`：截至 2026-06-12 的看板数据包。
- `legacy/`：旧版百分位看板，保留作对照入口。
- `.nojekyll`：让 GitHub Pages 原样发布静态文件。
- `README_看板逻辑.md`：看板核心逻辑说明。

## 更新数据

如果后续重新运行 Stata 并生成新版数据，只需要用新的 `dashboard_data.js` 覆盖本目录下同名文件，然后重新提交到 GitHub。
