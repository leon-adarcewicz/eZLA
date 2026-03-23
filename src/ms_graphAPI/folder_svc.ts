import type { Client } from "@microsoft/microsoft-graph-client";
import type { DriveItem } from "@microsoft/microsoft-graph-types";
import { GraphApiError } from "./types";

export async function graphListChildren(client: Client, driveId: string, parentId: string) {
  console.info(`[ graphListChildren ] getting children of folder with ID: ${parentId}`);
  const resp = await client.api(`/drives/${driveId}/items/${parentId}/children`).get();
  return resp.value as DriveItem[];
}

export async function graphCreateFolder(
  client: Client,
  driveId: string,
  parentId: string,
  name: string,
) {
  console.info(`[ graphCreateFolder ] creating a child folder within folder with ID: ${parentId}`);
  const item: DriveItem = {
    name,
    folder: {},
  };
  return (await client
    .api(`/drives/${driveId}/items/${parentId}/children`)
    .post(item)) as DriveItem;
}

export async function getOrCreateFolderByName(
  client: Client,
  driveId: string,
  parentId: string,
  name: string,
) {
  console.log(`[ getOrCreateFolderByName ] getting folder: ${name}`);
  const children = await graphListChildren(client, driveId, parentId);
  const searchedChild = children.find((child) => child.name === name);

  if (searchedChild?.id) {
    return searchedChild as DriveItem & { id: string };
  } else {
    console.warn(`[ getOrCreateFolderByName ] couldn't find folder: ${name}. Creating new folder.`);
    const newFolder = await graphCreateFolder(client, driveId, parentId, name);
    if (!newFolder.id) {
      throw new GraphApiError("[ getOrCreateFolderByName ] Error: newFolder doesn't contain id");
    }
    return newFolder as DriveItem & { id: string };
  }
}
