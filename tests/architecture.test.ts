import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ces tests ne vérifient pas un comportement, mais une règle d'architecture.
 * Ils doivent échouer dès qu'un développeur (ou un agent) essaie de faire fuir du code
 * de rendu dans la simulation : c'est la garantie que la bataille reste simulable
 * dans Node, testable et rejouable.
 */

const ROOT = process.cwd();

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts')) files.push(path);
    }
  };
  if (existsSync(dir)) walk(dir);
  return files;
}

const SIM_SIDE_DIRS = ['src/sim', 'src/core', 'src/data'];
const DOM_SIDE_DIRS = ['src/render', 'src/ui', 'src/input'];

const FORBIDDEN_IN_SIM: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /from\s+['"][^'"]*\/(render|ui|input)\//, reason: 'la simulation ne doit pas dépendre du rendu' },
  { pattern: /\bdocument\s*\./, reason: 'accès au DOM interdit dans la simulation' },
  { pattern: /\bwindow\s*\./, reason: 'accès à window interdit dans la simulation' },
  { pattern: /\brequestAnimationFrame\b/, reason: 'la simulation ne gère pas la boucle de rendu' },
  { pattern: /\bHTMLCanvasElement\b/, reason: 'pas de canvas dans la simulation' },
  { pattern: /\.getContext\s*\(/, reason: 'pas de contexte de dessin dans la simulation' },
  { pattern: /from\s+['"]vitest['"]/, reason: 'les tests sont dans tests/, pas dans src/' },
];

describe('frontière simulation / rendu', () => {
  it('aucun fichier de simulation, de données ou de noyau ne touche au DOM', () => {
    const offenders: string[] = [];
    for (const dir of SIM_SIDE_DIRS) {
      for (const file of listSourceFiles(join(ROOT, dir))) {
        const content = readFileSync(file, 'utf8');
        for (const { pattern, reason } of FORBIDDEN_IN_SIM) {
          if (pattern.test(content)) offenders.push(`${relative(ROOT, file)} — ${reason}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('la couche de rendu n importe la simulation que par son API publique (src/sim)', () => {
    const offenders: string[] = [];
    for (const dir of DOM_SIDE_DIRS) {
      for (const file of listSourceFiles(join(ROOT, dir))) {
        const content = readFileSync(file, 'utf8');
        for (const match of content.matchAll(/from\s+['"]([^'"]*sim[^'"]*)['"]/g)) {
          const specifier = match[1]!;
          if (!/^(\.\.\/)+sim$/.test(specifier)) {
            offenders.push(`${relative(ROOT, file)} — importe "${specifier}" au lieu de "src/sim"`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('la couche de rendu existe et consomme bien la simulation', () => {
    const renderFiles = listSourceFiles(join(ROOT, 'src/render'));
    expect(renderFiles.length).toBeGreaterThan(0);
    const usesSim = renderFiles.some((file) => /from\s+['"](\.\.\/)+sim['"]/.test(readFileSync(file, 'utf8')));
    expect(usesSim).toBe(true);
  });
});
