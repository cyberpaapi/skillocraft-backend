import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs-extra";

export const convertToHLS = async (inputPath: string, outputFolder: string) => {
  // Ensure output directory exists
  await fs.ensureDir(outputFolder);
  
  // Double-check directory exists
  const exists = await fs.pathExists(outputFolder);
  if (!exists) {
    throw new Error(`Failed to create output directory: ${outputFolder}`);
  }

  // Force garbage collection before starting
  if (global.gc) {
    global.gc();
  }

  return new Promise<void>((resolve, reject) => {
    const ffmpegProcess = ffmpeg(inputPath)
      .outputOptions([
        "-profile:v baseline",
        "-level 3.0",
        "-start_number 0",
        "-hls_time 10",
        "-hls_list_size 0",
        "-f hls",
        "-preset fast", // Use faster preset for less memory usage
        "-crf 23", // Reasonable quality
        "-movflags +faststart" // Optimize for streaming
      ])
      .output(path.join(outputFolder, "index.m3u8"))
      .on("end", () => {
        // Clean up ffmpeg process
        ffmpegProcess.kill('SIGKILL');
        resolve();
      })
      .on("error", (err) => {
        console.error("FFmpeg conversion error:", err);
        // Clean up ffmpeg process
        ffmpegProcess.kill('SIGKILL');
        reject(err);
      })
      .on("progress", (progress) => {
        // Optional: Log progress for debugging
        console.log(`Processing: ${progress.percent ? progress.percent.toFixed(2) : 0}% done`);
      });

    ffmpegProcess.run();
  });
};


