import { PutObjectCommand } from "@aws-sdk/client-s3";
import { spacesClient } from "../config/spaces";

export const uploadToSpaces = async (
  file: Express.Multer.File,
  folder: string
): Promise<string> => {

  //const fileName = `${folder}/${Date.now()}-${file.originalname}`;
  const cleanName = file.originalname.replace(/\s+/g, '-');
  const fileName = `${folder}/${Date.now()}-${cleanName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.CF_R2_BUCKET!,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
  });

  await spacesClient.send(command);

  // Return a backend-relative proxy path — served via GET /r2/* route.
  // This works without CF_R2_PUBLIC_URL or NEXT_PUBLIC_R2_PUBLIC_URL.
  return `/r2/${fileName}`;
};
