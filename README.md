# Monitor App

スマートフォン・タブレットのカメラで生体情報モニター（バイタルモニター・麻酔器等）の画面を撮影し、AI（Claude Vision API）が数値を自動抽出して画面に表示する Web アプリケーション。

---

## 機能

- **カメラ撮影**: デバイスのリアカメラでモニター画面を撮影
- **AI 自動抽出**: Claude Vision API が画面から 17 項目のバイタル値を読み取る
- **機種自動識別**: モニター種別を選択しなくても、AI が画像から機種を自動判定して最適な読み取りルールを適用する
- **機種別 Skill**: モニター機種を手動選択すると、その機種専用の読み取りルールが適用され精度が向上する
- **リアルタイム表示**: 撮影のたびに値が更新される（画面遷移なし）
- **読取不可の明示**: 認識できなかった項目は「---」と表示（推測値は表示しない）
- **モバイル最適化**: スマートフォン・タブレットの縦画面に対応

## 読み取り対象項目（全 17 項目）

### 基本バイタル情報

| 項目 | 単位 |
|---|---|
| 心拍数 | bpm |
| 血圧（収縮期 / 平均 / 拡張期） | mmHg |
| 呼吸数 | 回/分 |
| SpO2 | % |
| EtCO2 | mmHg |
| 体温 | °C |

### 呼吸器・麻酔器関連

| 項目 | 単位 |
|---|---|
| 1 回換気量 | mL |
| 分時換気量 | L/min |
| 最高気道内圧 | cmH2O |
| ISO ダイヤル / In / Et | % |
| ガス流量 O2 / Air | L/min |
| FiO2 | % |

---

## 画面の使い方

### 起動直後
全項目が「---」（点線）で表示されています。

```
┌──────────────────────────┐
│ モニター情報読取          │
├──────────────────────────┤
│ モニター種別 [機種指定なし▼] │  ← 省略可（自動判定）
│     [◉ 撮影開始]          │
├──────────────────────────┤
│ 基本バイタル              │
│  心拍数  ---  bpm         │
│  血圧    ---  mmHg        │
│  ...                     │
└──────────────────────────┘
```

### 撮影操作

1. **モニター種別** を選択する（省略可）
   - 機種を選択すると、その機種専用の読み取りルールが適用され精度が上がる
   - 「機種指定なし」のままでも、AI が画像から機種を自動判定する
2. **「撮影開始」** ボタンをタップ → カメラが起動しポップアップで表示される
3. モニター画面にカメラを向ける
4. **シャッターボタン（◯）** をタップ → 解析が始まる
5. 完了するとポップアップが閉じ、各項目に値が表示される

機種が自動判定された場合は「**自動検出: 機種名**」というバッジが表示されます。  
読み取れなかった項目は引き続き「---」のまま表示されます。

### 対応モニター機種

| 機種 | 選択 ID | 自動識別 |
|---|---|---|
| フクダエム・イー工業 Bio-Scope AM140（動物用） | `fukuda_am140` | ✓ |
| Dräger Vista 300 + Atlan A100（2画面構成） | `drager_vista300` | ✓ |
| その他・機種不明 | `generic`（汎用） | — |

---

## 必要なもの

- [Anthropic API キー](https://console.anthropic.com/)
- Python 3.10 以上
- [uv](https://docs.astral.sh/uv/) （Python パッケージマネージャー）

---

## セットアップ（ローカル開発）

```bash
# 1. リポジトリをクローン
git clone <リポジトリURL>
cd monitor_app

# 2. 依存パッケージをインストール
cd backend
uv sync

# 3. 環境変数を設定
cp ../.env.example ../.env
# .env を開き ANTHROPIC_API_KEY を入力

# 4. サーバーを起動
uv run uvicorn main:app --reload --port 8000
```

ブラウザで `http://localhost:8000` を開く。

> **注意**: カメラ機能は `localhost` または HTTPS 環境でのみ動作します。

---

## スマホ・タブレットからのアクセス

カメラ使用には HTTPS が必須のため、以下のいずれかの方法で公開 URL を発行してください。

### Cloudflare Tunnel（推奨・アカウント不要）

```bash
# プロジェクトルートから
./start.sh
```

起動後に表示される `https://xxxx.trycloudflare.com` をスマホで開く。

### 手動起動

```bash
# ターミナル 1
cd backend && uv run uvicorn main:app --port 8000

# ターミナル 2
cloudflared tunnel --url http://localhost:8000 --no-autoupdate
```

---

## Vercel へのデプロイ（GitHub 経由）

### 初回設定

1. GitHub にリポジトリをプッシュ
2. [Vercel](https://vercel.com) でアカウント作成 → "New Project" → リポジトリを選択
3. Framework Preset は **"Other"** を選択（Root Directory は変更しない）
4. Environment Variables に以下を設定:

| 変数名 | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic の API キー |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` |
| `VERCEL` | `1` |

5. **Deploy** を実行 → `https://xxx.vercel.app` が公開 URL になる

### 更新デプロイ

```bash
git add . && git commit -m "update" && git push
# GitHub push をトリガーに Vercel が自動デプロイ
```

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | HTML / CSS / Vanilla JavaScript |
| バックエンド | Python / FastAPI |
| AI | Anthropic Claude Vision API（デフォルト: `claude-sonnet-4-6`） |
| 画像処理 | Pillow |
| パッケージ管理 | uv |
| デプロイ | Vercel（サーバーレス）|

### 使用 AI モデルの変更

`.env` の `CLAUDE_MODEL` を変更することでモデルを切り替えられます。

```
CLAUDE_MODEL=claude-opus-4-6          # 最高精度（低速・高コスト）
CLAUDE_MODEL=claude-sonnet-4-6        # バランス型（デフォルト）
CLAUDE_MODEL=claude-haiku-4-5-20251001  # 高速・低コスト
```

## ディレクトリ構成

```
monitor_app/
├── api/                  # Vercel サーバーレス関数エントリポイント
│   └── index.py
├── image/                # Skill 作成の参考資料（PI 仕様書 PDF）
│   ├── Vista-300-pi-102414-ja-JP.pdf
│   └── Atlan-A100-A100-XL-pi-102413-ja-JP.pdf
├── backend/              # FastAPI バックエンド
│   ├── main.py
│   ├── config.py
│   ├── pyproject.toml
│   ├── api/
│   │   └── vision.py     # GET /api/monitors・POST /api/analyze
│   ├── services/
│   │   ├── claude_service.py   # Claude API 呼び出し・自動識別
│   │   ├── monitor_skills.py   # 機種別 Skill 定義
│   │   └── image_service.py
│   └── models/
│       └── schemas.py
├── frontend/             # 静的 HTML/CSS/JS
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js
│       ├── camera.js
│       └── api.js
├── vercel.json
├── requirements.txt
├── start.sh              # Cloudflare Tunnel 同時起動スクリプト
└── .env.example
```

---

## 注意事項

- `ANTHROPIC_API_KEY` は `.env` に記載し、Git にコミットしないこと
- 本アプリは **補助ツール** です。表示された値を医療判断の唯一の根拠にしないでください
- 画像認識の精度はモニターの種類・撮影角度・照明条件によって異なります
- 機種自動識別を使用した場合は 2 回の API 呼び出しが発生します（識別 + 読み取り）
- 機種が正しく認識されない場合はモニター種別セレクタで手動選択してください
