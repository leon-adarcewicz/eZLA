import { dbPushSickLeave, InitializeAWSDynamoClient, isAwsDynamoError } from "./aws/dynamo_svc";
import { SQSEvent } from "aws-lambda";
import { SickLeaveByTL } from "./types";
import { createHash } from "node:crypto";
import { returnConfirmedEnv } from "./utils";

export async function pushMsgToDynamo(ev: SQSEvent) {
  console.log("[ pushMsgToDynamo ] Got messages from SQS. Preparing to push to DynamoDB");

  const dbClient = InitializeAWSDynamoClient();
  const tableName = returnConfirmedEnv("DYNAMO_TABLE");

  console.log("[ pushMsgToDynamo ] putting records to DynamoDB");
  const dynamoPutPromises = ev.Records.map((msg) => {
    console.log(`Got message: ${JSON.stringify(msg)}`);
    const sickLeave: SickLeaveByTL = SickLeaveByTL.parse(JSON.parse(msg.body));
    const hashedObj = createHash("sha1").update(JSON.stringify(sickLeave)).digest("hex");

    return dbPushSickLeave(hashedObj, sickLeave, dbClient, tableName);
  });

  const allResults = await Promise.allSettled(dynamoPutPromises);

  const errors = allResults.filter((result) => result.status === "rejected");

  // collect all errors and throw single error message with unique errors only
  // this should improve readability
  if (errors.length > 0) {
    console.warn(`[ pushMsgToDynamo ] got ${errors.length} errors. Preparing error message`);
    const allErrorsStringify = errors.map((error) => {
      const reason = JSON.parse(error.reason.message);

      if (isAwsDynamoError(reason)) {
        const awsErr = {
          name: reason.name,
          message: reason.message,
        };

        return JSON.stringify(awsErr);
      } else {
        return JSON.stringify(reason);
      }
    });

    const uniqErrors = Array.from(new Set(allErrorsStringify));

    throw new Error(uniqErrors.toString());
  }

  console.log("[ pushMsgToDynamo ] pushed all messages");
}
