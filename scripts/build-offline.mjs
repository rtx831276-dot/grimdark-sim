// Produit un fichier HTML autonome que l'on peut ouvrir sans serveur.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = 'dist';
let html = await readFile(join(dir, 'index.html'), 'utf8');
const scriptMatch = html.match(/<script type="module" crossorigin src="\/(assets\/[^\"]+\.js)"><\/script>/);
const styleMatch = html.match(/<link rel="stylesheet" crossorigin href="\/(assets\/[^\"]+\.css)">/);
if (!scriptMatch || !styleMatch) throw new Error('Assets du build introuvables : lancez d’abord npm run build.');
const js = (await readFile(join(dir, scriptMatch[1]), 'utf8')).replace(/\n\/\/# sourceMappingURL=.*$/, '');
const css = await readFile(join(dir, styleMatch[1]), 'utf8');
if (/<\/script/i.test(js) || /<\/style/i.test(css)) throw new Error('Une balise de fermeture empêche l’intégration des assets.');
html = html.replace(scriptMatch[0], () => `<script type="module">\n${js}\n</script>`);
html = html.replace(styleMatch[0], () => `<style>\n${css}\n</style>`);
await writeFile(join(dir, 'operation-carrefour.html'), html);
console.log('Jeu autonome : dist/operation-carrefour.html');
