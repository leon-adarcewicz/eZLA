import { Client, ResponseType } from "@microsoft/microsoft-graph-client";
import type { BaseItem, DriveItem } from "@microsoft/microsoft-graph-types";

export async function graphGetItem(client: Client, driveId: string, itemId: string) {
  console.info(`[ graphGetDocument ] getting document with GraphAPI`);
  return (await client
    .api(`drives/${driveId}/items/${itemId}/content`)
    .responseType(ResponseType.ARRAYBUFFER)
    .get()) as ArrayBuffer;
}

export async function graphListChildren(client: Client, driveId: string, parentId: string) {
  console.info(`[ graphListChildren ] getting children of folder with ID: ${parentId}`);
  const resp = await client.api(`/drives/${driveId}/items/${parentId}/children`).get();
  return resp.value as DriveItem[];
}

export async function graphMoveItem(
  client: Client,
  driveId: string,
  parentId: string,
  itemId: string,
  name?: string,
) {
  console.info(`[ graphMoveItem ] moving item with ID: ${itemId}`);
  const item: BaseItem = {
    parentReference: {
      id: parentId,
    },
    name: name || null,
  };
  return (await client.api(`/drives/${driveId}/items/${itemId}`).patch(item)) as DriveItem;
}

export async function getFileContent(client: Client, driveId: string, fileId: string) {
  console.log(`[ getFileContent ] getting content of file: ${fileId}`);
  return await graphGetItem(client, driveId, fileId);
}

export async function getFolderFiles(client: Client, driveId: string, folderId: string) {
  console.log(`[ getFolderFiles ] getting files from folder: ${folderId}`);
  const children = await graphListChildren(client, driveId, folderId);
  return children.filter((child) => child.file);
}

export async function moveFileToFolder(
  client: Client,
  driveId: string,
  movingFileId: string,
  targetFolderId: string,
  newName?: string,
) {
  console.log(`[ moveFileToFolder ] moving file ${movingFileId} to folder ${targetFolderId}`);
  return await graphMoveItem(client, driveId, targetFolderId, movingFileId, newName);
}
