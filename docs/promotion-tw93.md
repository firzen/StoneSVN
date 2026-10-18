**【开源自荐】StoneSVN：给仍在使用 SVN 的开发者一个桌面工作台**

分享一下 StoneSVN，一个基于 OrcaSVN 继续开发的 MIT 开源 SVN 客户端，支持 macOS、Windows 和 Linux。

它将日常工作集中到“查看变更 → 审阅 Diff → 选择提交”：多个工作副本可以在项目栏切换，提交时按文件或目录选择范围，暂不提交的修改可以按文本变更块保存到本地贮藏，再恢复继续处理。也支持全局忽略规则、文件历史、SVN 属性编辑、五种界面语言和深浅主题。

技术栈是 Tauri、Rust 和 Vue 3，当前提供 v1.1.2 安装包。需要本机 SVN CLI；macOS 包采用 Ad-hoc 签名、未公证。通用 Merge、Switch 和逐行 Blame 暂无完整界面。

- 官网和界面预览：https://stonesvn.github.io/zh-CN/
- 源码：https://github.com/firzen/StoneSVN
- 下载：https://github.com/firzen/StoneSVN/releases/latest

欢迎有 SVN 使用场景的朋友试用，尤其想了解多工作副本切换、提交范围选择和本地贮藏是否顺手。
