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
  endpoint: `https://${process.env.DO_REGION || "sgp1"}.${process.env.DO_SPACES_ENDPOINT || "digitaloceanspaces.com"}`,
  region: process.env.DO_REGION || "sgp1",
  credentials: {
    accessKeyId: process.env.DO_ACCESS_KEY!,
    secretAccessKey: process.env.DO_SECRET_KEY!,
  },
});