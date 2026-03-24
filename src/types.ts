import { Client } from "@microsoft/microsoft-graph-client";
import { z } from "zod";
import type { Email } from "./ms_graphAPI/types";
import { isCaregiverLeave } from "./utils";

export const ezla = z
  .object({
    PESEL: z.string(),
    "Status zaświadczenia": z.string(),
    "Data początku niezdolności": z.string(),
    "Data końca niezdolności": z.string(),
    "Seria i numer paszportu": z.string(),
    "Data urodzenia osoby pod opieką": z.string(),
  })
  .transform((data) => ({
    pesel: data.PESEL,
    status: data["Status zaświadczenia"].toUpperCase(),
    startDate: data["Data początku niezdolności"],
    endDate: data["Data końca niezdolności"],
    passportID: data["Seria i numer paszportu"].replaceAll(" ", ""),
    caregiverLeave: isCaregiverLeave(data["Data urodzenia osoby pod opieką"]),
  }));

export type EZLA = z.infer<typeof ezla>;

export const xpertis = z
  .object({
    PESEL: z.string(),
    Paszport: z.string(),
    "Nr teczki": z.string(),
  })
  .transform((data) => ({
    fmno: data["Nr teczki"],
    pesel: data.PESEL,
    passport: data["Paszport"].replaceAll(" ", ""),
  }));

export type Xpertis = z.infer<typeof xpertis>;

export const asistar = z
  .object({
    Nr_teczki: z.string(),
    "imie [varchar(200)]": z.string(),
    "nazwisko [varchar(200)]": z.string(),
    "login [varchar(200)]": z.string(),
    "p1_login [varchar(200)]": z.string(),
  })
  .transform((data) => ({
    fmno: data["Nr_teczki"],
    firstName: data["imie [varchar(200)]"],
    lastName: data["nazwisko [varchar(200)]"],
    mail: data["login [varchar(200)]"],
    pdmMail: data["p1_login [varchar(200)]"],
  }));

export type Asistar = z.infer<typeof asistar>;

const SickLeave = z.object({
  fmno: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  mail: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  pdmMail: z.custom<Email>(),
  pdmFirstName: z.string(),
  pdmLastName: z.string(),
  caregiverLeave: z.string(),
});

export type SickLeave = z.infer<typeof SickLeave>;

export type SickLeaveWithoutTL = {
  fmno: string;
  firstName: string;
  lastName: string;
  mail: string;
  startDate: string;
  endDate: string;
  pdmMail: undefined;
  pdmFirstName: undefined;
  pdmLastName: undefined;
  caregiverLeave: string;
};

export type CombinedResults = {
  fullRecords: SickLeave[];
  incompleteRecords: SickLeaveWithoutTL[];
  newHires: EZLA[];
};

export const SickLeaveByTL = z.object({
  firstName: z.string(),
  lastName: z.string(),
  mail: z.custom<Email>(),
  team: z.array(SickLeave),
});

export type SickLeaveByTL = z.infer<typeof SickLeaveByTL>;
