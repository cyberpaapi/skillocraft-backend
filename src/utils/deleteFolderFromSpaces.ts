import { ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { spacesClient } from "../config/spaces";

export const deleteFolderFromSpaces = async (folderKey: string) => {
  const bucket = process.env.CF_R2_BUCKET!;

  const listCommand = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: folderKey,
  });

  const listedObjects = await spacesClient.send(listCommand);

  if (!listedObjects.Contents?.length) return;

  await spacesClient.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: listedObjects.Contents.map((obj) => ({
          Key: obj.Key!,
        })),
      },
    })
  );
};
