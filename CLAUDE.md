# Monitor App

## プロジェクト概要

スマートフォン・タブレット等のデバイスのカメラで生体情報モニター（バイタルモニター・麻酔器等）の画面を撮影し、Claude Vision API で必要な医療情報を抽出して Web UI に表示するアプリケーション。

## アプリケーション仕様・制約

### 1. 入力方式

- **デバイス**: スマートフォン・タブレット等の特定デバイスでの使用を前提とする
- **入力**: デバイス搭載カメラによるリアルタイム撮影のみ（ファイルアップロードは提供しない）
- カメラ映像をプレビュー表示し、ユーザーが任意のタイミングでシャッターを切って解析を実行する

### 2. 動作フロー

```
デバイスカメラ（getUserMedia） → プレビュー表示
       ↓ 撮影ボタン押下
Canvas でフレームキャプチャ → バックエンドへ送信
       ↓ POST /api/analyze
Claude Vision API で情報抽出
       ↓
抽出結果を Web UI に構造化して表示
```

### 3. 読み取り対象項目

以下の項目を抽出対象とする。読み取れなかった項目は `null`（未検出）として扱い、UI 上で明示的に「---」や「読取不可」と表示する。

#### 基本バイタル情報

| 項目 | キー名 | 単位 |
|---|---|---|
| 心拍数 | `heart_rate` | bpm |
| 血圧（収縮期） | `bp_systolic` | mmHg |
| 血圧（平均） | `bp_mean` | mmHg |
| 血圧（拡張期） | `bp_diastolic` | mmHg |
| 呼吸数 | `respiratory_rate` | 回/分 |
| SpO2 | `spo2` | % |
| EtCO2 | `etco2` | mmHg |
| 体温 | `body_temperature` | °C |

#### 呼吸器・麻酔器関連

| 項目 | キー名 | 単位 |
|---|---|---|
| 1回換気量 | `tidal_volume` | mL |
| 分時換気量 | `minute_ventilation` | L/min |
| 最高気道内圧 | `peak_airway_pressure` | cmH2O |
| ISO ダイヤル | `iso_dial` | % |
| ISO In（吸気） | `iso_inspired` | % |
| ISO Et（呼気） | `iso_expired` | % |
| ガス流量 O2 | `gas_flow_o2` | L/min |
| ガス流量 Air | `gas_flow_air` | L/min |
| FiO2 | `fio2` | % |

### 4. 読み取れなかった場合の扱い

- 抽出できなかった項目は `null` で返却し、UI では「**---**」または「**読取不可**」と表示する
- 部分的に読み取れた場合（例: 数値は読めたが単位が不明）も `null` として扱い、備考欄に補足を記載する
- 解析エラー全体の場合はエラーメッセージをユーザーに明示する

## アーキテクチャ

```
[スマホ/タブレット ブラウザ]
  デバイスカメラ（getUserMedia）
       ↓ multipart/form-data (POST /api/analyze)
[FastAPI バックエンド]
  画像バリデーション・前処理 (image_service)
       ↓ anthropic SDK
[Claude Vision API (claude-sonnet-4-6)]
       ↓ JSON レスポンス（構造化バイタルデータ）
[FastAPI] → JSON → [UI: バイタル情報パネル表示]
```

## ディレクトリ構造

```
monitor_app/
├── CLAUDE.md
├── .env                          # 環境変数（git管理外）
├── .env.example                  # 環境変数テンプレート
├── .gitignore
│
├── backend/                      # FastAPI バックエンド
│   ├── main.py                   # アプリエントリポイント・ルーター統合
│   ├── config.py                 # 設定・環境変数読み込み
│   ├── requirements.txt
│   ├── api/
│   │   ├── __init__.py
│   │   └── vision.py             # /api/analyze エンドポイント
│   ├── services/
│   │   ├── __init__.py
│   │   ├── claude_service.py     # Claude API クライアント・プロンプト管理
│   │   └── image_service.py      # 画像前処理・Base64変換・バリデーション
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py            # Pydantic モデル（リクエスト/レスポンス定義）
│   └── uploads/                  # アップロード画像の一時保存
│
└── frontend/                     # 静的 HTML/CSS/JS（FastAPI から配信）
    ├── index.html
    ├── css/
    │   └── style.css
    └── js/
        ├── app.js                # メインロジック・状態管理
        ├── camera.js             # カメラキャプチャ処理（getUserMedia API）
        └── api.js                # バックエンド API 通信
```

## ディレクトリの役割

| ディレクトリ/ファイル | 役割 |
|---|---|
| `backend/` | FastAPI サーバー一式 |
| `backend/api/` | HTTP エンドポイント定義 |
| `backend/services/` | ビジネスロジック（Claude API 呼び出し・画像処理） |
| `backend/models/` | リクエスト/レスポンスの Pydantic データモデル |
| `backend/uploads/` | アップロード画像の一時保存（起動時クリア推奨） |
| `frontend/` | 静的 HTML/CSS/JS。FastAPI から `/` で配信される |

## 開発コマンド

### uv のインストール（未インストールの場合）

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### セットアップ

```bash
cd backend
uv sync                  # .venv 作成 + 依存パッケージ一括インストール
cp ../.env.example ../.env
# .env に ANTHROPIC_API_KEY を設定
```

### 開発サーバー起動

```bash
cd backend
uv run uvicorn main:app --reload --port 8000
# → http://localhost:8000 でフロントエンドも配信
```

### 本番起動

```bash
cd backend
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

### 依存パッケージの管理

```bash
cd backend
uv add <package>         # 追加（pyproject.toml と uv.lock を自動更新）
uv remove <package>      # 削除
uv sync                  # lockfile と環境を同期
```

### スマホ・外部端末からのアクセス（Cloudflare Tunnel）

カメラを使うには HTTPS が必須のため、Cloudflare Tunnel でトンネルを作成する。
アカウント不要・無料で利用可能。

```bash
# サーバーと Cloudflare Tunnel を同時に起動（プロジェクトルートから）
./start.sh

# または手動で起動する場合
# ターミナル1
cd backend && uv run uvicorn main:app --port 8000
# ターミナル2
cloudflared tunnel --url http://localhost:8000 --no-autoupdate
```

- 起動後に表示される `https://xxxx.trycloudflare.com` をスマホで開く
- 起動のたびに URL が変わる（アカウント登録で固定 URL も可能）

### Vercel へのデプロイ（GitHub 経由）

#### 初回セットアップ

1. GitHub にリポジトリを作成してプッシュ
2. https://vercel.com でアカウント作成 → "New Project" → GitHub リポジトリを選択
3. Vercel の Environment Variables に以下を設定:

| 変数名 | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic のAPIキー |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` |
| `VERCEL` | `1` |

4. Deploy ボタンを押すと自動ビルド・公開される

#### デプロイ後の更新

```bash
git add . && git commit -m "update" && git push
# → GitHub push をトリガーに Vercel が自動デプロイ
```

#### Vercel 構成ファイル

| ファイル | 役割 |
|---|---|
| `vercel.json` | ルーティング設定（API / 静的ファイル） |
| `requirements.txt` | Vercel が参照する Python 依存パッケージ |
| `api/index.py` | Vercel サーバーレス関数のエントリポイント |

- API リクエスト (`/api/*`, `/health`) → `api/index.py`（サーバーレス関数）
- 静的ファイル (`/css/*`, `/js/*`) → `frontend/` ディレクトリ
- その他 → `frontend/index.html`

## API エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| `POST` | `/api/analyze` | カメラ撮影画像を受け取り Claude Vision で解析し結果を返す |
| `GET` | `/health` | ヘルスチェック |

## 重要な注意事項

### セキュリティ
- `ANTHROPIC_API_KEY` は必ず `.env` に設定すること（コミット禁止）

### カメラ・デバイス
- カメラ使用は **HTTPS または `localhost`** 環境が必須（ブラウザのセキュリティ制約）
- `getUserMedia` はスマホ・タブレットのリアカメラを優先して使用すること（`facingMode: "environment"`）
- UI はモバイルファースト（縦画面）で設計・実装する

### 画像処理
- アップロード画像は `backend/uploads/` に一時保存される（本番では定期削除を推奨）
- Claude Vision の画像サイズ上限: 5MB / 推奨: 1568px 以下にリサイズして送信

### モデル・API
- モデルは `claude-sonnet-4-6` を使用（変更は `.env` の `CLAUDE_MODEL` で設定）
- Claude への指示はバイタル項目の **JSON 構造化出力** を要求するプロンプトとする
- レスポンス JSON には全 17 項目を必ず含め、読み取れない項目は `null` とする

### 実装禁止事項
- ファイルアップロード入力（`<input type="file">`）は UI に設けない
- 読み取れない項目を推測・補完して値を返さない（必ず `null` を返す）
