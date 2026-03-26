import { createSickLeaveRecords } from "../lambda_main";
import { getGraphClient, getDriveId } from "../ms_graphAPI";
import { getOrCreateFolderByName } from "../ms_graphAPI/folder_svc";
import { getFolderFiles, getFileContent, moveFileToFolder } from "../ms_graphAPI/file_svc";
import {
  tryCombineRecords,
  groupByPdmAndSortByLastName,
  generateEzlaFileName,
  checkIfNoRestrictedChars,
} from "../utils";
import { pushSickLeavesToSqs } from "../aws/sqs_svc";
import { ezla, xpertis, asistar } from "../types";
import { sendEmail } from "../ms_graphAPI/email_svc";
import csvtojson from "csvtojson";
import xlsx from "xlsx";

jest.mock("../ms_graphAPI", () => ({
  getGraphClient: jest.fn(),
  getDriveId: jest.fn(),
}));

jest.mock("../ms_graphAPI/folder_svc", () => ({
  getOrCreateFolderByName: jest.fn(),
}));

jest.mock("../ms_graphAPI/file_svc", () => ({
  getFolderFiles: jest.fn(),
  getFileContent: jest.fn(),
  moveFileToFolder: jest.fn(),
}));

jest.mock("../utils", () => ({
  tryCombineRecords: jest.fn(),
  groupByPdmAndSortByLastName: jest.fn(),
  generateTable: jest.fn(),
  generateEzlaFileName: jest.fn(),
  generateHewHireTable: jest.fn(),
  checkIfNoRestrictedChars: jest.fn(),
  buildErrorEmailBody: jest.fn(),
}));

jest.mock("../aws/sqs_svc", () => ({
  pushSickLeavesToSqs: jest.fn(),
}));

jest.mock("../types", () => ({
  ezla: { safeParse: jest.fn() },
  xpertis: { safeParse: jest.fn() },
  asistar: { safeParse: jest.fn() },
}));

jest.mock("../config", () => ({
  config: {
    host: "host",
    siteWebId: "site1",
    mainFolderName: "main",
    reportFolderName: "report",
    requestName: "REQ",
    reportBackupFolderName: "backup",
    dataFolderName: "data",
    ezlaFileName: "ezla",
    xpertisFileName: "xpertis",
    asistarFileName: "asistar",
    hrMail: "hr@example.com",
    senderMail: "sender@example.com",
    checkSiteWebID: "site1",
    sqsUrl: "sqs://url",
  },
}));

jest.mock("../ms_graphAPI/email_svc", () => ({
  sendEmail: jest.fn(),
}));

jest.mock("csvtojson", () => {
  const fromString = jest.fn();
  const converter = jest.fn(() => ({ fromString }));
  return {
    __esModule: true,
    default: converter,
    fromString,
  };
});

jest.mock("xlsx", () => {
  const read = jest.fn();
  const sheet_to_csv = jest.fn();
  return {
    __esModule: true,
    default: {
      read,
      utils: {
        sheet_to_csv,
      },
    },
    read,
    utils: {
      sheet_to_csv,
    },
  };
});

const mockedGetGraphClient = getGraphClient as jest.MockedFunction<typeof getGraphClient>;
const mockedGetDriveId = getDriveId as jest.MockedFunction<typeof getDriveId>;
const mockedGetOrCreateFolderByName = getOrCreateFolderByName as jest.MockedFunction<
  typeof getOrCreateFolderByName
>;
const mockedGetFolderFiles = getFolderFiles as jest.MockedFunction<typeof getFolderFiles>;
const mockedGetFileContent = getFileContent as jest.MockedFunction<typeof getFileContent>;
const mockedMoveFileToFolder = moveFileToFolder as jest.MockedFunction<typeof moveFileToFolder>;
const mockedTryCombineRecords = tryCombineRecords as jest.MockedFunction<typeof tryCombineRecords>;
const mockedGroupByPdmAndSortByLastName = groupByPdmAndSortByLastName as jest.MockedFunction<
  typeof groupByPdmAndSortByLastName
>;
const mockedGenerateEzlaFileName = generateEzlaFileName as jest.MockedFunction<
  typeof generateEzlaFileName
>;
const mockedCheckIfNoRestrictedChars = checkIfNoRestrictedChars as jest.MockedFunction<
  typeof checkIfNoRestrictedChars
>;
const mockedPushSickLeavesToSqs = pushSickLeavesToSqs as jest.MockedFunction<
  typeof pushSickLeavesToSqs
>;
const mockedEzlaSafeParse = ezla.safeParse as jest.MockedFunction<typeof ezla.safeParse>;
const mockedXpertisSafeParse = xpertis.safeParse as jest.MockedFunction<typeof xpertis.safeParse>;
const mockedAsistarSafeParse = asistar.safeParse as jest.MockedFunction<typeof asistar.safeParse>;
const mockedSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

const mockedCsvToJson = csvtojson as jest.MockedFunction<typeof csvtojson>;
const mockedFromString = mockedCsvToJson().fromString as jest.MockedFunction<any>;
const mockedXlsxRead = (xlsx as any).read as jest.MockedFunction<any>;
const mockedSheetToCsv = (xlsx as any).utils.sheet_to_csv as jest.MockedFunction<any>;

describe("createSickLeaveRecords", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return no data when no ezla file is available", async () => {
    mockedGetGraphClient.mockResolvedValue({} as any);
    mockedGetDriveId.mockResolvedValue("drive-id");
    mockedGetOrCreateFolderByName.mockResolvedValue({ id: "x" } as any);
    mockedGetFolderFiles.mockResolvedValue([] as any);

    await expect(createSickLeaveRecords()).resolves.toBe("No data to process. Closing process");

    expect(mockedSendEmail).not.toHaveBeenCalled();
    expect(mockedGetFolderFiles).toHaveBeenCalledTimes(1);
  });

  it("should throw when xpertis file is missing", async () => {
    mockedGetGraphClient.mockResolvedValue({} as any);
    mockedGetDriveId.mockResolvedValue("drive-id");
    mockedGetOrCreateFolderByName.mockResolvedValue({ id: "x" } as any);

    mockedGetFolderFiles.mockResolvedValue([{ name: "ezla-file.csv", id: "ezla-id" }] as any);

    mockedGetFileContent.mockResolvedValue(Buffer.from("id,name\n1,2") as any);
    mockedFromString.mockResolvedValue([{ hello: "world" }] as any);
    mockedEzlaSafeParse.mockReturnValue({
      success: true,
      data: { pesel: "1", passportID: "p" },
    } as any);

    await expect(createSickLeaveRecords()).rejects.toThrow(
      "[ createSickLeaveRecords ] Couldn't find Xpertis file in the folder",
    );

    expect(mockedGetFolderFiles).toHaveBeenCalledTimes(1);
  });

  it("should execute full happy path and process records", async () => {
    mockedGetGraphClient.mockResolvedValue({} as any);
    mockedGetDriveId.mockResolvedValue("drive-id");
    mockedGetOrCreateFolderByName
      .mockResolvedValueOnce({ id: "main" } as any)
      .mockResolvedValueOnce({ id: "report" } as any)
      .mockResolvedValueOnce({ id: "request" } as any)
      .mockResolvedValueOnce({ id: "backup" } as any)
      .mockResolvedValueOnce({ id: "data" } as any)
      .mockResolvedValueOnce({ id: "dataRequest" } as any);

    mockedGetFolderFiles.mockResolvedValue([
      { name: "ezla-file.csv", id: "ezla" },
      { name: "xpertis-file.xlsx", id: "xpertis" },
      { name: "asistar-file.xlsx", id: "asistar" },
    ] as any);

    mockedGetFileContent.mockResolvedValue(Buffer.from("csvdata") as any);

    mockedFromString
      .mockResolvedValueOnce([{ name: "A" }])
      .mockResolvedValueOnce([{ name: "B" }])
      .mockResolvedValueOnce([{ name: "C" }]);

    mockedEzlaSafeParse.mockReturnValue({
      success: true,
      data: {
        pesel: "1",
        passportID: "p",
        startDate: "2024-01-01",
        endDate: "2024-01-02",
        caregiverLeave: "false",
      },
    } as any);
    mockedXpertisSafeParse.mockReturnValue({
      success: true,
      data: { pesel: "1", passport: "", fmno: "123" },
    } as any);
    mockedAsistarSafeParse.mockReturnValue({
      success: true,
      data: {
        fmno: "123",
        firstName: "Bob",
        lastName: "Jones",
        mail: "bob@example.com",
        pdmMail: "pdm@example.com",
        pdmFirstName: "Pat",
        pdmLastName: "Manager",
      },
    } as any);

    mockedXlsxRead.mockReturnValue({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } } as any);
    mockedSheetToCsv.mockReturnValue("id,name\n");

    mockedTryCombineRecords.mockReturnValue({
      fullRecords: [{ fmno: "123" }],
      incompleteRecords: [],
      newHires: [],
    } as any);
    mockedGroupByPdmAndSortByLastName.mockReturnValue([
      { firstName: "Pat", lastName: "M", mail: "pdm@example.com", team: [] },
    ] as any);
    mockedGenerateEzlaFileName.mockReturnValue("eZLA_123.xlsx");
    mockedCheckIfNoRestrictedChars.mockImplementation((input) => input);
    mockedPushSickLeavesToSqs.mockResolvedValue({} as any);
    mockedMoveFileToFolder.mockResolvedValue({} as any);
    mockedSendEmail.mockResolvedValue(undefined);

    await expect(createSickLeaveRecords()).resolves.toBeUndefined();

    expect(mockedPushSickLeavesToSqs).toHaveBeenCalledWith(
      [{ firstName: "Pat", lastName: "M", mail: "pdm@example.com", team: [] }],
      "sqs://url",
    );
    expect(mockedMoveFileToFolder).toHaveBeenCalledWith(
      {},
      "drive-id",
      "ezla",
      "backup",
      "eZLA_123.xlsx",
    );
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });
});
