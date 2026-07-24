// Renders static/img/og-card.png (1200×630) from the editable og-card.svg.
// Runs before docs:dev/docs:build so the raster social card can never drift
// from its SVG source; the PNG itself is gitignored.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const imgDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'img');
const svg = readFileSync(join(imgDir, 'og-card.svg'));
const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  // The SVG asks for 'Segoe UI', system-ui, sans-serif. Without an explicit
  // mapping resvg can fall back to a monospace face (wider glyphs clip the
  // tagline), so pin the generic families to a proportional sans that exists
  // on dev machines and ubuntu CI alike.
  font: {
    loadSystemFonts: true,
    defaultFontFamily: 'DejaVu Sans',
    sansSerifFamily: 'DejaVu Sans',
  },
})
  .render()
  .asPng();
writeFileSync(join(imgDir, 'og-card.png'), png);
console.log(`og-card.png rendered from og-card.svg (${png.length} bytes)`);
