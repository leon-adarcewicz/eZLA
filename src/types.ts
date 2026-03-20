import { Client } from "@microsoft/microsoft-graph-client";
import { z } from "zod";
import type { Email } from "./ms_graphAPI/types";

const EZLA = z.object({
  pesel: z.string(),
  status: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  passportID: z.string(),
  caregiverLeave: z.string(),
});

export type EZLA = z.infer<typeof EZLA>;

export type EzlaChecker = {
  array: any[];
  client: Client;
  receiverMail: Email;
};

export type Xpertis = {
  fmno: string;
  pesel: string;
  passport: string;
};

export type Asistar = {
  fmno: string;
  firstName: string;
  lastName: string;
  mail: Email;
  pdmMail: string;
};

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
