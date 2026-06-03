import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { spacesClient } from "../config/spaces";

export const deleteFromSpaces = async (fileUrl: string) => {
  try {
    const bucket = process.env.DO_BUCKET!;

    // Extract key from full URL
    const key = fileUrl.split(`/${bucket}.sgp1.digitaloceanspaces.com/`)[1];

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
