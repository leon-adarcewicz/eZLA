import { getGraphClient } from "./ms_graphAPI";
import { generateTable, returnConfirmedEnv } from "./utils";
import { getRecordByPk, InitializeAWSDynamoClient, putStats } from "./aws/dynamo_svc";
import { SickLeaveByTL } from "./types";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { GraphEmail } from "./ms_graphAPI/types";
import { sendEmail } from "./ms_graphAPI/email_svc";
import { DynamoDBStreamEvent } from "aws-lambda";

const SAVED_TIME = "5 minutes";
const REQUEST_NAME = "eZLA";

export async function sendMsgToTl(ev: DynamoDBStreamEvent) {
  console.log(`[ sendMsgToTl ] Sending message to TL`);
  console.log(ev);

  if (ev.Records.length !== 1)
    throw new Error(
      `[ sendMsgToTl ] expected to receive 1 DynamoDb records, but got ${ev.Records.length}`,
    );

  const streamRecord = ev.Records.at(0);

  //  finish Lambda execution if the event is not INSERT new item
  if (streamRecord?.eventName !== "INSERT") {
    console.warn(`[ sendMsgToTl ] It's not the INSERT event. Finishing the function`);
    return "OK";
  }

  const environment = returnConfirmedEnv("ENV");
  const recordsTable = returnConfirmedEnv("RECORDS_TABLE_NAME");
  const statsTable = returnConfirmedEnv("STATS_TABLE_NAME");
  const hrMail = returnConfirmedEnv("HR_MAIL");
  const senderMail = returnConfirmedEnv("SENDER_MAIL");

  const graphClient = await getGraphClient();
  const dbClient = InitializeAWSDynamoClient();

  const pk = streamRecord.dynamodb?.Keys?.pk?.S;
  if (!pk) throw new Error("[ sendMsgToTl ] couldn't get PK from DynamoDB stream record");

  console.log("[ sendMsgToTl ] pulling record from DynamoDB");
  const dynamoRecord = await getRecordByPk(pk, recordsTable, dbClient);

  console.log("[ sendMsgToTl ] extracting SickLeaves and sending messages");
  if (!dynamoRecord.Item?.data) throw new Error("[ sendMsgToTl ] no data found in DynamoDB record");
  const sl = SickLeaveByTL.parse(unmarshall(dynamoRecord.Item?.data));

  const email: GraphEmail = {
    recipients: environment === "prod" ? [sl.mail, hrMail] : [senderMail],
    subject: "eZLA - team sick leaves",
    bodyHtml: `Dear ${sl.firstName},<br /><br />Please find the list of your team members sick leaves:<br /><br />${generateTable(sl.team)}<br/><br />Best regards,<br />Local HR Team`,
  };

  await sendEmail(graphClient, senderMail, email);
  console.log("[ sendMsgToTl ] all messages sent successfully");

  //* SAVE statistics
  await putStats(statsTable, pk, REQUEST_NAME, dbClient, SAVED_TIME);
  console.log("[ sendMsgToTl ] stats pushed");
}
