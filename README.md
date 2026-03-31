# eZLA

Serverless pipeline that automates sick leave (eZLA) notification for team leaders and HR — replacing a manual, error-prone process with an event-driven AWS workflow.

**Key highlights:**

- **Fully serverless** — AWS Lambda, SQS FIFO, DynamoDB Streams, EventBridge, CDK
- **Idempotent & deduplicated** — SHA-1 hashing + conditional writes prevent duplicate notifications
- **Integrated with Microsoft 365** — reads SharePoint files and sends emails via Graph API
- **Automated error reporting** — HR is notified of bad data, missing employees, or incomplete org records
- **Saves HR ~1–2 hours per reporting cycle** by eliminating manual cross-referencing across three systems

## My Contribution

Designed and built the entire system solo — architecture, data processing pipeline, deduplication logic, Graph API integration, CDK infrastructure, and CI/CD setup.

## Problem

In Polish companies, medical certificates (eZLA — _elektroniczne Zaświadczenie Lekarskie_) are exported from the PUE ZUS portal as CSV files. HR teams must manually cross-reference these certificates with employee records from two separate systems (Xpertis and Asistar), identify each employee's team leader, and send individual email notifications. This is repetitive and slow.

## Solution

eZLA runs as a scheduled, fully serverless pipeline that:

1. Pulls the eZLA CSV, Xpertis employee list, and Asistar org-structure file from a SharePoint document library via the Microsoft Graph API.
2. Joins records by PESEL or passport number, resolves each employee's team leader (PDM), and detects caregiver leave.
3. Sends structured email alerts to HR when source files have bad structure, employees are missing from Xpertis ("new hires"), or team leader data is incomplete.
4. Groups valid sick leaves by team leader and dispatches them through an SQS FIFO queue → DynamoDB (with SHA-1 deduplication) → DynamoDB Streams → email notification Lambda.
5. Each team leader receives a single HTML email listing their team members' sick leaves. Execution stats are written to a separate DynamoDB table.

## Architecture

```
SharePoint (eZLA CSV + Xpertis XLSX + Asistar XLSX)
        │
        ▼
┌──────────────────────┐    EventBridge (cron, Mon–Fri 08:01 UTC)
│  Lambda: Main        │◄───────────────────────────────────────
│  (createSickLeave    │
│   Records)           │──► HR emails (bad structure / new hires)
│                      │
│  Parse → Join →      │
│  Group by TL         │
└──────────┬───────────┘
           │ SQS FIFO (KMS-encrypted, DLQ after 2 retries)
           ▼
┌──────────────────────┐
│  Lambda: Tracker     │
│  (pushMsgToDynamo)   │──► DynamoDB `ezla` table
│                      │    (pk = SHA-1, TTL = 30 days, PITR)
│  Dedup via           │
│  conditional put     │
└──────────────────────┘
           │ DynamoDB Stream (NEW_IMAGE, INSERT only)
           ▼
┌──────────────────────┐
│  Lambda: Final       │
│  (sendMsgToTl)       │──► Graph API sendMail → Team Leader
│                      │──► DynamoDB `stats` table
│  concurrency = 1     │
└──────────────────────┘
```

**Data flow step-by-step:**

1. **Main Lambda** authenticates with Azure AD (client credentials), resolves the SharePoint drive, and reads three files from a configured folder path.
2. Each file is validated with Zod schemas. Failures trigger an HR notification email describing the exact missing columns.
3. eZLA records are matched to Xpertis by PESEL/passport to obtain the employee file number (FMNO), then to Asistar to resolve name, email, and team leader.
4. Unmatched records are categorized as "incomplete" (no TL found) or "new hires" (not in Xpertis) and reported to HR.
5. Complete records are grouped by team leader, serialized as JSON, and sent to an SQS FIFO queue (one message per TL group).
6. The processed eZLA file is moved to a backup folder on SharePoint.
7. **Tracker Lambda** consumes SQS messages, computes a SHA-1 hash of each payload, and writes to DynamoDB with a conditional put (prevents duplicates).
8. **Final Lambda** is triggered by the DynamoDB stream on INSERT events. It reads the full record, composes an HTML email with a table of sick leaves, and sends it via Graph API. In production, both the team leader and HR receive the email. A stats row is written for audit.

## Tech Stack

| Layer         | Technology                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Language      | TypeScript (ESM)                                                                                 |
| Runtime       | Node.js 22 (AWS Lambda, Docker images)                                                           |
| Validation    | Zod                                                                                              |
| Cloud         | AWS Lambda, SQS FIFO, DynamoDB (Streams, TTL, PITR), EventBridge, ECR, KMS, Secrets Manager, SNS |
| IaC           | AWS CDK v2                                                                                       |
| External APIs | Microsoft Graph API (SharePoint files, sendMail)                                                 |
| Auth          | Azure AD client credentials (via `@azure/identity`)                                              |
| File parsing  | csvtojson, SheetJS (xlsx)                                                                        |
| CI            | GitHub Actions (depcheck, test, build), pre-commit (GitGuardian, depcheck, test, build)          |

## Getting Started

### Prerequisites

- Node.js 22+
- AWS CLI configured with appropriate credentials
- An Azure AD app registration with Microsoft Graph permissions (`Sites.Read.All`, `Mail.Send`)
- A SharePoint site with the expected folder structure

### Installation

```bash
git clone https://github.com/leon-adarcewicz/eZLA.git
cd eZLA
npm ci
```

### Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

| Variable                    | Description                                        |
| --------------------------- | -------------------------------------------------- |
| `SENDER_MAIL`               | Email address used as the "from" in Graph sendMail |
| `HR_MAIL`                   | HR team email for error/incomplete notifications   |
| `SQS_URL`                   | URL of the SQS FIFO queue                          |
| `AWS_REGION`                | AWS region (e.g. `us-east-1`)                      |
| `AWS_ACCOUNT_ID`            | AWS account ID (CDK deployment only)               |
| `DYNAMO_ENDPOINT`           | DynamoDB endpoint URL                              |
| `AZURE_APP_CLIENT_ID`       | Azure AD application (client) ID                   |
| `AZURE_CLIENT_SECRET`       | Azure AD client secret                             |
| `AZURE_TENANT_ID`           | Azure AD tenant ID                                 |
| `SHAREPOINT_HOST`           | SharePoint site hostname                           |
| `SHAREPOINT_SITE_WEB_ID`    | SharePoint site/web ID                             |
| `CHECK_SITE_WEB_ID`         | Site ID used to toggle test vs. production routing |
| `MAIN_FOLDER_NAME`          | Root folder name on SharePoint                     |
| `DATA_FOLDER_NAME`          | Subfolder containing input files                   |
| `REQUEST_NAME`              | Request-specific subfolder name                    |
| `REPORT_FOLDER_NAME`        | Report output folder                               |
| `REPORT_BACKUP_FOLDER_NAME` | Processed file archive folder                      |

### Build & Test

```bash
npm run build    # TypeScript → dist/
npm test         # Jest with ts-jest (ESM)
```

### Deploy Infrastructure

```bash
cd infra
npm ci
npx cdk synth    # validate CloudFormation output
npx cdk deploy   # deploy to AWS (requires credentials + env vars)
```

### Build Docker Images

Each Lambda has its own Dockerfile — build from the repo root:

```bash
docker build -f Dockerfile.lambda.main -t ezla-main .
docker build -f Dockerfile.lambda.tracker -t ezla-tracker .
docker build -f Dockerfile.lambda.final -t ezla-final .
```

## Usage

### Typical Workflow

1. HR exports the eZLA CSV from PUE ZUS and uploads it to the configured SharePoint folder alongside the current Xpertis and Asistar files.
2. The Main Lambda runs on schedule (Mon–Fri at 10:01 CET) or is invoked manually.
3. If source files have structural issues, HR receives an email specifying which columns are missing.
4. If employees are unmatched ("new hires"), HR receives a table of PESEL/passport IDs to add to Xpertis.
5. Each team leader receives an email like:

```
Subject: eZLA - team sick leaves

Dear Jan,

Please find the list of your team members sick leaves:

┌───────┬────────────┬───────────┬────────────┬────────────┬────────────────┐
│ FMNO  │ First name │ Last Name │ Start date │ End date   │ Caregiver leave│
├───────┼────────────┼───────────┼────────────┼────────────┼────────────────┤
│ 12345 │ Anna       │ Kowalska  │ 2026-03-25 │ 2026-03-31 │ NO             │
│ 67890 │ Piotr      │ Nowak     │ 2026-03-28 │ 2026-04-04 │ YES            │
└───────┴────────────┴───────────┴────────────┴────────────┴────────────────┘

Best regards,
Local HR Team
```

## Project Structure

```
src/
├── lambda_main.ts          # Entry point: fetch files, validate, combine, send to SQS
├── lambda_tracker.ts       # SQS consumer: deduplicate and write to DynamoDB
├── lambda_final.ts         # DynamoDB Stream consumer: email team leaders, write stats
├── config.ts               # Centralized env-var loading with runtime validation
├── types.ts                # Zod schemas for eZLA, Xpertis, Asistar, SickLeave, SickLeaveByTL
├── utils.ts                # Record joining, grouping, HTML table generation, file naming
├── aws/
│   ├── dynamo_svc/         # DynamoDB put (conditional), get, stats helpers
│   └── sqs_svc/            # SQS FIFO send with message group/dedup IDs
├── ms_graphAPI/
│   ├── index.ts            # Graph client initialization (Azure AD client credentials)
│   ├── file_svc.ts         # File content download, move operations
│   ├── folder_svc.ts       # Folder lookup/creation
│   ├── email_svc.ts        # sendMail wrapper
│   └── types.ts            # Graph-specific types (GraphEmail, Email, etc.)
└── __tests__/              # Jest tests for each Lambda and utility module

infra/
├── bin/infra.ts            # CDK app entry — defines QA and PROD stacks
└── lib/infra-stack.ts      # Full stack: DynamoDB, SQS, Lambda (ECR), EventBridge, KMS, SNS
```

## Design Decisions

- **SQS FIFO (not Standard)** — sick leave notifications are grouped per team leader. FIFO guarantees ordering and exactly-once delivery, preventing a TL from receiving duplicate or out-of-order batches within the same processing window.
- **DynamoDB Streams → separate Final Lambda** — decouples email delivery from data persistence. If email sending fails or throttles, the record is already stored. The stream retry mechanism handles transient Graph API failures without re-processing the entire pipeline.
- **SHA-1 conditional put for deduplication** — if the same eZLA file is accidentally processed twice (e.g. manual re-trigger), identical payloads produce the same hash. The conditional `PutItem` silently skips duplicates instead of sending repeat emails.
- **Reserved concurrency = 1 on Final Lambda** — Microsoft Graph `sendMail` has per-mailbox rate limits. Serializing email sends avoids 429 throttling without needing a custom rate limiter.
- **Serverless over containers** — the workload is bursty (runs once per business day, processes in seconds). Lambda + event sources eliminate idle cost and operational overhead of maintaining a running service.

## Future Improvements

- **Fix environment case mismatch** — CDK passes `ENV=PROD` but `lambda_final.ts` checks `=== "prod"`. Normalize to avoid production emails routing only to the sender.
- **Structured logging** — replace `console.log`/`console.warn` with a structured logger (e.g. Powertools for AWS Lambda) to improve observability and enable metric filters.
- **Retry & alerting granularity** — add CloudWatch alarms on SQS DLQ depth and Lambda error rates for faster incident response.
