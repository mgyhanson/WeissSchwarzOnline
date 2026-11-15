# 實裝檢查點

> 由 `npm run cards:worklist` 產生；批次紀錄來自 `reports/implementation-batches.json`（用 `npm run cards:worklist -- --batch "標題" "完成內容" "下一步"` 加入）。
>
> **重新開始工作時先讀這一份**，然後直接看「下一步」及 `CARD_WORKLIST.md`，不需要重新分析整個專案。

## 現況

- 可對戰 259／609（人手 128、整句句式 54、句子文法 77）；未支援 350。
- Level 3（五個補充包）：可對戰 6／63；未支援 57。
- 各系列可對戰：GUP 46、BDY 40、STS 27、ANM 28、NIK 35。
- 未認識的片段 504 種；只差 1 個片段的卡 116 張，只差 2 個的 126 張。

## 下一個最值得處理的片段

1. SHAPE: （…）: （CXのレベルはNとして扱う）（解鎖 4，涉及 5）
2. SHAPE: （…）: （D型改）（解鎖 3，涉及 5）
3. SHAPE: （…）: （公開したカードは元に戻す）（解鎖 3，涉及 5）
4. SHAPE: （…）: （そうでないなら元に戻す）（解鎖 3，涉及 3）
5. SHAPE: （…）: （CXのレベルはNとして扱う。公開したカードは元に戻す）（解鎖 2，涉及 7）
6. EFFECT: あなたは自分の山札を見てCXをN枚まで選んで公開し、自分の手札のCXをN枚まで選んで公開し、それらのCXを入れ替え、その山札をシャッフルする（解鎖 2，涉及 4）
7. EFFECT: あなたは自分のレベル置場のカードと控え室のカードをN枚ずつ選び、入れ替えてよい（解鎖 2，涉及 2）
8. TRIGGER: このカードがトリガーした時（解鎖 2，涉及 2）
9. OPTIONAL: あなたは自分の山札の上からN枚までを、公開してよい。N枚以上公開したなら、あなたはそれらのカードの《…》のキャラか「…」をN枚まで選び、手札に加え、残りのカードを控え室に置き、自分の手札をN枚選び、控（解鎖 2，涉及 2）
10. SHAPE: （…）: （CXのレベルはNとして扱う。ストック置場に置かないなら元に（解鎖 2，涉及 2）
11. OPTIONAL: あなたはこのカードを思い出にしてよい。そうしたら、次のあなたのドローフェイズの始めに、あなたは自分の思い出置場の「…」をN枚選び、舞台の好きな枠に置く（解鎖 2，涉及 2）
12. EFFECT: 選擇其一: あなたは自分のクロックの上からN枚を、控え室に置いてよい。（解鎖 1，涉及 5）

## 位置

- 文法：`card-database/src/grammar.ts`（片段切分：`fragments.ts`）；反向核對：`card-database/tests/render-ja.ts`；測試：`card-database/tests/grammar.test.ts`。
- 引擎構件：`game-engine/src/abilities/{types,effects,query}.ts`、`game-engine/src/flow/autos.ts`；構件測試：`game-engine/tests/abilities-batch-*.test.ts`。
- 人手卡：`card-database/sets/<系列>/cards.ts`；測試卡組：`card-database/src/decks.ts`。
- 開發期間只跑相關測試：`npx vitest run card-database/tests/grammar game-engine/tests/abilities-batch`；整批完成後才跑完整 QA。

## 批次紀錄（最新在最後）

| 日期 | 批次 | 完成內容 | 可對戰 | Level 3 可對戰 | 未支援 | 下一步 |
|---|---|---|---:|---:|---:|---|
| 2026-11-15 | L3-1 共通構件 | 手牌中降 Level、區域張數條件、A 或 B 條件、選擇其中一個效果、效果內支付 Cost、選目的地、Clock 頂放 Stock、攻擊結束時、多次 Trigger Check、放置當回合、不被對手選擇、對手 Climax 觸發、Stand 中的這張卡作 Cost、加入手牌的話、思い出選擇 | 259 | 6 | 350 | 見 CARD_WORKLIST.md 首項 |

