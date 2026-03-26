import { returnConfirmedEnv } from "./utils";

type Config = {
  senderMail: string;
  hrMail: string;
  statsDateFormat: string;
  // AWS
  sqsUrl: string;
  region: string;
  dynamoEndpoint: string;
  // AZURE
  clientId: string;
  clientSecret: string;
  tenantId: string;
  // SHAREPOINT
  host: string;
  mainFolderName: string;
  dataFolderName: string;
  requestName: string;
  reportFolderName: string;
  reportBackupFolderName: string;
  checkSiteWebID: string;
  siteWebId: string;
  ezlaFileName: string;
  xpertisFileName: string;
  asistarFileName: string;
};

export const config: Config = {
  senderMail: returnConfirmedEnv("SENDER_MAIL"),
  hrMail: returnConfirmedEnv("HR_MAIL"),
  statsDateFormat: "YYYY-MM",
  // AWS
  sqsUrl: returnConfirmedEnv("SQS_URL"),
  region: returnConfirmedEnv("AWS_REGION"),
  dynamoEndpoint: returnConfirmedEnv("DYNAMO_ENDPOINT"),
  // AZURE
  clientId: returnConfirmedEnv("AZURE_APP_CLIENT_ID"),
  clientSecret: returnConfirmedEnv("AZURE_CLIENT_SECRET"),
  tenantId: returnConfirmedEnv("AZURE_TENANT_ID"),
  // SHAREPOINT
  host: returnConfirmedEnv("SHAREPOINT_HOST"),
  mainFolderName: returnConfirmedEnv("MAIN_FOLDER_NAME"),
  dataFolderName: returnConfirmedEnv("DATA_FOLDER_NAME"),
  requestName: returnConfirmedEnv("REQUEST_NAME"),
  reportFolderName: returnConfirmedEnv("REPORT_FOLDER_NAME"),
  reportBackupFolderName: returnConfirmedEnv("REPORT_BACKUP_FOLDER_NAME"),
  checkSiteWebID: returnConfirmedEnv("CHECK_SITE_WEB_ID"),
  siteWebId: returnConfirmedEnv("SHAREPOINT_SITE_WEB_ID"),
  ezlaFileName: "Zaswiadczenia lekarskie",
  xpertisFileName: "lista_pracownikow",
  asistarFileName: "vacationStructure",
};
