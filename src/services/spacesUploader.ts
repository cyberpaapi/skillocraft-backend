import fs from "fs";
import path from "path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { spacesClient } from "../config/spaces";

export const uploadFolderToSpaces = async (
  folderPath: string,
  remoteFolder: string
) => {
  const files = fs.readdirSync(folderPath);

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const fileContent = fs.readFileSync(filePath);

    const contentType = file.endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : "video/MP2T";

    await spacesClient.send(
      new PutObjectCommand({
        Bucket: process.env.DO_BUCKET!,
        Key: `${remoteFolder}/${file}`,
        Body: fileContent,
        ContentType: contentType,
        ACL: "public-read",
      })
    );
  }
};
