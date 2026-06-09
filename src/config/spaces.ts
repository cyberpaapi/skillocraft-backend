import { S3Client } from "@aws-sdk/client-s3";

// export const spacesClient = new S3Client({
//   endpoint: "https://sgp1.digitaloceanspaces.com",
//   region: "sgp1",
//   credentials: {
//     accessKeyId: process.env.DO_ACCESS_KEY!,
//     secretAccessKey: process.env.DO_SECRET_KEY!,
//   },
// });


export const spacesClient = new S3Client({
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: "auto",
  credentials: {
    accessKeyId: process.env.CF_R2_ACCESS_KEY!,
    secretAccessKey: process.env.CF_R2_SECRET_KEY!,
  },
});