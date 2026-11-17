# 設計地域の分類提案

78地点はライブMapleの高難度マップ定義に含まれるが、field.region_idが通常国を指していた。本資料ではplacement_region_idを別に保持し、同一地点へ二重配置しない。

通常の変換コマンドはregion_idを変更しないため、高Lvの敵配置に整合性警告が出る場合がある。必要なら先に`--part classification --region CHY --include-review --review-note "設計上の高難度分類をレビュー"`で分類だけの提案を生成し、ローカルUIで採用する。

この操作は**公式カタログの所属・座標の変更ではなく、設計室の設計分類の提案**。現在の値が未設定状態の元所属と一致するときだけ提案し、採用済み分類や別の変更があると停止する。採用後は最新revisionで次の提案を作り直す。

| 地点 | 元の設計分類 | 今回の分類案 |
|---|---|---|
|teyvat:64824 | region-02 | branch-02|
|teyvat:64825 | region-02 | branch-02|
|teyvat:64828 | region-02 | branch-02|
|teyvat:64829 | region-02 | branch-02|
|teyvat:64830 | region-02 | branch-02|
|teyvat:64831 | region-02 | branch-02|
|teyvat:64832 | region-02 | branch-02|
|teyvat:64833 | region-02 | branch-02|
|teyvat:64834 | region-02 | branch-02|
|teyvat:64835 | region-02 | branch-02|
|teyvat:64836 | region-02 | branch-02|
|teyvat:64837 | region-02 | branch-02|
|teyvat:64838 | region-02 | branch-02|
|teyvat:64839 | region-02 | branch-02|
|teyvat:64840 | region-02 | branch-02|
|teyvat:64841 | region-02 | branch-02|
|teyvat:64842 | region-02 | branch-02|
|teyvat:64843 | region-02 | branch-02|
|teyvat:64844 | region-02 | branch-02|
|teyvat:64845 | region-02 | branch-02|
|teyvat:64846 | region-02 | branch-02|
|teyvat:64847 | region-02 | branch-02|
|teyvat:64848 | region-02 | branch-02|
|teyvat:64849 | region-02 | branch-02|
|teyvat:66768 | region-02 | branch-02|
|teyvat:66769 | region-02 | branch-02|
|teyvat:66979 | region-02 | branch-02|
|teyvat:46517 | region-04 | branch-04|
|teyvat:46520 | region-04 | branch-04|
|teyvat:46521 | region-04 | branch-04|
|teyvat:46523 | region-04 | branch-04|
|teyvat:46530 | region-04 | branch-04|
|teyvat:79060 | region-06 | branch-07|
|teyvat:79295 | region-06 | branch-07|
|teyvat:79319 | region-06 | branch-07|
|teyvat:79512 | region-06 | branch-07|
|teyvat:79514 | region-06 | branch-07|
|teyvat:79523 | region-06 | branch-07|
|teyvat:79536 | region-06 | branch-07|
|teyvat:79538 | region-06 | branch-07|
|teyvat:79539 | region-06 | branch-07|
|teyvat:79540 | region-06 | branch-07|
|teyvat:79541 | region-06 | branch-07|
|teyvat:79543 | region-06 | branch-07|
|teyvat:79544 | region-06 | branch-07|
|teyvat:79546 | region-06 | branch-07|
|teyvat:79548 | region-06 | branch-07|
|teyvat:79549 | region-06 | branch-07|
|teyvat:79550 | region-06 | branch-07|
|teyvat:80025 | region-06 | branch-07|
|teyvat:80030 | region-06 | branch-07|
|teyvat:80033 | region-06 | branch-07|
|teyvat:80035 | region-06 | branch-07|
|teyvat:80036 | region-06 | branch-07|
|teyvat:80040 | region-06 | branch-07|
|teyvat:80846 | region-06 | branch-07|
|teyvat:106180 | region-08 | branch-09|
|teyvat:106182 | region-08 | branch-09|
|teyvat:106183 | region-08 | branch-09|
|teyvat:106184 | region-08 | branch-09|
|teyvat:106185 | region-08 | branch-09|
|teyvat:106186 | region-08 | branch-09|
|teyvat:106187 | region-08 | branch-09|
|teyvat:106188 | region-08 | branch-09|
|teyvat:106189 | region-08 | branch-09|
|teyvat:106190 | region-08 | branch-09|
|teyvat:106191 | region-08 | branch-09|
|teyvat:106192 | region-08 | branch-09|
|teyvat:106193 | region-08 | branch-09|
|teyvat:106200 | region-08 | branch-09|
|teyvat:106201 | region-08 | branch-09|
|teyvat:106202 | region-08 | branch-09|
|teyvat:106203 | region-08 | branch-09|
|teyvat:106204 | region-08 | branch-09|
|teyvat:106205 | region-08 | branch-09|
|teyvat:106206 | region-08 | branch-09|
|teyvat:106207 | region-08 | branch-09|
|teyvat:106220 | region-08 | branch-09|
