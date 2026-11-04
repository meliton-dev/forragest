// Genera los PNG de la app a partir de public/icon.svg (se ejecuta una vez: npm run icons -w apps/driver)
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const svg = readFileSync(fileURLToPath(new URL('../public/icon.svg', import.meta.url)));
const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));
await sharp(svg).resize(192, 192).png().toFile(out('icon-192.png'));
await sharp(svg).resize(512, 512).png().toFile(out('icon-512.png'));
await sharp(svg).resize(180, 180).png().toFile(out('apple-touch-icon.png'));
// ícono "maskable": el logotipo ocupa ~60 % para que Android pueda recortar sin cortarlo
const inner = await sharp(svg).resize(310, 310).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#1D6B3F' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(out('icon-maskable-512.png'));
console.log('Íconos generados');
