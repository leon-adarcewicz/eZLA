import { ClientSecretCredential } from "@azure/identity";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { Client } from "@microsoft/microsoft-graph-client";
import type { Drive, Site } from "@microsoft/microsoft-graph-types";
import { GraphApiError } from "./types";
import { config } from "../config";

export async function getDriveId(client: Client, host: string, siteId: string) {
  console.info(`[ getDriveId ] getting GraphAPI ID for site: ${siteId}`);
  const siteInfo = (await client.api(`/sites/${host}:/sites/${siteId}`).get()) as Site;

  if (!siteInfo.id) {
    throw new GraphApiError("graphGetSiteInfo didn't return site ID");
  }

  console.info(`[ getDriveId ] getting drive for site: ${siteId}`);
  const drive = (await client.api(`/sites/${siteId}/drive`).get()) as Drive;

  if (!drive.id) {
    throw new GraphApiError("graphGetDrive didn't return drive ID");
  }
  return drive.id;
}

export async function getGraphClient() {
  console.log(`[ getGraphClient ] getting a graph client`);

  const credential = new ClientSecretCredential(
    config.tenantId,
    config.clientId,
    config.clientSecret,
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    // The client credentials flow requires that you request the
    // /.default scope, and pre-configure your permissions on the
    // app registration in Azure. An administrator must grant consent
    // to those permissions beforehand.
    scopes: ["https://graph.microsoft.com/.default"],
  });

  return Client.initWithMiddleware({ authProvider });
}
