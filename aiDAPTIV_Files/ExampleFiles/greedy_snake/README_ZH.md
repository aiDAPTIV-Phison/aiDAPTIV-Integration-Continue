# 🐍 貪吃蛇遊戲

一個使用 HTML5 Canvas + JavaScript 前端和 Python Flask 後端的貪吃蛇遊戲。

## 功能特色

- 🎮 經典貪吃蛇遊戲玩法
- 🏆 本地和線上高分記錄
- ⏸️ 暫停/繼續功能
- 📊 遊戲統計資料
- 🌐 即時高分排行榜

## 遊戲操作

- **方向鍵**: 控制貪吃蛇移動方向
- **空白鍵**: 暫停/繼續遊戲

## 安裝與執行

### 1. 安裝 Python 依賴

```bash
pip install -r requirements.txt
```

### 2. 啟動後端服務器

```bash
python app.py
```

服務器將在 `http://localhost:5000` 啟動。

### 3. 開啟遊戲

在瀏覽器中開啟 `index.html` 文件即可開始遊戲。

## API 端點

- `GET /api/scores` - 取得高分排行榜
- `POST /api/scores` - 新增分數記錄
- `GET /api/stats` - 取得遊戲統計資料
- `GET /api/health` - 健康檢查

## 檔案結構

```
greedy-snake/
├── index.html      # 遊戲主頁面
├── config.js         # 遊戲設定
├── app.py          # Flask 後端
├── requirements.txt # Python 依賴
├── high_scores.json # 分數資料 (自動生成)
└── README.md       # 說明文件
```

## 注意事項

- 遊戲資料會儲存在 `high_scores.json` 檔案中
- 如果無法連接到後端，遊戲仍可正常運行，但只會保存本地最高分
- 建議使用現代瀏覽器以獲得最佳體驗
