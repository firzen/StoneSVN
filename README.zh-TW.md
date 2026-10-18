# StoneSVN

[官方網站](https://stonesvn.github.io)

[简体中文](README.md) | 繁體中文 | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

StoneSVN 是一款以 Tauri、Rust 和 Vue 3 打造的跨平台 SVN 桌面用戶端。它將 Git 用戶端清晰的工作副本體驗帶到 SVN，同時保留 SVN 的集中式版本控制模式。

![StoneSVN 軟體介面](docs/images/orcasvn-workspace.png)

目前原始碼的開發介面，於 2026-10-18 擷取；專案、路徑與差異皆為虛構資料，不含真實儲存庫或個人資訊。[深色主題](docs/images/orcasvn-workspace-dark.png)。

目前正式版本為 **1.1.0**，更新內容見[發布說明](docs/releases/v1.1.0.md)。

## 核心功能

- 透過持久專案欄切換工作副本、拖曳排序與調整欄寬，頂部工具列集中常用操作
- 設定檔案過濾規則，支援 `*`、`?` 與 `**` 萬用字元，加入版本控制與提交時檢查範圍
- 預覽文字差異與圖片，並提供二進位檔案與目錄的外部開啟入口
- 透過專案樹與遞迴檔案搜尋瀏覽屬性，編輯常用 SVN 屬性與自訂文字屬性；套用後仍需提交
- 以類似 `git status` 的分類檢視本機變更、未納入版本控制的檔案、衝突和遺失檔案
- 簽出、更新、按檔案或目錄選擇提交、加入版本控制、還原與清理工作副本
- 本機貯藏：按檔案或文字區塊儲存修改，並還原至原工作副本
- 瀏覽提交時間軸與分頁檔案歷史，檢視歷史差異並切換相鄰版本
- 支援簡體中文、繁體中文、英文、日文和韓文
- 支援 Windows、macOS、Linux，以及淺色與深色主題

> StoneSVN 使用本機安裝的 `svn` 命令列工具，不會自行實作 SVN 通訊協定。

Switch 與一般 Merge 仍需使用其他 SVN 用戶端或命令列。衝突操作可保留手動解決後的內容，或選擇本機／儲存庫版本；目錄及樹狀衝突須先手動整理檔案。屬性頁支援保留歷史的重新命名／移動、含影響範圍預覽的遞迴還原、將乾淨的檔案或目錄還原至指定版本，以及加入或取消一般新增並保留本機檔案。相關變更仍需另外提交；倉庫位址遷移僅適用於同一儲存庫搬遷。

## 安裝

從 [GitHub Releases](https://github.com/firzen/StoneSVN/releases) 下載 Windows、macOS 或 Linux 安裝程式。

macOS 安裝包依晶片區分：Intel Mac 選擇檔名含 `x64` 的 DMG；M 系列 Mac 選擇 `aarch64`。可在「關於這台 Mac」確認晶片類型。

macOS 版本採用免費的 Ad-hoc 簽署，未經 Apple 公證。將 StoneSVN 拖入「應用程式」後，首次開啟若遭阻擋，請前往「系統設定 → 隱私權與安全性 → 強制打開」，再確認開啟。公司管理的 Mac 可能需要 IT 核准。詳見 [macOS 建置與散佈說明（簡體中文）](docs/macos-distribution.md)。

安裝後，請確認 SVN CLI 可以使用：

```bash
svn --version --quiet
```

## 快速開始

1. 開啟 StoneSVN，從專案欄底部選擇「新增本機副本」開啟既有工作副本，或選擇「新增遠端副本」簽出儲存庫。
2. 在工作區依變更、未納入版本控制、衝突或遺失狀態篩選檔案。
3. 選擇檔案檢視 Diff，確認後前往 Commit 頁面提交變更。
4. 提交前先執行 Update，並優先解決所有衝突。

更完整的操作說明請參閱 [QUICKSTART.md](QUICKSTART.md)。

## 屬性、匯出與檔案歷史

屬性頁支援專案樹、遞迴搜尋與 SVN 屬性編輯。可將受控檔案或目錄匯出至尚不存在的新目錄，保留本機修改且不含 `.svn` 中繼資料。也可安排刪除，或將沒有本機修改的受控檔案還原至指定版本；檢查後需另行提交。檔案歷史以分頁顯示，雙擊記錄可檢視差異。

![使用虛構資料的屬性頁](docs/images/stonesvn-properties.png)

[深色主題](docs/images/stonesvn-properties-dark.png)。

## 本機開發

需求：

- Node.js 18 或更新版本
- 最新穩定版 Rust 工具鏈
- SVN CLI 1.10 或更新版本
- 目前平台所需的 Tauri 2 建置相依套件

```bash
npm ci
npm run tauri dev
```

提交變更前請執行：

```bash
npm run check
```

環境設定與疑難排解請參閱 [SETUP.md](SETUP.md)，貢獻規範請參閱 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 專案結構

```text
src/                    Vue 3 前端
  api/                  Tauri 命令呼叫封裝
  composables/          可重複使用的工作區邏輯
  i18n/                 多語系資源
  stores/               Pinia 狀態
  views/                應用程式頁面
src-tauri/src/
  main.rs               Tauri 命令邊界
  svn/executor.rs       SVN 程序執行與逾時處理
  svn/operations.rs     SVN 參數建構
  svn/parser.rs         XML／文字結果解析
.github/workflows/      發佈流程
```

## 設計原則

- **可預期：** 介面操作盡可能對應明確的 SVN 命令。
- **變更前先檢視：** 預設先顯示狀態和差異，再提交或還原變更。
- **安全的參數邊界：** 使用 `--` 將檔案目標與命令選項分隔。
- **清楚的回饋：** 錯誤訊息保留原始 SVN 上下文，便於診斷。

## 授權條款

[MIT](LICENSE)
