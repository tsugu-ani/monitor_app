# Monitor App

## プロジェクト概要

スマートフォン・タブレット等のデバイスのカメラで生体情報モニター（バイタルモニター・麻酔器等）の画面を撮影し、Claude Vision API で必要な医療情報を抽出して Web UI に表示・記録するアプリケーション。

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
       ↓ POST /api/analyze  (monitor_type を同送)
       ↓
  [機種選択あり] → 選択 Skill を直接適用（API 1回）
  [機種選択なし] → Haiku + 768px 縮小画像で機種を自動識別（API 1回目）
                        ↓ 識別結果の Skill を適用
Claude Vision API でバイタル情報抽出（API 最終回）
       ↓
抽出結果を Web UI に表示 ＋ Supabase DB に自動保存
自動識別時は「自動検出: 機種名」バッジを表示
```

### 3. 読み取り対象項目

以下の項目を抽出対象とする。読み取れなかった項目は `null`（未検出）として扱い、UI 上で明示的に「---」と表示する。

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

- 抽出できなかった項目は `null` で返却し、UI では「**---**」と表示する
- 部分的に読み取れた場合（例: 数値は読めたが単位が不明）も `null` として扱い、備考欄に補足を記載する
- 解析エラー全体の場合はエラーメッセージをユーザーに明示する

### 5. UI 仕様

#### 画面構成

画面は **シングルページ（SPA）**。ヘッダーにタブバーを組み込み、「撮影」「撮影記録」の2タブで切り替える。

```
┌──────────────────────────────┐
│ ≈ モニター情報読取  12:34    │  ← ヘッダー（sticky）
├──────────────┬───────────────┤
│     撮影     │   撮影記録    │  ← タブバー（sticky、ヘッダー内）
├──────────────────────────────┤
│ [撮影タブ]                    │
│ モニター種別 [機種指定なし▼]  │
│     [◉ 撮影開始]              │
│ 基本バイタル                  │
│ ┌─────────┬─────────┐        │
│ │ 心拍数   │血圧(収縮)│        │
│ │  ---    │  ---    │        │
│ └─────────┴─────────┘        │
│ 呼吸器・麻酔器                │
│  ...（同様）                  │
└──────────────────────────────┘

┌──────────────────────────────┐
│ [撮影記録タブ]                │
│ ‹  2026/04/20  ›             │  ← 日付ピッカー（前日・翌日ボタン付き）
│ ┌────────────────────────┐   │
│ │ 14:32 [Bio-Scope AM140]│   │  ← 記録カード
│ │ 基本バイタル            │   │
│ │ 心拍数 75  血圧 120 ...│   │  ← 全17項目を2カラムグリッド
│ └────────────────────────┘   │
└──────────────────────────────┘
```

#### 撮影モーダル（「撮影開始」タップ時）

```
┌──────────────────────────────┐
│ 撮影               [✕]       │
├──────────────────────────────┤
│      カメラプレビュー         │  ← リアルタイム映像（リアカメラ優先）
│  （解析中はスピナーオーバーレイ）│
├──────────────────────────────┤
│             ◯                │  ← シャッターボタン
└──────────────────────────────┘
```

#### 状態遷移

```
[起動] → 全項目「---」点線表示 / 撮影記録タブは今日の記録を読み込み
  ↓「撮影開始」タップ
[モーダル表示] → カメラ起動・プレビュー
  ↓ シャッターボタンタップ
[解析中] → カメラ画面上にスピナーオーバーレイ
  ↓ 解析完了
[モーダル閉じる] → バイタル値が反映 ＋ DB 保存 ＋ 撮影記録タブに追加
```

#### バイタル値の表示状態

| 状態 | 表示 | スタイル |
|---|---|---|
| 未撮影 | `---` | 点線下線・グレー（`--ph-value`） |
| 取得済み | 数値 | 黒・通常フォント（`--filled-value`） |
| 読取不可（null） | `---` | 点線下線・薄グレー（`--null-value`） |

#### 実装上の制約
- 画面遷移・ページ切り替えは行わない（SPA）
- タブはヘッダー内に組み込み、常時 sticky で表示する
- カメラは「撮影開始」タップ時に起動し、モーダルを閉じると停止する
- モーダルの背景（backdrop）タップでも閉じる
- バイタルグリッドは 2 カラムレイアウト（モバイル縦画面基準）

## 識別ステップの高速化

機種自動識別（ステップ1）は速度を優先し、以下の設定を使用する。

| 設定 | 値 | 理由 |
|---|---|---|
| モデル | `claude-haiku-4-5-20251001`（固定） | 3択判定に Sonnet は不要 |
| 画像サイズ | 768px（縮小） | 機種判別に高解像度は不要 |
| max_tokens | 80 | JSON 1行のみ返す |

抽出ステップ（ステップ2）は `.env` の `CLAUDE_MODEL`（デフォルト: `claude-sonnet-4-6`）を使用する。

定数は `claude_service.py` の `_IDENTIFY_MODEL` / `_IDENTIFY_IMAGE_SIZE` で管理する。
縮小処理は `image_service.py` の `downscale()` 関数で行う。

## 撮影記録機能（Supabase DB）

### 概要

撮影・解析のたびに全17項目 + メタデータを Supabase（PostgreSQL）に自動保存し、撮影記録タブで日付別に閲覧できる。

### DB テーブル構造

```sql
CREATE TABLE vital_records (
    id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    recorded_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    monitor_type         TEXT,
    -- 基本バイタル（17項目）
    heart_rate           NUMERIC,
    ...（全17項目）
    notes                TEXT
);
CREATE INDEX idx_vital_records_recorded_at ON vital_records (recorded_at DESC);
```

### 接続方式

- **Supabase Transaction pooler**（ポート 6543）を使用する
- Vercel サーバーレス環境での接続過多を防ぐため、Direct connection（5432）は使用しない
- `DATABASE_URL` が未設定の場合は DB 操作をスキップし、解析フローは継続する

### タイムゾーン

- 日付フィルタは **JST（Asia/Tokyo）基準** で処理する
- SQL: `DATE(recorded_at AT TIME ZONE 'Asia/Tokyo') = %s`

### 関連実装

| ファイル | 関数 | 役割 |
|---|---|---|
| `db_service.py` | `save_record()` | 解析後に自動保存 |
| `db_service.py` | `get_records(date, limit)` | 日付フィルタ付き取得 |
| `vision.py` | `GET /api/records` | 記録一覧 API |
| `schemas.py` | `VitalRecord` | 記録レスポンスモデル |
| `app.js` | `loadHistory()` / `prependRecord()` | 記録の読み込み・追加 |

## モニター Skill システム

モニター機種ごとの画面特性を記述した **Skill** を Claude へのプロンプトに追加することで、読み取り精度を向上させる仕組み。

### 共通注意事項（_COMMON_CAUTIONS）

すべての Skill に共通して付加される注意事項が `_COMMON_CAUTIONS` 定数に定義されている。

| 項目 | 誤読パターン | 正しい挙動 |
|---|---|---|
| 血圧（NIBP vs ART） | 非観血と観血の混同 | ART（観血）が表示されている場合は ART を優先。使用種別を `notes` に記録 |
| ISO ダイヤル vs ISO In/Et | ダイヤル設定値を濃度と誤認 | `iso_dial` は常に `null`（物理ダイヤルのため画面に表示されない） |
| FiO2 vs ガス流量 O2/Air | 吸入酸素濃度と流量の混同 | `fio2` は画面の O₂ 濃度値。`gas_flow_o2/air` は流量計の値（画面外なら `null`） |

### 機種自動識別

「機種指定なし（generic）」または未選択の場合、以下の2ステップで処理する。

```
ステップ1: 識別フェーズ（Haiku + 768px / max_tokens=80）
  └─ Claude が "fukuda_am140" / "drager_vista300" / "generic" のいずれかを返す

ステップ2: 読み取りフェーズ（識別結果の Skill を適用 / CLAUDE_MODEL 使用）
  └─ 通常の analyze_image と同じ処理
```

機種を手動選択した場合はステップ1をスキップし、選択 Skill を直接適用する（API 呼び出し 1 回）。

#### レスポンスの `auto_detected` フラグ

`AnalyzeResponse` の `auto_detected: bool` が `true` の場合、機種が自動識別されている。
フロントエンドはこのフラグを使い「自動検出: 機種名」バッジを表示する。

#### 関連実装箇所

| ファイル | 関数・クラス | 役割 |
|---|---|---|
| `claude_service.py` | `_IDENTIFY_MODEL` / `_IDENTIFY_IMAGE_SIZE` | 識別ステップ専用設定 |
| `claude_service.py` | `_identify_monitor_type()` | 識別用 API 呼び出し（Haiku）|
| `claude_service.py` | `AnalysisResult` (NamedTuple) | `(vital_data, resolved_monitor_type, auto_detected)` を返す |
| `claude_service.py` | `analyze_image()` | 自動識別→Skill 適用→読み取りを統合 |
| `image_service.py` | `downscale()` | 識別用に画像を縮小 |
| `schemas.py` | `AnalyzeResponse.auto_detected` | 自動識別フラグ |
| `app.js` | `renderDetectedMonitor()` | 自動検出バッジの表示制御 |

### ファイル構成

| ファイル | 役割 |
|---|---|
| `backend/services/monitor_skills.py` | Skill 定義・モニター選択肢の管理 |
| `backend/services/claude_service.py` | `monitor_type` に応じたプロンプト構築・自動識別 |
| `backend/api/vision.py` | `GET /api/monitors`・`POST /api/analyze`・`GET /api/records` |

### 登録済み Skill

| ID | 機種名 | 状態 |
|---|---|---|
| `generic` | 機種指定なし（汎用） | ✓ 有効 |
| `fukuda_am140` | フクダエム・イー工業 Bio-Scope AM140（動物用） | ✓ 登録済み |
| `drager_vista300` | Dräger Vista 300 + Atlan A100（2画面構成） | ✓ 登録済み |

### 両モニターの項目対応表

| レポート項目 | Bio-Scope AM140 | Vista 300（左画面） | Atlan A100（右画面） | 備考 |
|---|---|---|---|---|
| 心拍数 | `HR`（緑・大） | `HR`（緑） | — | `PR`（脈拍数）は使用しない |
| 収縮期血圧 | `BP の SYS` または P1/P2 収縮期 | `ART` または `NIBP` の上段 | — | 観血圧（ART/IBP）優先 |
| 平均血圧 | `BP の MAP` または P1/P2 平均 | 括弧 `(...)` 内の値 ※`125/101 (109)` 形式 | — | 括弧内が MAP |
| 拡張期血圧 | `BP の DIA` または P1/P2 拡張期 | `ART` または `NIBP` の下段 | — | |
| SpO2 | `SpO₂`（黄・大） | `SpO₂` | — | |
| EtCO2 | `CO₂` の **ET** 値 | 外部 CO₂モジュール接続時のみ | `CO₂ Et`（内蔵モジュール時） | AM140 は In/ET 分離のため ET のみ使用 |
| 1回換気量 | `VT` [mL] | — | `VT` [mL]（L表示時は×1000） | |
| 分時換気量 | `MV` [L/min] | — | `MV` [L/min] | |
| 最高気道内圧 | 表示なし→ null | — | `PIP`（=Ppeak）[cmH2O] | Atlan A100 は PIP と表示 |
| 呼吸数 | `RR` | — | `RR`/`f`/`Freq` | |
| ISO ダイヤル | null（物理ダイヤル） | — | null（物理ダイヤル） | 画面表示なし |
| ISO In | `ISO In` [%] | — | `Iso` 吸気側（Insp/In）[%] | Iso 以外の薬剤使用時は null |
| ISO Et | `ISO Ex` [%]（Ex=呼気） | — | `Iso` 呼気側（Exp/Et/Ex）[%] | AM140 は "Ex" 表記 |
| ガス流量 O2/Air | null（画面外） | — | 前面フローチューブ（物理）で表示 | 写真で読み取れる場合のみ記録 |
| FiO2 | `O₂` | — | `O₂ Fi` または `FiO₂` 吸気側 | |
| 体温 | `TEMP` または `T1` [°C] | `TEMP`/`T1`（橙） | — | 下部の参照範囲ラベルは無視 |

### Skill 作成の参考資料

`image/` ディレクトリに各機種の製品情報（PI）PDF を保管している。

| ファイル | 機種 | 種別 |
|---|---|---|
| `image/Vista-300-pi-102414-ja-JP.pdf` | Dräger Vista 300 | 製品情報（PI） |
| `image/Atlan-A100-A100-XL-pi-102413-ja-JP.pdf` | Dräger Atlan A100/A100 XL | 製品情報（PI） |

> カタログ（brochure）は容量が大きいため `.gitignore` で除外している。PI のみリポジトリに含まれる。

### 新しい Skill の追加手順

1. メーカーの PI・仕様書で画面レイアウトとパラメータ表示を確認する
2. `monitor_skills.py` の `MONITOR_SKILLS` に新エントリを追加
3. `MONITOR_OPTIONS` にも UI 表示用エントリを追加
4. `prompt_hint` に以下の情報を日本語で記述:
   - 機種名・画面サイズ・レイアウト
   - 各パラメータの表示位置・ラベル・色・単位
   - 表示形式の特徴（分数形式・小数点・略語など）
   - 読み取り時の注意点（機種固有の混同しやすい項目）
5. `_IDENTIFY_PROMPT`（`claude_service.py`）に新機種の識別特徴を追記する

## アーキテクチャ

```
[スマホ/タブレット ブラウザ]
  デバイスカメラ（getUserMedia）
       ↓ multipart/form-data (POST /api/analyze)
[FastAPI バックエンド]
  画像バリデーション・前処理 (image_service)
  ├─ 識別用縮小画像生成 (downscale / 768px)
  │      ↓ Haiku API
  │   機種識別 (_identify_monitor_type)
  └─ 抽出用フル画像 (1568px)
         ↓ Sonnet API（CLAUDE_MODEL）
      バイタル情報抽出 (analyze_image)
       ↓ JSON レスポンス（構造化バイタルデータ）
[FastAPI]
  ├─ Supabase DB 保存 (db_service.save_record)
  └─ JSON → [UI: バイタル情報パネル表示 + 撮影記録タブ追加]
```

## ディレクトリ構造

```
monitor_app/
├── CLAUDE.md
├── README.md
├── .env                          # 環境変数（git管理外）
├── .env.example                  # 環境変数テンプレート
├── .gitignore
├── vercel.json                   # Vercel ルーティング設定
├── requirements.txt              # Vercel 用 Python 依存パッケージ
├── start.sh                      # uvicorn + Cloudflare Tunnel 同時起動スクリプト
│
├── api/
│   └── index.py                  # Vercel サーバーレス関数エントリポイント
│
├── image/                        # Skill 作成の参考資料（PI 仕様書）
│   ├── Vista-300-pi-102414-ja-JP.pdf
│   └── Atlan-A100-A100-XL-pi-102413-ja-JP.pdf
│
├── backend/                      # FastAPI バックエンド
│   ├── main.py                   # アプリエントリポイント・ルーター統合
│   ├── config.py                 # 設定・環境変数読み込み（DATABASE_URL 含む）
│   ├── pyproject.toml            # uv プロジェクト定義・依存パッケージ
│   ├── uv.lock                   # 依存ロックファイル
│   ├── api/
│   │   ├── __init__.py
│   │   └── vision.py             # GET /api/monitors・POST /api/analyze・GET /api/records
│   ├── services/
│   │   ├── __init__.py
│   │   ├── claude_service.py     # Claude API 呼び出し・Skill 適用・自動識別（Haiku）
│   │   ├── monitor_skills.py     # 機種別 Skill 定義（MONITOR_SKILLS / MONITOR_OPTIONS）
│   │   ├── image_service.py      # 画像前処理・リサイズ・downscale・Base64 変換
│   │   └── db_service.py         # Supabase DB 保存・取得（save_record / get_records）
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py            # Pydantic モデル（VitalData / VitalRecord / AnalyzeResponse）
│   └── uploads/                  # アップロード画像の一時保存（起動時クリア推奨）
│
└── frontend/                     # 静的 HTML/CSS/JS（FastAPI から配信）
    ├── index.html
    ├── css/
    │   └── style.css
    └── js/
        ├── app.js                # メインロジック・タブ制御・記録表示
        ├── camera.js             # カメラキャプチャ処理（getUserMedia API）
        └── api.js                # バックエンド API 通信
```

## ディレクトリの役割

| ディレクトリ/ファイル | 役割 |
|---|---|
| `image/` | Skill 作成の参考資料（PI 仕様書 PDF）。カタログは除外済み |
| `api/index.py` | Vercel サーバーレス関数エントリポイント |
| `backend/` | FastAPI サーバー一式 |
| `backend/api/` | HTTP エンドポイント定義 |
| `backend/services/claude_service.py` | Claude API 呼び出し・Skill 適用・自動識別ロジック（識別はHaiku固定） |
| `backend/services/monitor_skills.py` | 機種別 Skill 定義（`MONITOR_SKILLS`・`MONITOR_OPTIONS`） |
| `backend/services/image_service.py` | 画像前処理・リサイズ・`downscale()`・Base64 変換・バリデーション |
| `backend/services/db_service.py` | Supabase への保存・取得。`DATABASE_URL` 未設定時はスキップ |
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
# .env に ANTHROPIC_API_KEY と DATABASE_URL を設定
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

```bash
# サーバーと Cloudflare Tunnel を同時に起動（プロジェクトルートから）
./start.sh

# または手動で起動する場合
# ターミナル1
cd backend && uv run uvicorn main:app --port 8000
# ターミナル2
cloudflared tunnel --url http://localhost:8000 --no-autoupdate
```

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
| `DATABASE_URL` | Supabase Transaction pooler URI（ポート 6543） |

4. Deploy ボタンを押すと自動ビルド・公開される

#### デプロイ後の更新

```bash
git add . && git commit -m "update" && git push
# → GitHub push をトリガーに Vercel が自動デプロイ
```

## API エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/monitors` | 利用可能なモニター種別の一覧を返す |
| `POST` | `/api/analyze` | カメラ撮影画像を解析し結果を返す（DB に自動保存） |
| `GET` | `/api/records` | 撮影記録を返す（`date`・`limit` クエリパラメータ対応） |
| `GET` | `/health` | ヘルスチェック |

### POST /api/analyze レスポンス

```json
{
  "success": true,
  "data": { /* VitalData: 17項目 + notes */ },
  "monitor_type": "fukuda_am140",
  "auto_detected": true,
  "record_saved_at": "2026-04-20T14:32:00+09:00"
}
```

### GET /api/records クエリパラメータ

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `date` | `YYYY-MM-DD` | なし（全件） | JST基準の日付フィルタ |
| `limit` | int | 200 | 最大取得件数（上限 500） |

## 重要な注意事項

### セキュリティ
- `ANTHROPIC_API_KEY` / `DATABASE_URL` は必ず `.env` に設定すること（コミット禁止）

### カメラ・デバイス
- カメラ使用は **HTTPS または `localhost`** 環境が必須（ブラウザのセキュリティ制約）
- `getUserMedia` はスマホ・タブレットのリアカメラを優先して使用すること（`facingMode: "environment"`）
- UI はモバイルファースト（縦画面）で設計・実装する

### 画像処理
- アップロード画像は `backend/uploads/` に一時保存される（本番では定期削除を推奨）
- 抽出ステップ: 1568px 以下にリサイズして送信
- 識別ステップ: さらに 768px に縮小（`downscale()` 関数）

### モデル・API
- **識別ステップ**: `claude-haiku-4-5-20251001` 固定（`_IDENTIFY_MODEL`）
- **抽出ステップ**: `.env` の `CLAUDE_MODEL`（デフォルト: `claude-sonnet-4-6`）
- レスポンス JSON には全17項目を必ず含め、読み取れない項目は `null` とする

#### モデル選択の目安（抽出ステップ）

| モデル | 特徴 | 用途 |
|---|---|---|
| `claude-opus-4-6` | 最高精度・低速・高コスト | 読み取り精度を最優先する場合 |
| `claude-sonnet-4-6` | バランス型（デフォルト） | 通常運用 |
| `claude-haiku-4-5-20251001` | 高速・低コスト | コスト削減・レスポンス速度優先 |

### DB
- `DATABASE_URL` が未設定の場合は DB 操作をスキップし、解析は正常に動作する
- Supabase Transaction pooler（ポート 6543）を使用すること。Direct connection（5432）は Vercel サーバーレスでは接続過多になる
- 日付フィルタは JST（Asia/Tokyo）基準

### 実装禁止事項
- ファイルアップロード入力（`<input type="file">`）は UI に設けない
- 読み取れない項目を推測・補完して値を返さない（必ず `null` を返す）
