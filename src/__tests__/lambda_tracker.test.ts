import { SQSEvent } from "aws-lambda";

jest.mock("../aws/dynamo_svc", () => ({
  dbPushSickLeave: jest.fn(),
  InitializeAWSDynamoClient: jest.fn(),
  isAwsDynamoError: jest.fn(),
}));

import { pushMsgToDynamo } from "../lambda_tracker";
import { dbPushSickLeave, InitializeAWSDynamoClient, isAwsDynamoError } from "../aws/dynamo_svc";

const mockedDbPushSickLeave = dbPushSickLeave as jest.MockedFunction<typeof dbPushSickLeave>;
const mockedInitializeAwsDynamoClient = InitializeAWSDynamoClient as jest.MockedFunction<
  typeof InitializeAWSDynamoClient
>;
const mockedIsAwsDynamoError = isAwsDynamoError as jest.MockedFunction<typeof isAwsDynamoError>;

describe("pushMsgToDynamo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const sampleRecord = {
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

  it("should push records successfully when dbPushSickLeave resolves", async () => {
    const fakeClient = { send: jest.fn() };
    mockedInitializeAwsDynamoClient.mockReturnValue(fakeClient as any);
    mockedDbPushSickLeave.mockResolvedValue(undefined);

    const event: SQSEvent = {
      Records: [
        {
          messageId: "1",
          receiptHandle: "rh",
          body: JSON.stringify(sampleRecord),
          attributes: {},
          messageAttributes: {},
          md5OfBody: "md5",
          eventSource: "aws:sqs",
          eventSourceARN: "arn",
          awsRegion: "us-east-1",
        },
      ],
    } as unknown as SQSEvent;

    await expect(pushMsgToDynamo(event)).resolves.toBeUndefined();

    expect(mockedInitializeAwsDynamoClient).toHaveBeenCalledTimes(1);
    expect(mockedDbPushSickLeave).toHaveBeenCalledTimes(1);
    expect(mockedDbPushSickLeave).toHaveBeenCalledWith(
      expect.any(String),
      sampleRecord,
      fakeClient,
      undefined,
    );
  });

  it("should throw a combined error when one push rejects with AWS error", async () => {
    mockedInitializeAwsDynamoClient.mockReturnValue({} as any);

    const awsError = { name: "TestDynamoError", message: "boom" };
    mockedDbPushSickLeave.mockRejectedValue(JSON.stringify(awsError));
    mockedIsAwsDynamoError.mockReturnValue(true);

    const event: SQSEvent = {
      Records: [
        {
          messageId: "2",
          receiptHandle: "rh2",
          body: JSON.stringify(sampleRecord),
          attributes: {},
          messageAttributes: {},
          md5OfBody: "md5",
          eventSource: "aws:sqs",
          eventSourceARN: "arn",
          awsRegion: "us-east-1",
        },
      ],
    } as unknown as SQSEvent;

    await expect(pushMsgToDynamo(event)).rejects.toThrow(
      '{"name":"TestDynamoError","message":"boom"}',
    );

    expect(mockedIsAwsDynamoError).toHaveBeenCalledWith(awsError);
  });

  it("should throw a combined error when one push rejects with non-AWS error", async () => {
    mockedInitializeAwsDynamoClient.mockReturnValue({} as any);

    const nonAwsReason = { code: 500, info: "server-failure" };
    mockedDbPushSickLeave.mockRejectedValue(JSON.stringify(nonAwsReason));
    mockedIsAwsDynamoError.mockReturnValue(false);

    const event: SQSEvent = {
      Records: [
        {
          messageId: "3",
          receiptHandle: "rh3",
          body: JSON.stringify(sampleRecord),
          attributes: {},
          messageAttributes: {},
          md5OfBody: "md5",
          eventSource: "aws:sqs",
          eventSourceARN: "arn",
          awsRegion: "us-east-1",
        },
      ],
    } as unknown as SQSEvent;

    await expect(pushMsgToDynamo(event)).rejects.toThrow('{"code":500,"info":"server-failure"}');

    expect(mockedIsAwsDynamoError).toHaveBeenCalledWith(nonAwsReason);
  });
});
