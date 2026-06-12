import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { spacesClient } from "../config/spaces";

export const deleteFromSpaces = async (fileUrl: string) => {
  try {
    const bucket = process.env.CF_R2_BUCKET!;

    // fileUrl may be a full URL (any domain) or a plain key — extract just the path key
    const key = fileUrl.startsWith('http')
      ? new URL(fileUrl).pathname.replace(/^\//, '')
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
