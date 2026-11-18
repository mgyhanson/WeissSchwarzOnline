# Batch 10 進度

> 由 `npm run cards:worklist` 產生；每批用 `npm run cards:worklist -- --batch "B10-…" "完成內容" "下一步"` 記錄。

| 日期 | 批次 | 完成內容 | 可對戰 | Level 3 | 未支援 | GUP | BDY | STS | ANM | NIK | 下一步 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 2026-11-17 | B10-1 控え室生效的能力、玩家的第 N 個回合、對手由控え室互換、Counter Event、兩個卡名的絆 | 「控え室にこのカードがあるなら、あなたの第1ターンの始めに」（NIK 017）、「相手は自分の控え室のレベルＸ以下のキャラを1枚選び、入れ替える」（GUP 075、BDY 085）、Counter Event 及分行的二選一（STS 063、BDY 061）、絆／「A」「B」（NIK 016）；付 Cost 的 Event 之後另有獨立句子時不讀取（NIK 109 維持未支援）；引擎情境測試 16 個、真實卡牌測試 26 個、變異測試 14／14；控え室掃描的效能修正 | 534 | 57 | 75 | 104 | 88 | 90 | 84 | 85 | 完整 QA、報告、PR |
| 2026-11-17 | B10-2 測試卡組、規則登記表、報告及 QA | BDY 085／061、STS 063、NIK 016／017 加入測試卡組；規則登記表新增 CR-10.4.2.1；修正控え室掃描的效能問題；完整 QA（check 1417／8／0，第一次因 AI 測試超時失敗 1 個，修正程式後全部通過；soak 4000；validate 609/609；qa:ui 25/25；qa:online 40 項全部通過；build 成功） | 534 | 57 | 75 | 104 | 88 | 90 | 84 | 85 | 下一批：見 RULES_IMPLEMENTATION_REPORT.md 的 Batch 10 章節及 CARD_WORKLIST.md |

四種狀態的現時卡號清單見 `reports/BATCH_12_PROGRESS.md`（由程式按現況計算）；本批完成時的數字記錄在 `reports/RULES_IMPLEMENTATION_REPORT.md` 的相應章節。

