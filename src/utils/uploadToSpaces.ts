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
    Bucket: process.env.DO_BUCKET!, // skillo-s3
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: "public-read", // remove if bucket is private
  });

  await spacesClient.send(command);

  return `${process.env.DO_BUCKET_URL || `https://${process.env.DO_BUCKET}.${process.env.DO_REGION || "sgp1"}.${process.env.DO_SPACES_ENDPOINT || "digitaloceanspaces.com"}`}/${fileName}`;
};
