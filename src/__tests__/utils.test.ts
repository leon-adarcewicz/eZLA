import {
  buildErrorEmailBody,
  checkIfNoRestrictedChars,
  generateEzlaFileName,
  generateNewHireTable,
  isCaregiverLeave,
  returnConfirmedEnv,
  tryCombineRecords,
} from "../utils";
import type { Asistar, EZLA, Xpertis } from "../types";

jest.mock("../ms_graphAPI/email_svc", () => ({
  sendEmail: jest.fn(),
}));

describe("returnConfirmedEnv", () => {
  const ORIGINAL_ENV = process.env;

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("returns value of existing env variable", () => {
    process.env.TEST_VAR = "hello";
    expect(returnConfirmedEnv("TEST_VAR")).toBe("hello");
  });

  it("throws when env variable does not exist", () => {
    delete process.env.TEST_VAR;
    expect(() => returnConfirmedEnv("TEST_VAR")).toThrow("Couldn't find env variable: TEST_VAR");
  });
});

describe("buildErrorEmailBody", () => {
  it("builds correct message for ezla reason", () => {
    const result = buildErrorEmailBody("ezla");
    expect(result).toMatchSnapshot();
  });

  it("builds correct message for xpertis reason", () => {
    const result = buildErrorEmailBody("xpertis");
    expect(result).toMatchSnapshot();
  });

  it("builds correct message for asistar reason", () => {
    const result = buildErrorEmailBody("asistar");
    expect(result).toMatchSnapshot();
  });
});

describe("tryCombineRecords", () => {
  it("creates full records when all data is available", () => {
    const ezla: EZLA[] = [
      {
        pesel: "12345678901",
        status: "ACTIVE",
        startDate: "2023-01-01",
        endDate: "2023-01-10",
        passportID: "AB123456",
        caregiverLeave: "NO",
      },
    ];

    const xpertis: Xpertis[] = [
      {
        fmno: "FMNO001",
        pesel: "12345678901",
        passport: "", // empty passport to test matching by pesel
      },
    ];

    const asistar: Asistar[] = [
      {
        fmno: "FMNO001",
        firstName: "John",
        lastName: "Doe",
        mail: "john.doe@example.com",
        pdmMail: "manager@example.com",
      },
      {
        fmno: "PDM001",
        firstName: "Jane",
        lastName: "Smith",
        mail: "manager@example.com",
        pdmMail: "higher.manager@example.com",
      },
    ];

    const result = tryCombineRecords(ezla, xpertis, asistar);

    expect(result.fullRecords).toHaveLength(1);
    expect(result.incompleteRecords).toHaveLength(0);
    expect(result.newHires).toHaveLength(0);
    expect(result.fullRecords[0]).toEqual({
      fmno: "FMNO001",
      firstName: "John",
      lastName: "Doe",
      mail: "john.doe@example.com",
      startDate: "2023-01-01",
      endDate: "2023-01-10",
      pdmMail: "manager@example.com",
      pdmFirstName: "Jane",
      pdmLastName: "Smith",
      caregiverLeave: "NO",
    });
  });

  it("creates incomplete records when PDM is missing", () => {
    const ezla: EZLA[] = [
      {
        pesel: "12345678901",
        status: "ACTIVE",
        startDate: "2023-01-01",
        endDate: "2023-01-10",
        passportID: "AB123456",
        caregiverLeave: "NO",
      },
    ];

    const xpertis: Xpertis[] = [
      {
        fmno: "FMNO001",
        pesel: "12345678901",
        passport: "AB123456",
      },
    ];

    const asistar: Asistar[] = [
      {
        fmno: "FMNO001",
        firstName: "John",
        lastName: "Doe",
        mail: "john.doe@example.com",
        pdmMail: "nonexistent@example.com", // PDM not in asistar
      },
    ];

    const result = tryCombineRecords(ezla, xpertis, asistar);

    expect(result.fullRecords).toHaveLength(0);
    expect(result.incompleteRecords).toHaveLength(1);
    expect(result.newHires).toHaveLength(0);
    expect(result.incompleteRecords[0]).toEqual({
      fmno: "FMNO001",
      firstName: "John",
      lastName: "Doe",
      mail: "john.doe@example.com",
      startDate: "2023-01-01",
      endDate: "2023-01-10",
      pdmMail: undefined,
      pdmFirstName: undefined,
      pdmLastName: undefined,
      caregiverLeave: "NO",
    });
  });

  it("adds to newHires when no FMNO match", () => {
    const ezla: EZLA[] = [
      {
        pesel: "99999999999",
        status: "ACTIVE",
        startDate: "2023-01-01",
        endDate: "2023-01-10",
        passportID: "ZZ999999",
        caregiverLeave: "NO",
      },
    ];

    const xpertis: Xpertis[] = [
      {
        fmno: "FMNO001",
        pesel: "12345678901",
        passport: "AB123456",
      },
    ];

    const asistar: Asistar[] = [
      {
        fmno: "FMNO001",
        firstName: "John",
        lastName: "Doe",
        mail: "john.doe@example.com",
        pdmMail: "manager@example.com",
      },
    ];

    const result = tryCombineRecords(ezla, xpertis, asistar);

    expect(result.fullRecords).toHaveLength(0);
    expect(result.incompleteRecords).toHaveLength(0);
    expect(result.newHires).toHaveLength(1);
    expect(result.newHires[0]).toEqual(ezla[0]);
  });

  it("throws error when xpertis has empty pesel and passport", () => {
    const ezla: EZLA[] = [];
    const xpertis: Xpertis[] = [
      {
        fmno: "FMNO001",
        pesel: "",
        passport: "",
      },
    ];
    const asistar: Asistar[] = [];

    expect(() => tryCombineRecords(ezla, xpertis, asistar)).toThrow(
      "[ tryCombineRecords ] xpertis contain records with both pesel and passport empty strings",
    );
  });

  it("throws error when asistar record not found but fmno exists", () => {
    const ezla: EZLA[] = [
      {
        pesel: "12345678901",
        status: "ACTIVE",
        startDate: "2023-01-01",
        endDate: "2023-01-10",
        passportID: "AB123456",
        caregiverLeave: "NO",
      },
    ];

    const xpertis: Xpertis[] = [
      {
        fmno: "FMNO001",
        pesel: "12345678901",
        passport: "AB123456",
      },
    ];

    const asistar: Asistar[] = [
      {
        fmno: "DIFFERENT_FMNO",
        firstName: "John",
        lastName: "Doe",
        mail: "john.doe@example.com",
        pdmMail: "manager@example.com",
      },
    ];

    expect(() => tryCombineRecords(ezla, xpertis, asistar)).toThrow(
      "[ tryCombineRecords ] couldn't find one of necessary records: asistarColleague OR asistarPDM, for colleague with FMNO: FMNO001",
    );
  });

  it("matches by passport when pesel is empty", () => {
    const ezla: EZLA[] = [
      {
        pesel: "12345678901",
        status: "ACTIVE",
        startDate: "2023-01-01",
        endDate: "2023-01-10",
        passportID: "AB123456",
        caregiverLeave: "NO",
      },
    ];

    const xpertis: Xpertis[] = [
      {
        fmno: "FMNO001",
        pesel: "", // Empty pesel
        passport: "AB123456",
      },
    ];

    const asistar: Asistar[] = [
      {
        fmno: "FMNO001",
        firstName: "John",
        lastName: "Doe",
        mail: "john.doe@example.com",
        pdmMail: "manager@example.com",
      },
      {
        fmno: "PDM001",
        firstName: "Jane",
        lastName: "Smith",
        mail: "manager@example.com",
        pdmMail: "higher.manager@example.com",
      },
    ];

    const result = tryCombineRecords(ezla, xpertis, asistar);

    expect(result.fullRecords).toHaveLength(1);
  });
});

describe("generateNewHireTable", () => {
  it("generates table with multiple rows for multiple EZLA records", () => {
    const ezlaList: EZLA[] = [
      {
        pesel: "12345678901",
        status: "ACTIVE",
        startDate: "2023-01-01",
        endDate: "2023-01-10",
        passportID: "AB123456",
        caregiverLeave: "NO",
      },
      {
        pesel: "98765432109",
        status: "INACTIVE",
        startDate: "2023-02-01",
        endDate: "2023-02-15",
        passportID: "CD789012",
        caregiverLeave: "YES",
      },
    ];
    const result = generateNewHireTable(ezlaList);
    expect(result).toMatchSnapshot();
  });
});

describe("generateEzlaFileName", () => {
  beforeAll(() => {
    jest.spyOn(Date, "now").mockReturnValue(1640995200000); // Mock Date.now to return a fixed timestamp
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("generates filename with extension", () => {
    const result = generateEzlaFileName("example.xlsx");
    expect(result).toBe("eZLA_1640995200000.xlsx");
  });
});

describe("isCaregiverLeave", () => {
  it('returns "YES" for valid date', () => {
    expect(isCaregiverLeave(" 2023-01-01 ")).toBe("YES");
    expect(isCaregiverLeave("2023-01-01")).toBe("YES");
    expect(isCaregiverLeave("01/01/2023")).toBe("YES");
  });

  it('returns "NO" for invalid date string', () => {
    expect(isCaregiverLeave("not a date")).toBe("NO");
    expect(isCaregiverLeave("   ")).toBe("NO");
  });
});

describe("checkIfNoRestrictedChars", () => {
  it("returns the string when no restricted characters are present", () => {
    const input = "valid_filename.txt";
    expect(checkIfNoRestrictedChars(input)).toBe(input);
  });

  it("throws error when string contains restricted characters", () => {
    expect(() => checkIfNoRestrictedChars('file"name.txt')).toThrow(
      '[ checkIfNoRestrictedChars ] found restricted characters: "',
    );
    expect(() => checkIfNoRestrictedChars("file*name.txt")).toThrow(
      "[ checkIfNoRestrictedChars ] found restricted characters: *",
    );
    expect(() => checkIfNoRestrictedChars("file:name.txt")).toThrow(
      "[ checkIfNoRestrictedChars ] found restricted characters: :",
    );
    expect(() => checkIfNoRestrictedChars("file<name.txt")).toThrow(
      "[ checkIfNoRestrictedChars ] found restricted characters: <",
    );
    expect(() => checkIfNoRestrictedChars("file>name.txt")).toThrow(
      "[ checkIfNoRestrictedChars ] found restricted characters: >",
    );
    expect(() => checkIfNoRestrictedChars("file?name.txt")).toThrow(
      "[ checkIfNoRestrictedChars ] found restricted characters: ?",
    );
    expect(() => checkIfNoRestrictedChars("file/name.txt")).toThrow(
      "[ checkIfNoRestrictedChars ] found restricted characters: /",
    );
    expect(() => checkIfNoRestrictedChars("file|name.txt")).toThrow(
      "[ checkIfNoRestrictedChars ] found restricted characters: |",
    );
    expect(() => checkIfNoRestrictedChars("file:*?.txt")).toThrow(
      "[ checkIfNoRestrictedChars ] found restricted characters: :,*,?",
    );
  });

  it("returns empty string when input is empty", () => {
    expect(checkIfNoRestrictedChars("")).toBe("");
  });
});
