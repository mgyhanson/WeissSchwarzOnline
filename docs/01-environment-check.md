# 環境及 iCloud 檢查結果（STEP 1）

檢查日期：2026-11-10

## 1. 電腦環境

| 項目 | 結果 | 評估 |
|---|---|---|
| 作業系統 | macOS 27.0.1（Build 26A434） | 正常 |
| 處理器 | Apple M4 Pro（arm64） | 充足 |
| 記憶體 | 24 GB | 充足 |
| 磁碟 | 926 GB，可用 334 GB | 充足 |
| Node.js | v24.21.0（`/usr/local/bin/node`） | 正常，內建 `node:sqlite` 可用 |
| npm | 11.19.0 | 正常，支援 workspaces |
| Git | 2.54.0（Apple Git-157） | 已安裝，但**未設定 `user.name` 及 `user.email`** |
| SQLite CLI | 3.54.0 | 正常 |
| Python | 3.9.6（系統內建） | 不會用到 |
| Xcode | 已安裝（`/Applications/Xcode.app`） | 正常 |
| 瀏覽器 | Google Chrome、Safari | 足夠做桌面測試；iPhone 版可用 iOS 模擬器 |
| Homebrew | 未安裝 | 目前不需要 |
| pnpm / yarn / bun | 未安裝 | 不需要，使用 npm workspaces |
| nvm / volta / fnm | 未安裝 | 會在專案加入 `.nvmrc` 及 `engines` 鎖定 Node 版本 |

### 需要你處理的事

1. **Git 身分未設定**。第一次 commit 之前需要設定，請告訴我要用的名稱及電郵（或自行執行 `git config --global user.name` 及 `user.email`）。
2. Playwright 首次安裝時需要下載瀏覽器（數百 MB，放在 `~/Library/Caches/ms-playwright`，不在 iCloud 內）。到 STEP 7 才需要，屆時會先問你。

## 2. iCloud Drive

| 項目 | 結果 |
|---|---|
| iCloud Drive | **已啟用**，同步狀態 `caught-up`，最後同步 2026-11-10 17:27 |
| iCloud Drive 根目錄 | `~/Library/Mobile Documents/com~apple~CloudDocs`，可寫入 |
| `Game/` | 原本**不存在**，已建立 |
| `Game/WeissSchwarzOnline/` | 原本**不存在**，已建立，寫入測試通過 |
| 「桌面與文件」同步 | 已開啟 |
| 「最佳化 Mac 儲存空間」 | **已開啟**（`optimize-storage = 1`） |

備註：iCloud Drive 內另有一個 `game file/` 資料夾（放了「香港人生模擬器」的 HTML 檔）。我按你的指示使用新的 `Game/WeissSchwarzOnline/`，沒有改動 `game file/`。

目前專案資料夾內容：

```
WeissSchwarzOnline/
├── README.md
├── .gitignore
├── docs/
│   ├── 01-environment-check.md     ← 本文件
│   ├── 02-architecture.md
│   └── 03-phase1-plan.md
└── rules/
    ├── rules-research.md
    └── rule-registry.md
```

`frontend/`、`backend/`、`game-engine/` 等資料夾會在 STEP 4 開始時才建立，避免留下空殼。

## 3. iCloud 帶來的風險及對策

| 風險 | 說明 | 對策 |
|---|---|---|
| `node_modules` 被同步 | 數萬個小檔案會拖慢同步，也可能產生衝突副本 | 實際目錄命名為 `node_modules.nosync`（iCloud 不會同步 `.nosync` 結尾的項目），再建立 `node_modules` 符號連結指向它。由 `scripts/setup.sh` 自動處理 |
| 「最佳化儲存空間」把檔案移到雲端 | 檔案變成只有佔位符，建置或測試讀取時會觸發下載，甚至失敗 | 請在 Finder 對 `WeissSchwarzOnline` 資料夾按右鍵選「保持下載」。這一步需要你手動做 |
| `.git` 目錄被同步損壞 | iCloud 同步 `.git` 內部檔案時可能產生「檔名 2」衝突副本，令版本庫損壞 | 見下方「Git 存放方式」 |
| 執行中的 SQLite 被同步 | WAL 檔與主檔不同步會損壞資料庫 | 執行期資料庫放在 `data.nosync/`（在專案目錄內，但不同步）。需要備份時用 `sqlite3 .backup` 輸出快照到 `backups/` |
| 建置輸出、測試報告、快取 | 無需同步 | `dist.nosync/`、`coverage.nosync/`、`.cache.nosync/` |
| 密碼及 API Key | 不可放進同步資料夾 | 目前架構不需要任何 API Key。日後如需要，放在 `~/.config/wsonline/`（iCloud 之外），專案內只放 `.env.example` |
| 同步延遲 | 另一部裝置可能看到未完成的檔案 | 只在這部 Mac 上開發；其他裝置只讀取 |

### Git 存放方式（需要你選擇）

| 方案 | 做法 | 優點 | 缺點 |
|---|---|---|---|
| **A（建議）** | 工作目錄在 iCloud，`.git` 資料用 `--separate-git-dir` 放在 `~/GitRepos/WeissSchwarzOnline.git`，並推送到私人 GitHub 版本庫 | 程式碼在 iCloud；版本歷史不會被同步弄壞；有異地備份 | 版本歷史不在 iCloud 資料夾內 |
| B | `.git` 直接放在 iCloud 專案資料夾內 | 完全符合「所有東西都在專案目錄」 | 有版本庫損壞的實際風險 |
| C | 不使用 Git，只靠 iCloud | 最簡單 | 沒有版本歷史，不建議 |

## 4. 備份方法

1. **程式碼及文件**：Git 提交，並推送到私人遠端版本庫（方案 A）。
2. **整個專案快照**：`scripts/backup.sh` 會把專案（排除所有 `.nosync` 目錄）壓縮成 `WeissSchwarzOnline-YYYYMMDD.zip`，放到你指定的位置。
3. **資料庫**：`sqlite3 data.nosync/app.db ".backup backups/app-YYYYMMDD.db"`，輸出的是一致的快照，可安全同步。
4. **卡牌資料**：卡牌資料以 JSON 檔存放在 `card-database/`，本身就在 Git 及 iCloud 之內。SQLite 只是由 JSON 產生的查詢索引，可隨時重建。

以上腳本會在 STEP 4 建立專案骨架時一併加入。
