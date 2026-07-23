# data/gdp_forecast.csv について

内閣府「経済見通しと経済財政運営の基本的態度」の当初見通し(GDP成長率)と、国民経済計算(SNA)の実績値を年度単位で並べたデータ。

## 収集範囲

- 見通し(forecast_real / forecast_nominal): FY1998〜FY2025(閣議決定版を採用。閣議了解版は同一見通しの前段階のため除外)
- 実績(actual_real / actual_nominal): FY1981〜FY2024(FY1980は接続元系列の起点で成長率算出不能)
- FY1980〜FY1997の見通しデータは未収集(内閣府アーカイブページに掲載がなく、別途調査が必要。CLAUDE.mdのTODO)
- FY2025の実績値は年度未終了のため空欄

## 出典

- 見通し: https://www5.cao.go.jp/keizai1/mitoshi/mitoshikako.html 掲載の各年度PDF/HTML(行ごとのforecast_source_urlを参照)
  - FY2000は現在の内閣府URLが本文消失のスタブページ化していたため、Wayback Machineのアーカイブ経由で確認
  - FY1999の名目値は別添「主要経済指標」表が画像(gif)のため、画像を直接読み取って確認
- 実績:
  - FY1981〜FY1994: 2015年基準・簡易遡及の参考系列(内閣府ESRI、令和3年12月8日公表) — https://www.esri.cao.go.jp/jp/sna/data/data_list/h27_retroactive/
  - FY1995〜FY2024: 2020年基準・2008SNA・2024年度国民経済計算年次推計(正式系列) — https://www.esri.cao.go.jp/jp/sna/data/data_list/kakuhou/files/2024/2024_kaku_top.html

## 既知の注意点

- **基準改定によるヴィンテージ差**: GDP統計は基準年改定のたびに過去に遡って数値が改定される。本CSVの実績値は2024年度の最新確報(2020年基準)を使用しているため、より過去の時点で公表された数値とは一致しない年度がありうる。実績値側の基準改定履歴までは今回のCSVでは表現していない(将来的に取得日・確報/速報の別を記録する運用に拡張余地あり)。
- FY2011の見通し文書のみ章立てが「Ⅰ〜Ⅳ」形式(通常は「１〜３」)で、対象年度見通しは「Ⅳ．平成23年度の経済見通し」に該当。
- FY2013・FY2015は閣議決定日が2月(通常は1月)。政権交代直後の年度で決定が遅れたため。

## 未着手(今後の作業)

- **FY1980〜FY1997の見通しデータ収集**(最優先)。実績はFY1981から揃っているのに見通しがFY1998始まりのため、17年分が片側だけの状態になっている。内閣府アーカイブページに掲載がなく、国立国会図書館デジタルコレクション・経済企画庁時代の年次資料・Wayback Machine等をあたる必要がある
- 実績値のヴィンテージ(基準改定)の表現。現状は2020年基準の最新確報で全期間を統一しているため、「当時公表されていた実績」とは異なる。下記「既知の注意点」参照
- 名目/実質の乖離だけでなく、関連指標の追加余地(消費者物価は`cpi_forecast.csv`として追加済み)

## 対応済み(旧「未着手」からの繰り上げ)

税収見積もり(Phase 2)・出生率(Phase 3)はいずれも実装・公開済み。現在サイトが扱う指標は次の8系列 + 出生率ページ。

- `gdp_forecast.csv`(実質・名目) / `tax_revenue_forecast.csv` / `cpi_forecast.csv` / `unemployment_forecast.csv` / `current_account_forecast.csv` / `bond_issuance_forecast.csv` / `jgb_total_issuance_forecast.csv`
- `fertility_forecast.csv` + `fertility_actual.csv`(専用ページ `/fertility`)
