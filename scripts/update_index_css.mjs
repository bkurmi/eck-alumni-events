import fs from 'fs';
import { execSync } from 'child_process';

let css = fs.readFileSync('src/index.css', 'utf-8');
const header = `@import "tailwindcss";

@theme {
  --color-brand-primary: #f59e0b;
  --color-brand-primary-light: #fbbf24;
  --color-brand-primary-dark: #d97706;
  --color-brand-accent: #f97316;
  --color-brand-accent-crimson: #e11d48;
  --color-brand-bg-base: #0a0c16;
  --color-brand-bg-surface: #111425;
  --color-brand-bg-elevated: #1a1e36;
}

`;

css = header + css;
css = css.replace(/\/\* ── Reset & Base Styles ── \*\/\r?\n\*,?\r?\n\*::before,?\r?\n\*::after\s*\{[^}]*\}/, '/* ── Reset & Base Styles handled by Tailwind ── */');

const diff = execSync('git show HEAD:src/directory.css', { encoding: 'utf-8' });
const idx = diff.indexOf('.alumni-modal-backdrop');
const modalCss = diff.substring(idx);

css = css + '\n\n/* ── Alumni Profile Modal Styles ── */\n' + modalCss;

fs.writeFileSync('src/index.css', css, 'utf-8');
console.log('index.css updated cleanly with Tailwind tokens and modal styles!');
