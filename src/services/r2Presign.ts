import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { spacesClient } from '../config/spaces';
import { Readable } from 'stream';
import fs from 'fs';

const BUCKET = () => process.env.CF_R2_BUCKET!;

export const getPresignedPutUrl = (key: string, contentType: string, expiresIn = 6 * 3600) =>
  getSignedUrl(
    spacesClient,
    new PutObjectCommand({ Bucket: BUCKET(), Key: key, ContentType: contentType }),
    { expiresIn }
  );

export const getPresignedGetUrl = (key: string, expiresIn = 5 * 60) =>
  getSignedUrl(
    spacesClient,
    new GetObjectCommand({ Bucket: BUCKET(), Key: key }),
    { expiresIn }
  );

// Download an R2 object to a local file path
export const downloadFromR2 = async (key: string, destPath: string): Promise<void> => {
  const { Body } = await spacesClient.send(
    new GetObjectCommand({ Bucket: BUCKET(), Key: key })
  );
  if (!Body) throw new Error(`R2 object not found: ${key}`);
  await new Promise<void>((resolve, reject) => {
    const writeStream = fs.createWriteStream(destPath);
    (Body as Readable).pipe(writeStream);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
};

export const deleteFromR2 = (key: string) =>
  spacesClient.send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));

// Read an R2 text object (e.g. m3u8 manifest) into a string
export const readTextFromR2 = async (key: string): Promise<string> => {
  const { Body } = await spacesClient.send(
    new GetObjectCommand({ Bucket: BUCKET(), Key: key })
  );
  if (!Body) throw new Error(`R2 object not found: ${key}`);
  const chunks: Buffer[] = [];
  for await (const chunk of Body as Readable) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
};
