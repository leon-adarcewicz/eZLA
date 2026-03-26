import dayjs from "dayjs";
import type {
  Asistar,
  CombinedResults,
  EZLA,
  SickLeave,
  SickLeaveByTL,
  SickLeaveWithoutTL,
  Xpertis,
} from "./types";

export function returnConfirmedEnv(envName: string): string {
  const env = process.env[envName];
  if (env) {
    return env;
  } else {
    throw new Error(`Couldn't find env variable: ${envName}`);
  }
}

export function buildErrorEmailBody(reason: "ezla" | "xpertis" | "asistar"): string {
  let reasonText: string;
  switch (reason) {
    case "ezla":
      reasonText =
        "The process couldn't find one of necessary columns in the eZLA file " +
        "(PESEL | Status zaświadczenia | Data początku niezdolności | Data końca niezdolności | Seria i numer paszportu | Data urodzenia osoby pod opieką). " +
        "Please check the file structure and try again.";
      break;
    case "xpertis":
      reasonText =
        "The process couldn't find one of necessary columns in the Xpertis file " +
        "(PESEL | Nr teczki | Paszport). " +
        "Please check the file structure and try again.";
      break;
    case "asistar":
      reasonText =
        "The process couldn't find one of necessary columns in the Asistar file " +
        "(Nr_teczki | imie [varchar(200)] | nazwisko [varchar(200)] | login [varchar(200)] | p2_login [varchar(200)]). " +
        "Please check the file structure and try again.";
      break;
    default:
      reasonText = `${reason satisfies never}`;
  }
  return `Dear team,<br /><br />${reasonText}<br /><br />Best regards,<br />MGS-CI team`;
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
    console.log("[ tryCombineRecords ] searching for Xpertis record");
    const xpertisObj = xpertis.find(
      (x) =>
        (x.pesel !== "" && x.pesel === obj.pesel) ||
        (x.passport !== "" && x.passport === obj.passportID),
    );

    console.log("[ tryCombineRecords ] searching for Asistar records");
    // find colleague from Asistar file
    const asistarRecord = asistar.find((el) => el.fmno === xpertisObj?.fmno);
    // find colleague's Team Leader
    const asistarPDM = asistar.find((el) => el.mail === asistarRecord?.pdmMail);

    console.log(`[ tryCombineRecords ] creating SickLeave record nr: ${i}`);
    if (asistarRecord && asistarPDM && xpertisObj?.fmno) {
      const record: SickLeave = {
        fmno: xpertisObj?.fmno,
        firstName: asistarRecord.firstName,
        lastName: asistarRecord.lastName,
        mail: asistarRecord.mail,
        startDate: structuredClone(obj.startDate),
        endDate: structuredClone(obj.endDate),
        pdmMail: asistarPDM.mail,
        pdmFirstName: asistarPDM.firstName,
        pdmLastName: asistarPDM.lastName,
        caregiverLeave: structuredClone(obj.caregiverLeave),
      };
      fullRecords.push(record);
    } else if (asistarRecord && xpertisObj?.fmno) {
      console.warn(
        `[ tryCombineRecords ] couldn't find PDM data for colleague with FMNO: ${xpertisObj?.fmno}`,
      );
      const record: SickLeaveWithoutTL = {
        fmno: xpertisObj?.fmno,
        firstName: asistarRecord.firstName,
        lastName: asistarRecord.lastName,
        mail: asistarRecord.mail,
        startDate: structuredClone(obj.startDate),
        endDate: structuredClone(obj.endDate),
        pdmMail: undefined,
        pdmFirstName: undefined,
        pdmLastName: undefined,
        caregiverLeave: structuredClone(obj.caregiverLeave),
      };
      incompleteRecords.push(record);
    } else if (xpertisObj?.fmno === undefined) {
      console.warn(
        `[ tryCombineRecords ] found record with empty FMNO - Xpertis file should be updated`,
      );
      newHires.push(obj);
    } else {
      throw new Error(
        `[ tryCombineRecords ] couldn't find one of necessary records: asistarColleague OR asistarPDM, for colleague with FMNO: ${xpertisObj?.fmno}`,
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
