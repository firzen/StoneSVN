### 项目地址

https://github.com/firzen/StoneSVN

### 类别

Rust

### 项目标题

支持三大桌面平台的开源 SVN 图形客户端

### 项目描述

StoneSVN 为仍在使用 SVN 的开发者提供图形工作台，把多个工作副本、文本差异和选择提交放在一起。未完成的修改可按文本变更块保存在本地贮藏中。支持 Windows、macOS 和 Linux，采用 Tauri、Rust 与 Vue 3 构建，基于 OrcaSVN 继续开发，MIT 开源。需要本机 SVN CLI，可从 Releases 下载安装包。

### 亮点

- 一个项目栏管理多个 SVN 工作副本，在当前会话中按项目保留提交草稿与勾选。
- 提交时按文件或目录选择范围；暂不提交的文本修改可以按变更块贮藏，再恢复到原副本。
- 支持全局忽略规则、提交时间线、文件历史、图片预览和 SVN 属性编辑。
- 提供简繁中文、英语、日语、韩语及浅色和深色主题。
- 对学习 Tauri 的开发者，源码展示了 Rust 调用本地 SVN 进程、解析 XML 并向 Vue 工作台提供数据的实现方式。

当前公开版本 v1.1.2。macOS 包采用 Ad-hoc 签名，未经过苹果公证；通用 Merge、Switch 和逐行 Blame 界面尚未提供。

### 示例代码

这是桌面应用，可在安装本机 SVN CLI 后直接打开已有 SVN 工作副本，或从仓库地址检出，再审阅差异并选择提交。

- 下载：https://github.com/firzen/StoneSVN/releases/latest
- 快速开始：https://github.com/firzen/StoneSVN/blob/main/QUICKSTART.md

### 截图或演示视频

官网包含浅色、深色工作台与属性页预览：https://stonesvn.github.io/zh-CN/

界面截图使用虚构项目数据。
