# Monitor App

スマートフォン・タブレットのカメラで生体情報モニター（バイタルモニター・麻酔器等）の画面を撮影し、AI（Claude Vision API）が数値を自動抽出して画面に表示・記録する Web アプリケーション。

---

## 機能

- **カメラ撮影**: デバイスのリアカメラでモニター画面を撮影
- **AI 自動抽出**: Claude Vision API が画面から 17 項目のバイタル値を読み取る
- **機種自動識別**: モニター種別を選択しなくても、AI が画像から機種を自動判定して最適な読み取りルールを適用する
- **機種別 Skill**: モニター機種を手動選択すると、その機種専用の読み取りルールが適用され精度が向上する
- **患者管理**: 患者（名前・カルテ番号・体重・種別）をあらかじめ登録し、撮影前にヘッダーから選択できる
- **患者別記録**: 選択した患者に自動的に撮影記録が紐付けられ、患者ごとの履歴・グラフを閲覧できる
- **撮影記録の保存**: 撮影のたびに全項目を Supabase（PostgreSQL）に自動保存する
- **日付別閲覧**: 撮影記録タブで日付を指定して過去の記録を確認できる（患者選択中はその患者の記録のみ表示）
- **手動修正**: AI の読み取り誤りを人手で修正して DB に上書き保存できる
- **記録の削除**: 修正モーダルの削除ボタンで記録を DB から削除できる
- **トレンド表示**: 8項目から複数選択して時系列グラフと一覧を確認できる。「数値表示」ボタンで各点の値を ON/OFF 切り替え可能（患者選択中はその患者のデータに絞り込まれる）
- **読取不可の明示**: 認識できなかった項目は「---」と表示（推測値は表示しない）
- **モバイル最適化**: スマートフォン・タブレットの縦画面に対応

## 読み取り対象項目（全 17 項目）

### 基本バイタル情報

| 項目 | 単位 |
|---|---|
| 心拍数 | bpm |
| P1（観血測定平均） / 血圧（平均） / P2（観血測定平均） | mmHg |
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

### 画面構成

ヘッダーに **患者選択行** と **「撮影」「撮影記録」「トレンド」「患者管理」** の 4 タブがあります。

```
┌──────────────────────────────┐
│ ≈ モニター情報読取   12:34   │
│ 👤 田中 太郎 ▼               │  ← 患者選択（タップで切り替え）
├───────┬──────┬───────┬───────┤
│ 撮影  │撮影記録│トレンド│患者管理│
└───────┴──────┴───────┴───────┘
```

---

### 撮影タブ

モニターを撮影してバイタル値を読み取ります。

#### 操作手順

1. **モニター種別** を選択する（省略可）
   - 機種を選択すると、その機種専用の読み取りルールが適用され精度が上がる
   - 「機種指定なし」のままでも、AI が画像から機種を自動判定する
2. **「撮影開始」** ボタンをタップ → カメラが起動しポップアップで表示される
3. モニター画面にカメラを向ける
4. **シャッターボタン（◯）** をタップ → 解析が始まる
5. 完了するとポップアップが閉じ、各項目に値が表示される

機種が自動判定された場合は「**自動検出: 機種名**」というバッジが表示されます。  
撮影結果は自動的に撮影記録に保存されます。

#### 対応モニター機種

| 機種 | 選択 ID | 自動識別 |
|---|---|---|
| フクダエム・イー工業 Bio-Scope AM140（動物用） | `fukuda_am140` | ✓ |
| Dräger Vista 300 + Atlan A100（2画面構成） | `drager_vista300` | ✓ |
| その他・機種不明 | `generic`（汎用） | — |

---

### 撮影記録タブ

過去の撮影記録を日付別に確認できます。

```
┌──────────────────────────────┐
│  ‹  2026/04/20  ›            │  ← 日付ピッカー
├──────────────────────────────┤
│ 14:32  [Bio-Scope AM140]  ✏  │  ← 右端の ✏ で値を修正・削除可能
│ [カルテ番号 12345] [体重 3.2 kg] │  ← 患者情報チップ（入力済み項目のみ表示）
│ 基本バイタル                  │
│ 心拍数             75 bpm    │  ← 縦1列リスト（ラベル左・値右）
│ P1（観血測定平均） 90 mmHg   │
│ SpO2          98 %           │
│  ...（全 17 項目）            │
├──────────────────────────────┤
│ 13:15  [Vista 300 + Atlan] ✏ │
│  ...                         │
└──────────────────────────────┘
```

#### 日付の変え方

| 操作 | 動作 |
|---|---|
| `‹` ボタン | 前日に移動 |
| `›` ボタン | 翌日に移動 |
| 日付をタップ | カレンダーから任意の日付を選択 |

#### 患者選択中の挙動

ヘッダーの患者選択行で患者を選択中の場合、**その患者の記録のみ**が表示されます。「選択解除」すると全患者の記録を表示します。

#### 記録の手動修正・患者情報の入力

各記録カード右上の **✏ ボタン** をタップすると修正モーダルが開きます。

1. 現在の値がフォームに入力された状態で開く
2. 「患者情報」グループ（カルテ番号・名前・体重）を入力できる
3. 誤りのあるバイタル項目を修正する（空欄にすると「---」に戻る）
4. 「保存」をタップ → DB に上書き保存され、カードが即時更新される

#### 記録の削除

修正モーダル下部の **「削除」ボタン** をタップすると、確認ダイアログの後に記録を DB から削除できます。

---

### トレンドタブ

複数の項目を同時に選んで時系列の折れ線グラフと一覧を確認できます。

```
┌──────────────────────────────┐
│ [✓心拍数][✓血圧(平均)][✓呼吸数][✓体温]│  ← デフォルト選択4項目
│ [P1(観血測定平均)][P2(観血測定平均)][SpO2][EtCO2]│  ← 追加選択可能な4項目
│ ‹  2026/05/21  ›             │  ← 日付ピッカー（前日・翌日ボタン付き）
│ 時間  [09:15] 〜 [14:32]     │  ← 同日内の時間範囲
│ [更新]              [数値表示]│  ← 数値表示ボタン
│ ╔══════════════════════╗      │
│ ║ ─心拍数  ─ SpO2     ║      │  ← 凡例（2項目以上選択時）
│ ║   09:15   10:32  14:32║     │
│ ╚══════════════════════╝      │
│              10:32  14:32      │  ← 列=時刻（昇順・1行目）
│ 心拍数(bpm)    75    78        │  ← 行=項目（1列目スティッキー）
│ 体温(°C)      38.1  38.2       │
└──────────────────────────────┘
```

#### 選択できる項目

| 項目 | デフォルト |
|---|---|
| 心拍数 / 血圧（平均）/ 呼吸数 / 体温 | ✓ 選択済み |
| P1（観血測定平均）/ P2（観血測定平均）/ SpO2 / EtCO2 | 非選択 |

#### 使い方

1. タブを開くと **今日・00:00〜23:59** がデフォルト期間として設定される
2. 確認したい項目のチップをタップして選択する（複数同時選択可・変更と同時に自動更新）
3. 日付ピッカー（前日・翌日ボタン）で日を切り替えると自動で再読み込みする
4. 「時間」の開始・終了を変更して「更新」をタップするとその日の中の時間範囲を絞り込める
5. グラフの点にタッチするとその時刻の全選択項目の値がツールチップで表示される
6. **「数値表示」ボタン**をタップすると各データ点の値を常時表示できる（再タップで非表示）

> 患者を選択中の場合、その患者のデータのみがグラフ・一覧に表示されます。

---

### 患者管理タブ

患者情報を登録・管理します。ここで登録した患者をヘッダーから選択することで、撮影記録が自動的に患者に紐付けられます。

#### 操作方法

| 操作 | 手順 |
|---|---|
| 患者を登録 | 「＋ 新規患者登録」ボタン → フォームに入力 → 保存 |
| 患者情報を編集 | 患者カード右端の ✏ ボタン → 修正 → 保存 |
| 患者を削除 | ✏ ボタン → 削除ボタン（確認ダイアログあり） |
| 患者を選択 | 患者カードの「選択」ボタン（ヘッダーにも同様の選択ボタンあり） |

#### 患者情報フィールド

| 項目 | 説明 |
|---|---|
| 名前（必須） | 患者名 |
| カルテ番号 | 整数（ユニーク制約あり） |
| 体重 | kg 単位 |
| 種別 | 犬 / 猫 / その他 |
| 登録日時 | 自動付与（患者カードに表示） |

---

## 必要なもの

- [Anthropic API キー](https://console.anthropic.com/)
- [Supabase](https://supabase.com/) アカウント（撮影記録の保存に使用）
- Python 3.10 以上
- [uv](https://docs.astral.sh/uv/) （Python パッケージマネージャー）

---

## セットアップ（ローカル開発）

### 1. Supabase のテーブルを作成する

Supabase ダッシュボード → **SQL Editor** で以下を実行:

```sql
-- 患者マスタ
CREATE TABLE patients (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    chart_number INTEGER     UNIQUE,
    name         TEXT        NOT NULL,
    species      TEXT,
    body_weight  NUMERIC,
    created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_patients_chart_number ON patients (chart_number);

-- バイタル記録
CREATE TABLE vital_records (
    id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    recorded_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    monitor_type         TEXT,
    patient_id           UUID        REFERENCES patients(id),
    heart_rate           NUMERIC, bp_systolic    NUMERIC, bp_mean          NUMERIC,
    bp_diastolic         NUMERIC, respiratory_rate NUMERIC, spo2            NUMERIC,
    etco2                NUMERIC, body_temperature NUMERIC, tidal_volume    NUMERIC,
    minute_ventilation   NUMERIC, peak_airway_pressure NUMERIC, iso_dial   NUMERIC,
    iso_inspired         NUMERIC, iso_expired     NUMERIC, gas_flow_o2     NUMERIC,
    gas_flow_air         NUMERIC, fio2            NUMERIC,
    chart_number         INTEGER, patient_name    TEXT,    body_weight     NUMERIC,
    notes                TEXT
);
CREATE INDEX idx_vital_records_recorded_at ON vital_records (recorded_at DESC);
CREATE INDEX idx_vital_records_patient_id  ON vital_records (patient_id);
```

> **既存テーブルへの追加（患者管理機能追加時のマイグレーション）**:
> ```sql
> CREATE TABLE patients (
>     id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
>     chart_number INTEGER     UNIQUE,
>     name         TEXT        NOT NULL,
>     species      TEXT,
>     body_weight  NUMERIC,
>     created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
> );
> CREATE INDEX idx_patients_chart_number ON patients (chart_number);
> ALTER TABLE vital_records ADD COLUMN patient_id UUID REFERENCES patients(id);
> CREATE INDEX idx_vital_records_patient_id ON vital_records (patient_id);
> ```

### 2. アプリをセットアップする

```bash
# リポジトリをクローン
git clone <リポジトリURL>
cd monitor_app

# 依存パッケージをインストール
cd backend
uv sync

# 環境変数を設定
cp ../.env.example ../.env
```

`.env` を開いて以下を入力:

```
ANTHROPIC_API_KEY=your_key_here
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

> **DATABASE_URL の取得場所**: Supabase ダッシュボード → **Connect** → **Transaction pooler** タブ（ポート 6543 の URI）

### 3. サーバーを起動する

```bash
cd backend
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
3. Framework Preset は **"Other"** を選択
4. Environment Variables に以下を設定:

| 変数名 | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic の API キー |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` |
| `VERCEL` | `1` |
| `DATABASE_URL` | Supabase Transaction pooler URI（ポート 6543） |

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
| フロントエンド | HTML / CSS / Vanilla JavaScript / Chart.js 4.4.7 |
| バックエンド | Python / FastAPI |
| AI | Anthropic Claude Vision API（デフォルト: `claude-sonnet-4-6`） |
| DB | Supabase（PostgreSQL）/ psycopg2-binary |
| 画像処理 | Pillow |
| パッケージ管理 | uv |
| デプロイ | Vercel（サーバーレス）|

### 使用 AI モデルについて

識別ステップと抽出ステップで異なるモデルを使用しています。

| ステップ | モデル | 変更方法 |
|---|---|---|
| 機種識別（3択判定） | `claude-haiku-4-5-20251001`（固定） | 変更不可（速度優先） |
| バイタル抽出 | `claude-sonnet-4-6`（デフォルト） | `.env` の `CLAUDE_MODEL` で変更 |

```
CLAUDE_MODEL=claude-opus-4-6           # 最高精度（低速・高コスト）
CLAUDE_MODEL=claude-sonnet-4-6         # バランス型（デフォルト）
CLAUDE_MODEL=claude-haiku-4-5-20251001 # 高速・低コスト
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
│   │   └── vision.py          # 全APIエンドポイント（monitors / analyze / records / patients）
│   ├── services/
│   │   ├── claude_service.py  # Claude API 呼び出し・自動識別（Haiku）
│   │   ├── monitor_skills.py  # 機種別 Skill 定義
│   │   ├── image_service.py   # 画像前処理・downscale
│   │   └── db_service.py      # Supabase DB（vital_records / patients 両対応）
│   └── models/
│       └── schemas.py         # VitalData / VitalRecord / AnalyzeResponse / PatientRecord 等
├── frontend/             # 静的 HTML/CSS/JS
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── app.js        # メインロジック・タブ制御・患者状態管理・記録表示・編集モーダル
│       ├── camera.js     # カメラキャプチャ処理
│       ├── api.js        # バックエンド API 通信（患者 CRUD 含む）
│       ├── trend.js      # トレンドタブ（グラフ・一覧・期間選択）
│       └── patients.js   # 患者管理タブ・患者選択モーダル・患者登録/編集モーダル
├── vercel.json
├── requirements.txt
├── start.sh              # Cloudflare Tunnel 同時起動スクリプト
└── .env.example
```

---

## 注意事項

- `ANTHROPIC_API_KEY` / `DATABASE_URL` は `.env` に記載し、Git にコミットしないこと
- 本アプリは **補助ツール** です。表示された値を医療判断の唯一の根拠にしないでください
- 画像認識の精度はモニターの種類・撮影角度・照明条件によって異なります
- 機種自動識別を使用した場合は 2 回の API 呼び出しが発生します（識別 + 読み取り）
- 機種が正しく認識されない場合はモニター種別セレクタで手動選択してください
- `DATABASE_URL` が未設定の場合、撮影記録・患者管理は保存されません（解析機能は正常に動作します）
- 患者を削除しても、その患者に紐付いた撮影記録は削除されません（`patient_id` が NULL になるだけです）
- 患者の選択状態はブラウザの `localStorage` に保存されます。プライベートモードでは保持されません
