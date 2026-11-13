# IMPLEMENTATION_AUDIT — 升級前的專案審核

日期：2026-11-13 至 14。分支：`feat/upgrade-cards-decks-animation`（由 `feat/step9-online` 開出）。
審核方法：實際追蹤程式碼及執行測試，不是只讀 README。升級前 `npm run check` 為 472 個測試通過。

## 1. 升級前的現有功能（已核實）

| 範圍 | 狀況 | 依據 |
|---|---|---|
| 規則引擎（`game-engine/`） | 按官方《総合ルール》JP ver. 1.114 編寫的完整狀態機：遊戲準備、換牌、Stand／抽牌／Clock／主要／Climax／攻擊（宣言、Trigger、Counter、傷害、戰鬥、Encore 各步驟）／結束階段、Refresh、Level Up、勝負。規則登記表 209 條，當時 130 條已測試 | `rules/rule-registry.md`、`npm run check`、4000 局 soak |
| 卡牌能力 | 以資料描述（`abilities/types.ts`），由同一個直譯器執行；不是逐張卡寫 if/else | 102 張卡逐張有測試 |
| 卡牌資料庫 | 5 個資料夾共 102 張，全部 `verified`；官方資料原樣儲存並有 SHA-256 | `card-database/tests/database.test.ts` |
| 動畫 | 已是「引擎 → 事件 → 佇列 → 畫面」：`steps.ts` 把事件變成步驟，`queue.ts` 逐步播放，播放期間棋盤保持舊狀態 | `web-client/src/presentation/` |
| AI、網上對戰、重播 | STEP 8 及 STEP 9 已完成 | `docs/06-online-play.md` |

## 2. 升級前發現的問題及缺少的功能

| # | 問題 | 影響 | 這次的處理 |
|---|---|---|---|
| 1 | 動畫太快：卡牌移動 280 ms、Rest 220 ms、階段轉換 200 ms；只有「一般／快速／關閉」 | 看不清發生了甚麼 | 放慢並分級，加入慢速、暫停、逐步播放（`ANIMATION_REPORT.md`） |
| 2 | 播放時只顯示「正在顯示剛才發生的事…」，沒有文字說明原因 | 不知道卡為甚麼移動、傷害為甚麼被取消 | 每一步都有標題及解說；新增戰鬥解說紀錄 |
| 3 | 攻擊的各個步驟（Trigger、Counter、傷害、戰鬥、Encore）沒有在畫面標示 | 攻擊流程不清楚 | 引擎的 `STEP_STARTED` 事件現在會顯示並解說 |
| 4 | 沒有自製卡組：只能用 5 副測試卡組；卡組驗證只存在於測試內，限制表只抄了 1 張禁卡 | 不能自己組卡 | 卡組編輯器及卡組驗證引擎（`DECK_BUILDER_REPORT.md`） |
| 5 | 卡池只有 102 張，都是精選卡，沒有一個完整的補充包 | 卡池小 | 匯入最新五個補充包的全部基本卡 526 張（`LATEST_FIVE_SETS.md`） |
| 6 | 資料庫要求「每張官方卡都有人手寫的紀錄」 | 不能匯入尚未實作的卡 | 新增自動紀錄：未實作的卡如實標記為不支援，不能用於對戰 |
| 7 | 卡面圖片只能填在卡面上方的小窗內，會裁切 | 完整卡圖不能正確顯示 | 完整卡圖以整張卡顯示，不裁切；Climax 橫向圖片自動轉正 |
| 8 | 伺服器（`npm run server`）不提供本機圖片，只有開發伺服器提供；`dev:lan` 會把圖片提供給同一網絡的其他裝置 | 圖片顯示不一致；圖片可能外流 | 兩個伺服器都只向本機（loopback 及 localhost）提供 |
| 9 | 卡牌一覽一次過顯示全部卡 | 600 張時會卡頓 | 分頁顯示，圖片延遲載入 |
| 10 | 規則登記表的檢查沒有掃描 `card-database/tests` | 卡組規則（DR-001 至 008）不能標為已測試 | 已加入掃描 |

沒有發現重複卡號、錯誤卡號或錯誤的圖片路徑（升級前沒有任何圖片）。沒有 placeholder 效果：102 張卡的效果都是真正執行並有測試的。

## 3. 102 張卡圖整合包的檢查

`WeissSchwarz_Card_Art_102_Complete.zip`（SHA-256 `c91776ea…afc1c07`，12,168,558 位元組）在 `~/Downloads` 找到。內容是官方卡表的卡圖（有 SAMPLE 水印），102 個卡號與資料庫當時的 102 張卡完全一致。能直接使用：檔名規則與專案原有的 `card-assets/local.nosync/` 相同。詳見 `CARD_IMAGE_REPORT.md`。

## 4. 你就圖片所作的決定

升級前專案的規則是「不下載、不託管官方卡圖」（Bushiroad Fan Content Policy 不容許官方圖片用於軟件）。你在 2026-11-13 表示已取得使用所有圖片的許可，並指示下載。因此：

- 圖片按你的指示下載及使用；
- 但全部只放在 `card-assets/local.nosync/`：不進入 Git、iCloud 不同步、不包含在建置輸出內、不會傳送給網上對手（你選擇了「只限本機」）；
- 我無法核實許可本身。如果日後要公開發佈或把圖片放上 GitHub，請先確認許可的範圍。

## 5. 修改的檔案（主要）

| 範圍 | 檔案 |
|---|---|
| 匯入及驗證工具 | `scripts/import-card-sets.ts`、`scripts/import-image-pack.ts`、`scripts/validate-card-database.ts`、`scripts/images-lib.ts`、`card-database/import/sets.json` |
| 卡牌資料 | `card-database/sets/{BDY_W135,STS_W140,ANM_W138,NIK_S135}/official.json`（新）、`GUP_W141/official.json`（19 → 114 張） |
| 資料庫 | `card-database/src/{index,official,types,patterns,formats}.ts` |
| 卡組 | `web-client/src/model/decks.ts`、`web-client/src/components/DeckBuilder.tsx`、`backend/src/{rooms,store}.ts`、`backend/src/shared/protocol.ts` |
| 動畫 | `web-client/src/presentation/{queue,steps,explain,animate}.ts`、`web-client/src/components/{Narration,Game}.tsx` |
| 圖片顯示 | `web-client/src/components/CardFace.tsx`、`web-client/src/styles.css`、`backend/src/server.ts`、`web-client/vite.config.ts` |
| 測試 | `card-database/tests/{patterns,formats,stats}.test.ts`、`web-client/tests/decks.test.ts`，以及多個現有測試的更新 |

## 6. 風險及相容性

- **舊存檔**：升級前保存的單機對局沒有卡組列表，仍然可以載入（按測試卡組代號還原）。
- **舊房間紀錄**：伺服器資料庫中升級前的房間只有測試卡組代號，仍然可以還原。
- **GUP 測試卡組**：GUP 由 19 張擴充至 114 張後，原有 19 張的資料及能力完全沒有變動（匯入工具比對後報告「沒有改變」）。
- **建置大小**：609 張卡的文字資料令介面的 JavaScript 由約 0.56 MB 增至約 1.1 MB；圖片不在其中。
- **未支援的卡佔多數**：見 `RULES_IMPLEMENTATION_REPORT.md`。這是如實的現況，不是完成。
