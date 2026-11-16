# 素材生成記録

2026-11-16 / built-in image_gen（CLI不使用）。初稿 atlas-candidate.png と透過修正版 atlas-transparent.png を両方保持。

初回プロンプト：
Create a production pixel art sprite atlas on transparent background, exactly 4 columns by 2 rows equal cells, 1024x512 canvas. Each subject isolated within cell with wide transparent margins, feet aligned near cell bottom, no labels no text no borders. Authentic detailed cute 2.5-head-tall side-scrolling fantasy RPG pixel art, crisp pixels, consistent pixel grid, rich but limited palette, dark colored outlines, MapleStory-inspired proportions but no copied MapleStory assets. Row 1 cells: Genshin Impact male Traveler Aether idle facing right with blond braid white gold cape and black gold outfit; same Aether running facing right; Genshin Impact Amber idle facing right with brown hair red bunny ear headband red brown adventurer outfit and bow; same Amber drawing bow facing right. Row 2 cells: small bright blue hydro slime idle; same slime squashed hopping; small orange pyro slime idle; a lush green grass topped stone platform tile. Full bodies readable at 64-pixel game height. This is an initial style candidate sheet, not a poster.

透過修正プロンプト：
Remove ONLY the white/off-white background from this sprite sheet. Make background genuinely fully transparent alpha=0 including all spaces between sprites. Preserve the 8 sprites, exact placements, full canvas dimensions, colors and crisp pixel art. No checkerboard painted into image, no white halo, no shadow outside sprites. This must be a usable transparent game sprite atlas.

初稿はアルファ162〜251で白背景が残ったため不採用。修正版はRGBA 1774×887、アルファ0〜255を確認。元PNGは編集せず、compile_assets.py で描画用の矩形データに変換する。実際の出力寸法はプロンプト指定と異なるため実寸からセルを検出。輪郭に色残りがあるので最終素材にはさらなる整備が必要。

## 背景画像

2026-11-16の本人指示で本番背景を3D配置へ変更。ラボ用に built-in image_gen で `mondstadt-background.png` を生成。公式のスクリーンショットではなく、モンドをイメージした暫定背景。

Prompt: A beautiful wide 16:9 background plate for a side scrolling Genshin Impact Mondstadt-inspired adventure prototype. This is scenery only for layering small pixel-art player characters in front. High quality painterly cel-shaded 3D game environment look, not pixel art. Bright gentle late morning light, soft blue sky with airy clouds, distant medieval walled city and cathedral spires with red roofs and windmills to the right, rolling green hills, a lake and distant cliffs, scattered large leafy trees at far left edge, wildflowers and grassy roadside. Clear readable unobstructed central and lower playing area with subtle quiet tones behind characters. Horizon at upper half. Broad grassy foreground stretching horizontally near bottom 15%, no characters no enemies no UI no text no symbols no fake floating platforms. Rich attractive fantasy environment, designed as distant background for a 2D side-view battle, not a top-down map. Composition supports horizontal scrolling by panning a little across the image.
