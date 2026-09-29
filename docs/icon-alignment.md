# アイコン位置の微調整（2026-09-29）

内蔵imagegenで既存の透過R画像を編集し、`build/icon.png`と`public/icon.png`へ反映。配布アイコンと画面内ロゴの両方に使用する。採用した指示文：

> Edit target is the existing R app icon. Subtle optical alignment correction: reposition the icon slightly downward on a SQUARE transparent canvas. The FULL R must fit without ANY clipping. BOTH lower pointed tips MUST be complete and surrounded by transparent pixels. Mandatory transparent bottom margin 3% canvas height; top margin 6% canvas height. Thus the entire R occupies 91% of canvas height. Keep the original exact R design, purple and gold color, faceted shapes, and proportions; preserve original horizontal centering. Do not add anything, no background, no drop shadow. This is the same large R icon with a tiny downward optical alignment correction; do not redesign. Return genuinely transparent PNG.

出力は指示値どおりの厳密な平行移動ではない。実測は1254×1254、alpha>128の上下端が72〜1245。透過と先端の余白を確認した。
