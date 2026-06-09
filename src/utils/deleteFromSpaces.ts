import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { spacesClient } from "../config/spaces";

export const deleteFromSpaces = async (fileUrl: string) => {
  try {
    const bucket = process.env.CF_R2_BUCKET!;

    // fileUrl may be a full URL or a plain key — strip to just the key
    const key = fileUrl.includes('r2.cloudflarestorage.com')
      ? fileUrl.split('/').slice(4).join('/')
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
