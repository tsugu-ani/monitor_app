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
       ↓ POST /api/analyze  (monitor_type を同送)
       ↓
  [機種選択あり] → 選択 Skill を直接適用
  [機種選択なし] → Claude が機種を自動識別（1回目の API 呼び出し）
                        ↓ 識別結果の Skill を適用
Claude Vision API でバイタル情報抽出（2回目 or 1回目の API 呼び出し）
       ↓
抽出結果を Web UI に構造化して表示
自動識別時は「自動検出: 機種名」バッジを表示
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

### 5. UI 仕様

#### 画面構成

画面は **シングルページ**（遷移・切り替えなし）。バイタル項目は常時表示し、モーダルでカメラ操作を行う。

```
┌──────────────────────────────┐
│ ≈ モニター情報読取  最終撮影: │  ← ヘッダー（常時固定）
├──────────────────────────────┤
│        [◉ 撮影開始]           │  ← 撮影ボタン（常時表示）
├──────────────────────────────┤
│ 基本バイタル                  │
│ ┌─────────┬─────────┐        │
│ │ 心拍数   │血圧(収縮)│        │  ← 未撮影: "---"（点線下線・グレー）
│ │  ---    │  ---    │        │     取得済: 数値（黒・実線なし）
│ └─────────┴─────────┘        │     読取不可: "---"（点線・薄グレー）
│ 呼吸器・麻酔器                │
│  ...（同様）                  │
└──────────────────────────────┘
```

#### 撮影モーダル（「撮影開始」タップ時）

```
┌──────────────────────────────┐
│ 撮影               [✕]       │  ← モーダルヘッダー
├──────────────────────────────┤
│                              │
│      カメラプレビュー         │  ← リアルタイム映像（リアカメラ優先）
│  （解析中はスピナーオーバーレイ）│
│                              │
├──────────────────────────────┤
│             ◯                │  ← シャッターボタン（大きな円形）
└──────────────────────────────┘
```

#### 状態遷移

```
[起動] → 全項目「---」点線表示
  ↓「撮影開始」タップ
[モーダル表示] → カメラ起動・プレビュー
  ↓ シャッターボタンタップ
[解析中] → カメラ画面上にスピナーオーバーレイ
  ↓ 解析完了
[モーダル閉じる] → メイン画面の各項目に値が反映
  ↓ 再撮影したい場合
[「撮影開始」タップ] → モーダル再表示（繰り返し）
```

#### バイタル値の表示状態

| 状態 | 表示 | スタイル |
|---|---|---|
| 未撮影 | `---` | 点線下線・グレー（`--ph-value`） |
| 取得済み | 数値 | 黒・通常フォント（`--filled-value`） |
| 読取不可（null） | `---` | 点線下線・薄グレー（`--null-value`） |

#### 実装上の制約
- 画面遷移・ページ切り替えは行わない（SPA）
- カメラは「撮影開始」タップ時に起動し、モーダルを閉じると停止する
- モーダルの背景（backdrop）タップでも閉じる
- バイタルグリッドは 2 カラムレイアウト（モバイル縦画面基準）

## モニター Skill システム

モニター機種ごとの画面特性を記述した **Skill** を Claude へのプロンプトに追加することで、読み取り精度を向上させる仕組み。

### 共通注意事項（_COMMON_CAUTIONS）

すべての Skill に共通して付加される注意事項が `_COMMON_CAUTIONS` 定数に定義されている。
混同しやすい以下の3項目について Claude への明示的な指示を与えている。

| 項目 | 誤読パターン | 正しい挙動 |
|---|---|---|
| 血圧（NIBP vs ART） | 非観血と観血の混同 | ART（観血）が表示されている場合は ART を優先。使用種別を `notes` に記録 |
| ISO ダイヤル vs ISO In/Et | ダイヤル設定値を濃度と誤認 | `iso_dial` は常に `null`（物理ダイヤルのため画面に表示されない） |
| FiO2 vs ガス流量 O2/Air | 吸入酸素濃度と流量の混同 | `fio2` は画面の O₂ 濃度値。`gas_flow_o2/air` は流量計の値（画面外なら `null`） |

### 機種自動識別

「機種指定なし（generic）」または未選択の場合、以下の2ステップで処理する。

```
ステップ1: 識別フェーズ（_IDENTIFY_PROMPT / max_tokens=80）
  └─ Claude が "fukuda_am140" / "drager_vista300" / "generic" のいずれかを返す

ステップ2: 読み取りフェーズ（識別結果の Skill を適用した通常プロンプト）
  └─ 通常の analyze_image と同じ処理
```

機種を手動選択した場合はステップ1をスキップし、選択 Skill を直接適用する（API 呼び出し 1 回）。  
自動識別した場合は合計 2 回の API 呼び出しになる。

#### レスポンスの `auto_detected` フラグ

`AnalyzeResponse` の `auto_detected: bool` が `true` の場合、機種が自動識別されている。  
フロントエンドはこのフラグを使い「自動検出: 機種名」バッジを表示する。

#### 関連実装箇所

| ファイル | 関数・クラス | 役割 |
|---|---|---|
| `claude_service.py` | `_identify_monitor_type()` | 識別用 API 呼び出し |
| `claude_service.py` | `AnalysisResult` (NamedTuple) | `(vital_data, resolved_monitor_type, auto_detected)` を返す |
| `claude_service.py` | `analyze_image()` | 自動識別→Skill 適用→読み取りを統合 |
| `schemas.py` | `AnalyzeResponse.auto_detected` | 自動識別フラグ |
| `app.js` | `renderDetectedMonitor()` | 自動検出バッジの表示制御 |

### ファイル構成

| ファイル | 役割 |
|---|---|
| `backend/services/monitor_skills.py` | Skill 定義・モニター選択肢の管理 |
| `backend/services/claude_service.py` | `monitor_type` に応じたプロンプト構築・自動識別 |
| `backend/api/vision.py` | `GET /api/monitors`・`POST /api/analyze` で `monitor_type` を受け取る |

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
新しい Skill を追加する際はメーカーの仕様書・PI を参照すること。

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
       ↓ anthropic SDK
[Claude Vision API (claude-sonnet-4-6)]
       ↓ JSON レスポンス（構造化バイタルデータ）
[FastAPI] → JSON → [UI: バイタル情報パネル表示]
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
│   ├── config.py                 # 設定・環境変数読み込み
│   ├── pyproject.toml            # uv プロジェクト定義・依存パッケージ
│   ├── uv.lock                   # 依存ロックファイル
│   ├── api/
│   │   ├── __init__.py
│   │   └── vision.py             # GET /api/monitors・POST /api/analyze
│   ├── services/
│   │   ├── __init__.py
│   │   ├── claude_service.py     # Claude API 呼び出し・Skill 適用・自動識別
│   │   ├── monitor_skills.py     # 機種別 Skill 定義（MONITOR_SKILLS / MONITOR_OPTIONS）
│   │   └── image_service.py      # 画像前処理・Base64変換・バリデーション
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py            # Pydantic モデル（VitalData / AnalyzeResponse）
│   └── uploads/                  # アップロード画像の一時保存（起動時クリア推奨）
│
└── frontend/                     # 静的 HTML/CSS/JS（FastAPI から配信）
    ├── index.html
    ├── css/
    │   └── style.css
    └── js/
        ├── app.js                # メインロジック・状態管理・自動検出バッジ
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
| `backend/services/claude_service.py` | Claude API 呼び出し・Skill 適用・自動識別ロジック |
| `backend/services/monitor_skills.py` | 機種別 Skill 定義（`MONITOR_SKILLS`・`MONITOR_OPTIONS`） |
| `backend/services/image_service.py` | 画像前処理・リサイズ・Base64 変換・バリデーション |
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
| `GET` | `/api/monitors` | 利用可能なモニター種別の一覧を返す |
| `POST` | `/api/analyze` | カメラ撮影画像を受け取り Claude Vision で解析し結果を返す |
| `GET` | `/health` | ヘルスチェック |

### POST /api/analyze レスポンス

```json
{
  "success": true,
  "data": { /* VitalData: 17 項目 + notes */ },
  "monitor_type": "fukuda_am140",   // 実際に使用した Skill の ID（null = Skill なし）
  "auto_detected": true             // true: 機種が自動識別された / false: 手動選択
}
```

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
- デフォルトモデルは `claude-sonnet-4-6`（変更は `.env` の `CLAUDE_MODEL` で設定）
- Claude への指示はバイタル項目の **JSON 構造化出力** を要求するプロンプトとする
- レスポンス JSON には全 17 項目を必ず含め、読み取れない項目は `null` とする

#### モデル選択の目安

| モデル | 特徴 | 用途 |
|---|---|---|
| `claude-opus-4-6` | 最高精度・低速・高コスト | 読み取り精度を最優先する場合 |
| `claude-sonnet-4-6` | バランス型（デフォルト） | 通常運用 |
| `claude-haiku-4-5-20251001` | 高速・低コスト | コスト削減・レスポンス速度優先 |

機種自動識別（ステップ1）と読み取り（ステップ2）は両方とも `CLAUDE_MODEL` で指定したモデルを使用する。

### 実装禁止事項
- ファイルアップロード入力（`<input type="file">`）は UI に設けない
- 読み取れない項目を推測・補完して値を返さない（必ず `null` を返す）
