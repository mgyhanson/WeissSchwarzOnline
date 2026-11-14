# card-assets：卡牌圖片

> **2026-11-13 更新**：專案擁有人表示已取得使用官方卡圖的許可，並指示匯入。609 張卡圖現在放在 `local.nosync/`（102 張來自擁有人提供的整合包，507 張由官方卡表下載），**只在擁有人自己的電腦使用**：不進入 Git、iCloud 不同步、不包含在建置輸出內，伺服器只向 localhost 提供，不會傳送給網上對手。許可本身未能由本專案核實；公開發佈或上傳圖片之前請先確認許可範圍。詳見 `reports/CARD_IMAGE_REPORT.md`。下面是原有的政策說明，保留作參考。

非官方的社群專案，與 Bushiroad 及各作品的權利人無關。

## 為甚麼遊戲內沒有官方卡圖

Bushiroad 現行 Fan Content Policy（https://en.bushiroad.com/fan-content-policy/ ，2026-11-12 查閱）規定官方網站的圖片：

- 只可用於網站；
- 不可用作任何網頁應用程式或軟件的一部分，包括 JavaScript 及 Ajax；
- 不可修改，包括改變檔案格式；
- 不可再散佈，不可供批量下載；
- 只限非商業用途。

本遊戲是以 JavaScript 運行的軟件，所以不下載、不託管、不嵌入官方卡圖。每張卡都有「在官方卡表查看卡牌圖片」的連結，在官方網站觀看。

## 遊戲按以下次序找卡牌圖片

| 次序 | 來源 | 位置 | 進入 GitHub？ |
|---|---|---|---|
| 1 | 已取得書面許可的圖片 | `licensed-images.json`（目前是空的） | 清單會；圖片只在許可容許時 |
| 2 | 你自己放入、有權使用的圖片 | `local.nosync/` | **不會**（`.gitignore`；iCloud 不同步；正式版不包含） |
| 3 | 程式繪製的原創卡面 | `web-client/src/components/CardArt.tsx` | 會（程式碼） |

找不到或載入失敗時，自動使用下一個來源。原創卡面只用抽象圖案、顏色及種類徽章，不描繪任何角色，不模仿官方卡圖。

## 放入自己的圖片

1. 確認你有權在本專案使用該圖片。官方網站的卡圖**不**符合上述政策，不要放入。
2. 檔名按卡號，把 `/` 換成 `_`，例如 `SY/W08-T06` → `SY_W08-T06.png`（可用 `.png`、`.jpg`、`.jpeg`、`.webp`）。
3. 放到 `card-assets/local.nosync/`。
4. （建議）在同一資料夾的 `sources.json` 記錄來源：

   ```json
   { "SY_W08-T06.png": { "source": "自己繪製", "licence": "自己擁有", "note": "" } }
   ```

5. 用 `npm run dev` 啟動，開發伺服器會原樣提供這些檔案（不改動、不轉檔）。

這些圖片只在你自己的電腦上出現；正式版建置（`npm run build`）不會包含，也不會被上傳。

## licensed-images.json 的格式

只在取得明確書面許可後加入：

```json
{
  "images": [
    {
      "cardId": "XXX/W00-001",
      "url": "https://… 或 card-assets/licensed/檔名",
      "source": "權利人名稱",
      "licence": "GRANTED",
      "permissionRef": "許可文件或電郵的參考編號",
      "lastVerified": "YYYY-MM-DD",
      "attribution": "必須顯示的版權字句"
    }
  ]
}
```

`licence` 不是 `GRANTED` 的項目不會顯示。
