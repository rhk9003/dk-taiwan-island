# DK 台灣島

把 DK 全台 61 間門市照真實位置蓋在一座 3D 台灣島上。每間店掛著 DK 招牌、周圍是一圈商圈（街道、夜市小攤、路燈、店面），街上有穿 DK 空氣鞋的 DKEC 氣球人在逛街。每間店有自己的玩法（小遊戲、小教室、抽鞋籤、留言板、做鞋工坊）。

點一間店，鏡頭會降到店門口、開門進店：店長氣球人站在櫃台後面說「店長的一句話」，鞋牆上擺著店長推薦，旁邊是這間店的玩法角落。店長氣球人的圖在 `assets/mascot-*.png`（從空氣鞋小教室的角色圖裁出來的）。

純靜態網頁，不用安裝、不用編譯，可以直接放 GitHub Pages。3D 用 [three.js](https://threejs.org/)（從 jsDelivr 載入）。

## 檔案在哪

```
index.html        網頁本體
css/style.css     介面樣式
js/               程式（平常不用動）
  main.js         讀資料、檢查資料、串起畫面
  world.js        3D 場景、鏡頭、點擊
  islands.js      台灣島的形狀、山、門市排位置、商圈範圍
  buildings.js    各種門市建築與 DK 招牌、熱氣球廣場
  town.js         商圈裡的店面、夜市小攤、路燈
  landmarks.js    台灣景點、機場、離島地標的造型和 DK 航空的飛機
  people.js       門口的店長氣球人、街上逛街的氣球人和他們的鞋
  ui.js           右側清單、分區卡、進店畫面、遊戲視窗、開場導覽
assets/           店長氣球人的圖
data/             ← 平常只改這裡
  site.json       網站標題、開場導覽文字
  regions.json    八個分區（含離島）
  landmarks.json  台灣景點與機場
  stores.json     61 間門市
  modules.json    玩法（每種玩法的名稱、建築造型、遊戲網址）
  products.json   店長推薦可以選的商品
```

每個 json 檔最上面的 `_說明` 寫了各欄位的意思。

## 常見修改

| 想做的事 | 改哪裡 |
|---|---|
| 換某間店的玩法 | `stores.json` 那間店的 `module`，填 `shop`、`balloon`、`quiz`、`fortune`、`board`、`workshop` 其中一個。島上的建築會跟著換 |
| 店長的一句話、店長推薦 | 請店長用「店長的話蒐集」表單填（見下一節），島會自動讀。要手動修字，直接改那份 Google 試算表 |
| 加碼推薦商品 | 先在 `products.json` 加商品，再把商品 id 填進 `stores.json` 的 `products`，會排在店長推薦後面 |
| 加一個新玩法 | `modules.json` 加一項：`name`、`building`（用哪種建築造型）、`color`、`desc`、`url`（遊戲網址）、`cta`（按鈕文字）。`url` 留 `null` 會顯示「即將開放」 |
| 新增門市 | `stores.json` 複製一間店改內容。`id` 不能重複；`region` 填分區代號；`latlng` 填經緯度 |
| 調整門市在島上的位置 | 改 `latlng`。在 Google 地圖對門市按右鍵，點第一行的數字就會複製經緯度。位置跟別間店撞到時，會自動挪到旁邊最近的空地 |
| 加一個景點或機場 | `landmarks.json` 加一項：`name`、`latlng`、`model`（造型）、`desc`。點景點會顯示簡介和離它最近的三間 DK |
| 加一間公廟 | `landmarks.json` 加一項，`type` 填 `temple`、`model` 填 `shrine`、`deity` 填主祀神明。公廟的 `id` 之後遶境路線會用到，不要隨意改 |
| 打開／關掉留言板 | `site.json` 的 `messageBoard`（true／false） |
| 審核留言 | 到「店長的話蒐集」試算表的「門市留言」分頁，勾「上牆」才會貼到那間店的留言牆 |
| 改分區名稱、介紹、名牌位置 | `regions.json` |
| 改標題、開場導覽 | `site.json` |

**改完看右下角**：資料有寫錯（例如玩法代號打錯、商品 id 找不到），畫面右下角會出現「資料提醒 N 則」，按 F12 打開 Console 可以看是哪一間店的哪個欄位。json 格式錯誤（少逗號、少引號）時整個畫面會顯示錯在哪一個檔案。

## 店長的話從試算表自動更新

店長在 https://rhk9003.github.io/dk-store-manager-picks/ 填的「一句話＋推薦商品＋推薦理由」會存進 Google 試算表。島每次打開時會去讀那份試算表（讀取網址設在 `site.json` 的 `managerPicksUrl`）：

- 店長送出後，下一個打開島的人就看得到；在試算表手動改字或勾「不採用」也一樣。
- 有填的店，以試算表為準；推薦理由會顯示在商品下面。商品網址有商品編號的話，會自動抓官網的商品圖，門口氣球人也會換上那雙鞋的顏色（依商品名稱裡的顏色字判斷，或 `products.json` 裡同一個商品的顏色）。
- 試算表暫時讀不到時，島照常運作，店長的話先顯示「蒐集中」。
- 有設定 `managerPicksUrl` 時，`stores.json` 裡 `"sample": true` 的範例內容不會顯示；把 `managerPicksUrl` 清空，就回到只用 `stores.json`。

## 直接連到某間店或某一區

網址後面加 `#store/門市id` 或 `#region/分區id`，例如：

- `…/dk-taiwan-island/#store/頂好`
- `…/dk-taiwan-island/#region/kaoping`

可以放在 LINE、門市 QR code 或官網文章裡。

## 在自己電腦上看

直接雙擊 `index.html` 會讀不到資料（瀏覽器的安全限制），要開一個本機伺服器：

```bash
python -m http.server 8781 --directory dk-taiwan-island
```

然後打開 http://localhost:8781 。

## 放上 GitHub Pages、嵌進官網

1. 在 GitHub 建一個 repo（例如 `dk-taiwan-island`），把這個資料夾的內容推上去。
2. repo 的 Settings → Pages → Branch 選 `main`、資料夾選 `/ (root)`。
3. 一兩分鐘後網址會是 `https://rhk9003.github.io/dk-taiwan-island/`。
4. 跟其他小遊戲一樣，在官網文章用 iframe 嵌入：

```html
<iframe src="https://rhk9003.github.io/dk-taiwan-island/" style="width:100%;height:80vh;border:0;border-radius:16px" allow="fullscreen" loading="lazy"></iframe>
```

之後只要改 `data/` 裡的檔案再推上去，網站就會更新，不用重新嵌入。

## 還沒做的

- 集點蓋章與兌獎（花東的熱氣球廣場已經預留位置）
- 留言板、手工做鞋工坊（建築已在島上，按鈕顯示「即將開放」）
