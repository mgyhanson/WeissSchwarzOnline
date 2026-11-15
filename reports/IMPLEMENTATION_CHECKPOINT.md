# 實裝檢查點

> 由 `npm run cards:worklist` 產生；批次紀錄來自 `reports/implementation-batches.json`（用 `npm run cards:worklist -- --batch "標題" "完成內容" "下一步"` 加入）。
>
> **重新開始工作時先讀這一份**，然後直接看「下一步」及 `CARD_WORKLIST.md`，不需要重新分析整個專案。

## 現況

- 可對戰 264／609（人手 128、整句句式 54、句子文法 82）；未支援 345。
- Level 3（五個補充包）：可對戰 7／63；未支援 56。
- 各系列可對戰：GUP 48、BDY 41、STS 27、ANM 29、NIK 36。
- 未認識的片段 514 種；只差 1 個片段的卡 109 張，只差 2 個的 129 張。

## 下一個最值得處理的片段

1. SHAPE: （…）: （D型改）（解鎖 3，涉及 5）
2. EFFECT: あなたは自分の山札を見てCXをN枚まで選んで公開し、自分の手札のCXをN枚まで選んで公開し、それらのCXを入れ替え、その山札をシャッフルする（解鎖 2，涉及 4）
3. EFFECT: あなたは自分のレベル置場のカードと控え室のカードをN枚ずつ選び、入れ替えてよい（解鎖 2，涉及 2）
4. TRIGGER: このカードがトリガーした時（解鎖 2，涉及 2）
5. OPTIONAL: あなたは自分の山札の上からN枚までを、公開してよい。N枚以上公開したなら、あなたはそれらのカードの《…》のキャラか「…」をN枚まで選び、手札に加え、残りのカードを控え室に置き、自分の手札をN枚選び、控（解鎖 2，涉及 2）
6. SHAPE: （…）: （CXのレベルはNとして扱う。ストック置場に置かないなら元に（解鎖 2，涉及 2）
7. OPTIONAL: あなたはこのカードを思い出にしてよい。そうしたら、次のあなたのドローフェイズの始めに、あなたは自分の思い出置場の「…」をN枚選び、舞台の好きな枠に置く（解鎖 2，涉及 2）
8. EFFECT: あなたは相手のキャラをN枚選び、次の相手のターンの終わりまで、次の能力を与える。『【永】 このカードは他の枠に動かせない。』（解鎖 1，涉及 4）
9. CONDITION: このカードの下にマーカーがある（解鎖 1，涉及 4）
10. EFFECT: あなたは自分の山札を上からN枚まで見て、カードをN枚まで選び、山札の上に好きな順番で置き、残りのカードを控え室に置く（解鎖 1，涉及 3）
11. OPTIONAL: あなたはそのキャラをストック置場に置いてよい。そうしたら、あなたは相手のストックの下からN枚を、控え室に置く（解鎖 1，涉及 2）
12. EFFECT: あなたは自分のキャラをN枚選び、そのターン中、次の能力を与える。『【永】 このカードのバトル中、相手はイベントと『助太刀』を手札からプレイできない。』（解鎖 1，涉及 2）

## 位置

- 文法：`card-database/src/grammar.ts`（片段切分：`fragments.ts`）；反向核對：`card-database/tests/render-ja.ts`；測試：`card-database/tests/grammar.test.ts`。
- 引擎構件：`game-engine/src/abilities/{types,effects,query}.ts`、`game-engine/src/flow/autos.ts`；構件測試：`game-engine/tests/abilities-batch-*.test.ts`。
- 人手卡：`card-database/sets/<系列>/cards.ts`；測試卡組：`card-database/src/decks.ts`。
- 開發期間只跑相關測試：`npx vitest run card-database/tests/grammar game-engine/tests/abilities-batch`；整批完成後才跑完整 QA。

## 批次紀錄（最新在最後）

| 日期 | 批次 | 完成內容 | 可對戰 | Level 3 可對戰 | 未支援 | 下一步 |
|---|---|---|---:|---:|---:|---|
| 2026-11-15 | L3-1 共通構件 | 手牌中降 Level、區域張數條件、A 或 B 條件、選擇其中一個效果、效果內支付 Cost、選目的地、Clock 頂放 Stock、攻擊結束時、多次 Trigger Check、放置當回合、不被對手選擇、對手 Climax 觸發、Stand 中的這張卡作 Cost、加入手牌的話、思い出選擇 | 259 | 6 | 350 | 見 CARD_WORKLIST.md 首項 |
| 2026-11-15 | L3-2 Ｘ及公開山札頂、勘誤核對 | Ｘ＝放到控え室的卡的 Level 合計／公開卡的 Level；公開後放 Stock；選擇效果內可拒絕的選項；括號提示逐項判斷；四張勘誤卡核對（3 張只是異圖版本卡圖，STS-030 已是修正後文字） | 264 | 7 | 345 | 見 CARD_WORKLIST.md 首項 |

