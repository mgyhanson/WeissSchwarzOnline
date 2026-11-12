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
| STEP 6a 第一批真實卡牌：兩副 Trial Deck（35 張） | 完成 |
| STEP 6b 補充包卡牌：SAO/S20 27 張、GUP/W141 19 張 | 完成（第一批） |
| STEP 6b 第二批：SAO 21 張（経験、記憶、アラーム、「次の相手のターンの終わりまで」；分支 `feat/card-pool-2`） | 完成，見 [docs/05-card-pool-2.md](docs/05-card-pool-2.md)；卡池共 102 張 |
| STEP 7 對戰介面、卡牌一覽、術語解釋 | 完成 |
| STEP 8 四種難度的 AI（入門、普通、進階、專家） | 完成 |
| 第二階段視覺：卡牌揭示、卡面、動畫、介面重設、卡牌一覽（分支 `feat/card-visual-reveal-ux`） | 完成，見 [docs/04-visual-card-expansion-plan.md](docs/04-visual-card-expansion-plan.md) |
| STEP 9 網上對戰：伺服器、房間、重新連線、重播（分支 `feat/step9-online`） | 完成，見 [docs/06-online-play.md](docs/06-online-play.md)；只限本機及同一 Wi-Fi，未部署到互聯網 |
| STEP 10 起（卡組編輯器、教學） | 未開始 |

目前共 472 個自動測試通過，另有 4000 局隨機完整對局的長時間測試（`npm run soak`，其中 1000 局輪流使用五副真實卡組的所有配對）全部通過。引擎已可按官方規則打完整局，並能執行以資料描述的卡牌能力：永續、自動、起動能力，Event 效果，各種 Cost，「そのターン中」及「次の相手のターンの終わりまで」的期限，以及応援、助太刀、集中、絆、チェンジ、大活躍、アラーム、経験、記憶、加速、Encore 等關鍵字。能力的資料格式見 `game-engine/src/abilities/types.ts`。

卡牌資料庫收錄了 102 張真實卡牌（涼宮ハルヒの憂鬱及五等分の花嫁 一花的 Trial Deck、ソードアート・オンライン SAO/S20 及其他 SAO 商品的精選、ガールズ＆パンツァー GUP/W141），全部可以自動執行並逐張有測試，見 [card-database/README.md](card-database/README.md)。

瀏覽器介面（`web-client/`）可以在電腦及手機上與四種難度的電腦對手打完整局。電腦對手不作弊：只看到自己座位可以看到的資訊，見 [ai/README.md](ai/README.md)。

網上對戰（`backend/`）：建立房間、以代碼或邀請連結加入，兩名玩家在不同裝置對戰。對局在伺服器上進行，每名玩家只收到自己可以看到的資訊；重新整理或斷線可以回到對局；對局結束後可下載及觀看重播。見 [docs/06-online-play.md](docs/06-online-play.md)。

仍未完成：網上對戰未部署到互聯網（部署方式待你決定）；卡組編輯器及教學；卡池仍然不大（102 張，長期目標約 100 至 130 種已達下限）；一般置換效果、シフト、Marker 類關鍵字等少見內容未實作（清單見 [rules/rule-registry.md](rules/rule-registry.md) 第 14 節）。

## 試玩

```bash
npm run dev
```

然後在瀏覽器打開 http://localhost:5173 。想用同一 Wi-Fi 的手機試玩，改用 `npm run dev:lan`，再在手機打開終端機顯示的 Network 網址。

### 網上對戰（雙人）

```bash
npm run server
```

然後打開 http://localhost:8787 ，按「網上對戰」建立房間，把代碼或邀請連結傳給對手。要讓同一 Wi-Fi 的其他裝置加入，改用 `npm run server:lan`，再用終端機顯示的「同一網絡」網址。詳情見 [docs/06-online-play.md](docs/06-online-play.md)。

## 開發指令

```bash
npm run setup      # 安裝依賴（必須用這個，不要直接 npm install）
npm run dev        # 啟動瀏覽器介面（http://localhost:5173）
npm run build      # 建立正式版介面（輸出到 web-client/dist.nosync/）
npm test           # 執行全部測試
npm run typecheck  # 型別檢查
npm run check      # 型別檢查 + 全部測試 + 規則登記表覆蓋檢查
npm run registry   # 由規則登記表重新產生 rules/registry.json，並列出覆蓋報告
npm run soak       # 4000 局隨機完整對局（約 1.5 分鐘）
npm run ai:tournament  # 各難度 AI 對戰的勝率（約 5 分鐘）
npm run server     # 建立介面並啟動網上對戰伺服器（http://localhost:8787）
npm run server:lan # 同上，並容許同一 Wi-Fi 的裝置連線
npm run server:dev # 只啟動伺服器，配合 npm run dev 開發
npm run qa:ui      # 單機對戰的瀏覽器測試（先執行 npm run dev）
npm run qa:online  # 網上對戰的雙瀏覽器測試（重新整理、斷線、重播、斷線判負）
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
- [web-client/README.md](web-client/README.md)：瀏覽器介面的結構及測試
- [ai/README.md](ai/README.md)：四種難度的電腦對手、不作弊的做法、勝率

## 規則基準

日文《総合ルール》ver. 1.114（2026-11-10）。
任何規則疑問以官方最新綜合規則、エラッタ、Q&A 為準，不自行推斷。
