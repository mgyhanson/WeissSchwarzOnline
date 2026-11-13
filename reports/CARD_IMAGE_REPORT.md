# CARD_IMAGE_REPORT — 卡圖

2026-11-14。圖片全部在 `card-assets/local.nosync/`（不入 Git、iCloud 不同步、不包含在建置輸出內）。

## 結果

| 來源 | 張數 | 核對結果 |
|---|---|---|
| 你提供的 `WeissSchwarz_Card_Art_102_Complete.zip`（原有 Trial Deck 35 張＋新增 67 張） | 102 | 102 張全部通過 |
| 按你的指示由官方卡表下載（五個補充包的基本卡，已有的 19 張 GUP 卡圖不重複下載） | 507 | 507 張全部通過 |
| **合計** | **609** | 資料庫 609 張卡每張都有圖片；缺圖 0、錯圖 0、沒有對應卡的檔案 0 |

異圖版本（SP、SSP 等 645 項）沒有下載：資料庫只有基本卡。

## 102 張整合包的處理（`npm run cards:images -- <zip>`）

1. 在 `~/Downloads` 找到檔案；SHA-256 `c91776eaf6906f327b894bc098d212f6a437285c6e81baa0cb0882e58afc1c07`。
2. 先檢查 ZIP 內沒有不安全的路徑，並以 `unzip -t` 驗證每個檔案的 CRC；解壓到獨立的暫存資料夾，沒有執行其中任何內容。
3. 讀取 `manifest_102.csv`，**以 `card_id` 欄配對**，不是按檔案次序或檔名相似度：
   - 卡號必須在資料庫內（102／102）；
   - 檔名必須屬於該卡號；
   - manifest 記錄的來源網址必須是該卡在官方資料中的圖片路徑；
   - 檔案的 SHA-256 必須同時符合 manifest 及 `SHA256SUMS.txt`；
   - 圖片必須可以解碼。
4. 原樣複製（不轉檔、不修改）到 `card-assets/local.nosync/<卡號>.png`；已有圖片的卡不會被覆蓋。
5. 原始 ZIP 另存一份在 `data.nosync/originals/`。
6. 結果：複製 102、問題 0（`reports/card_image_pack_report.json`）。

原有 35 張及新增 67 張都保留；沒有重複圖片，沒有刪除任何卡牌資料。

## 圖片驗證方法

不是只看副檔名：`scripts/images-lib.ts` 檢查 PNG 簽名、每個區塊的 CRC，並把圖像資料實際解壓，核對解壓後的大小與檔頭宣告的寬高相符。全部 609 張都是 PNG（角色及 Event 400×559 左右，Climax 是橫向 559×400 左右）。

## 圖片索引

`card-assets/local.nosync/image-index.json`：每張卡的檔名、SHA-256、位元組數、寬高、來源（整合包或官方卡表）、來源網址、記錄日期。`sources.json` 供介面顯示來源。`npm run cards:validate` 會核對索引、檔案及資料庫三者一致。

## 圖片在遊戲中的顯示

- 卡牌一覽、卡組編輯器、對戰畫面、卡牌詳情都使用同一個圖片來源（`web-client/src/images/providers.ts`）。
- 完整卡圖以整張卡顯示，保持原來的長寬比，**不裁切**；Climax 的橫向圖片在棋盤上轉正放入直向卡位，在詳情中以橫向顯示。
- 點擊卡牌可以放大查看（詳情中最大 320 px 寬），滑鼠及觸控都可以。
- 舞台上角色的數值被效果改變時，會在卡圖上疊加顯示現時的 Power／Soul（印刷數值沒有改變時不疊加）。
- 圖片延遲載入；卡牌一覽分頁顯示。瀏覽器測試：三種畫面尺寸都是 60 fps。
- 圖片載入失敗或沒有圖片時，自動改用程式繪製的卡面，不會以其他卡的圖片代替。

## 圖片的使用範圍

- 只向**這部電腦**提供：請求必須來自 loopback 位址，而且網址是 localhost；同一 Wi-Fi 的其他裝置、經通道或代理的請求一律得不到圖片（有測試）。網上對手看到的是程式繪製的卡面。
- `npm run build` 的輸出不包含任何圖片（已檢查：只有 `index.html` 及兩個 assets）。
- 圖片不在 Git 版本庫內，也沒有上傳到 GitHub。
- 你表示已取得使用這些圖片的許可；我無法核實。原有的 Bushiroad Fan Content Policy 說明保留在 `card-assets/README.md`。如果要把圖片公開或放上 GitHub，請先確認許可範圍。
