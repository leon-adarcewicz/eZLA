import { returnConfirmedEnv } from "./utils";

type Config = {
  senderMail: string;
  hrMail: string;
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
  senderMail: returnConfirmedEnv(process.env.SENDER_MAIL, "SENDER_MAIL"),
  hrMail: returnConfirmedEnv(process.env.HR_MAIL, "HR_MAIL"),
  // AWS
  sqsUrl: returnConfirmedEnv(process.env.SQS_URL, "SQS_URL"),
  region: returnConfirmedEnv(process.env.AWS_REGION, "AWS_REGION"),
  dynamoEndpoint: returnConfirmedEnv(process.env.AWS_DYNAMO_ENDPOINT, "AWS_DYNAMO_ENDPOINT"),
  // AZURE
  clientId: returnConfirmedEnv(process.env.AZURE_APP_CLIENT_ID, "AZURE_APP_CLIENT_ID"),
  clientSecret: returnConfirmedEnv(process.env.AZURE_CLIENT_SECRET, "AZURE_CLIENT_SECRET"),
  tenantId: returnConfirmedEnv(process.env.AZURE_TENANT_ID, "AZURE_TENANT_ID"),
  // SHAREPOINT
  host: returnConfirmedEnv(process.env.SHAREPOINT_HOST, "SHAREPOINT_HOST"),
  mainFolderName: returnConfirmedEnv(process.env.MAIN_FOLDER_NAME, "MAIN_FOLDER_NAME"),
  dataFolderName: returnConfirmedEnv(process.env.DATA_FOLDER_NAME, "DATA_FOLDER_NAME"),
  requestName: returnConfirmedEnv(process.env.REQUEST_NAME, "REQUEST_NAME"),
  reportFolderName: returnConfirmedEnv(process.env.REPORT_FOLDER_NAME, "REPORT_FOLDER_NAME"),
  reportBackupFolderName: returnConfirmedEnv(
    process.env.REPORT_BACKUP_FOLDER_NAME,
    "REPORT_BACKUP_FOLDER_NAME",
  ),
  checkSiteWebID: returnConfirmedEnv(process.env.CHECK_SITE_WEB_ID, "CHECK_SITE_WEB_ID"),
  siteWebId: returnConfirmedEnv(process.env.SHAREPOINT_SITE_WEB_ID, "SHAREPOINT_SITE_WEB_ID"),
  ezlaFileName: "Zaswiadczenia lekarskie",
  xpertisFileName: "lista_pracownikow",
  asistarFileName: "vacationStructure",
};
