import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logic = {};
vm.createContext(logic);
vm.runInContext(fs.readFileSync(path.join(root, 'services/IconColors.js'), 'utf8').replace('.pragma library', ''), logic);
export function stockThemeTable(directory = '/usr/share/omarchy/themes') {
  if (!fs.existsSync(directory)) return [];
  const icons = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/icon-edges.json'))).icons;
  return fs.readdirSync(directory).sort().flatMap(theme => {
    const file = path.join(directory, theme, 'colors.toml');
    if (!fs.existsSync(file)) return [];
    const palette = logic.palette(fs.readFileSync(file, 'utf8'));
    const candidates = {bar: palette.background};
    for (const role of ['background', 'dark_background', 'darker_background', 'lighter_background'])
      if (palette[role]) candidates[role] = palette[role];
    const samples = [...icons, logic.dots(palette.foreground)];
    const dark = logic.luminance(logic.rgb(palette.foreground)) > logic.luminance(logic.rgb(palette.background));
    const result = logic.choose(candidates, palette.foreground, samples, dark);
    if (!result.best) throw new Error(`${theme}: no text-safe background`);
    return [{theme, ...result.best, barScore: result.scores.find(s => s.role === 'bar').score,
      outlined: icons.filter(icon => logic.outlineAlpha(icon.edges, result.best.color, palette.foreground) > 0).length}];
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('| Theme | Role | Color | Icons (bar → chosen) | Text | Outlined if enabled |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const row of stockThemeTable())
    console.log(`| ${row.theme} | ${row.role} | ${row.color} | ${row.barScore - 1}/9 → ${row.score - 1}/9 | ${row.textContrast.toFixed(2)}:1 | ${row.outlined} |`);
}
