import * as dotenv from "dotenv";
dotenv.config();
import CsvToJson from "csvtojson";
import XLSX from "xlsx";
import {
  tryCombineRecords,
  groupByPdmAndSortByLastName,
  generateTable,
  generateEzlaFileName,
  generateHewHireTable,
  checkIfNoRestrictedChars,
  buildErrorEmailBody,
} from "./utils";
import { pushSickLeavesToSqs } from "./aws/sqs_svc";
import { asistar, ezla, xpertis } from "./types";
import { type GraphEmail } from "./ms_graphAPI/types";
import { getFileContent, getFolderFiles, moveFileToFolder } from "./ms_graphAPI/file_svc";
import { getDriveId, getGraphClient } from "./ms_graphAPI";
import { getOrCreateFolderByName } from "./ms_graphAPI/folder_svc";
import { config } from "./config";
import { sendEmail } from "./ms_graphAPI/email_svc";

export async function createSickLeaveRecords() {
  console.log("[ createSickLeaveRecords ] function has been called");

  const client = await getGraphClient();
  const driveId = await getDriveId(client, config.host, config.siteWebId);
  const oneStopFolder = await getOrCreateFolderByName(
    client,
    driveId,
    "root",
    config.mainFolderName,
  );
  const reportFolder = await getOrCreateFolderByName(
    client,
    driveId,
    oneStopFolder.id,
    config.reportFolderName,
  );
  const reportRequestFolder = await getOrCreateFolderByName(
    client,
    driveId,
    reportFolder.id,
    config.requestName,
  );
  const reportBackupFolder = await getOrCreateFolderByName(
    client,
    driveId,
    reportRequestFolder.id,
    config.reportBackupFolderName,
  );
  const dataFolder = await getOrCreateFolderByName(
    client,
    driveId,
    oneStopFolder.id,
    config.dataFolderName,
  );
  const dataRequestFolder = await getOrCreateFolderByName(
    client,
    driveId,
    dataFolder.id,
    config.requestName,
  );
  const folderChildren = await getFolderFiles(client, driveId, dataRequestFolder.id);

  //* GET Xpertis file and check structure
  const ezlaFile = folderChildren.find((x) => x.name?.includes(config.ezlaFileName));
  if (!ezlaFile) {
    console.warn("[ createSickLeaveRecords ] No data to process. Closing process");
    return "No data to process. Closing process";
  }
  if (!ezlaFile.name || !ezlaFile.id) {
    throw new Error("[ createSickLeaveRecords ] Found ezla file with missing name or ID");
  }
  const ezlaBuffer = await getFileContent(client, driveId, ezlaFile.id);
  const csvString = Buffer.from(ezlaBuffer).toString();
  const objFromCSV = await CsvToJson({ delimiter: "auto" }).fromString(csvString);

  const ezlaResults = objFromCSV.map((el) => ezla.safeParse(el));
  const ezlaRecords = ezlaResults.filter((res) => res.success);

  if (ezlaRecords.length !== objFromCSV.length) {
    console.error(
      `[ createSickLeaveRecords ] Found records with wrong structure. Sending email to HR team with details`,
    );
    const email: GraphEmail = {
      recipients: [config.hrMail],
      subject: "eZLA - wrong ezla file structure",
      bodyHtml: buildErrorEmailBody("ezla"),
    };
    await sendEmail(client, config.senderMail, email);
    throw new Error(
      "[ returnEzlaObj ] Couldn't find one of rows: PESEL | Status zaświadczenia | Data początku niezdolności | Data końca niezdolności | Seria i numer paszportu | Data urodzenia osoby pod opieką",
    );
  }

  //* GET Xpertis file and check structure
  const xpertisFile = folderChildren.find((x) => x.name?.includes(config.xpertisFileName));
  if (!xpertisFile) {
    throw new Error("[ createSickLeaveRecords ] Couldn't find Xpertis file in the folder");
  }

  const xpertisBuffer = await getFileContent(client, driveId, xpertisFile.id!);
  const xpertisXlsx = XLSX.read(xpertisBuffer, { type: "buffer" });
  const xpertisSheetNames = xpertisXlsx.SheetNames;

  if (xpertisSheetNames.length !== 1) {
    throw new Error("[ createSickLeaveRecords ] Xpertis file contain more that 1 sheet");
  }

  const xpertisSheetName = xpertisSheetNames.find(Boolean)!; // excel always contains at least 1 sheet
  console.log(`[ createSickLeaveRecords ] looking for data from ${xpertisSheetName} sheet`);
  const xpertisSheet = xpertisXlsx.Sheets[xpertisSheetName];

  if (!xpertisSheet) {
    throw new Error(
      `[ createSickLeaveRecords ] Couldn't find sheet: ${xpertisSheet} in Xpertis file`,
    );
  }

  const xpertisCsvString = XLSX.utils.sheet_to_csv(xpertisSheet);

  const xpertisRawObj = await CsvToJson({ delimiter: "auto" }).fromString(xpertisCsvString);
  const xpertisResults = xpertisRawObj.map((el) => xpertis.safeParse(el));
  const xpertisRecords = xpertisResults.filter((res) => res.success);

  if (xpertisRecords.length !== xpertisRawObj.length) {
    const email: GraphEmail = {
      recipients: [config.hrMail],
      subject: "eZLA - wrong ezla file structure",
      bodyHtml: buildErrorEmailBody("xpertis"),
    };
    await sendEmail(client, config.senderMail, email);
    throw new Error(
      "[ createSickLeaveRecords ] Xpertis file contain rows with wrong structure. Please check the file and try again",
    );
  }

  //* GET Asistar file and check the structure
  const asistarFile = folderChildren.find((x) => x.name?.includes(config.asistarFileName));
  if (!asistarFile) {
    throw new Error("[ createSickLeaveRecords ] Couldn't find Asistar file in the folder");
  }

  const asistarBuffer = await getFileContent(client, driveId, asistarFile.id!);
  const asistarXlsx = XLSX.read(asistarBuffer, { type: "buffer" });
  const asistarSheetNames = asistarXlsx.SheetNames;

  if (asistarSheetNames.length !== 1)
    throw new Error("[ createSickLeaveRecords ] Asistar file contain more that 1 sheet");

  const asistarSheetName = asistarSheetNames.find(Boolean)!; // excel always contains at least 1 sheet
  console.log(`[ createSickLeaveRecords ] looking for data from ${asistarSheetName} sheet`);
  const asistarSheet = asistarXlsx.Sheets[asistarSheetName];

  if (!asistarSheet) {
    throw new Error(
      `[ createSickLeaveRecords ] Couldn't find sheet: ${asistarSheet} in Asistar file`,
    );
  }

  const asistarCsvString = XLSX.utils.sheet_to_csv(asistarSheet);

  const asistarRawObj = await CsvToJson({ delimiter: "auto" }).fromString(asistarCsvString);
  const asistarResults = asistarRawObj.map((el) => asistar.safeParse(el));
  const asistarRecords = asistarResults.filter((res) => res.success);

  if (asistarRecords.length !== asistarRawObj.length) {
    const email: GraphEmail = {
      recipients: [config.hrMail],
      subject: "eZLA - wrong ezla file structure",
      bodyHtml: buildErrorEmailBody("asistar"),
    };
    await sendEmail(client, config.senderMail, email);
    throw new Error(
      "[ returnAsistarObjs ] Asistar file contain rows with wrong structure. Please check the file and try again",
    );
  }

  //* create SickLeave records
  console.log(`[ createSickLeaveRecords ] creating SickLeave records`);
  const { fullRecords, incompleteRecords, newHires } = tryCombineRecords(
    ezlaRecords.map((el) => el.data),
    xpertisRecords.map((el) => el.data),
    asistarRecords.map((el) => el.data),
  );

  //* inform HR about incomplete records
  if (incompleteRecords.length > 0 || newHires.length > 0) {
    console.log(
      `[ createSickLeaveRecords ] Found incomplete records - preparing email to HR team with appropriate information`,
    );

    const email: GraphEmail = {
      recipients:
        config.siteWebId === config.checkSiteWebID ? [config.senderMail] : [config.hrMail],
      subject: "eZLA - incomplete records",
      bodyHtml: `Dear team,
            <br /><br />
${incompleteRecords.length > 0 && "Please check the records mentioned below and update data or process theme manually:<br /><br />" + generateTable(incompleteRecords) + "<br /><br />"}
${newHires.length > 0 && "Please update Xpertis file. PUE report contain record/s with pesel/passport ID that we couldn't find into Xpertis file:<br /><br />" + generateHewHireTable(newHires) + "<br /><br />"}

Best regards,<br />
MGS-CI team`,
    };

    await sendEmail(client, config.senderMail, email);
  }

  //* SEND SickLeaves to SQS
  const groupedAndSorted = groupByPdmAndSortByLastName(fullRecords);

  console.log(`[ createSickLeaveRecords ] sending sick leaves to SQS`);
  await pushSickLeavesToSqs(groupedAndSorted, config.sqsUrl);

  //* SEND eZLA file to processed folder
  console.log(`[ createSickLeaveRecords ] moving eZLA files to the Processed folder`);
  const fileName = generateEzlaFileName(ezlaFile.name);
  await moveFileToFolder(
    client,
    driveId,
    ezlaFile.id,
    reportBackupFolder.id,
    checkIfNoRestrictedChars(fileName),
  );

  console.log("[ createSickLeaveRecords ] files has been moved");
}

// export async function sendMsgToTl (ev: DynamoDBStreamEvent) {
//     console.log(`[ sendMsgToTl ] Sending message to TL`);
//     console.log(ev)

//     if(ev.Records.length !== 1) throw new Error(`[ sendMsgToTl ] expected to receive 1 DynamoDb records, but got ${ev.Records.length}`)

//     const streamRecord = ev.Records[0]
//     //  finish Lambda execution if the event is not INSERT new item
//     if(streamRecord.eventName !== "INSERT") {
//         console.warn(`[ sendMsgToTl ] It's not the INSERT event. Finishing the function`);
//         return "OK"
//     }

//     const environment = process.env.ENV!
//     const graphClient = await getGraphClientSvc();

//     const dbClient = InitializeAWSDynamoClient();

//     console.log("[ sendMsgToTl ] pulling record from DynamoDB");
//     const arn = streamRecord.eventSourceARN!
//     const tableName = returnTableName(arn)
//     const pk = streamRecord.dynamodb?.Keys?.pk.S!

//     const dynamoRecord = await getRecordByPk(pk, tableName, dbClient)

//     console.log("[ sendMsgToTl ] extracting SickLeaves and sending messages");
//     const sl = SickLeaveByTL.parse(unmarshall(dynamoRecord.Item!).data)

//     const email: GraphEmail = {
//         recipients: environment === "prod" ? [sl.mail,HR_MAIL] : [ONE_STOP_MAIL],
//         subject: "eZLA - team sick leaves",
//         bodyHtml: `Dear ${sl.firstName},<br /><br />Please find the list of your team members sick leaves:<br /><br />${generateTable(sl.team)}<br/><br />Best regards,<br />Local HR Team`
//     }

//     await sendEmail(graphClient, ONE_STOP_MAIL, email)
//     console.log("[ sendMsgToTl ] all messages sent successfully");

//     //* SAVE statistics
//     const statsTable = process.env.STATS_TABLE_NAME!;
//     const requestName = "eZLA";

//     await putStats(statsTable, pk, requestName, dbClient, SAVED_TIME)
//     console.log("[ sendMsgToTl ] stats pushed")
// }
