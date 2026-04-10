const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

const SOURCE_IMAGE = process.argv[2] || "auroa_fl.jpg";
const OUTPUT_DIR = process.argv[3] || "tiles";
const TILE_SIZE = 256;
const PNG_COMPRESSION_LEVEL = 9;

async function removeDirIfExists(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function main() {
  const sourcePath = path.resolve(process.cwd(), SOURCE_IMAGE);
  const outputPath = path.resolve(process.cwd(), OUTPUT_DIR);
  const outputBaseName = path.basename(outputPath);
  const outputParent = path.dirname(outputPath);
  const dziPath = path.join(outputParent, `${outputBaseName}.dz`);

  const image = sharp(sourcePath, { limitInputPixels: false }).rotate();
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Could not determine source image dimensions.");
  }

  const maxZoom = Math.ceil(Math.log2(Math.max(metadata.width, metadata.height) / TILE_SIZE));

  await removeDirIfExists(outputPath);
  await fs.mkdir(outputParent, { recursive: true });

  await image
    .png({ compressionLevel: PNG_COMPRESSION_LEVEL })
    .tile({
      size: TILE_SIZE,
      overlap: 0,
      layout: "google"
    })
    .toFile(dziPath);

  await fs.writeFile(
    path.join(outputPath, "manifest.json"),
    JSON.stringify(
      {
        source: path.basename(sourcePath),
        width: metadata.width,
        height: metadata.height,
        tileSize: TILE_SIZE,
        format: "png",
        maxNativeZoom: maxZoom
      },
      null,
      2
    )
  );

  console.log(
    `Generated ${outputBaseName} from ${path.basename(sourcePath)} (${metadata.width}x${metadata.height}), maxNativeZoom=${maxZoom}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
