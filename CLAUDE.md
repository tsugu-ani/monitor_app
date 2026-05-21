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
| P1（観血測定平均） | `bp_systolic` | mmHg |
| 血圧（平均） | `bp_mean` | mmHg |
| P2（観血測定平均） | `bp_diastolic` | mmHg |
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

#### 人工呼吸器

| 項目 | キー名 | 単位 |
|---|---|---|
| 設定呼吸回数 | `set_respiratory_rate` | bpm |
| 設定吸気圧（+PEEP） | `set_inspiratory_pressure` | cmH2O |
| 吸気時間 | `inspiratory_time` | sec |
| PEEP | `peep` | cmH2O |
| トリガ感度 | `trigger_sensitivity` | cmH2O |
| 吸気流量 | `inspiratory_flow` | L/min |

#### 患者情報（手入力）

AI による抽出対象ではなく、撮影後に修正モーダルから手入力する項目。DB カラムとして `VitalData` に含まれる（patients テーブルとは別管理だが、患者選択時に自動引き継ぎされる）。

| 項目 | キー名 | 型 | 単位 |
|---|---|---|---|
| カルテ番号 | `chart_number` | INTEGER | — |
| 名前 | `patient_name` | TEXT | — |
| 体重 | `body_weight` | NUMERIC | kg |

### 4. 読み取れなかった場合の扱い

- 抽出できなかった項目は `null` で返却し、UI では「**---**」と表示する
- 部分的に読み取れた場合（例: 数値は読めたが単位が不明）も `null` として扱い、備考欄に補足を記載する
- 解析エラー全体の場合はエラーメッセージをユーザーに明示する

### 5. UI 仕様

#### 画面構成

画面は **シングルページ（SPA）**。ヘッダーにタブバーを組み込み、「撮影」「撮影記録」「トレンド」「患者管理」の4タブで切り替える。ヘッダーにはタブバーの上に **患者選択行** を設け、現在の対象患者を常時表示・切り替えできる。ヘッダー右上の `?` ボタンから **マニュアルモーダル** を開ける（基本フロー・各タブの使い方・その他シナリオを記載）。

```
┌──────────────────────────────┐
│ ≈ モニター情報読取  12:34 ⓘ │  ← ヘッダー（sticky）、右端 ? でマニュアル
│ 👤 田中 太郎 ▼               │  ← 患者選択行（タップで患者選択モーダル）
├──────┬──────┬────────┬───────┤
│ 撮影 │撮影記録│トレンド│患者管理│  ← タブバー（sticky、ヘッダー内）
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
│                               │  患者選択中はその患者の記録のみ表示
│ ┌────────────────────────┐   │
│ │ 14:32 [Bio-Scope AM140] ✏ │  ← 記録カード（右端に編集ボタン）
│ │ [カルテ番号 12345] [体重 3.2 kg] │  ← 患者情報チップ（値ありの項目のみ）
│ │ 基本バイタル            │   │
│ │ 心拍数         75 bpm  │   │  ← 全17項目を縦1列（ラベル左・値右）
│ │ P1（観血測定平均）90 mmHg │   │
│ │ ...                    │   │
│ └────────────────────────┘   │
└──────────────────────────────┘

┌──────────────────────────────┐
│ [患者管理タブ]                │
│ [＋ 新規患者登録]             │
│ ┌────────────────────────┐   │
│ │[犬] 田中 太郎 [選択中]  ✏│  ← 患者カード（種別タグ・選択バッジ・編集ボタン）
│ │ #12345 · 5.2 kg         │   │  ← カルテ番号・体重
│ │                 [選択] [✏] │
│ └────────────────────────┘   │
│ ┌────────────────────────┐   │
│ │[猫] 山田 花子           ✏│
│ │ #67890 · 3.1 kg         │
│ │                 [選択] [✏] │
│ └────────────────────────┘   │
└──────────────────────────────┘

┌──────────────────────────────┐
│ [トレンドタブ]                │
│ [✓心拍数][✓血圧(平均)][✓呼吸数][✓体温]│  ← デフォルト選択4項目
│ [P1(観血測定平均)][P2(観血測定平均)][SpO2][EtCO2]│  ← 追加選択可能な4項目
│ ‹  2026/05/21  ›             │  ← 日付ピッカー（前日・翌日ボタン付き）
│ 時間  [09:15] 〜 [14:32]     │  ← 同日内の時間範囲
│ [更新]              [数値表示]│  ← 数値表示ボタン（ON時に各点に値を描画）
│ ╔══════════════════════╗      │
│ ║ ─心拍数  ─ SpO2      ║     │  ← 凡例（2項目以上選択時）
│ ║   折れ線グラフ        ║      │  ← Chart.js（X 軸は HH:MM）
│ ╚══════════════════════╝      │
│              12:15  14:32      │  ← 列=時刻（昇順・1行目）
│ 心拍数(bpm)    75    78        │  ← 行=項目（1列目スティッキー）
│ 体温(°C)      38.1  38.2       │
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

#### 修正モーダル（撮影記録タブの ✏ ボタンタップ時）

```
┌──────────────────────────────┐
│ 記録を修正          [✕]      │
├──────────────────────────────┤
│ 患者情報                      │
│ カルテ番号    [12345_______]  │  ← 手入力フィールド（縦1列）
│ 名前          [田中 太郎____] │
│ 体重          [3.2_________]kg│
│ 基本バイタル                  │
│ 心拍数        [75__________]bpm│  ← 全17項目を縦1列（ラベル左・入力右）
│ P1（観血測定平均）[90_______]mmHg│
│  ...（全17項目）              │
│ 補足情報                      │
│ [textarea]                   │
├──────────────────────────────┤
│ [キャンセル] [削除]  [保存]   │
└──────────────────────────────┘
```

#### 患者選択モーダル（ヘッダー患者行タップ時）

```
┌──────────────────────────────┐
│ 患者を選択          [✕]      │
├──────────────────────────────┤
│ [選択解除（全患者表示）]      │
│ ┌────────────────────────┐   │
│ │[犬] 田中 太郎    ✓     │   │  ← 選択中は青枠・チェックマーク
│ │ #12345 · 5.2 kg        │   │
│ └────────────────────────┘   │
│ ┌────────────────────────┐   │
│ │[猫] 山田 花子           │   │
│ │ #67890                 │   │
│ └────────────────────────┘   │
└──────────────────────────────┘
```

#### 患者登録・編集モーダル（患者管理タブの ✏ ボタン / 新規登録ボタンタップ時）

```
┌──────────────────────────────┐
│ 患者を登録          [✕]      │
├──────────────────────────────┤
│ 名前 *        [田中 太郎____]│  ← 手入力フィールド（縦1列）
│ カルテ番号    [12345_______] │
│ 体重          [5.2_________]kg│
│ 種別          [犬▼]          │  ← 犬 / 猫 / その他
├──────────────────────────────┤
│ [キャンセル]  [削除]  [保存]  │
└──────────────────────────────┘
```

#### 実装上の制約
- 画面遷移・ページ切り替えは行わない（SPA）
- タブはヘッダー内に組み込み、常時 sticky で表示する
- カメラは「撮影開始」タップ時に起動し、モーダルを閉じると停止する
- モーダルの背景（backdrop）タップでも閉じる
- 撮影記録タブのバイタル項目・修正モーダルのフォームは縦1列リスト（ラベル左・値右）で表示する
- 修正モーダルのフォームは「患者情報」グループを先頭に配置する
- 患者の選択状態は `localStorage` に保存し、ブラウザリロード後も復元する
- 患者未選択時は全患者の記録を表示する（既存動作を維持）

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

撮影・解析のたびに全17項目 + 患者情報 + メタデータを Supabase（PostgreSQL）に自動保存し、撮影記録タブで日付別に閲覧できる。

### DB テーブル構造

```sql
-- 患者マスタ
CREATE TABLE patients (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    chart_number INTEGER     UNIQUE,
    name         TEXT        NOT NULL,
    species      TEXT,                  -- 犬 / 猫 / その他
    body_weight  NUMERIC,
    created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_patients_chart_number ON patients (chart_number);

-- バイタル記録
CREATE TABLE vital_records (
    id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    recorded_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    monitor_type         TEXT,
    patient_id           UUID        REFERENCES patients(id),  -- 患者FK（nullable）
    -- 基本バイタル（17項目）
    heart_rate           NUMERIC,
    ...（全17項目）
    -- 人工呼吸器設定値（6項目）
    set_respiratory_rate     NUMERIC,
    set_inspiratory_pressure NUMERIC,
    inspiratory_time         NUMERIC,
    peep                     NUMERIC,
    trigger_sensitivity      NUMERIC,
    inspiratory_flow         NUMERIC,
    -- 患者情報（手入力 / 後から上書き可）
    chart_number         INTEGER,
    patient_name         TEXT,
    body_weight          NUMERIC,
    notes                TEXT
);
CREATE INDEX idx_vital_records_recorded_at ON vital_records (recorded_at DESC);
CREATE INDEX idx_vital_records_patient_id  ON vital_records (patient_id);
```

マイグレーション（患者管理機能追加時）:

```sql
CREATE TABLE patients (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    chart_number INTEGER     UNIQUE,
    name         TEXT        NOT NULL,
    species      TEXT,
    body_weight  NUMERIC,
    created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX idx_patients_chart_number ON patients (chart_number);

ALTER TABLE vital_records ADD COLUMN patient_id UUID REFERENCES patients(id);
CREATE INDEX idx_vital_records_patient_id ON vital_records (patient_id);
```

マイグレーション（人工呼吸器グループ追加時）:

```sql
ALTER TABLE vital_records
    ADD COLUMN set_respiratory_rate     NUMERIC,
    ADD COLUMN set_inspiratory_pressure NUMERIC,
    ADD COLUMN inspiratory_time         NUMERIC,
    ADD COLUMN peep                     NUMERIC,
    ADD COLUMN trigger_sensitivity      NUMERIC,
    ADD COLUMN inspiratory_flow         NUMERIC;
```

> **重要**: このマイグレーションを未実行の場合、`save_record` 実行時に `column does not exist` エラーで保存失敗するため、必ず本番 DB にも適用すること。

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
| `db_service.py` | `save_record(monitor_type, vital_data, patient_id)` | 解析後に自動保存（patient_id を付与） |
| `db_service.py` | `update_record(id, vital_data, patient_id)` | バイタル値・患者情報・患者紐付けの手動修正（UPDATE） |
| `db_service.py` | `delete_record(id)` | 記録の削除（DELETE） |
| `db_service.py` | `get_records(date, limit, start, end, patient_id)` | 日付・datetime・患者フィルタ付き取得 |
| `db_service.py` | `create_patient(data)` | 患者の新規登録 |
| `db_service.py` | `get_patients()` | 全患者を名前順で取得 |
| `db_service.py` | `update_patient(id, data)` | 患者情報の更新 |
| `db_service.py` | `delete_patient(id)` | 患者の削除 |
| `vision.py` | `GET /api/records` | 記録一覧 API（`date`・`start`/`end`・`limit`・`patient_id` 対応） |
| `vision.py` | `PATCH /api/records/{id}` | 記録の手動修正 API |
| `vision.py` | `DELETE /api/records/{id}` | 記録の削除 API |
| `vision.py` | `GET /api/patients` | 患者一覧 API |
| `vision.py` | `POST /api/patients` | 患者登録 API |
| `vision.py` | `PATCH /api/patients/{id}` | 患者更新 API |
| `vision.py` | `DELETE /api/patients/{id}` | 患者削除 API |
| `schemas.py` | `VitalRecord` | 記録レスポンスモデル（`patient_id` フィールド追加） |
| `schemas.py` | `VitalDataUpdate` | `VitalData` + `patient_id`。PATCH /api/records/{id} のリクエストモデル |
| `schemas.py` | `PatientRecord` / `PatientCreate` / `PatientUpdate` | 患者モデル |
| `schemas.py` | `AnalyzeResponse.record_id` | 保存 UUID（撮影直後の編集に使用） |
| `app.js` | `currentPatient` / `setCurrentPatient()` | 現在の対象患者の状態管理・localStorage 保存 |
| `app.js` | `PATIENT_FIELDS` | 患者情報フィールド定義（カルテ番号・名前・体重） |
| `app.js` | `loadHistory()` / `prependRecord()` | 記録の読み込み・追加（patient_id フィルタ付き） |
| `app.js` | `openEditModal()` / `buildEditForm()` / `buildEditField()` | 修正モーダルの制御・フォーム生成 |
| `app.js` | `buildHistoryCard()` | 患者情報チップの表示（値ありの項目のみ） |
| `patients.js` | `loadPatients()` / `renderPatientList()` | 患者一覧の読み込み・描画（カードに初回登録日時を表示） |
| `patients.js` | `openPatientSelectModal()` | ヘッダーの患者選択モーダル |
| `patients.js` | `openPatientEditModal()` / `buildPatientEditForm()` | 患者登録・編集モーダル |
| `trend.js` | `loadTrend()` / `renderTrendChart()` | トレンドタブのデータ取得・グラフ描画（patient_id フィルタ付き） |

## 撮影記録の手動修正・削除機能

### 概要

AI の読み取り誤りを人手で修正し Supabase DB に上書き保存できる機能、および記録を DB から削除できる機能。撮影記録タブの各記録カード右上に表示される **鉛筆アイコンボタン（✏）** をタップすると修正モーダルが開く。

### 動作フロー

```
撮影記録タブ → 記録カード右上の ✏ ボタンをタップ
       ↓
修正モーダルが開く（現在値がフォームに入力済み）
       ├─ 値を修正・保存ボタンをタップ
       │      ↓
       │  PATCH /api/records/{id} → DB UPDATE
       │      ↓ モーダルが閉じ、カードが即時再描画
       │
       └─ 削除ボタンをタップ（確認ダイアログあり）
              ↓
          DELETE /api/records/{id} → DB DELETE
              ↓ モーダルが閉じ、カードが即時除去
```

### 実装上のポイント

- `recordsMap`（`Map<id, record>`）でページ内のレコードをキャッシュし、イベント委任で編集ボタンのクリックを処理する
- 撮影直後に追加されたカードも `AnalyzeResponse.record_id` を使って編集可能にする
- 数値フィールドを空欄にすると `null`（---）として保存する
- `patient_name` はテキスト入力（`type="text"`）、`chart_number` / `body_weight` は数値入力（`type="number"`）
- `notes`（補足情報）はテキストエリアで編集可能
- フォームは「患者情報」→「基本バイタル」→「呼吸器・麻酔器」→「補足情報」の順に表示する
- 患者情報グループの先頭に「患者」紐付け select があり、既存患者から選択 / 解除できる。選択すると名前・カルテ番号・体重の手入力フィールドへ値が自動反映される（手動で再編集可）。送信時には `patient_id`（UUID）が `vital_records.patient_id` を上書きする

### API

| メソッド | パス | ボディ | 説明 |
|---|---|---|---|
| `PATCH` | `/api/records/{id}` | `VitalDataUpdate` JSON | 全17項目 + 患者情報 + notes + `patient_id`（紐付け）を上書き |
| `DELETE` | `/api/records/{id}` | なし | 記録を削除する |

`update_record()` は `VitalData` の全フィールド + `patient_id` カラムを `UPDATE` する。フィールドを `null` にしたい場合は空欄（フロントエンドが `null` を送信）。`patient_id` を空文字 / 省略すると紐付けが解除される。

## トレンドタブ

### 概要

撮影記録から複数項目を同時選択し、指定した日時範囲の時系列変化を **折れ線グラフ**（項目ごとに色分け）と **一覧** で表示する。

### 動作フロー

```
トレンドタブを初めて開く
       ↓
今日の記録を取得 → 最初の計測時刻〜現在をデフォルト期間に設定
       ↓
項目チップで表示項目を選択（複数選択可・変更時に自動更新）
       ↓
GET /api/records?start=ISO&end=ISO → ASC 順でレコード取得
       ↓
いずれかの選択項目に値があるレコードを抽出
       ↓
Chart.js 折れ線グラフ + 時刻昇順の一覧を表示
```

### 日時範囲の仕様

トレンドは **1日単位** で表示し、その日の中で時間範囲を指定する。

| 設定 | 仕様 |
|---|---|
| デフォルト日付 | 今日 |
| デフォルト開始時刻 | `00:00` |
| デフォルト終了時刻 | `23:59` |
| 日付入力 | `type="date"`（前日・翌日ボタン付き） |
| 時刻入力 | `type="time"`（開始 / 終了の2つ） |
| API 送信形式 | ISO 8601 UTC（`new Date(\`${date}T${time}:00\`).toISOString()`） |
| DB 比較 | `recorded_at >= start AND recorded_at <= end`（TIMESTAMPTZ 比較） |
| ソート順 | ASC（グラフ・一覧とも時刻昇順） |

### 選択可能な項目（TREND_ITEMS）

| ラベル | キー | 単位 | デフォルト選択 |
|---|---|---|---|
| 心拍数 | `heart_rate` | bpm | ✓ |
| 血圧（平均） | `bp_mean` | mmHg | ✓ |
| 呼吸数 | `respiratory_rate` | 回/分 | ✓ |
| 体温 | `body_temperature` | °C | ✓ |
| P1 (観血測定平均) | `bp_systolic` | mmHg | — |
| P2 (観血測定平均) | `bp_diastolic` | mmHg | — |
| SpO2 | `spo2` | % | — |
| EtCO2 | `etco2` | mmHg | — |

### グラフ仕様

| 設定 | 値 |
|---|---|
| ライブラリ | Chart.js 4.4.7（CDN） |
| グラフ種別 | 折れ線（`type: 'line'`）、1項目選択時は fill あり |
| 複数項目 | 各項目を別色の折れ線で重ねて表示、凡例（legend）を表示 |
| X 軸ラベル | `HH:MM`（1日単位表示のため時刻のみ） |
| Y 軸 | `beginAtZero: false`（値域に合わせて自動スケール） |
| ツールチップ | `mode: 'index'` で全選択項目の値を一括表示 |
| 数値表示トグル | グラフ右上の「数値表示」ボタンで各データ点の値を ON/OFF |
| 数値ラベル | Chart.js 組み込みプラグインで各点の真上に色付きテキストを描画（外部ライブラリ不要） |
| 項目変更 | データセットを差し替えて `chart.update()` で更新 |

### 関連実装

| ファイル | 関数・定数 | 役割 |
|---|---|---|
| `trend.js` | `TREND_ITEMS` | 選択可能な8項目の定義（`defaultOn` フラグでデフォルト選択を制御） |
| `trend.js` | `dataLabelsPlugin` | 数値ラベル描画の Chart.js インラインプラグイン |
| `trend.js` | `showDataLabels` | 数値表示の ON/OFF 状態 |
| `trend.js` | `initTrendFieldChips()` | チップ型項目セレクタの初期化・イベント設定 |
| `trend.js` | `initTrendDefaults()` | デフォルト期間設定（今日の最初の計測時刻を取得） |
| `trend.js` | `loadTrend()` | データ取得・グラフ・一覧の描画 |
| `trend.js` | `renderTrendChart()` | Chart.js グラフ描画・更新 |
| `trend.js` | `renderTrendList()` | 時系列一覧（ASC）描画 |
| `db_service.py` | `get_records(start=, end=)` | datetime 範囲フィルタ・ASC 順返却 |
| `vision.py` | `GET /api/records?start=&end=` | トレンド用 datetime 範囲クエリ |

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
| `bp_systolic`（P1 観血平均） | P1 表示の MAP（3値中の中央下） | — | — | P1 チャンネルの平均圧のみ。SYS/DIA は記録しない |
| `bp_mean`（単一血圧の平均） | `BP` の MAP / 単一 ART の MAP | `ART` または `NIBP` の括弧内 `(MEAN)` | — | Vista 300 は単一 ART のため常に `bp_mean` を使用 |
| `bp_diastolic`（P2 観血平均） | P2 表示の MAP（3値中の中央下） | — | — | P2 チャンネルの平均圧のみ。SYS/DIA は記録しない |
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
│   │   └── vision.py             # 全APIエンドポイント（monitors / analyze / records / patients）
│   ├── services/
│   │   ├── __init__.py
│   │   ├── claude_service.py     # Claude API 呼び出し・Skill 適用・自動識別（Haiku）
│   │   ├── monitor_skills.py     # 機種別 Skill 定義（MONITOR_SKILLS / MONITOR_OPTIONS）
│   │   ├── image_service.py      # 画像前処理・リサイズ・downscale・Base64 変換
│   │   └── db_service.py         # Supabase DB 保存・取得（vital_records / patients 両対応）
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py            # Pydantic モデル（VitalData / VitalRecord / AnalyzeResponse / PatientRecord 等）
│   └── uploads/                  # アップロード画像の一時保存（起動時クリア推奨）
│
└── frontend/                     # 静的 HTML/CSS/JS（FastAPI から配信）
    ├── index.html
    ├── css/
    │   └── style.css
    └── js/
        ├── app.js                # メインロジック・タブ制御・患者状態管理・記録表示・編集モーダル
        ├── camera.js             # カメラキャプチャ処理（getUserMedia API）
        ├── api.js                # バックエンド API 通信（患者 CRUD 含む）
        ├── trend.js              # トレンドタブ（グラフ・一覧・期間選択）
        ├── patients.js           # 患者管理タブ・患者選択モーダル・患者編集モーダル
        └── manual.js             # マニュアルモーダルの開閉・TOC スクロール制御
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
| `backend/services/db_service.py` | Supabase への保存・取得。vital_records と patients の両テーブルを管理。`DATABASE_URL` 未設定時はスキップ |
| `backend/models/` | リクエスト/レスポンスの Pydantic データモデル |
| `backend/uploads/` | アップロード画像の一時保存（起動時クリア推奨） |
| `frontend/` | 静的 HTML/CSS/JS。FastAPI から `/` で配信される |
| `frontend/js/trend.js` | トレンドタブのロジック（Chart.js グラフ・期間選択・一覧） |
| `frontend/js/patients.js` | 患者管理タブ・患者選択モーダル・患者登録/編集モーダルのロジック |

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
| `GET` | `/api/records` | 撮影記録を返す（`date`・`start`/`end`・`limit`・`patient_id` 対応） |
| `PATCH` | `/api/records/{id}` | 指定 ID のバイタル値・患者情報を手動修正する |
| `DELETE` | `/api/records/{id}` | 指定 ID の記録を削除する |
| `GET` | `/api/patients` | 患者一覧を返す（名前順） |
| `POST` | `/api/patients` | 患者を新規登録する |
| `PATCH` | `/api/patients/{id}` | 指定 ID の患者情報を更新する |
| `DELETE` | `/api/patients/{id}` | 指定 ID の患者を削除する |
| `GET` | `/health` | ヘルスチェック |

### POST /api/analyze リクエストフィールド（multipart/form-data）

| フィールド | 型 | 説明 |
|---|---|---|
| `file` | UploadFile | 撮影画像 |
| `monitor_type` | str | モニター種別 ID（省略時は空文字） |
| `patient_id` | str | 患者 UUID（省略時は空文字）。選択中の患者がいる場合に送信する |

### POST /api/analyze レスポンス

```json
{
  "success": true,
  "data": { /* VitalData: 17項目 + notes */ },
  "monitor_type": "fukuda_am140",
  "auto_detected": true,
  "record_saved_at": "2026-04-20T14:32:00+09:00",
  "record_id": "uuid-of-saved-record"
}
```

### PATCH /api/records/{id} リクエスト / レスポンス

リクエストボディは `VitalData` JSON（全17項目 + notes）。`null` を送ると対応カラムを NULL に更新する。

```json
{ "success": true }
```

### GET /api/records クエリパラメータ

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `date` | `YYYY-MM-DD` | なし | JST基準の日付フィルタ（DESC 順） |
| `start` | ISO 8601 datetime | なし | datetime 範囲の開始（`end` と同時指定、ASC 順） |
| `end` | ISO 8601 datetime | なし | datetime 範囲の終了 |
| `limit` | int | 200 | 最大取得件数（上限 500） |
| `patient_id` | UUID | なし | 患者 ID フィルタ。指定した患者の記録のみ返す |

`start`/`end` は `date` より優先される。トレンドタブはこちらを使用。`patient_id` は他のフィルタと組み合わせ可能。

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
