# TEST_REPORT — 測試結果

2026-11-15，Mac（Node 24.21），分支 `feat/card-effects-batch-3`。以下全部是實際執行的結果。

<!-- support-summary:start (由 npm run cards:worklist 產生，請勿手改；數字只以此為準) -->
**目前卡牌支援（2026-11-16，程式計算）**：609 張中 **473 張可對戰**，未支援 136 張；Level 3 38/63。

| 系列 | 卡數 | 可對戰 | 角色 | Event | Climax | Level 3 |
|---|---:|---:|---:|---:|---:|---:|
| SY/W08_TD | 17 | 17 | 13/13 | 1/1 | 3/3 | 1/1 |
| 5HY/W83_TD_ICHIKA | 18 | 18 | 15/15 | 1/1 | 2/2 | 2/2 |
| SAO/S20 | 30 | 30 | 21/21 | 1/1 | 8/8 | - |
| GUP/W141 | 114 | 94 | 78/95 | 1/4 | 15/15 | 9/12 |
| SAO/OTHERS | 18 | 18 | 17/17 | 0/0 | 1/1 | - |
| BDY/W135 | 100 | 76 | 64/85 | 0/3 | 12/12 | 12/16 |
| STS/W140 | 100 | 76 | 63/84 | 1/4 | 12/12 | 4/9 |
| ANM/W138 | 100 | 73 | 57/81 | 4/7 | 12/12 | 9/13 |
| NIK/S135 | 112 | 71 | 57/90 | 1/9 | 13/13 | 4/13 |
| **合計** | 609 | 473 | | | | 五個補充包 38/63 |

未支援分類（初步，只用作排序）：A 39、B 1、C 54、D 42、E 0。詳細見 `reports/CARD_WORKLIST.md`。
<!-- support-summary:end -->

## 自動測試（2026-11-16，Batch 4，分支 `feat/card-effects-batch-4`，全部實際執行）

| 指令 | 結果 |
|---|---|
| `npm run check` | **1047 個測試通過**（49 個測試檔），8 個慢速測試按設計略過，失敗 0；registry 檢查通過；上一批是 911 個 |
| `npm run soak` | 4000 局全部通過（INV-01 至 INV-07） |
| `npm run cards:validate` | 609 張卡、609 張圖片，缺少 0、問題 0（沒有重新下載或改動圖片） |
| `npm run qa:ui` | 25/25 |
| `npm run qa:online` | 41/41 全部通過 |

### Batch 4 新增及改動的測試

| 檔案 | 內容 |
|---|---|
| `game-engine/tests/abilities-batch-9.test.ts`（19） | Stand 中的 Cost、放回山札、山札頂最多 N 張、抽了才執行、三選一放置、回合分開的永續、卡名不含／兩個 Soul 圖示篩選、特徵給予（雙方其他角色、一回合）、手牌上限、Level 置場面朝下不計、使用【起】時、這張卡的 Trigger Check、公開分支及可選後續、選出的卡分配、按次序放置、Power 上限 |
| `game-engine/tests/abilities-batch-10.test.ts`（14） | 延遲能力（下一個我方回合開始時、回合結束時，在正確的回合觸發一次）、由主人選枠放置、放到空枠、互換位置、Level 置場與控え室互換、山札與手牌的 Climax 互換（兩邊都有才換）、同名再選、攻擊中的角色、不會被 Reverse（仍在舞台）、不能 Encore（連規則 Encore）、所有玩家不能用助太刀、得到 Trigger 圖示、手牌指定卡 Level、對手 Climax 條件、按目標 Soul 的 X |
| `game-engine/tests/abilities-batch-11.test.ts`（12） | Event 使用限制、Stand 階段不 Stand、對手所有角色得到 Encore、Stock 底 Cost、其他角色離開舞台時放回原枠、對手山札底、不能對玩家造成傷害、給予後列應援、得到【起】能力、山札頂分配到手牌及 Stock、對手 Level 條件、效果中途支付 Cost |
| `card-database/tests/grammar.test.ts` | 每張文法卡逐張反向寫回日文（新增 91 張）；Event 的使用限制一併核對 |
| `card-database/tests/games.test.ts`（改進，門檻不變） | 文法卡練習卡組加入其卡上指名的 Climax，令 CX Combo 能力在對局中出現；「最少 75% 能力被執行」的門檻沒有改動 |
| `card-database/tests/patterns.test.ts`（更新 1 項） | Event 除使用限制外不可有其他能力（以前是不可有任何能力） |
| `game-engine/tests/abilities.test.ts`（更新 1 項，Batch 3） | Event 造成的傷害以那張 Event 為來源（CR-4.13.2.2） |
| `web-client/src/model/cards.ts` | Event 的使用限制一行計作它的能力文字 |

## 自動測試（2026-11-15，Batch 3，分支 `feat/card-effects-batch-3`，全部實際執行）

| 指令 | 結果 |
|---|---|
| `npm run check` | **911 個測試通過**（46 個測試檔），8 個慢速測試按設計略過，失敗 0；registry 檢查通過；上一批是 772 個 |
| `npm run soak` | 4000 局全部通過（INV-01 至 INV-07） |
| `npm run cards:validate` | 609 張卡、609 張圖片，缺少 0、問題 0（沒有重新下載或改動圖片） |
| `npm run cards:report` | 可對戰 379（人手 128＋自動 251）、未支援 230 |
| `npm run qa:ui` | 25 項全部通過，沒有錯誤 |
| `npm run qa:online` | 全部通過（41 項） |

### Batch 3 新增及改動的測試

| 檔案 | 內容 |
|---|---|
| `game-engine/tests/abilities-markers.test.ts`（22） | Marker 表裏（裏向 Marker 不會出現在對手的 PlayerView）、從上面取回、作 Cost、角色離開舞台時 Marker 放控え室、張數及不同卡名條件、按張數加數值、思い出與 Marker 合計、Marker 置場生效的永續及自動能力、回想兩個自動能力、以回想角色作 Cost、リンク、搭乗、思い出生效的能力、最多抽 N 張、重複 N 次 |
| `game-engine/tests/abilities-batch-7.test.ts`（12） | Climax 作 Cost、Climax 階段的放置觸發、其他角色被正面攻擊時、按對手角色張數的 X、看山札頂取多張、Standby、所有玩家控え室洗回、不能移動到其他枠、戰鬥中對手不能使用助太刀、取得永續能力、按 Level 的 X、戰鬥中的角色 |
| `game-engine/tests/abilities-batch-8.test.ts`（15） | 移動到前列／後列空枠（同一張卡、Marker 跟隨、不能移動時只 Rest）、這張卡 Trigger 時、這張卡造成的傷害被 Cancel 時（攻擊傷害及效果傷害，CR-4.13.2）、戰鬥中受到的傷害被 Cancel 時、先攻玩家第 N 回合、看山札頂選 1 張放回、對手 Stock 底、傷害 N 次（每次分開處理）、不需顏色條件、對手山札頂放控え室、傷害沒有被 Cancel 時、山札頂或控え室、Level 置場翻成裏向（對手看不到、不再提供顏色） |
| `game-engine/tests/abilities.test.ts`（更新 1 項） | Event 造成的傷害現在以那張 Event 為傷害來源（CR-4.13.2.2），以前記錄為沒有來源 |
| `card-database/sets/5HY_W83_TD_ICHIKA/cards.ts`（T03） | 「移動到後列空枠」改用新的 `MOVE_TO_SLOT`（Marker 跟隨、遵守不能移動），該卡原有測試不變並通過 |
| `card-database/tests/grammar.test.ts` | 每張文法卡逐張反向寫回日文（新增 90 張） |
| `card-database/tests/patterns.test.ts`（更新 2 項） | 帶 Cost 的 Event 現在比較 MAY_PAY 的結構；沒有支付字句的 `[(1)]` 句子仍然不讀 |
| `web-client/tests/card-browser.test.ts`（更新） | 「已驗證 Event」清單改由資料庫計算，不再寫死 |
| `ai/tests/deck-games.test.ts` | 五副卡組加入新 Level 3 後重新執行（BDY 對 ANM、STS 對 NIK、GUP 對 BDY、同系列對局），全部正常結束 |


## 自動測試（2026-11-15，Level 3 優先批次，分支 `feat/card-effects-batch-2`，全部實際執行）

| 指令 | 結果 |
|---|---|
| `npm run check` | **772 個測試通過**（43 個測試檔），8 個慢速測試按設計略過，失敗 0；上一批是 668 個 |
| `npm run soak` | 4000 局全部通過（真實卡組 1000 局使用九副卡組的所有配對）。從未被使用的能力 11 個（條件在隨機對局中沒有出現，例如指定的 Climax、Level 3 才有的情況）：ANM/W138-041#1、095#0，GUP/W141-004#1、022#0、099#2，NIK/S135-011#0、014#0，SAO/S80-040#1，STS/W140-018#1、093#0、093#1；各有逐張測試、構件測試或反向核對 |
| `npm run cards:validate` | 609 張卡、609 張圖片，缺少 0、問題 0（沒有重新下載或改動圖片） |
| `npm run cards:report` | 可對戰 289（人手 128＋自動 161）、未支援 320 |
| `npm run cards:worklist` | 未支援 320；未認識的片段 478 種；只差 1 個片段的卡 102 張 |
| `npm run qa:ui` | 三種尺寸 60 fps、沒有橫向捲動、沒有錯誤；卡圖檢查 25 項全部通過；以快速動畫打完一整局（GUP 對 ANM，318 秒） |
| `npm run qa:online` | 39 項全部通過（第二次執行）。第一次執行有兩項不通過：「雙方都在 Climax 置場看到真實卡圖」，原因是那一局電腦代打始終沒有放置 Climax，而不是卡圖出錯（同一局其他卡圖請求 40 個全部成功）；重新執行即全部通過。這項檢查依賴對局內容，屬於不穩定的檢查，記錄在此 |

同一批次中先執行的一次完整 QA 發現另一個問題：卡圖瀏覽器檢查寫死了「BDY 卡組有 18 種卡」，加入 Level 3 後是 19 種（19 張全部顯示真實卡圖）。已改為按卡組實際種類數檢查，沒有放寬「每張都要顯示真實卡圖」的要求。

## Level 3 優先批次新增及改動的測試

| 檔案 | 內容 |
|---|---|
| `game-engine/tests/abilities-batch-6.test.ts`（40） | 約 30 個新引擎構件的情境測試（每個構件有成立及不成立的情況） |
| `card-database/tests/grammar.test.ts`（112） | 每張由文法產生的卡逐張反向核對（名稱含卡號）；人手卡交叉核對 |
| `ai/tests/deck-games.test.ts`（12） | 四副新系列卡組各 32 局進階對局；新增 BDY 對 ANM、STS 對 NIK、GUP 對 BDY 及五副卡組同系列對局各 6 局，全部正常結束，而且每組對局都有 Level 3 角色登場 |
| `ai/tests/match.ts` | 對局輔助程式記錄雙方打出的卡（供上面的 Level 3 檢查使用） |
| `card-database/tests/helpers.ts`、`cards-bdy.test.ts`、`cards-batch-4.test.ts` | 新增 `plain` 選項：只用作「身體」（印刷數值及特徵）的卡在測試中不帶能力，避免這些卡日後被支援時改變無關的測試。BDY/W135-072 原本被當作沒有能力的卡使用，這一批被文法讀懂後令兩項測試失敗，因此加入這個選項；測試內容及預期值沒有改動 |
| `card-database/tests/patterns.test.ts`（更新 1 項） | 人手編寫的 Event 被文法讀懂時，比較其效果（而不是要求沒有效果） |
| `card-database/tests/games.test.ts`（更新） | 文法卡練習對局的時限由 5 秒改為 300 秒（卡數增加令對局數增加），對局數及檢查不變 |
| `tests/e2e/pictures.mjs` | 見上：卡組種類數不再寫死 |

沒有刪除測試，也沒有降低任何預期值。

## 自動測試（2026-11-14，第三批，分支 `feat/card-effects-batch-2`）

| 指令 | 結果 |
|---|---|
| `npm run check`（型別檢查＋全部測試＋規則登記表覆蓋檢查） | **668 個測試通過**（42 個測試檔），8 個慢速測試按設計略過；上一批是 587 個 |
| `npm run soak`（4000 局隨機完整對局） | 全部通過；真實卡組 1000 局輪流使用九副卡組的所有配對。從未被使用的能力 9 個：ANM/W138-041#1、065#1、074（Event）、095#0，GUP/W141-099#2，NIK/S135-011#0、014#0，STS/W140-018#1、093#0（條件在隨機對局中沒有出現；各有逐張或構件測試） |
| `npm run cards:validate` | 609 張卡、9 個系列；圖片已核對 609、缺少 0、問題 0；資料問題 0 |
| `npm run cards:report` | 可對戰 233（人手 128＋自動 105）、未支援 376 |
| `npm run cards:worklist` | 未支援 376；未認識的片段 532 種；只差 1 個片段的卡 100 張、只差 2 個的 121 張 |
| `npm run build` | 成功；輸出不含圖片 |
| `npm run qa:ui` | 三種尺寸 60 fps、沒有橫向捲動、沒有錯誤（這次用 STS 對 NIK 卡組量度）；卡圖檢查 25 項全部通過；以快速動畫打完一整局 |
| `npm run qa:online` | 39 項檢查全部通過 |

## 第三批（分支 `feat/card-effects-batch-2`）新增及改動的測試

| 檔案 | 內容 |
|---|---|
| `card-database/tests/grammar.test.ts`（56） | 句子文法：人手卡 102 句交叉核對；51 張自動產生的卡逐張反向核對（每張一項，名稱含卡號）；不認識的片段不會編譯並指出是哪一部分；括號文字只在已知是提示時略過。植入 25 個錯誤全部被發現 |
| `card-database/tests/render-ja.ts` | 把能力資料寫回日文的獨立程式（只供測試使用） |
| `game-engine/tests/abilities-batch-5.test.ts`（18） | 八個新引擎構件 |
| `game-engine/tests/ability-helpers.ts` | 合成卡測試共用的輔助程式；`abilities-batch-3.test.ts` 改為使用它（測試內容沒有改動） |
| `card-database/tests/games.test.ts`（更新，新增 1） | 九副卡組的所有配對共 108 局；新增：全部由文法產生的卡分成四副練習卡組，對九副卡組打 144 局，沒有規則問題，87 個能力中 75 個被使用 |
| `ai/tests/deck-games.test.ts`（4，取代 `bdy-games.test.ts`） | BDY、STS、ANM、NIK 四副卡組各打 32 局進階對進階；全部正常結束、每 10 個決定檢查不變量。BDY 原有的勝率上下限（多於 10%、少於 90%）保留 |
| `card-database/tests/patterns.test.ts`（更新 1 項） | 原本的「Event 永不自動編譯」按這一批的設計改為：Event 只在整段都是已認識的效果句子時編譯；有不認識的句子、Counter Event、帶 Cost 的 Event 都不編譯 |
| `card-database/tests/stats.test.ts`、`web-client/tests/card-browser.test.ts`（各更新 1 個預期值） | 因勘誤而暫緩的卡可以沒有未認識的句子；已驗證的 Event 清單加入 ANM/W138-074 |

沒有刪除其他測試，也沒有放寬其他預期值。

## 這一批（2026-11-14，分支 `feat/card-effects-batch-1`）新增的測試

| 檔案 | 內容 |
|---|---|
| `card-database/tests/cards-bdy.test.ts`（14） | BDY/W135 的 14 張人手卡，每張一個以卡號命名的測試，在真實引擎內按官方文字逐項驗證（包括不應發生的情況，例如 087 的戰鬥對手 Cost 是 1 時不會詢問）。在卡牌資料植入 8 個錯誤，全部被發現 |
| `game-engine/tests/abilities-batch-3.test.ts`（16） | 十一個新的通用構件（第一批十個、第二批的「…した時か…した時」），以合成測試卡測試。在引擎植入 19 個錯誤，全部被發現 |
| `card-database/tests/cards-batch-4.test.ts`（12） | 第二批 12 張卡（ANM、NIK、STS、GUP、BDY），每張一個以卡號命名的測試，包括「到對手下回合結束」的效果在對手回合仍然有效、之後消失，以及被給予的 Encore 實際把角色放回舞台。植入 35 個錯誤，全部被發現 |
| `ai/tests/bdy-games.test.ts`（1） | BDY 卡組由進階電腦對進階電腦，對其餘五副卡組各 8 局（雙方座位各半），共 40 局全部正常結束、每 10 個決定檢查一次不變量、沒有規則問題；BDY 勝 14 局，平均每局 186 個決定 |
| `card-database/tests/games.test.ts`（更新，新增 1） | 隨機對局由 60 局增至 90 局，涵蓋六副卡組的所有配對；BDY 的能力確實在對局中被使用。新增：用第二批 12 張卡組成的練習卡組（跨五個作品，不是合法卡組，不提供給玩家）對六副測試卡組打 60 局，全部正常結束；19 個能力中 15 個被使用，其餘 4 個的條件在隨機對局中不會出現（測試內列明），由逐張測試涵蓋 |
| `card-database/tests/formats.test.ts`、`database.test.ts`、`ai/tests/ai.test.ts`（自動涵蓋） | BDY 卡組是合法的 Neo-Standard 卡組、全部是已驗證的卡；進階及普通電腦用它打完合法的完整對局 |
| `card-database/tests/stats.test.ts`（新增 1） | 每張未支援的卡都被分到 A 至 E 其中一類，需要新構件或機制的都有列明原因 |
| `web-client/tests/card-pictures.test.tsx`（7） | 圖片清單、609 張卡與圖片的對應、每個圖片網址、`<img>` 顯示、卡背沒有圖片、載入失敗的備用、圖片關閉時的行為 |
| `backend/tests/server.test.ts`（圖片服務 5，取代原來 1 項「只限 localhost」） | 見 `CARD_IMAGE_REPORT.md`。原來的測試描述的是舊行為（只提供給 localhost），按你的新指示改為預設提供給所有客戶端；「只限 localhost」的行為仍然保留為 `USER_ART=local` 並有測試 |
| `tests/e2e/pictures.mjs`（瀏覽器） | `qa:ui` 及 `qa:online` 共用的卡圖檢查 |

## 上一批新增的測試

| 檔案 | 內容 |
|---|---|
| `card-database/tests/patterns.test.ts`（23） | 句式與人手資料交叉核對；每個句式在引擎內對它產生的每張卡逐張執行，預期數值由官方原文讀出（不是由產生的資料讀出）。曾故意植入四個錯誤（數值加一、數字次序對調、漏掉 Level 條件、漏掉 Soul 圖示條件），全部被測試捉到，之後還原 |
| `card-database/tests/formats.test.ts`（18） | 卡組驗證：50 張、同名 4 張、Climax 8 張、Title（包括一個作品番號屬於兩個 Title）、使用不可、○枚まで、○種選抜、附帶條件的解禁、未知卡號及錯誤張數、未支援的卡 |
| `card-database/tests/database.test.ts`（更新，15） | 每張官方卡只出現一次；自動紀錄只可以是「句式」或「未支援」；匯入的系列卡號代碼一致；Soul「－」＝ 0；未核實的 Trigger 圖示會令卡變成未支援而不是令資料庫失效 |
| `card-database/tests/games.test.ts`（新增 1） | 用新匯入的 GUP Climax 組成合法卡組，與五副測試卡組打完 12 局，新卡的能力確實被使用 |
| `card-database/tests/stats.test.ts`（1） | 每張卡只屬於人手、句式、未支援其中一種 |
| `web-client/tests/decks.test.ts`（5） | 加減卡牌；多副卡組及預設卡組在重新載入後仍然存在；JSON／CSV／代碼匯出再匯入得到相同卡組；匯入錯誤逐項列出；只有合法而且全部支援的卡組可用於對戰 |
| `web-client/tests/presentation.test.ts`（新增 5） | 暫停、逐步播放（連按不跳步）、跳過、戰鬥紀錄次序及內容、不動畫的更新仍然推進紀錄 |
| `backend/tests/rooms.test.ts`（新增 3） | 伺服器接受合法的自製卡組並按它發牌；自行驗證並拒絕混合 Title、禁卡、未支援的卡、張數不對的卡組；對手看不到卡組內容 |

## 測試中發現並修正的問題

| 問題 | 處理 |
|---|---|
| （這一批）加入兩張 GUP 新卡後，一個舊的 GUP 測試失敗：它依賴測試卡堆的次序，新卡排在最後變成了山札頂 | 新紀錄改放在清單最前面，舊卡次序不變；沒有修改舊測試 |
| （這一批）第一個 commit 更新了規則登記表的文字，但沒有重新產生 `rules/registry.json`，令該 commit 的登記表測試不通過 | 第二個 commit 已重新產生（`npm run registry`），`npm run check` 全部通過 |
| （這一批）瀏覽器卡圖檢查有時在圖片剛載入、頁面還未判斷直向或橫向時就讀取結果 | 改為等待頁面標記「已載入」後才檢查 |
| （這一批）故意令卡圖載入失敗的檢查，令同一張卡在之後的卡組編輯器檢查中仍顯示備用卡面 | 這是設計行為（失敗的圖片不再重試）；檢查改用另一系列的卡 |
| 句式測試的預期值原本取自產生的能力資料，是循環論證（植入的錯誤沒有被引擎測試捉到） | 改為由官方原文讀出數字及特徵；重新植入錯誤後全部被捉到 |
| 逐步播放按「下一步」後，「等待下一步」的狀態慢一拍才清除，按鈕可能被連按 | 改為立即清除；測試連按兩次不會跳步 |
| 跳過動畫時，戰鬥紀錄先記入之後的更新、再記入當前更新的餘下步驟，次序錯誤 | 已修正並有測試 |
| 完整卡圖被裁切到卡面上方的小窗；Climax 的橫向圖片不符合直向比例 | 完整卡圖整張顯示；橫向圖片轉正 |
| 介面只列出有人手紀錄的 102 張卡 | 改為列出資料庫全部卡 |
| 驗證工具把 Soul「－」當作錯誤 | 對照卡圖後確認是 Soul 0 的角色，已正確處理並加入測試 |
| 手機導覽列 7 個項目換行成直排；電腦顯示了手機用的分頁按鈕；複製的卡組名稱出現兩次「（自製）」；上方階段標示與解說不同步 | 全部修正，截圖確認 |
| 一個舊的 SAO 測試依賴洗牌後的次序 | 上一批已修正 |

## 實際在瀏覽器操作的項目

| 項目 | 結果 |
|---|---|
| 用舊有卡組對戰（SAO 對 GUP、涼宮ハルヒ 對 一花） | 打完整局，沒有錯誤 |
| 用新匯入的卡組成卡組 | GUP 新 Climax 組成合法卡組並完成對局（自動測試）；編輯器可以瀏覽及加入全部 609 張卡 |
| 不同顏色的卡對戰 | 測試卡組是雙色及三色 |
| 攻擊方式、Climax、Trigger、傷害及取消、卡牌效果 | 由解說及戰鬥紀錄逐步顯示；規則由 772 個測試及 4000 局 soak 覆蓋 |
| 卡組編輯器 | 複製測試卡組 → 顯示「合法，可以對戰」；移除 1 張 → 「不合法：卡組必須剛好 50 張，現在是 49 張（還差 1 張）」；加回 → 合法 |
| 重新整理後卡組仍然存在 | 是；首頁的卡組選單出現該自製卡組 |
| 電腦及手機介面 | 1366×900 及 390×844 截圖檢查；沒有橫向捲動 |
| 卡圖 | 卡牌一覽、卡組編輯器、手牌、舞台、Climax、判定公開畫面、移動中的卡、詳情都顯示真實卡圖（瀏覽器測試逐項核對，並檢視截圖） |
| 用 BDY 卡組對戰 | 單機打完整局（`qa:ui`）；電腦對電腦 40 局 |

## 沒有做或做不到的測試

- Tablet 尺寸沒有單獨截圖（版面在 980 px 切換，電腦及手機兩種版面都已測試）。
- 沒有測試真正的手機裝置，只有 Chromium 的手機尺寸及觸控模擬。
- 320 張未支援的卡沒有效果測試（尚未實作）；測試確認它們不能進入對戰。
- 由句子文法產生的 51 張卡沒有逐張的情境測試（人手卡才有）；它們由交叉核對、反向核對、構件測試及完整對局涵蓋。
- 四張有官方勘誤的卡仍未核對勘誤內容，所以保持未支援。
- 另一部實體手機、實體電腦及互聯網部署仍未測試（步驟見 `docs/07-devices-and-deployment.md`）。
- STS、ANM、NIK 的新卡未能以合法卡組測試（可對戰的卡不足 50 張），只有逐張測試及上述練習卡組的完整對局。
- 卡圖的區域網絡測試是在同一部電腦以區域網絡位址連線；沒有用另一部實體裝置測試，也沒有經互聯網的房間（未部署）。
