import { DynamoDBStreamEvent } from "aws-lambda";
import { sendMsgToTl } from "../lambda_final";
import { getGraphClient } from "../ms_graphAPI";
import { generateTable, returnConfirmedEnv } from "../utils";
import { getRecordByPk, InitializeAWSDynamoClient, putStats } from "../aws/dynamo_svc";
import { SickLeaveByTL } from "../types";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { sendEmail } from "../ms_graphAPI/email_svc";

jest.mock("../ms_graphAPI", () => ({
  getGraphClient: jest.fn(),
}));

jest.mock("../utils", () => ({
  generateTable: jest.fn(),
  returnConfirmedEnv: jest.fn(),
}));

jest.mock("../aws/dynamo_svc", () => ({
  getRecordByPk: jest.fn(),
  InitializeAWSDynamoClient: jest.fn(),
  putStats: jest.fn(),
}));

jest.mock("../types", () => ({
  SickLeaveByTL: {
    parse: jest.fn(),
  },
}));

jest.mock("@aws-sdk/util-dynamodb", () => ({
  unmarshall: jest.fn(),
}));

jest.mock("../ms_graphAPI/email_svc", () => ({
  sendEmail: jest.fn(),
}));

const mockedGetGraphClient = getGraphClient as jest.MockedFunction<typeof getGraphClient>;
const mockedGenerateTable = generateTable as jest.MockedFunction<typeof generateTable>;
const mockedReturnConfirmedEnv = returnConfirmedEnv as jest.MockedFunction<
  typeof returnConfirmedEnv
>;
const mockedGetRecordByPk = getRecordByPk as jest.MockedFunction<typeof getRecordByPk>;
const mockedInitializeAWSDynamoClient = InitializeAWSDynamoClient as jest.MockedFunction<
  typeof InitializeAWSDynamoClient
>;
const mockedPutStats = putStats as jest.MockedFunction<typeof putStats>;
const mockedSickLeaveByTLParse = SickLeaveByTL.parse as jest.MockedFunction<
  typeof SickLeaveByTL.parse
>;
const mockedUnmarshall = unmarshall as jest.MockedFunction<typeof unmarshall>;
const mockedSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

describe("sendMsgToTl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const sampleSL = {
    firstName: "Alice",
    lastName: "Smith",
    mail: "alice.smith@example.com",
    team: [
      {
        fmno: "123",
        firstName: "Bob",
        lastName: "Jones",
        mail: "bob.jones@example.com",
        startDate: "2024-01-01",
        endDate: "2024-01-10",
        pdmMail: "pdm@example.com",
        pdmFirstName: "Pat",
        pdmLastName: "Manager",
        caregiverLeave: "false",
      },
    ],
  };

  it("should send message successfully when all operations resolve", async () => {
    const fakeGraphClient = { send: jest.fn() };
    const fakeDbClient = { send: jest.fn() };
    mockedGetGraphClient.mockResolvedValue(fakeGraphClient as any);
    mockedInitializeAWSDynamoClient.mockReturnValue(fakeDbClient as any);
    mockedReturnConfirmedEnv.mockImplementation((key: string) => {
      const envs: Record<string, string> = {
        ENV: "prod",
        RECORDS_TABLE_NAME: "records",
        STATS_TABLE_NAME: "stats",
        HR_MAIL: "hr@example.com",
        SENDER_MAIL: "sender@example.com",
      };
      return envs[key] || "";
    });
    mockedGetRecordByPk.mockResolvedValue({ Item: { data: "marshalledData" } } as any);
    mockedUnmarshall.mockReturnValue(sampleSL);
    mockedSickLeaveByTLParse.mockReturnValue(sampleSL);
    mockedGenerateTable.mockReturnValue("<table>team data</table>");
    mockedSendEmail.mockResolvedValue(undefined);
    mockedPutStats.mockResolvedValue({} as any);

    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "INSERT",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            Keys: {
              pk: { S: "test-pk" },
            },
            NewImage: {},
            StreamViewType: "NEW_AND_OLD_IMAGES",
          },
          eventSourceARN: "arn",
        },
      ],
    };

    await expect(sendMsgToTl(event)).resolves.toBeUndefined();

    expect(mockedGetGraphClient).toHaveBeenCalledTimes(1);
    expect(mockedInitializeAWSDynamoClient).toHaveBeenCalledTimes(1);
    expect(mockedReturnConfirmedEnv).toHaveBeenCalledTimes(5);
    expect(mockedGetRecordByPk).toHaveBeenCalledWith("test-pk", "records", fakeDbClient);
    expect(mockedUnmarshall).toHaveBeenCalledWith("marshalledData");
    expect(mockedSickLeaveByTLParse).toHaveBeenCalledWith(sampleSL);
    expect(mockedGenerateTable).toHaveBeenCalledWith(sampleSL.team);
    expect(mockedSendEmail).toHaveBeenCalledWith(
      fakeGraphClient,
      "sender@example.com",
      expect.objectContaining({
        recipients: ["alice.smith@example.com", "hr@example.com"],
        subject: "eZLA - team sick leaves",
        bodyHtml: expect.stringContaining("Dear Alice"),
      }),
    );
    expect(mockedPutStats).toHaveBeenCalledWith(
      "stats",
      "test-pk",
      "eZLA",
      fakeDbClient,
      "5 minutes",
    );
  });

  it("should throw error when more than one record", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "INSERT",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            Keys: {
              pk: { S: "test-pk" },
            },
            NewImage: {},
            StreamViewType: "NEW_AND_OLD_IMAGES",
          },
          eventSourceARN: "arn",
        },
        {
          eventID: "2",
          eventName: "INSERT",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            Keys: {
              pk: { S: "test-pk2" },
            },
            NewImage: {},
            StreamViewType: "NEW_AND_OLD_IMAGES",
          },
          eventSourceARN: "arn",
        },
      ],
    };

    await expect(sendMsgToTl(event)).rejects.toThrow(
      "[ sendMsgToTl ] expected to receive 1 DynamoDb records, but got 2",
    );
  });

  it("should return OK when event is not INSERT", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "MODIFY",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            Keys: {
              pk: { S: "test-pk" },
            },
            NewImage: {},
            StreamViewType: "NEW_AND_OLD_IMAGES",
          },
          eventSourceARN: "arn",
        },
      ],
    };

    const result = await sendMsgToTl(event);
    expect(result).toBe("OK");
  });

  it("should throw error when PK is missing", async () => {
    mockedReturnConfirmedEnv.mockReturnValue("test");

    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "INSERT",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            Keys: {},
            NewImage: {},
            StreamViewType: "NEW_AND_OLD_IMAGES",
          },
          eventSourceARN: "arn",
        },
      ],
    };

    await expect(sendMsgToTl(event)).rejects.toThrow(
      "[ sendMsgToTl ] couldn't get PK from DynamoDB stream record",
    );
  });

  it("should throw error when no data in DynamoDB record", async () => {
    mockedReturnConfirmedEnv.mockReturnValue("test");
    mockedGetGraphClient.mockResolvedValue({} as any);
    mockedInitializeAWSDynamoClient.mockReturnValue({} as any);
    mockedGetRecordByPk.mockResolvedValue({ Item: {} } as any);

    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "INSERT",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            Keys: {
              pk: { S: "test-pk" },
            },
            NewImage: {},
            StreamViewType: "NEW_AND_OLD_IMAGES",
          },
          eventSourceARN: "arn",
        },
      ],
    };

    await expect(sendMsgToTl(event)).rejects.toThrow(
      "[ sendMsgToTl ] no data found in DynamoDB record",
    );
  });
});
