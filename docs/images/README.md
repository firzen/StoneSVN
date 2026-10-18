# 文档截图

更新日期：2026-10-18。截图来自 v1.1.2 源码的真实 Vue 开发界面，在本地 Vite 页面中渲染，展示属性页顶部操作栏与目录子项状态；不包含原生窗口边框，浏览器截图不作为原生桌面集成验收。

SVN 状态、Diff、文件树和属性使用 `workspace-demo.js` 中的虚构数据，没有连接远端仓库或执行 SVN 写操作。项目名、本地路径、仓库地址和代码内容均为示例，不读取真实工作副本、个人目录、账号或凭据。未扫描的示例项目不显示变更数量。

| 文件 | 场景 |
| --- | --- |
| `orcasvn-workspace.png` | 简体中文、浅色主题、1440 × 900，项目栏、顶栏、文件列表与选中文件 Diff |
| `orcasvn-workspace-dark.png` | 同一场景的深色主题 |
| `stonesvn-properties.png` | 简体中文、浅色主题、1440 × 900，文件树、状态标记、属性及文件操作栏 |
| `stonesvn-properties-dark.png` | 属性页的深色主题 |

## 重新截取

需要 Node.js、npm 和 Playwright CLI 可用的 Chromium 浏览器。使用独立浏览器会话，避免加载真实应用保存的项目列表。先在项目根目录启动 Vite：

```bash
npm run dev -- --host 127.0.0.1
```

另开终端，在项目根目录运行：

```bash
mkdir -p output/playwright
npx --package @playwright/cli playwright-cli -s=docs-refresh open http://127.0.0.1:1420
npx --package @playwright/cli playwright-cli -s=docs-refresh resize 1440 900
npx --package @playwright/cli playwright-cli -s=docs-refresh eval "async () => await (await import('/docs/images/workspace-demo.js')).default"
npx --package @playwright/cli playwright-cli -s=docs-refresh snapshot
npx --package @playwright/cli playwright-cli -s=docs-refresh run-code "async (page) => { await page.mouse.move(1400, 880); await page.screenshot({path: 'output/playwright/workspace-light.png'}); }"
npx --package @playwright/cli playwright-cli -s=docs-refresh eval "async () => { (await import('/src/composables/useSettings.ts')).useSettings().updateSettings({theme:'dark'}); await (await import('/node_modules/.vite/deps/vue.js')).nextTick(); }"
npx --package @playwright/cli playwright-cli -s=docs-refresh run-code "async (page) => { await page.screenshot({path: 'output/playwright/workspace-dark.png'}); }"
npx --package @playwright/cli playwright-cli -s=docs-refresh eval "async () => await (await import('/docs/images/workspace-demo.js')).showPropertiesDemo()"
npx --package @playwright/cli playwright-cli -s=docs-refresh snapshot
npx --package @playwright/cli playwright-cli -s=docs-refresh run-code "async (page) => { await page.screenshot({path: 'output/playwright/properties-dark.png'}); }"
npx --package @playwright/cli playwright-cli -s=docs-refresh eval "async () => { (await import('/src/composables/useSettings.ts')).useSettings().updateSettings({theme:'light'}); await (await import('/node_modules/.vite/deps/vue.js')).nextTick(); }"
npx --package @playwright/cli playwright-cli -s=docs-refresh run-code "async (page) => { await page.screenshot({path: 'output/playwright/properties-light.png'}); }"
npx --package @playwright/cli playwright-cli -s=docs-refresh close
```

截图前确认：项目列表只有 `stone-demo`、`docs-site` 和 `ui-components` 三个虚构项目，路径均以 `/workspaces/` 开头；六个示例文件已显示，`src/config.ts` 已选中，Diff 显示新增 3 行、删除 2 行，图标和字体均已加载。属性页展开 `src` 并选中 `config.ts`，属性地址仅使用 `svn.example.com`，本地示例属性以 `demo:` 为前缀。确认新 StoneSVN 图形及「添加本地副本／添加远程副本」双入口可见。截图后逐张检查文字、面板、错误提示和敏感信息，再替换文档图片：

```bash
cp output/playwright/workspace-light.png docs/images/orcasvn-workspace.png
cp output/playwright/workspace-dark.png docs/images/orcasvn-workspace-dark.png
cp output/playwright/properties-light.png docs/images/stonesvn-properties.png
cp output/playwright/properties-dark.png docs/images/stonesvn-properties-dark.png
```

脚本只在手动导入的开发浏览器会话中注入数据，不会被应用入口导入。刷新页面会移除模拟命令桥接，但示例项目与主题设置会保留在该会话的浏览器存储中。关闭后使用 Playwright CLI 的 `-s=docs-refresh delete-data` 清理专用会话数据。

本次检查覆盖四张截图的布局与示例数据。浏览器启动时缺少原生 Tauri 桥接的控制台提示，以及发布更新检查的网络结果，不作为桌面 SVN 集成验证依据。
