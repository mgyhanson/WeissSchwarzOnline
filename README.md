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
| 全面升級：最新五個補充包完整匯入（526 張）、609 張卡圖、自製卡組及卡組驗證、動畫放慢及逐步解說、戰鬥解說紀錄（分支 `feat/upgrade-cards-decks-animation`） | 完成，見 [reports/](reports/)；當時 609 張中 156 張可對戰 |
| 卡牌效果第一批及真實卡圖全面啟用（分支 `feat/card-effects-batch-1`）：BDY/W135 14 張角色人手實作、合法的 BDY 50 張卡組、卡圖提供給區域網絡及網上房間的玩家、未支援卡的分類；第二批 12 張（ANM、NIK、STS、GUP、BDY） | 完成，見 [reports/](reports/) |
| 卡牌效果第三批（分支 `feat/card-effects-batch-2`）：卡牌工作清單工具、句子文法（由已知片段自動編譯卡牌）、51 張新卡、STS／ANM／NIK 三副合法卡組、部署指南 | 完成，見 [reports/CARD_IMPLEMENTATION_PROGRESS.md](reports/CARD_IMPLEMENTATION_PROGRESS.md) |
| Level 3 優先批次（分支 `feat/card-effects-batch-2`，2026-11-15）：約 30 個新通用構件、勘誤核對、五副新系列卡組加入 Level 3 角色 | 完成，見 [reports/IMPLEMENTATION_CHECKPOINT.md](reports/IMPLEMENTATION_CHECKPOINT.md) |
| 卡牌效果 Batch 3（分支 `feat/card-effects-batch-3`，2026-11-15）：Marker 引擎（放到卡下面、表裏、Cost、張數及卡名條件）、回想、搭乗、リンク、在思い出／Marker 置場生效的能力、給予及取得永續能力、Climax Cost、移動到空枠、傷害被 Cancel 時、【ターンN】、不需顏色條件等；90 張新卡 | 完成，見 [reports/BATCH_3_PROGRESS.md](reports/BATCH_3_PROGRESS.md) |
| 卡牌效果 Batch 4（分支 `feat/card-effects-batch-4`，2026-11-16）：延遲效果、互換及交換、公開分支、可選效果、分配選出的卡、Event 使用限制、得到【起】能力、中途 Cost 等約 60 個通用構件；91 張新卡（Level 3 +12） | 完成一部分，見 [reports/BATCH_4_PROGRESS.md](reports/BATCH_4_PROGRESS.md) |
| 卡牌效果 Batch 5（分支 `feat/card-effects-batch-5`，2026-11-16）：Ｘ 計算、額外回合（CR-11.2）、Replay（CR-11.3）、區域互換、逐張公開等；31 張新卡（Level 3 +15） | 完成一部分，見 [reports/BATCH_5_PROGRESS.md](reports/BATCH_5_PROGRESS.md) |
| STEP 11 起（教學）、其餘未支援卡的效果 | 未開始／進行中 |


<!-- support-summary:start (由 npm run cards:worklist 產生，請勿手改；數字只以此為準) -->
**目前卡牌支援（2026-11-16，程式計算）**：609 張中 **504 張可對戰**，未支援 105 張；Level 3 56/63。

| 系列 | 卡數 | 可對戰 | 角色 | Event | Climax | Level 3 |
|---|---:|---:|---:|---:|---:|---:|
| SY/W08_TD | 17 | 17 | 13/13 | 1/1 | 3/3 | 1/1 |
| 5HY/W83_TD_ICHIKA | 18 | 18 | 15/15 | 1/1 | 2/2 | 2/2 |
| SAO/S20 | 30 | 30 | 21/21 | 1/1 | 8/8 | - |
| GUP/W141 | 114 | 101 | 84/95 | 2/4 | 15/15 | 12/12 |
| SAO/OTHERS | 18 | 18 | 17/17 | 0/0 | 1/1 | - |
| BDY/W135 | 100 | 82 | 70/85 | 0/3 | 12/12 | 15/16 |
| STS/W140 | 100 | 82 | 69/84 | 1/4 | 12/12 | 8/9 |
| ANM/W138 | 100 | 78 | 62/81 | 4/7 | 12/12 | 11/13 |
| NIK/S135 | 112 | 78 | 64/90 | 1/9 | 13/13 | 10/13 |
| **合計** | 609 | 504 | | | | 五個補充包 56/63 |

未支援分類（初步，只用作排序）：A 33、B 1、C 44、D 27、E 0。詳細見 `reports/CARD_WORKLIST.md`。
<!-- support-summary:end -->

目前共 1096 個自動測試通過，另有 4000 局隨機完整對局的長時間測試（`npm run soak`，其中 1000 局輪流使用九副真實卡組的所有配對）全部通過。引擎已可按官方規則打完整局，並能執行以資料描述的卡牌能力：永續、自動、起動能力，Event 效果，各種 Cost，「そのターン中」及「次の相手のターンの終わりまで」的期限，以及応援、助太刀、集中、絆、チェンジ、大活躍、アラーム、経験、記憶、加速、Encore 等關鍵字。能力的資料格式見 `game-engine/src/abilities/types.ts`。

卡牌資料庫收錄了 609 張真實卡牌：原有的 Trial Deck 及精選卡 83 張，以及最新五個日文補充包的全部基本卡 526 張（BanG Dream! [夢限大みゅーたいぷ]、ガールズ＆パンツァー、ステラソラ、anemoi、勝利の女神：NIKKE Vol.2）。其中 **379 張的效果已實作並測試，可以用於對戰；其餘 230 張已有完整官方資料及卡圖，可以搜尋及瀏覽，但效果尚未支援，不能用於對戰**（介面會清楚標示）。未支援的卡已按所需的工作分類，見 [reports/UNSUPPORTED_CARDS.md](reports/UNSUPPORTED_CARDS.md)。見 [reports/CARD_DATABASE_REPORT.md](reports/CARD_DATABASE_REPORT.md) 及 [card-database/README.md](card-database/README.md)。

自製卡組（「卡組」頁面）：建立、編輯、複製、刪除、匯入及匯出卡組，按官方構築規則及限制表即時檢查，合法的卡組可用於單機及網上對戰。見 [reports/DECK_BUILDER_REPORT.md](reports/DECK_BUILDER_REPORT.md)。

對戰動畫已放慢，可以選慢速／正常／快速、暫停及逐步播放；每一步都有文字解說，並有戰鬥解說紀錄。見 [reports/ANIMATION_REPORT.md](reports/ANIMATION_REPORT.md)。

遊戲以 609 張真實卡圖作為主要顯示方式（卡牌一覽、卡組編輯器、手牌、舞台、Climax、判定公開畫面、動畫、重播）；程式繪製的卡面只在圖片載入失敗時作備用。圖片存放在運行伺服器的電腦（`card-assets/local.nosync/`），**不在 GitHub、不在建置輸出內**，由伺服器提供給連線的玩家：這部電腦、同一 Wi-Fi 的裝置（`npm run server:lan`）及網上房間的對手都會看到。圖片只按玩家已知的卡號提供，不會洩漏隱藏的卡。可用 `USER_ART=local`（只限本機）或 `USER_ART=off` 關閉。見 [reports/CARD_IMAGE_REPORT.md](reports/CARD_IMAGE_REPORT.md)。

瀏覽器介面（`web-client/`）可以在電腦及手機上與四種難度的電腦對手打完整局。電腦對手不作弊：只看到自己座位可以看到的資訊，見 [ai/README.md](ai/README.md)。

網上對戰（`backend/`）：建立房間、以代碼或邀請連結加入，兩名玩家在不同裝置對戰。對局在伺服器上進行，每名玩家只收到自己可以看到的資訊；重新整理或斷線可以回到對局；對局結束後可下載及觀看重播。見 [docs/06-online-play.md](docs/06-online-play.md)。

仍未完成：部分新卡的效果（數字見上面的自動摘要；BDY、GUP、STS、ANM、NIK 各有一副含 Level 3 角色的 50 張卡組）；另一部實體裝置上的測試；網上對戰未部署到互聯網（部署方式待你決定）；教學；一般置換效果、シフト、延遲效果（次の…の始めに）等少見內容未實作（清單見 [rules/rule-registry.md](rules/rule-registry.md) 第 14 節）。

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
npm run cards:worklist   # 重新產生卡牌工作清單：每個未認識的片段可解鎖多少張卡（reports/CARD_WORKLIST.md）
npm run ai:tournament  # 各難度 AI 對戰的勝率（約 5 分鐘）
npm run server     # 建立介面並啟動網上對戰伺服器（http://localhost:8787）
npm run server:lan # 同上，並容許同一 Wi-Fi 的裝置連線
npm run server:dev # 只啟動伺服器，配合 npm run dev 開發
npm run qa:ui      # 單機對戰的瀏覽器測試（先執行 npm run dev）
npm run qa:online  # 網上對戰的雙瀏覽器測試（重新整理、斷線、重播、斷線判負）
npm run cards:import    # 由官方卡表匯入 card-database/import/sets.json 列出的補充包（可重複執行）
npm run cards:images -- <zip>  # 匯入你提供的卡圖整合包（只放到本機的 card-assets/local.nosync/）
npm run cards:validate  # 核對卡牌資料、圖片及索引
npm run cards:report    # 產生各系列的支援統計
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
