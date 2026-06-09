import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { spacesClient } from "../config/spaces";

export const getSignedHlsUrl = async (key: string) => {
  const command = new GetObjectCommand({
    Bucket: process.env.CF_R2_BUCKET!,
    Key: key,
  });

  return getSignedUrl(spacesClient, command, { expiresIn: 5 * 60 }); // 5 minutes
};
