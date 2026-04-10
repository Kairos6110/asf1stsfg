const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

const TILES_DIR = process.argv[2] || "tiles";
const QUALITY = Number(process.argv[3] || 88);
const CONCURRENCY = Number(process.argv[4] || 6);

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function runPool(items, worker) {
  let index = 0;

  async function runNext() {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, runNext)
  );
}

async function convertTile(filePath) {
  const outputPath = filePath.replace(/\.png$/i, ".webp");
  await sharp(filePath)
    .webp({
      quality: QUALITY,
      effort: 4,
      smartSubsample: true
    })
    .toFile(outputPath);
  await fs.unlink(filePath);
}

async function updateManifest(tilesDir) {
  const manifestPath = path.join(tilesDir, "manifest.json");
  const rawManifest = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(rawManifest);
  manifest.format = "webp";
  manifest.quality = QUALITY;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const tilesDir = path.resolve(process.cwd(), TILES_DIR);
  const files = await walk(tilesDir);

  if (!files.length) {
    console.log("No PNG tiles found.");
    return;
  }

  let converted = 0;
  await runPool(files, async (filePath) => {
    await convertTile(filePath);
    converted += 1;
    if (converted % 250 === 0 || converted === files.length) {
      console.log(`Converted ${converted}/${files.length}`);
    }
  });

  await updateManifest(tilesDir);
  console.log(`Converted ${files.length} PNG tiles to WebP at quality ${QUALITY}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
