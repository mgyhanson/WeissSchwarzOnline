# Weiß Schwarz Online Community Simulator

非官方的社群專案，與 Bushiroad 及各作品的權利人無關。
「Weiß Schwarz」及各作品名稱是其權利人的商標。

## 目前進度

| 步驟 | 狀態 |
|---|---|
| STEP 1 環境檢查 | 完成 |
| STEP 2 規則研究 | 完成，待決定事項已確認 |
| STEP 3 技術架構 | 完成，已確認 |
| STEP 4a 引擎骨架、區域、卡牌移動、玩家視圖 | 完成 |
| STEP 4b 遊戲準備、回合、出牌、Check Timing、規則處理 | 完成 |
| STEP 4c 攻擊、Trigger、傷害、Encore | 完成 |
| STEP 4d-1 卡牌能力引擎（核心） | 完成 |
| STEP 4d-2 常見關鍵字 | 完成 |
| STEP 5 規則覆蓋檢查及大量隨機對局 | 完成 |
| STEP 6 第一批真實卡牌 | **未開始** |
| STEP 7 起（介面、AI、連線） | 未開始 |

目前共 247 個自動測試通過，另有 3000 局隨機完整對局的長時間測試（`npm run soak`）全部通過。引擎已可按官方規則打完整局，並能執行以資料描述的卡牌能力：永續、自動、起動能力，Event 效果，各種 Cost，以及応援、助太刀、集中、絆、チェンジ、大活躍、アラーム、Encore 等關鍵字。能力的資料格式見 `game-engine/src/abilities/types.ts`。

但**還不是可以玩的 WS**：測試用的仍是假卡，沒有任何真實卡牌；沒有介面、AI 及連線；一般置換效果、シフト、Marker 類關鍵字等少見內容未實作（清單見 [rules/rule-registry.md](rules/rule-registry.md) 第 14 節）。

## 開發指令

```bash
npm run setup      # 安裝依賴（必須用這個，不要直接 npm install）
npm test           # 執行全部測試
npm run typecheck  # 型別檢查
npm run check      # 型別檢查 + 全部測試 + 規則登記表覆蓋檢查
npm run registry   # 由規則登記表重新產生 rules/registry.json，並列出覆蓋報告
npm run soak       # 3000 局隨機完整對局（約 1.5 分鐘）
npm run backup -- <目的地資料夾>
```

依賴安裝在 `node_modules.nosync/`，iCloud 不會同步。直接執行 `npm install` 會把它換回會被同步的真實資料夾，所以請用 `npm run setup`。

Git 資料存放在 `~/GitRepos/WeissSchwarzOnline.git`（iCloud 之外），專案內的 `.git` 只是一個指向它的檔案。

## 文件

- [docs/01-environment-check.md](docs/01-environment-check.md)：電腦環境及 iCloud 檢查
- [rules/rules-research.md](rules/rules-research.md)：WS 官方規則研究結果
- [rules/rule-registry.md](rules/rule-registry.md)：規則登記表（每條規則的官方編號、實作狀態、測試編號）
- [docs/02-architecture.md](docs/02-architecture.md)：技術架構
- [docs/03-phase1-plan.md](docs/03-phase1-plan.md)：第一階段卡牌系列、開發步驟、風險及版權、待決定事項

## 規則基準

日文《総合ルール》ver. 1.114（2026-11-10）。
任何規則疑問以官方最新綜合規則、エラッタ、Q&A 為準，不自行推斷。
