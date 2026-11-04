// Genera los PNG de la app a partir de public/icon.svg e icon-maskable.svg (npm run icons -w apps/driver)
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (name) => readFileSync(fileURLToPath(new URL(`../public/${name}`, import.meta.url)));
const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));
const svg = read('icon.svg');
await sharp(svg, { density: 384 }).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(svg, { density: 384 }).resize(512, 512).png().toFile(out('icon-512.png'));
await sharp(svg, { density: 384 }).resize(180, 180).png().toFile(out('apple-touch-icon.png'));
await sharp(svg, { density: 384 }).resize(48, 48).png().toFile(out('favicon-48.png'));
// “maskable”: Android recorta el borde, por eso la espiga ocupa solo el centro y el fondo llega a las esquinas
await sharp(read('icon-maskable.svg'), { density: 384 }).resize(512, 512).png().toFile(out('icon-maskable-512.png'));
console.log('Íconos generados');
