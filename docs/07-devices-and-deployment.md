# 實體裝置測試及互聯網部署指南

2026-11-14。這份文件分兩部分：

1. 用另一部實體手機或電腦測試（**尚待你親自測試**；我只能在同一部電腦上模擬）。
2. 把伺服器放到互聯網的準備及步驟（**尚未部署**；沒有主機帳號、網域及憑證，所以沒有任何部署結果）。

## 第一部分：實體裝置測試

### 目前已測試及未測試的範圍

| 項目 | 狀態 |
|---|---|
| localhost 顯示真實卡圖 | 已測試（`npm run qa:ui`、`npm run qa:online`） |
| 同一部電腦以區域網絡位址連線（例如 `http://192.168.x.x:埠`） | 已測試（`npm run qa:online` 中的 Bob） |
| 卡圖載入失敗時改用備用卡面 | 已測試 |
| 對局中不會要求未公開的對手卡圖 | 已測試（逐一核對每個圖片請求） |
| 圖片索引、ETag、304 快取 | 已測試（`backend/tests/server.test.ts`） |
| **另一部實體手機**（同一 Wi-Fi） | **未測試，待你測試** |
| **另一部實體電腦**（同一 Wi-Fi） | **未測試，待你測試** |
| 經互聯網連線 | 未測試（未部署） |

同一部電腦以區域網絡位址連線，測試到的是伺服器對非 localhost 請求的處理；它**不能**證明另一部裝置的瀏覽器、Wi-Fi 路由器或 macOS 防火牆沒有問題。

### 最簡單的測試步驟（約 10 分鐘）

1. 在 Mac 的終端機進入專案資料夾，執行：

   ```bash
   npm run server:lan
   ```

2. 終端機會顯示類似以下內容，記下「同一網絡」那一行的網址：

   ```
   本機：     http://localhost:8787
   同一網絡： http://192.168.0.190:8787
   卡圖：     609 張，提供給所有連到這個伺服器的遊戲客戶端…
   ```

   如果 macOS 詢問「是否允許 node 接受傳入連線」，請按「允許」。

3. 手機連到**同一個 Wi-Fi**，用瀏覽器打開上面「同一網絡」的網址。
4. 逐項檢查並記錄結果：

| # | 在手機上做 | 預期 |
|---|---|---|
| 1 | 按「卡牌」 | 每張卡都是真實卡圖；Climax 是轉正的橫向圖 |
| 2 | 按任何一張卡 | 出現大圖及中文說明 |
| 3 | 按「卡組」→ 複製一副測試卡組 | 卡池及卡組清單都顯示真實卡圖 |
| 4 | 回主頁開始單機對局 | 手牌、舞台是真實卡圖 |
| 5 | 攻擊一次 | Trigger Check 翻出的卡以真實卡圖顯示 |
| 6 | Mac 按「網上對戰」建立房間；手機用邀請連結加入並開始 | 雙方都看到真實卡圖；對手的手牌是卡背 |
| 7 | 手機開啟飛行模式 10 秒再關閉 | 顯示「連線中斷」，之後自動回到對局 |
| 8 | 在 Mac 按 Ctrl+C 停止伺服器，再執行 `npm run server:lan`，手機重新整理 | 回到同一局（房間由資料庫恢復） |

5. 另一部電腦重複第 3 至 6 項。
6. 如果手機打不開網址：確認兩部裝置在同一個 Wi-Fi（不是訪客網絡）；到「系統設定 → 網絡 → 防火牆」確認沒有封鎖 node；部分路由器有「AP 隔離」，要關閉。

測試完成後，請把結果告訴我（哪一項不符預期、手機型號及瀏覽器），我會記入 `reports/TEST_REPORT.md`。

## 第二部分：互聯網部署

### 部署前的檢查結果（根據程式碼及現有測試）

| 項目 | 現況 | 部署時要注意 |
|---|---|---|
| WebSocket | 與網頁同一個位址的 `/ws`；頁面是 https 時自動用 `wss`（`web-client/src/host/remote.ts`） | 反向代理要轉發 WebSocket（Upgrade 標頭） |
| 來源檢查 | 只接受與 `Host` 標頭同一主機名稱或 localhost 的頁面；其他來源要列入 `ALLOWED_ORIGINS` | 反向代理必須保留原本的 `Host` 標頭 |
| 伺服器本身的 HTTPS | 沒有；伺服器只說 HTTP | 由反向代理或通道服務負責 HTTPS |
| 靜態檔案 | 由同一個伺服器提供建置後的介面（`STATIC`） | 先執行 `npm run build` |
| 卡圖 | `/user-art/`，只提供索引列出的檔案；`Cache-Control: private, max-age=86400`、ETag、304 | 圖片不在 Git 內，要另外複製到伺服器；公開提供前請確認授權範圍 |
| 持久化 | SQLite（`DB`）：房間、種子、卡組、行動列表 | 資料庫檔案要放在重啟後仍然存在的磁碟 |
| 伺服器重啟 | 啟動時按紀錄重新計算每一局，結果與重啟前相同（有測試） | 無需額外處理 |
| 重新連線 | 斷線保留 `GRACE_MINUTES`（預設 10 分鐘），逾時判負 | 可按需要調整 |
| 重播 | 對局結束後下載；不依賴伺服器保存 | 無 |
| 健康檢查 | `GET /health` 回覆 `ok` | 可供監察使用 |
| 流量限制 | 每個連線 10 秒 200 則訊息；最多 500 個房間；訊息上限 64 KB | 公開後如遇濫用再收緊 |

未做的：沒有帳號系統、沒有房間密碼以外的存取控制（知道房間代碼即可加入）、沒有在真正的公開網絡量度延遲。

### 環境

- Node.js 24（使用內建的 `node:sqlite`；較舊版本不能運行）。
- 記憶體：沒有量度過；每個房間在記憶體中只有一局的狀態。
- 磁碟（在這部 Mac 上量度）：依賴 98 MB、卡圖 86 MB、建置後的介面及伺服器共約 2.5 MB；資料庫只有文字紀錄。

### 環境變數

| 變數 | 預設 | 部署建議 |
|---|---|---|
| `PORT` | 8787 | 按主機要求 |
| `HOST` | 127.0.0.1（`--lan` 時是 0.0.0.0） | 反向代理在同一部機器：保持 127.0.0.1；在容器內：`0.0.0.0` |
| `DB` | `data.nosync/server.sqlite` | 指向持久化的磁碟，例如 `/var/lib/wso/server.sqlite` |
| `STATIC` | `web-client/dist.nosync` | 不用改 |
| `USER_ART` | `clients` | 想讓所有玩家看到卡圖：`clients`；不想公開提供：`off` |
| `USER_ART_DIR` | `card-assets/local.nosync` | 指向你複製到伺服器的圖片資料夾（要包括 `image-index.json` 及 `sources.json`） |
| `GRACE_MINUTES` | 10 | 按需要 |
| `ALLOWED_ORIGINS` | 空 | 介面與伺服器同一個網域時不用設定 |
| `HEARTBEAT_SECONDS` | 15 | 不用改 |

不要把密碼、金鑰或個人資料寫入版本庫；這個伺服器本身不需要任何金鑰。

### 步驟（以一部 Linux 主機加 Caddy 為例）

以下是設定方法，**沒有實際執行過**：

```bash
# 1. 取得程式並安裝（主機上）
git clone https://github.com/mgyhanson/WeissSchwarzOnline.git wso && cd wso
npm run setup
npm run build && npm run server:build

# 2. 卡圖（由你的 Mac 複製；不經 GitHub）
#    在 Mac 上：rsync -av card-assets/local.nosync/ 使用者@主機:/var/lib/wso/art/

# 3. 啟動
PORT=8787 HOST=127.0.0.1 DB=/var/lib/wso/server.sqlite USER_ART=clients USER_ART_DIR=/var/lib/wso/art \
  node backend/dist.nosync/server.mjs
```

Caddy 設定（自動取得 HTTPS 憑證，並轉發 WebSocket；Caddy 預設保留 `Host` 標頭）：

```
你的網域.example {
    reverse_proxy 127.0.0.1:8787
}
```

如果用 nginx，必須加上：

```
proxy_set_header Host $host;
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 3600s;
```

要長期運行，請用 systemd 或主機提供的程序管理工具，在當機或重啟後自動啟動同一個指令。

另一個不需要主機的方法是通道服務（例如 Cloudflare Tunnel）：Mac 執行 `npm run server`，通道把公開的 https 網址轉到 `localhost:8787`。圖片留在 Mac，不用複製；Mac 要保持開機。通道會以公開網域作為 `Host`，來源檢查可以通過。

### 部署後的檢查

| # | 檢查 | 預期 |
|---|---|---|
| 1 | `curl https://你的網域/health` | `ok` |
| 2 | 瀏覽器打開網址 | 介面出現，網址列顯示 https |
| 3 | `curl -I https://你的網域/user-art/manifest.json` | 200 |
| 4 | `curl -I https://你的網域/user-art/image-index.json` 及 `/user-art/../package.json` | 404 |
| 5 | 兩部不同網絡的裝置（例如手機用流動數據）建立及加入房間，打完一局 | 雙方看到卡圖；結果相反；可下載重播 |
| 6 | 對局中重新整理、切換網絡 | 回到對局 |
| 7 | 重啟伺服器程序 | 房間及進行中的對局恢復 |
| 8 | 瀏覽器開發者工具 → Network → WS | 連線是 `wss://`，狀態 101 |

也可以把網上對戰的自動測試指向已部署的網址作基本檢查（目前 `npm run qa:online` 會自行啟動本機伺服器；指向遠端網址的選項未做）。

### 備份及還原

- **要備份的只有兩樣**：資料庫檔案（`DB`）及卡圖資料夾（`USER_ART_DIR`）。程式由 Git 還原。
- 資料庫：停止伺服器後複製檔案，或在運行中執行 `sqlite3 server.sqlite ".backup 備份檔"`。
- 還原：把檔案放回 `DB` 指向的位置再啟動；伺服器會按紀錄重新計算每一局。
- 卡圖：保留 Mac 上的 `card-assets/local.nosync/` 作為原本；`npm run cards:validate` 可核對 609 張圖片及索引是否完整。
- 專案本身：`npm run backup -- <目的地資料夾>`（不包括圖片及資料庫）。

### 版權及授權提醒

公開部署等於向公眾提供含有官方卡牌文字及卡圖的遊戲。你表示已取得卡圖的使用授權；請確認授權範圍包括在公開伺服器上提供。這一點我無法核實，也沒有部署任何內容。
