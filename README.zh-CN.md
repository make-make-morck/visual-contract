# VisualContract

把设计师写下的视觉规则，变成每次 Pull Request 都会执行的检查。

VisualContract 是一个 MIT 开源的 TypeScript CLI 和 GitHub Action。它可以检查响应式网页中的横向溢出、文字对比度、过小点击区域、对齐偏差、间距不一致，以及受保护区域的像素变化。确定性检查全部在本地运行，不依赖付费 API。

> 当前状态：**v0.1.0 MVP**。在 v1.0 前，公开 API 和 YAML 配置可能调整。欢迎真实项目试用并反馈。

## 快速开始

需要 Node.js 20 或更高版本。

```bash
npm install --save-dev visual-contract
npx playwright install chromium
npx visual-contract init
npx visual-contract check http://127.0.0.1:3000
```

本仓库附带一组可验证示例：

```bash
pnpm install
pnpm exec playwright install chromium
pnpm demo:serve
```

另开一个终端：

```bash
pnpm demo:check
pnpm dev check http://127.0.0.1:4173/fail.html --config examples/demo/visual-contract.yml
```

`pass.html` 应当通过；`fail.html` 故意包含溢出、低对比度、点击区域过小、错位和不等间距，应当以退出码 1 结束。

## 最重要的使用方式

- 用 `visual-contract init` 生成带注释的配置。
- 用 `alignment` 声明多个元素共享同一条边。
- 用 `spacing` 声明连续元素之间的间距应当一致。
- 用 `protectedRegions` 保护导航、结账摘要等关键视觉区域。
- 用 `--update-baselines` 明确接受新的基线，并在提交前人工审查。
- 使用 Markdown、JSON、终端输出或 GitHub Action 检查结果。

完整配置见 [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md)。英文 README 包含 GitHub Action、AI 可选功能、限制条件和退出码说明。

## 可选 AI 审查

`--ai-review` 会把已接受基线和当前整页截图发给 OpenAI Responses API，输出结构化的辅助意见。它默认关闭，需要 `OPENAI_API_KEY`，并且**永远不会改变确定性检查的通过/失败结果**。启用前请阅读 [`PRIVACY.md`](PRIVACY.md)。

## 项目真实性说明

这是一个可以构建、测试和运行的 v0.1.0 MVP，但新项目不能虚构 Star、下载量、外部采用方或处理 Issue 的数量。发布和申请步骤见 [`docs/LAUNCH_AND_APPLICATION.md`](docs/LAUNCH_AND_APPLICATION.md)。

## License

MIT。
