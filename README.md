# NightSave

半夜想叫外送的攔截器。走完假的下單流程，食物不會來，改成告訴你省下多少，並把錢推向你設定的目標。

## 架構重點

前端只跟自己的後端講話，估價的 API 金鑰藏在伺服器端（`app/api/estimate/route.js`），前端拿不到，任何人打開網頁也看不到。要換供應商只改環境變數，不動程式。

- `app/page.jsx` — 介面，進度用 localStorage 存在使用者裝置
- `app/api/estimate/route.js` — 後端代理，唯一碰金鑰的地方
- 沒設供應商時會用本地估價 fallback，所以先部署再接 AI 也沒問題

## 本機跑起來

    npm install
    npm run dev

打開 http://localhost:3000

## 接 MiniMax（或任何 OpenAI 相容供應商）

1. 複製 `.env.example` 成 `.env.local`
2. 填 `LLM_BASE_URL` `LLM_MODEL` `LLM_API_KEY` 三個值
3. 重跑 `npm run dev`

MiniMax 的 base URL 和 model 字串請以它官方文件當下為準，數字和路徑會變。若在意資料流到中國，用 OpenRouter 這類西方託管路徑（`.env.example` 裡有範例）。

## 部署到 Vercel

1. 把這個資料夾推到 GitHub
2. 在 Vercel 匯入這個 repo
3. 在 Vercel 專案的 Settings → Environment Variables 填那三個 `LLM_` 變數
4. Deploy

金鑰只放在 Vercel 的環境變數，不要寫進程式或推上 GitHub。
