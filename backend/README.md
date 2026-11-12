# backend — 網上對戰伺服器（STEP 9）

```bash
npm run server        # 建立介面並啟動伺服器：http://localhost:8787
npm run server:lan    # 同上，並容許同一 Wi-Fi 的其他裝置連線
npm run server:dev    # 只啟動伺服器（配合 npm run dev，介面經 Vite 轉發 /ws）
```

| 檔案 | 內容 |
|---|---|
| `src/shared/` | 伺服器及瀏覽器共用、不依賴 Node：通訊協定、一局（種子＋行動）、每個座位的事件及更新、重播檔 |
| `src/rooms.ts` | 房間、座位、準備、對局、再戰、重新連線、斷線保留 |
| `src/store.ts` | SQLite 持久化（`data.nosync/server.sqlite`） |
| `src/server.ts` | HTTP、WebSocket（`/ws`）、來源檢查、心跳、提供已建置的介面 |
| `src/main.ts` | 啟動程式及設定（環境變數見檔案開頭） |

引擎只在伺服器運行，每名玩家只收到自己座位的玩家視圖及已過濾的事件。設計、平台規則、安全措施及測試結果見 [docs/06-online-play.md](../docs/06-online-play.md)。

伺服器以 esbuild 打包成 `backend/dist.nosync/server.mjs`（不入 Git、iCloud 不同步），唯一的執行期依賴是 `ws`。
