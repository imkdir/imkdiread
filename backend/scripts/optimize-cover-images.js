const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { getPublicPath } = require("../app/utils/paths");

function parseArgs(argv) {
  const options = {
    dir: getPublicPath("imgs", "covers"),
    width: 690,
    height: 1048,
    limit: Infinity,
    force: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dir" && argv[index + 1]) {
      options.dir = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--width" && argv[index + 1]) {
      options.width = Number.parseInt(argv[index + 1], 10) || options.width;
      index += 1;
      continue;
    }

    if (arg === "--height" && argv[index + 1]) {
      options.height = Number.parseInt(argv[index + 1], 10) || options.height;
      index += 1;
      continue;
    }

    if (arg === "--limit" && argv[index + 1]) {
      options.limit = Number.parseInt(argv[index + 1], 10) || options.limit;
      index += 1;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function findAvailableEncoder() {
  const candidates = [
    {
      name: "magick",
      command: "magick",
      versionArgs: ["-version"],
      buildArgs: ({ inputPath, outputPath, width, height }) => [
        inputPath,
        "-resize",
        `${width}x${height}`,
        "-background",
        "none",
        "-gravity",
        "center",
        "-extent",
        `${width}x${height}`,
        "-strip",
        outputPath,
      ],
    },
    {
      name: "convert",
      command: "convert",
      versionArgs: ["-version"],
      buildArgs: ({ inputPath, outputPath, width, height }) => [
        inputPath,
        "-resize",
        `${width}x${height}`,
        "-background",
        "none",
        "-gravity",
        "center",
        "-extent",
        `${width}x${height}`,
        "-strip",
        outputPath,
      ],
    },
    {
      name: "ffmpeg",
      command: "ffmpeg",
      versionArgs: ["-version"],
      buildArgs: ({ inputPath, outputPath, width, height }) => [
        "-y",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-vf",
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=white@0,format=rgba`,
        "-c:v",
        "png",
        "-frames:v",
        "1",
        outputPath,
      ],
    },
  ];

  for (const candidate of candidates) {
    const probe = spawnSync(candidate.command, candidate.versionArgs, {
      stdio: "ignore",
    });

    if (probe.status === 0 || probe.status === 1) {
      return candidate;
    }
  }

  return null;
}

function listCoverFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((name) => path.extname(name).toLowerCase() === ".png")
    .sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
    );
}

function optimizeFile(encoder, inputPath, outputPath, options) {
  const result = spawnSync(
    encoder.command,
    encoder.buildArgs({
      inputPath,
      outputPath,
      width: options.width,
      height: options.height,
    }),
    { stdio: "pipe" },
  );

  if (result.status !== 0) {
    throw new Error(
      result.stderr?.toString("utf8").trim() ||
        `Encoder ${encoder.name} failed for ${path.basename(inputPath)}.`,
    );
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const encoder = findAvailableEncoder();

  if (!encoder) {
    console.error(
      "No supported PNG encoder found. Install ffmpeg or ImageMagick (magick/convert).",
    );
    process.exitCode = 1;
    return;
  }

  const inputFiles = listCoverFiles(options.dir).slice(0, options.limit);

  if (!inputFiles.length) {
    console.log(`No PNG cover files found in ${options.dir}.`);
    return;
  }

  let optimizedCount = 0;
  let skippedCount = 0;
  let savedBytes = 0;

  console.log(
    `Using ${encoder.name} on ${inputFiles.length} PNG cover file(s) in ${options.dir}, targeting ${options.width}x${options.height}.`,
  );

  for (const filename of inputFiles) {
    const inputPath = path.join(options.dir, filename);
    const sourceStats = fs.statSync(inputPath);

    if (options.dryRun) {
      skippedCount += 1;
      console.log(`dry-run ${filename}`);
      continue;
    }

    const tempPath = `${inputPath}.tmp.png`;

    try {
      optimizeFile(encoder, inputPath, tempPath, options);

      const targetStats = fs.statSync(tempPath);
      if (targetStats.size >= sourceStats.size && !options.force) {
        fs.unlinkSync(tempPath);
        skippedCount += 1;
        console.log(
          `skip ${filename} (${formatBytes(targetStats.size)} >= ${formatBytes(sourceStats.size)})`,
        );
        continue;
      }

      fs.renameSync(tempPath, inputPath);
      optimizedCount += 1;
      savedBytes += Math.max(0, sourceStats.size - targetStats.size);
      console.log(
        `ok   ${filename} (${formatBytes(sourceStats.size)} -> ${formatBytes(targetStats.size)})`,
      );
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      skippedCount += 1;
      console.warn(
        `fail ${filename}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(
    `Done. Optimized ${optimizedCount}, skipped ${skippedCount}, estimated savings ${formatBytes(savedBytes)}.`,
  );
}

main();
