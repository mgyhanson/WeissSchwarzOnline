# Batch 7 進度

> 由 `npm run cards:worklist` 產生；每批用 `npm run cards:worklist -- --batch "B7-…" "完成內容" "下一步"` 記錄。

| 日期 | 批次 | 完成內容 | 可對戰 | Level 3 | 未支援 | GUP | BDY | STS | ANM | NIK | 下一步 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 2026-11-16 | B7-1 共用引擎：N回行ったら、二選一 Cost、Choice／Gate 指定卡、公開卡 Level＝Ｘ | 「トリガーチェックを2回行う。2回行ったら…」的獨立完成計數（NIK 047／074）、二選一 Cost（GUP 056）、Choice／Gate 可選指定卡名（NIK 104）、公開卡 Level＝Ｘ 的「Ｘが…なら」及 CX 當作 Level 0（STS 069、ANM 027）、集中按指定卡名計算（BDY 036）；引擎情境測試 25 個（其後 B7-3 加入玩家視圖測試，合共 26 個）、真實卡牌測試 42 個 | 512 | 57 | 97 | 102 | 83 | 83 | 79 | 82 | 其餘未支援卡：見 CARD_WORKLIST.md |
| 2026-11-16 | B7-2 測試卡組、報告及 QA | BDY 036、ANM 027、NIK 074／104／012 加入測試卡組；玩家視圖不再包含等待中的後續效果；規則登記表新增 CR-7.3.1.2.3；完整 QA（check 1181／8／0、soak 4000、validate 609/609、qa:ui 25/25、qa:online 41/41、build 成功） | 512 | 57 | 97 | 102 | 83 | 83 | 79 | 82 | 其餘 97 張：見 CARD_WORKLIST.md 及 BATCH_7_PROGRESS.md 的四種狀態 |

四種狀態的現時卡號清單見 `reports/BATCH_8_PROGRESS.md`（由程式按現況計算）；本批完成時的數字記錄在 `reports/RULES_IMPLEMENTATION_REPORT.md` 的相應章節。

