# Contributing

[English](CONTRIBUTING.md) | 简体中文

感谢参与 StoneSVN。请保持改动聚焦、可验证，并确保界面语义与 SVN CLI 行为一致。

## 开发流程

1. 从 `main` 创建短生命周期分支。
2. 使用 `npm ci` 安装锁定版本的依赖。
3. 实现改动，并为解析、参数构造等纯逻辑补充测试。
4. 运行 `npm run check`。
5. 在 Pull Request 中说明用户可见行为、风险和验证方式。

完整 SVN 集成测试需要同时提供 `svn` 和 `svnadmin`；缺少工具时部分 Rust 用例会提前返回。原生 USN 测试还依赖 NTFS 卷读取权限，不能只凭测试显示通过就认定该路径已验证。

性能基准为显式运行的 ignored 测试，测量范围和重跑方法见 [工作区加载基准](docs/workspace-startup-benchmark.zh-CN.md)。正式版发布步骤、版本校验及失败重跑见 [发布流程](docs/releasing.zh-CN.md)，候选版本见 [预发布流程](docs/prerelease.zh-CN.md)。

## 代码约定

- 前端使用 Vue 3 Composition API、TypeScript 和现有 Pinia/composable 模式。
- 后端保持 `executor`、`operations`、`parser` 的职责边界。
- 文件路径参数必须放在 SVN 的 `--` 参数边界之后。
- 新增用户可见文本时同步更新全部语言资源。
- 不提交 `dist/`、`node_modules/` 或 `src-tauri/target/`。

## 文档语言

- `README.md`、`QUICKSTART.md` 和 `docs/` 下不带语言后缀的 Markdown 默认使用英文。
- 简体中文译文保存在同目录的 `.zh-CN.md` 文件中，双方提供语言切换链接。中文文档优先链接已有中文对应版本。
- `README.en.md` 保留英文兼容入口，英文主入口为 `README.md`；`.zh-TW.md`、`.ja.md`、`.ko.md` 保留各自语言。
- 同步维护受影响译文及对应的章节锚点，翻译技术记录时保留历史数据和验证边界。

## 提交信息

推荐使用简洁的 Conventional Commits 风格：

```text
feat: add conflict status filter
fix: separate svn file targets from options
docs: clarify local development workflow
```
