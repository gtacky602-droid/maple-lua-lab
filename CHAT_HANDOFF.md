# ChatGPTへの引き継ぎ

2026-11-16。制作はユーザー指示で中断中。勝手に再開しない。

目的は原神×メイプル風2D RPGのLuaラボ。全マップ、通常・週ボス全種、幽境専用戦闘、クエストを制作する。実機導入は未実施。

現状: 61仮地点、47仮依頼、11戦部分実装、完成扱い0戦。通常10戦が本編入口と依頼へ接続。背景はホスト画像、将来は本番3D背景。PNGと矩形の同tick比較あり。雷音権現の突進まで確認、羽弾は未着手。

読む順序: このファイル → content/coverage.json → content/encounters.json → sources/20261116-amendment.md → README.md。READMEは制作履歴も含み、古い件数を現状と混同しない。evidence/に検査結果。

起動: Python環境で `pip install -r requirements.txt`、`python server.py`。ブラウザは http://127.0.0.1:8769/ 。ブラウザ検査は別途 `npm install --no-save playwright` とChromeが必要。

共有する決定はこのファイルや仕様へ記録し、コード変更はコミットしてpushする。チャット会話そのものの同期を保証するものではない。原作素材の権利を移転するリポジトリではない。
