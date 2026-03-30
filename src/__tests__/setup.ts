// Global setup for Jest to set environment variables before all tests run
async function setup_(_globalConfig: any, _: any) {
  // Backup original environment variables
  (globalThis as any).__ORIGINAL_ENV__ = { ...process.env };

  // Set test environment variables
  process.env.SENDER_MAIL = "test@example.com";
  process.env.HR_MAIL = "hr@example.com";
  process.env.SQS_URL = "https://sqs.us-east-1.amazonaws.com/123456789012/test-queue";
  process.env.AWS_REGION = "us-east-1";
  process.env.DYNAMO_ENDPOINT = "http://localhost:8000";
  process.env.AZURE_APP_CLIENT_ID = "test-client-id";
  process.env.AZURE_CLIENT_SECRET = "test-client-secret";
  process.env.AZURE_TENANT_ID = "test-tenant-id";
  process.env.SHAREPOINT_HOST = "test.sharepoint.com";
  process.env.MAIN_FOLDER_NAME = "Main";
  process.env.DATA_FOLDER_NAME = "Data";
  process.env.REQUEST_NAME = "Request";
  process.env.REPORT_FOLDER_NAME = "Reports";
  process.env.REPORT_BACKUP_FOLDER_NAME = "ReportsBackup";
  process.env.CHECK_SITE_WEB_ID = "test-web-id";
  process.env.SHAREPOINT_SITE_WEB_ID = "test-site-web-id";
}
export default setup_;
