推荐一个面向仍在使用 SVN 的开发者的开源桌面客户端：**StoneSVN**。支持 Windows、macOS 和 Linux，采用 MIT 许可证，基于 OrcaSVN 继续开发。

- 官网与界面预览：https://stonesvn.github.io/zh-CN/
- GitHub：https://github.com/firzen/StoneSVN
- 安装包：https://github.com/firzen/StoneSVN/releases/latest

很多项目仍需要使用 SVN。StoneSVN 将日常的“查看变更 → 审阅差异 → 选择提交”集中到一个工作台，适合管理多个工作副本，以及希望在不同操作系统上使用同一套界面的开发者。

主要功能：

- **多工作副本管理**：通过项目栏切换工作副本，在当前会话中按项目保留提交草稿、勾选和筛选条件。
- **审阅差异与选择提交**：查看文本 Diff，按文件或目录选择提交范围。
- **本地贮藏**：暂存尚未准备提交的修改，支持按文本变更块选择，再恢复到原工作副本。
- **历史和文件操作**：查看提交时间线及单文件历史，预览图片、编辑 SVN 属性，支持保留历史的重命名与移动。
- **全局忽略**：在所有工作副本中统一过滤临时文件。
- **多语言与主题**：支持简繁中文、英文、日文、韩文及浅色、深色主题。

当前正式版本为 v1.1.2，提供 Windows、macOS（Apple Silicon / Intel）和 Linux 安装包。技术栈为 Tauri、Rust 和 Vue 3，调用本机 SVN CLI，需要另行安装 SVN 命令行工具。

macOS 安装包采用 Ad-hoc 签名，尚未经过苹果公证，首次打开方式见官网。通用 Merge、Switch 和逐行 Blame 界面尚未提供。

欢迎有 SVN 使用场景的朋友试用，也欢迎通过 [Issues](https://github.com/firzen/StoneSVN/issues) 反馈系统版本、SVN 版本及遇到的问题。
