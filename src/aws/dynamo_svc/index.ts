import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  DynamoDBServiceException,
  GetItemCommand,
  PutItemCommand,
  type GetItemInput,
  type PutItemInput,
} from "@aws-sdk/client-dynamodb";
import { SickLeaveByTL } from "../../types";
import dayjs from "dayjs";
import { config } from "../../config";

export function isAwsDynamoError(obj: unknown): obj is DynamoDBServiceException {
  return (
    obj !== null &&
    obj !== undefined &&
    typeof obj === "object" &&
    (obj as DynamoDBServiceException).name !== undefined &&
    (obj as DynamoDBServiceException).message !== undefined
  );
}

export function InitializeAWSDynamoClient(): DynamoDBClient {
  console.log(`[ InitializeAWSDynamoClient ] creating DynamoDB client`);

  const client = new DynamoDBClient({
    region: config.region,
    apiVersion: "2012-08-10",
    endpoint: config.dynamoEndpoint, //! config can't be used here. To much secrets should be logged unnecessarily
  });

  return client;
}

export async function dbPushSickLeave(
  hash: string,
  sickLeave: SickLeaveByTL,
  client: DynamoDBClient,
  tableName: string,
) {
  console.log("[ pushSickLeave ] putting new record");

  const input: PutItemInput = {
    TableName: tableName,
    Item: {
      pk: { S: hash },
      data: {
        M: {
          firstName: { S: sickLeave.firstName },
          lastName: { S: sickLeave.lastName },
          mail: { S: sickLeave.mail },
          team: {
            L: sickLeave.team.map((el) => {
              return {
                M: {
                  firstName: { S: el.firstName },
                  lastName: { S: el.lastName },
                  mail: { S: el.mail },
                  fmno: { S: el.fmno },
                  startDate: { S: el.startDate },
                  endDate: { S: el.endDate },
                  pdmMail: { S: el.pdmMail },
                  pdmFirstName: { S: el.pdmFirstName },
                  pdmLastName: { S: el.pdmLastName },
                  caregiverLeave: { S: el.caregiverLeave },
                },
              };
            }),
          },
        },
      },
      ttl: { N: dayjs().add(1, "month").unix().toString() },
    },
    ConditionExpression: "attribute_not_exists(pk)",
  };

  try {
    const command = new PutItemCommand(input);
    await client.send(command);
  } catch (err) {
    if ((err as ConditionalCheckFailedException).name === "ConditionalCheckFailedException") {
      console.warn(`[ pushSickLeave ] Couldn't put record to DynamoDB - the record already exists`);
    } else {
      console.error(
        `[ pushSickLeave ] ERROR: Couldn't put record to DynamoDB - ${JSON.stringify(err)}`,
      );
      return new Error(JSON.stringify(err));
    }
  }
}

export async function getRecordByPk(pk: string, tableName: string, client: DynamoDBClient) {
  console.log(`[ getRecordByPk ] searching dynamo item by pk: ${pk}`);

  const input: GetItemInput = {
    TableName: tableName,
    Key: {
      pk: { S: pk },
    },
  };

  const command = new GetItemCommand(input);
  return client.send(command);
}

export async function putStats(
  tableName: string,
  id: string,
  requestName: string,
  client: DynamoDBClient,
  savedTime: string,
) {
  console.log("[ putStats ] preparing record");

  const date = dayjs();

  const input: PutItemInput = {
    TableName: tableName,
    Item: {
      PK: { S: id },
      SK: { S: requestName },
      GSIPK: { S: date.format(config.statsDateFormat) },
      GSISK: { S: requestName },
      Date: { S: date.toISOString() },
      Time: { S: savedTime },
    },
  };

  console.log("[ putStats ] putting record to Dynamo table");
  const command = new PutItemCommand(input);
  return client.send(command);
}
