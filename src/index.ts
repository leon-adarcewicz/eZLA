import * as dotenv from "dotenv";
dotenv.config();
import CsvToJson from "csvtojson";
import XLSX from "xlsx";
import {
  tryCombineRecords,
  groupByPdmAndSortByLastName,
  returnAsistarObjs,
  returnEzlaObjs,
  returnXpertisObjs,
  //   isAwsDynamoError,
  generateTable,
  generateEzlaFileName,
  returnTableName,
  generateHewHireTable,
  returnConfirmedEnv,
} from "./utils";
