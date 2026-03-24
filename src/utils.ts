import dayjs from "dayjs";
import type {
  Asistar,
  CombinedResults,
  EZLA,
  EzlaChecker,
  SickLeave,
  SickLeaveByTL,
  SickLeaveWithoutTL,
  Xpertis,
} from "./types";
import { type GraphEmail } from "./ms_graphAPI/types";
import { sendEmail } from "./ms_graphAPI/email_svc";
import { config } from "./config";

export function returnConfirmedEnv(envName: string): string {
  const env = process.env[envName];
  if (env) {
    return env;
  } else {
    throw new Error(`Couldn't find env variable: ${envName}`);
  }
}

export async function returnEzlaObjs(props: EzlaChecker): Promise<EZLA[]> {
  console.log("[ returnEzlaObj ] checking file structure");
  const firstElement = props.array.find(Boolean);

  if (
    Object.keys(firstElement).includes("PESEL") &&
    Object.keys(firstElement).includes("Status zaświadczenia") &&
    Object.keys(firstElement).includes("Data początku niezdolności") &&
    Object.keys(firstElement).includes("Data końca niezdolności") &&
    Object.keys(firstElement).includes("Seria i numer paszportu") &&
    Object.keys(firstElement).includes("Data urodzenia osoby pod opieką")
  ) {
    return props.array
      .map((obj) => {
        return {
          pesel: obj.PESEL,
          status: obj["Status zaświadczenia"].toUpperCase(),
          startDate: obj["Data początku niezdolności"],
          endDate: obj["Data końca niezdolności"],
          passportID: obj["Seria i numer paszportu"].replaceAll(" ", ""),
          caregiverLeave: isCaregiverLeave(obj["Data urodzenia osoby pod opieką"]),
        };
      })
      .filter((obj) => obj.status !== "ANULOWANE"); // ezla records with status "ANULOWANE" shouldn't be reflected into reports
  } else {
    const email: GraphEmail = {
      recipients: [props.receiverMail],
      subject: "eZLA - wrong ezla file structure",
      bodyHtml: `Dear team,
            <br /><br />
The process couldn't find one of necessary columns in the eZLA file (PESEL | Status zaświadczenia | Data początku niezdolności | Data końca niezdolności | Seria i numer paszportu | Data urodzenia osoby pod opieką). 
Please check the file structure and try again.

Best regards,<br />
MGS-CI team`,
    };
    await sendEmail(props.client, config.senderMail, email);
    throw new Error(
      `[ returnEzlaObj ] Couldn't find one of rows: PESEL | Status zaświadczenia | Data początku niezdolności | Data końca niezdolności | Seria i numer paszportu | Data urodzenia osoby pod opieką`,
    );
  }
}

export async function returnXpertisObjs(props: EzlaChecker): Promise<Xpertis[]> {
  console.log("[ returnXpertisObjs ] checking file structure");

  const firstElement = props.array.find(Boolean);

  if (
    Object.keys(firstElement).includes("PESEL") &&
    Object.keys(firstElement).includes("Paszport") &&
    Object.keys(firstElement).includes("Nr teczki")
  ) {
    const anyWhitespaceReg = /\s/g;
    return props.array.map((obj) => {
      return {
        fmno: obj["Nr teczki"],
        pesel: obj.PESEL,
        passport: obj.Paszport.replace(anyWhitespaceReg, ""),
      };
    });
  } else {
    const email: GraphEmail = {
      recipients: [props.receiverMail],
      subject: "eZLA - wrong ezla file structure",
      bodyHtml: `Dear team,
            <br /><br />
The process couldn't find one of necessary columns in the Xpertis file (PESEL | Nr teczki | Paszport). 
Please check the file structure and try again.

Best regards,<br />
MGS-CI team`,
    };
    await sendEmail(props.client, config.senderMail, email);
    throw new Error(
      `[ returnXpertisObjs ] Couldn't find one of rows: PESEL | Nr teczki | Paszport`,
    );
  }
}

export async function returnAsistarObjs(props: EzlaChecker): Promise<Asistar[]> {
  console.log("[ returnAsistarObjs ] checking file structure");

  const firstElement = props.array.find(Boolean);

  if (
    Object.keys(firstElement).includes("Nr_teczki") &&
    Object.keys(firstElement).includes("imie [varchar(200)]") &&
    Object.keys(firstElement).includes("nazwisko [varchar(200)]") &&
    Object.keys(firstElement).includes("login [varchar(200)]") &&
    Object.keys(firstElement).includes("p1_login [varchar(200)]")
  ) {
    return props.array.map((obj) => {
      return {
        fmno: obj["Nr_teczki"],
        firstName: replaceDiacriticsAndPolishChars(obj["imie [varchar(200)]"]),
        lastName: replaceDiacriticsAndPolishChars(obj["nazwisko [varchar(200)]"]),
        mail: obj["login [varchar(200)]"].toLowerCase(),
        pdmMail: obj["p1_login [varchar(200)]"].toLowerCase(),
      };
    });
  } else {
    const email: GraphEmail = {
      recipients: [props.receiverMail],
      subject: "eZLA - wrong ezla file structure",
      bodyHtml: `Dear team,
            <br /><br />
The process couldn't find one of necessary columns in the Xpertis file (Nr_teczki | imie [varchar(200)] | nazwisko [varchar(200)] | login [varchar(200)] | p2_login [varchar(200)]). 
Please check the file structure and try again.

Best regards,<br />
MGS-CI team`,
    };
    await sendEmail(props.client, config.senderMail, email);
    throw new Error(
      `[ returnAsistarObjs ] Couldn't find one of rows: Nr_teczki | imie [varchar(200)] | nazwisko [varchar(200)] | login [varchar(200)] | p2_login [varchar(200)]`,
    );
  }
}

export function tryCombineRecords(
  ezla: EZLA[],
  xpertis: Xpertis[],
  asistar: Asistar[],
): CombinedResults {
  console.log("[ tryCombineRecords ] start function");

  xpertis.forEach((el) => {
    if (el.passport === "" && el.pesel === "")
      throw new Error(
        "[ tryCombineRecords ] xpertis contain records with both pesel and passport empty strings",
      );
  });

  const fullRecords: SickLeave[] = [];
  const incompleteRecords: SickLeaveWithoutTL[] = [];
  const newHires: EZLA[] = [];

  ezla.forEach((obj, i) => {
    const wipObj = {
      status: structuredClone(obj.status),
      startDate: structuredClone(obj.startDate),
      endDate: structuredClone(obj.endDate),
      caregiverLeave: structuredClone(obj.caregiverLeave),
    };

    console.log("[ tryCombineRecords ] searching for Xpertis record");
    const xpertisObj = xpertis.find(
      (x) =>
        (x.pesel !== "" && x.pesel === obj.pesel) ||
        (x.passport !== "" && x.passport === obj.passportID),
    );
    const withFMNO = Object.assign(wipObj, { fmno: xpertisObj?.fmno });

    console.log("[ tryCombineRecords ] searching for Asistar records");
    // find colleague from Asistar file
    const asistarRecord = asistar.find((el) => el.fmno === withFMNO.fmno);
    // find colleague's Team Leader
    const asistarPDM = asistar.find((el) => el.mail === asistarRecord?.pdmMail);

    console.log(`[ tryCombineRecords ] creating SickLeave record nr: ${i}`);
    if (asistarRecord && asistarPDM && withFMNO.fmno) {
      const record = {
        fmno: withFMNO.fmno,
        firstName: asistarRecord.firstName,
        lastName: asistarRecord.lastName,
        mail: asistarRecord.mail,
        startDate: withFMNO.startDate,
        endDate: withFMNO.endDate,
        pdmMail: asistarPDM.mail,
        pdmFirstName: asistarPDM.firstName,
        pdmLastName: asistarPDM.lastName,
        caregiverLeave: withFMNO.caregiverLeave,
      };
      fullRecords.push(record);
    } else if (asistarRecord && withFMNO.fmno) {
      console.warn(
        `[ tryCombineRecords ] couldn't find PDM data for colleague with FMNO: ${withFMNO.fmno}`,
      );
      const record = {
        fmno: withFMNO.fmno,
        firstName: asistarRecord.firstName,
        lastName: asistarRecord.lastName,
        mail: asistarRecord.mail,
        startDate: withFMNO.startDate,
        endDate: withFMNO.endDate,
        pdmMail: undefined,
        pdmFirstName: undefined,
        pdmLastName: undefined,
        caregiverLeave: withFMNO.caregiverLeave,
      };
      incompleteRecords.push(record);
    } else if (!withFMNO.fmno) {
      console.warn(
        `[ tryCombineRecords ] found record with empty FMNO - Xpertis file should be updated`,
      );
      newHires.push(obj);
    } else {
      throw new Error(
        `[ tryCombineRecords ] couldn't find one of necessary records: asistarColleague OR asistarPDM, for colleague with FMNO: ${withFMNO.fmno}`,
      );
    }
  });

  return { fullRecords, incompleteRecords, newHires };
}

export function replaceDiacriticsAndPolishChars(txt: string): string {
  return txt
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .replaceAll("Ł", "L")
    .replaceAll("ł", "l");
}

export function groupByPdmAndSortByLastName(list: SickLeave[]): SickLeaveByTL[] {
  console.log("[ groupByPdmAndSortByLastName ] creating grouped and sorted SickLeaves");

  return list
    .reduce((accumulator, currentValue) => {
      const result = accumulator.find((el) => el.mail === currentValue.pdmMail);

      if (result) {
        result.team.push(currentValue);
      } else {
        accumulator.push({
          firstName: currentValue.pdmFirstName,
          lastName: currentValue.pdmLastName,
          mail: currentValue.pdmMail,
          team: [currentValue],
        });
      }

      return accumulator;
    }, [] as SickLeaveByTL[])
    .map((pdm) => {
      pdm.team.sort((curr, next) => {
        if (curr.lastName > next.lastName) {
          return 1;
        } else if (curr.lastName < next.lastName) {
          return -1;
        } else {
          return 0;
        }
      });

      return pdm;
    });
}

export function generateTable(list: (SickLeaveWithoutTL | SickLeave)[]): string {
  const tableHeaders = `<tr style="background-color: #ddd; font-weight: bold"><th>FMNO</th><th>First name</th><th>Last Name</th><th>Leave start date</th><th>Leave end date</th><th>Caregiver leave</th></tr>`;
  const tableBody = list
    .map(
      (sl) =>
        `<tr><td>${sl.fmno}</td><td>${sl.firstName}</td><td>${sl.lastName}</td><td>${sl.startDate}</td><td>${sl.endDate}</td><td>${sl.caregiverLeave}</td></tr>`,
    )
    .join("");

  return `<table border="1" cellpadding="5">${tableHeaders + tableBody}</table>`;
}

export function generateHewHireTable(list: EZLA[]): string {
  const tableHeaders = `<tr style="background-color: #ddd; font-weight: bold"><th>Pesel</th><th>Passport</th></tr>`;
  const tableBody = list
    .map((sl) => `<tr><td>${sl.pesel}</td><td>${sl.passportID}</td></tr>`)
    .join("");

  return `<table border="1" cellpadding="5">${tableHeaders + tableBody}</table>`;
}

export function generateEzlaFileName(name: string): string {
  console.log("[ generateEzlaFileName ] generating new file name");

  const indexOfDot = name.lastIndexOf(".");
  const extension = name.substring(indexOfDot);

  return `eZLA_${Date.now()}${extension}`;
}

export function returnTableName(arn: string): string {
  console.log("[ returnTableName ] retrieving table name");

  const startIndex = arn.includes("ProdStack")
    ? arn.indexOf("ProdStack")
    : arn.indexOf("QaOneStopStack");
  const endIndex = arn.indexOf("/stream");

  if (startIndex === -1 || endIndex === -1)
    throw new Error(
      `[ returnTableName ] the structure of the ARN is differentiate from expected one: ${arn}`,
    );

  return arn.substring(startIndex, endIndex);
}

export function isCaregiverLeave(value: string): "YES" | "NO" {
  if (typeof value === "string") {
    const valueNoSpaces = value.replaceAll(" ", "");
    const isValidFormat = dayjs(valueNoSpaces).isValid();
    return isValidFormat ? "YES" : "NO";
  } else {
    return "NO";
  }
}

export function checkIfNoRestrictedChars(string: string) {
  // should error if name contains any of restricted characters: " * : < > ? / \ |
  // https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins/validating-file-names-in-sharepoint-online
  console.info(`[ checkIfNoRestrictedChars ] checking: ${string}`);

  const restrictedChars = /[\\/:*?"<>|]/g;
  const matches = string.match(restrictedChars);
  if (matches) {
    throw new Error(`[ checkIfNoRestrictedChars ] found restricted characters: ${matches}`);
  }
  return string;
}
