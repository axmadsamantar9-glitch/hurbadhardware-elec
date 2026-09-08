/**
 * Generates simple placeholder JPGs for every category/product image path
 * currently referenced in the database, so production stops 404ing on
 * public/images/... . These are NOT real product photography -- just a
 * neutral colored tile with the product/category name, so the storefront
 * renders correctly while real images/a CDN pipeline are sourced separately
 * (see docs/agents/run-state.md OPEN RISKS item 9).
 */
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { db } from "../src/lib/db";

const WIDTH = 800;
const HEIGHT = 800;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapLines(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function colorFor(seed: string): string {
  const palette = ["#64748b", "#0ea5e9", "#6366f1", "#059669", "#d97706", "#dc2626", "#7c3aed"];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

async function generatePlaceholder(label: string): Promise<Buffer> {
  const bg = colorFor(label);
  const lines = wrapLines(label, 18);
  const lineHeight = 44;
  const startY = HEIGHT / 2 - ((lines.length - 1) * lineHeight) / 2;
  const textEls = lines
    .map(
      (line, i) =>
        `<text x="50%" y="${startY + i * lineHeight}" font-family="system-ui, sans-serif" font-size="36" fill="white" text-anchor="middle" dominant-baseline="middle">${escapeXml(line)}</text>`
    )
    .join("");

  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${bg}"/>
      ${textEls}
    </svg>
  `;

  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

async function main() {
  const categories = await db.category.findMany({
    select: { slug: true, nameEn: true, imageUrl: true },
  });
  const products = await db.product.findMany({
    select: { slug: true, nameEn: true, images: { select: { url: true, position: true } } },
  });

  const publicDir = path.join(process.cwd(), "public");
  const categoriesDir = path.join(publicDir, "images", "categories");
  const productsDir = path.join(publicDir, "images", "products");
  await fs.mkdir(categoriesDir, { recursive: true });
  await fs.mkdir(productsDir, { recursive: true });

  let written = 0;

  for (const cat of categories) {
    if (!cat.imageUrl) continue;
    const filename = path.basename(cat.imageUrl);
    const buf = await generatePlaceholder(cat.nameEn);
    await fs.writeFile(path.join(categoriesDir, filename), buf);
    written++;
  }

  for (const p of products) {
    for (const img of p.images) {
      const filename = path.basename(img.url);
      const label = `${p.nameEn} ${img.position + 1}`;
      const buf = await generatePlaceholder(label);
      await fs.writeFile(path.join(productsDir, filename), buf);
      written++;
    }
  }

  console.log(`Wrote ${written} placeholder images.`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
