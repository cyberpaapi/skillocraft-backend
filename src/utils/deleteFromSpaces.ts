import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { spacesClient } from "../config/spaces";

export const deleteFromSpaces = async (fileUrl: string) => {
  try {
    const bucket = process.env.CF_R2_BUCKET!;

    // fileUrl may be a full URL, a /r2/key proxy path, or a plain key
    const key = fileUrl.startsWith('http')
      ? new URL(fileUrl).pathname.replace(/^\/r2\//, '').replace(/^\//, '')
      : fileUrl.startsWith('/r2/')
        ? fileUrl.slice(4)
        : fileUrl;

    if (!key) return;

    await spacesClient.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  } catch (error) {
    console.error("Error deleting from Spaces:", error);
  }
};
