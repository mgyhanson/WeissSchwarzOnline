# 第二階段計劃：卡牌揭示、卡牌視覺、動畫、介面及卡池擴充

非官方的社群專案，與 Bushiroad 及各作品的權利人無關。

工作分支：`feat/card-visual-reveal-ux`（由 `main` 的 STEP 8 完成版本分出）。
本文件按你的要求寫於 Stage A，之後各階段完成時更新「狀態」一欄。

## 0. 起點

| 項目 | 狀態（2026-11-12 開始時重新確認） |
|---|---|
| 規則引擎（STEP 4a 至 4d）、規則覆蓋檢查（STEP 5） | 完成 |
| 真實卡牌（STEP 6a） | 35 張，全部 verified |
| 對戰介面（STEP 7） | 完成，但視覺簡陋、沒有動畫 |
| AI（STEP 8） | 完成：入門、普通、進階、專家四級（你的指示寫於 STEP 8 完成之前，所以寫成「尚未完成」） |
| 連線（STEP 9） | 未開始，本階段不做 |

開始前的測試基準（`main` 的 `0995267`，2026-11-12）：`npm run check` 332 個測試通過、8 個慢速測試按設計略過（soak、AI 對戰、評分擬合）；`npm run build` 成功；`npm run soak` 4000 局全部通過；`npm run ai:tournament` 三組全部通過。Node.js v24.21.0。

「練習對手」已在 STEP 8 由四級 AI 取代（入門及普通級的角色相同），本階段不會刪除任何對手功能。

## 1. 現有介面的問題

1. **卡牌難以辨認**：只有文字及色框，所有卡看起來差不多；小尺寸時名字被截斷。
2. **翻牌看不清楚**：Trigger Check、傷害、集中翻出的卡只在棋盤中間一閃而過；抽牌完全沒有提示。
3. **沒有動畫**：狀態直接跳到結果，對手的行動只能看紀錄。
4. **電腦對手太快**：一個決定之內發生的多次傷害、Refresh、Level Up 同時出現。
5. **資訊層次弱**：雙方 Level、Clock、Stock 的張數要細看棋盤才知道；沒有玩家資訊列。
6. **視覺不一致**：顏色寫在個別規則內，沒有設計系統。
7. **卡池少**：只有兩副 Trial Deck。

## 2. 卡牌圖片

### 2.1 官方圖片能否使用（2026-11-12 查閱）

Bushiroad 現行 Fan Content Policy（https://en.bushiroad.com/fan-content-policy/）對官方網站的圖片（包括 Weiß Schwarz）規定：

- 只可用於網站；
- **不可用作任何網頁應用程式或軟件的一部分**，明文包括 JavaScript 及 Ajax；
- 不可修改，包括改變檔案格式；
- 不可以任何其他方式再散佈，不可供批量下載，不可隨應用程式或軟件散佈；
- 只限非商業用途。

本專案是以 JavaScript 運行的網頁遊戲，**不符合**這些條件。日文官方網站沒有找到另外的指引。因此：

- 不下載、不託管、不嵌入官方卡圖，也不把官方圖片網址放進遊戲內載入；
- 每張卡提供「在官方卡表查看卡牌圖片」連結，開啟官方網站的卡牌頁（由玩家在官方網站觀看，不屬於本遊戲的一部分）；
- 如要在遊戲內使用官方卡圖，須先向 Bushiroad 取得書面許可（https://ws-tcg.com/support/）。

### 2.2 可替換的圖片來源（Image Provider）

按次序嘗試，找到就用：

| 次序 | 來源 | 內容 | 是否進入 GitHub |
|---|---|---|---|
| 1 | Licensed | `card-assets/licensed-images.json`：只列出有明確書面許可的圖片，每項記錄 cardId、檔案或網址、來源、許可狀態、許可文件參考、最後核實日期、署名要求。**目前是空的** | 清單會；圖片只在許可容許時 |
| 2 | User provided | `card-assets/local.nosync/`：玩家自行放入、有權使用的圖片，檔名按卡號（`SY_W08-T06.png`），另有 `sources.json` 記錄來源。開發伺服器原樣提供，不改動圖片 | **不會**（`.gitignore`；`.nosync` 亦令 iCloud 不同步；正式版建置不包含） |
| 3 | Original artwork | 程式繪製的原創卡面：按卡號產生的抽象圖案、顏色主題、種類徽章、自製 Trigger 圖示。不描繪任何角色，不模仿官方卡圖 | 會（程式碼） |

圖片載入：延遲載入、載入中佔位、載入失敗自動退回原創卡面、大圖查看；載入失敗不影響操作。

## 3. 卡牌揭示（Reveal）

### 3.1 資料來源

只用玩家已經收到的資料：自己座位的 `PlayerView`、自己的 `Decision`（`look` 欄）、已過濾的 `GameEventView`。不讀取遊戲狀態，不由介面自行判斷卡是否公開：卡牌身份只在引擎已經給予時出現。

| 情況 | 引擎資料 | 介面分類（只是展示層的名稱，不是規則用語） |
|---|---|---|
| 自己抽牌 | `CARD_MOVED`（`DRAW`），移動後自己看得到 | PRIVATE_DRAW |
| 對手抽牌 | 同一事件，沒有卡牌資料 | 只顯示張數 |
| Trigger Check | `CARD_MOVED`（`TRIGGER_CHECK`，到解決領域）＋ `TRIGGER_CHECK`（圖示）＋之後到 Stock | TRIGGER_REVEAL |
| 傷害 | 逐張 `CARD_MOVED`（`DAMAGE`，到解決領域），然後 Cancel（到控え室）或全部到 Clock，最後 `DAMAGE_DEALT` | DAMAGE_REVEAL |
| 集中等「翻開」效果 | `CARD_MOVED`（`EFFECT`，到解決領域） | PUBLIC_REVEAL |
| 「相手に見せ」 | `CARD_REVEALED` | PUBLIC_REVEAL |
| 查看山札頂、搜尋山札 | 自己 `Decision` 的 `look` | DECK_INSPECTION／OWNER_ONLY_REVEAL |

### 3.2 展示

- 揭示面板（棋盤中央）：大卡、卡名、卡號、顏色、Level、Cost、Power、Soul、Trigger、效果原文、中文說明、翻牌原因、最後去向。
- 多張卡：逐張翻開排成一列，點擊任何一張看詳情。
- 傷害：逐張翻開，顯示「第 N 張／共 M 點」；Cancel 時整列劃走並顯示「Cancel」，否則移入 Clock。
- Trigger：翻面後放大顯示 Trigger 圖示及結果（例如「Soul +1」「門：可回收角色」），然後移入 Stock。
- 抽牌：自己抽到的卡短暫展示後飛入手牌；對手抽牌只顯示卡背飛入對方手牌。
- 已揭示的卡留在對局紀錄，卡名可點擊開啟詳情（只限揭示時已公開或自己有權看的卡）。

## 4. 動畫系統

### 4.1 架構

```
LocalHost（引擎） ──每次提交產生 { id, events, view }──▶ PresentationQueue ──▶ 畫面
```

- 主機把每次提交的結果（已過濾的事件＋新的玩家視圖）作為一個「更新」，有遞增 id。
- `PresentationQueue`（`web-client/src/presentation/`）按次序把更新的事件轉成「展示步驟」（純函數，可測試），逐步播放；一個更新的步驟播完，棋盤才換成該更新的視圖。
- 已播放的更新 id 記錄在佇列內，React 重繪不會重播。
- **動畫不改變遊戲結果**：引擎在提交時已計算完畢，佇列只決定「何時顯示」。
- 電腦對手在畫面播放期間等候（只延遲電腦下一步的時間，不延遲任何規則處理）。
- 「跳過動畫」立即顯示最新視圖；速度：一般、快速、關閉。瀏覽器設定 `prefers-reduced-motion` 時預設為關閉。

### 4.2 實作原則

- 卡牌移動用 Web Animations API 移動一個浮動的卡牌元素（只用 transform 及 opacity），起點及終點取自棋盤區域的位置；不在每一格動畫更新 React 狀態。
- 每種動畫有統一的時間及緩動（animation tokens）。

### 4.3 動畫清單

移動（抽牌、出牌、到控え室、Clock、Level、Stock、Memory、回收）；翻牌；攻擊（攻擊角色向前推進、目標標示）；Rest／Stand／Reverse（旋轉過渡）；Climax 放置；Trigger；傷害及 Cancel；Encore；Level Up；Refresh；能力發動（卡牌閃光及能力文字提示）；Power／Soul 變化（數字變化提示）。

## 5. 介面重設

- 設計系統：`styles.css` 頂部的色彩、間距、字型、圓角、陰影、動畫時間 tokens；按鈕、面板、卡牌樣式統一。繁體中文字型堆疊：PingFang TC、Noto Sans TC、Microsoft JhengHei。
- 對戰桌面：
  - 上：對手資訊列（名稱、Level、Clock、Stock、手牌、山札、控え室）。
  - 中上：對手場地。
  - 中：揭示面板、攻擊及傷害展示、階段提示。
  - 中下：自己場地。
  - 下：自己資訊列、手牌、主要按鈕。
  - 側：決定面板、對局紀錄、卡牌詳情。
- 手機直向：決定面板在底部；手機橫向：側欄收窄，棋盤優先；按鈕最少 40px 高。
- 永遠顯示：回合、階段、誰在決定、雙方 Level／Clock／Stock 張數、正在處理的效果。

## 6. 卡池擴充（STEP 6b）

### 6.1 系列選擇（2026-11-12 查閱官方卡表）

| 系列 | 補充包卡數（不含異圖） | 新的 Trigger 圖示 | 提及 Marker 的卡 | 備註 |
|---|---|---|---|---|
| ソードアート・オンライン SAO/S20 | 104 | Shot、Draw、Treasure（各 1 張） | 2 | 原計劃系列；有絆、応援、思い出、チェンジ、集中、助太刀、加速 |
| ステラソラ STS/W140 | 100 | Gate、Standby、Treasure | 30 | Marker 卡很多，引擎尚未支援 Marker 類效果 |
| ガールズ＆パンツァー GUP/W141 | 114 | Choice、Draw、Gate、Treasure | 11 | CX Combo 15、集中 8、助太刀 9、Counter 12 |

選擇 **GUP/W141**：可測試的新 Trigger 圖示最多（Choice、Draw、Gate、Treasure），而且 Marker 卡較少，較少卡需要標示為不支援。

### 6.2 範圍

每個系列先選 15 至 25 種不同效果的卡（優先：Event、Climax、Counter、搜尋、回收、Power／Soul 增減、CX Combo、Experience、思い出、Alarm、チェンジ、Encore、多重能力、特殊 Trigger）。原有 SY/W08、5HY/W83 及限制資料全部保留。

### 6.3 每張卡的要求

官方原文、卡號、數值（由官方資料自動轉換）、官方 Q&A、エラッタ核對、限制表核對、能力資料（`abilities/types.ts` 的格式）、獨立的繁中說明（標示 AI 輔助・待核實）、支援狀態、自動化測試。新的 Trigger 圖示要先由卡上的提示文字確認意思才可以加入轉換器。引擎未支援的效果：先查規則、擴充引擎並測試；做不到就標示 unsupported 並選另一張卡。只有 verified 的卡可以放入測試卡組。

## 7. 檔案

### 7.1 需要修改

- `web-client/src/components/CardFace.tsx`、`Board.tsx`、`Game.tsx`、`Panels.tsx`、`Sheets.tsx`、`Screens.tsx`、`App.tsx`
- `web-client/src/styles.css`、`web-client/src/host/local.ts`、`web-client/src/model/log.ts`
- `web-client/vite.config.ts`（玩家自備圖片的開發伺服器路由）
- `card-database/src/official.ts`（新的 Trigger 圖示，附證據）、`card-database/src/index.ts`、`card-database/src/decks.ts`
- `game-engine/src/abilities/*`（只在新卡需要時，並附測試）
- `.gitignore`、各 README、`docs/02-architecture.md`、`docs/03-phase1-plan.md`、`rules/rule-registry.md`

### 7.2 新增

- `web-client/src/presentation/steps.ts`：事件 → 展示步驟（純函數）
- `web-client/src/presentation/queue.ts`：展示佇列、速度、跳過
- `web-client/src/presentation/animate.ts`：卡牌移動、翻面等 Web Animations
- `web-client/src/components/RevealPanel.tsx`、`PlayerBar.tsx`、`CardArt.tsx`
- `web-client/src/images/providers.ts`：圖片來源鏈
- `card-assets/licensed-images.json`、`card-assets/README.md`
- `card-database/sets/SAO_S20/`、`card-database/sets/GUP_W141/`（official.json、cards.ts）及卡牌測試

## 8. 測試計劃

| 範疇 | 方法 |
|---|---|
| 揭示 | 展示步驟的單元測試：抽牌、Trigger、傷害（逐張、Cancel）、集中、公開；用真實對局的事件檢查每個步驟只用該座位收到的資料，對手的抽牌沒有卡牌身份 |
| 洩漏 | 對兩個座位分別產生步驟：一方的私人抽牌從不出現在另一方的步驟中；查看山札的卡只出現在自己的決定 |
| 佇列 | 次序、不重播同一更新、跳過後與最新視圖一致、關閉動畫時立即顯示 |
| 圖片 | 每張卡都有原創卡面；授權清單的格式檢查；載入失敗退回；正式版建置不包含 `local.nosync` 的檔案 |
| 介面 | 瀏覽器檢查：電腦、手機直向、手機橫向；沒有橫向捲動、沒有重疊 |
| 卡牌 | 沿用現有：每張 verified 卡都有測試；資料雜湊；卡組合法 |
| 回歸 | `npm run check`、`npm run build`、`npm run soak`、`npm run ai:tournament` |

## 9. 版權風險

- 官方卡圖：見 2.1，不使用。
- 卡牌文字及卡名：沿用現有做法（私人非商業參考、標明出處），新系列同樣處理。
- 原創卡面：只用抽象圖形，不描繪角色，不模仿官方卡框設計。
- 玩家自備圖片：只存在玩家自己的電腦，不進入 GitHub、iCloud 同步或正式版；使用權由玩家負責，介面會提示。

## 10. 各階段驗收標準

| 階段 | 內容 | 驗收 |
|---|---|---|
| A | 檢查、基準測試、本計劃 | 測試基準記錄於本文件；計劃符合 02、03 文件 |
| B | 揭示系統 | 第 12 節 A 項全部通過；兩個座位的洩漏測試通過 |
| C | 卡面及圖片來源 | 每張卡有清晰卡面（三種尺寸比例正確）；圖片來源鏈及退回測試通過；正式版不含未授權圖片 |
| D | 動畫佇列 | 次序、不重播、跳過、三種速度、reduced motion 都有測試或瀏覽器驗證 |
| E | 介面重設 | 電腦、手機直向及橫向在瀏覽器檢查無嚴重排版問題；常駐資訊齊全 |
| F | 卡池擴充 | SAO/S20 及 GUP/W141 新增的 verified 卡全部有測試；未支援的卡如實標示 |
| G | 全面檢查 | `check`、`build`、`soak`、`ai:tournament` 全部通過；文件更新；最終報告 |

## 11. 與原有計劃的關係

- `docs/02-architecture.md` 第 10 節：介面只由玩家視圖及事件驅動、動畫以事件排隊、不使用官方 UI 素材——本計劃完全沿用，並把「以事件排隊播放的動畫」實作出來。
- `docs/03-phase1-plan.md`：STEP 6b 原本計劃 SAO 及 2026 年系列；本計劃按此進行，2026 年系列經比較後選 GUP/W141。版權一節「預設不使用官方卡圖」與 2.1 的結論一致。
- STEP 9（連線）不在本階段範圍；`GameHost` 介面保持不變，展示佇列只依賴主機提供的更新，日後換成連線主機也適用。

## 12. 結果（2026-11-12）

| 階段 | 狀態 | Commit |
|---|---|---|
| A 計劃及基準 | 完成 | `80ef052` |
| B 卡牌揭示 | 完成 | `852db6b` |
| C 卡面及圖片來源 | 完成 | `e84bd66` |
| D 動畫佇列 | 完成 | `eea00da` |
| E 介面重設、卡牌一覽 | 完成 | `a1e0a09` |
| F 卡池擴充（STEP 6b 第一批） | 完成：SAO/S20 27 張、GUP/W141 19 張，全部 verified | `d7e9bc9` |
| G 全面檢查 | 完成 | 本階段最後的 commit |

### 測試

- `npm run check`：406 個測試通過、8 個慢速測試按設計略過；型別檢查及規則覆蓋檢查通過。
- `npm run build`：成功；輸出只有 `index.html` 及兩個 assets，沒有任何玩家自備圖片。
- `npm run soak`：4000 局全部通過；真實卡組部分輪流使用四副卡組的 12 種配對。唯一從未被使用的能力是 GUP/W141-099 的第三個能力（需要未收錄的「BT-42のなんでも屋 アキ」）。
- `npm run qa:ui`（新增，真正的無介面 Chromium）：

| 畫面 | 動畫期間幀率 | 每幀時間（中位數／95%） | 橫向捲動 | Console 錯誤 |
|---|---|---|---|---|
| 電腦 1366×850 | 60 fps | 16.7／16.7 ms | 沒有 | 0 |
| 手機直向 375×812 | 60 fps | 16.7／16.7 ms | 沒有 | 0 |
| 手機橫向 812×375 | 60 fps | 16.7／16.7 ms | 沒有 | 0 |

  另以「快速」動畫在瀏覽器打完一整局，沒有錯誤。

### QA 中發現並修正的問題

- Trigger Check 揭示面板以圖示名稱作為 React key；有兩個相同圖示的 Climax（例如 Soul＋Soul）會產生重複 key 的警告。已改以位置作 key，並加入回歸測試（已驗證沒有修正時測試會失敗）。
- 卡面的名稱、卡號及特徵在大卡及手牌尺寸會互相重疊；已調整卡面比例及字距，以截圖確認。
- 手機上揭示面板置於整個棋盤的中央，會跑到畫面外或被底部的決定面板遮住；窄畫面改為固定在畫面中央。揭示面板改為不透明。
- 內建瀏覽器面板隱藏時會暫停動畫，曾令佇列等候；動畫加入計時保險，隱藏分頁不會令對局停住。

### 已知限制

- 官方卡圖按政策不能使用；卡面是原創圖案。玩家可在 `card-assets/local.nosync/` 放入自己有權使用的圖片。
- 一次更新（一個決定）之內，棋盤在播放完成後才換成新狀態；過程由揭示面板及飛行的卡呈現。
- 沒有拖放操作；音效未加入。
- 卡池合共 81 張，長期目標仍是約 100 至 130 種。（其後的第二批把卡池增至 102 張，見 `docs/05-card-pool-2.md`。）
