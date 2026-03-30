import { isAwsDynamoError, InitializeAWSDynamoClient, dbPushSickLeave } from "../aws/dynamo_svc";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { config } from "../config";

jest.mock("@aws-sdk/client-dynamodb");
jest.mock("../utils", () => ({
  returnConfirmedEnv: jest.fn(),
}));

describe("isAwsDynamoError", () => {
  it("returns true for object with both name and message properties", () => {
    const obj = {
      name: "ValidationException",
      message: "One or more parameter values were invalid",
    };

    expect(isAwsDynamoError(obj)).toBe(true);
  });

  it("returns false for objects with missing property", () => {
    const obj1 = {
      name: "ValidationException",
    };
    const obj2 = {
      message: "One or more parameter values were invalid",
    };

    expect(isAwsDynamoError(obj1)).toBe(false);
    expect(isAwsDynamoError(obj2)).toBe(false);
    expect(isAwsDynamoError({})).toBe(false);
  });
});

describe("InitializeAWSDynamoClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (config as jest.Mocked<typeof config>).region = "us-east-1";
    (config as jest.Mocked<typeof config>).dynamoEndpoint = "http://custom-endpoint:8000";
  });

  it("should return a DynamoDBClient instance", () => {
    const client = InitializeAWSDynamoClient();

    expect(client).toBeDefined();
    expect(DynamoDBClient).toHaveBeenCalled();
    expect(DynamoDBClient).toHaveBeenCalledWith({
      region: "us-east-1",
      apiVersion: "2012-08-10",
      endpoint: "http://custom-endpoint:8000",
    });
  });
});

describe("dbPushSickLeave", () => {
  const mockClient = { send: jest.fn() } as unknown as DynamoDBClient;
  const hash = "test-hash";
  const tableName = "sick-leave-table";
  const sickLeave = {
    firstName: "Alice",
    lastName: "Smith",
    mail: "alice.smith@example.com",
    team: [
      {
        fmno: "12345",
        firstName: "Bob",
        lastName: "Jones",
        mail: "bob.jones@example.com",
        startDate: "2025-01-01",
        endDate: "2025-01-10",
        pdmMail: "manager@example.com",
        pdmFirstName: "Manager",
        pdmLastName: "Name",
        caregiverLeave: "false",
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should call PutItemCommand and send client command", async () => {
    mockClient.send = jest.fn().mockResolvedValue({});

    await dbPushSickLeave(hash, sickLeave, mockClient, tableName);

    expect(PutItemCommand).toHaveBeenCalledTimes(1);
    expect(PutItemCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: tableName,
        Item: expect.objectContaining({
          pk: { S: hash },
          data: expect.any(Object),
          ttl: expect.any(Object),
        }),
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );

    expect(mockClient.send).toHaveBeenCalledTimes(1);
    expect(mockClient.send).toHaveBeenCalledWith(expect.anything());
  });

  it("should not throw and return undefined for ConditionalCheckFailedException", async () => {
    mockClient.send = jest.fn().mockRejectedValue({ name: "ConditionalCheckFailedException" });

    const result = await dbPushSickLeave(hash, sickLeave, mockClient, tableName);

    expect(result).toBeUndefined();
    expect(mockClient.send).toHaveBeenCalledTimes(1);
  });

  it("should throw Error for non-ConditionalCheckFailedException error", async () => {
    const error = { name: "InternalError", message: "test failure" };
    mockClient.send = jest.fn().mockRejectedValue(error);

    await expect(dbPushSickLeave(hash, sickLeave, mockClient, tableName)).rejects.toThrow(
      JSON.stringify(error),
    );
    expect(mockClient.send).toHaveBeenCalledTimes(1);
  });
});
