import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamo from "aws-cdk-lib/aws-dynamodb";
import * as kms from "aws-cdk-lib/aws-kms";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as destinations from "aws-cdk-lib/aws-lambda-destinations";
import * as events from "aws-cdk-lib/aws-events";
import * as evTargets from "aws-cdk-lib/aws-events-targets";
import * as lambdaESs from "aws-cdk-lib/aws-lambda-event-sources";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { config } from "../../src/config";

export type EnvPrefix = "PROD" | "QA";

export interface SelfStackProps extends cdk.StackProps {
  envPrefix: EnvPrefix;
}

export class InfraStack extends cdk.Stack {
  private readonly ezlaTableName = "ezla";
  private readonly statsTableName = "stats";
  // add emails of people responsible for the project
  // to receive notifications about process failures
  private readonly devTeam = [];

  constructor(scope: Construct, id: string, props: SelfStackProps) {
    super(scope, id, props);

    //* SECRETS
    const azureTenant = new cdk.aws_secretsmanager.Secret(this, "AzureTenant", {
      secretName: "AzureTenant",
      description: "Azure Tenant ID for eZLA project",
    });

    const azureAppId = new cdk.aws_secretsmanager.Secret(this, "AzureAppId", {
      secretName: "AzureAppId",
      description: "Azure App ID for eZLA project",
    });

    const azureAppSecret = new cdk.aws_secretsmanager.Secret(this, "AzureAppSecret", {
      secretName: "AzureAppSecret",
      description: "Azure App Secret for eZLA project",
    });

    //* KSM
    const masterKey = new kms.Key(this, "MasterKey", {
      alias: "Master_Key",
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const sqsKMS = new kms.Key(this, "sqsKMS", {
      alias: "sqsKMS",
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const snsKey = new kms.Key(this, "snsKey", {
      alias: "snsKey",
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    //* DYNAMODB
    const genericStatsTable = new dynamo.Table(this, this.statsTableName, {
      partitionKey: { name: "PK", type: dynamo.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamo.AttributeType.STRING },
      billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
      encryption: dynamo.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: masterKey,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    genericStatsTable.addGlobalSecondaryIndex({
      indexName: "GSI",
      partitionKey: { name: "GSIPK", type: dynamo.AttributeType.STRING },
      sortKey: { name: "GSISK", type: dynamo.AttributeType.STRING },
      projectionType: dynamo.ProjectionType.ALL,
    });

    const ezlaTable = new dynamo.Table(this, this.ezlaTableName, {
      partitionKey: { name: "pk", type: dynamo.AttributeType.STRING },
      billingMode: dynamo.BillingMode.PAY_PER_REQUEST,
      encryption: dynamo.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: masterKey,
      pointInTimeRecovery: true,
      timeToLiveAttribute: "ttl",
      stream: dynamo.StreamViewType.NEW_IMAGE,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    //* ECR
    const ecrLifecycleRules: ecr.LifecycleRule[] = [
      {
        rulePriority: 1,
        description: "Prevent deletion of the image tagged as 'latest'",
        tagPrefixList: ["latest"],
        tagStatus: ecr.TagStatus.TAGGED,
        maxImageCount: 1,
      },
      {
        rulePriority: 2,
        description: "Retain only the 5 most recent images",
        tagStatus: ecr.TagStatus.ANY, // Applies to all images
        maxImageCount: 5, // Retain the 5 most recent images
      },
    ];

    const mainLambdaRepo = new ecr.Repository(this, "MainLambdaRepo", {
      imageScanOnPush: true,
      repositoryName: "main-lambda-repo",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: ecrLifecycleRules,
    });

    const trackerLambdaRepo = new ecr.Repository(this, "TrackerLambdaRepo", {
      imageScanOnPush: true,
      repositoryName: "tracker-lambda-repo",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: ecrLifecycleRules,
    });

    const finalLambdaRepo = new ecr.Repository(this, "FinalLambdaRepo", {
      imageScanOnPush: true,
      repositoryName: "final-lambda-repo",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: ecrLifecycleRules,
    });

    //* create SNS topics to inform team about process failures
    const ezlaDlqTopic = new sns.Topic(this, "ezlaDlqTopic", {
      masterKey: snsKey,
    });
    for (const email of this.devTeam) {
      ezlaDlqTopic.addSubscription(new subscriptions.EmailSubscription(email, { json: true }));
    }

    //* create SQS to handle messages from eZLA lambda
    const ezlaSickLeavesSqsDlq = new sqs.Queue(this, "ezlaSickLeavesSqsDlq", {
      visibilityTimeout: cdk.Duration.minutes(1),
      fifo: true,
      encryptionMasterKey: sqsKMS,
    });

    const ezlaSickLeavesSQS = new sqs.Queue(this, "ezlaSickLeavesSQS", {
      visibilityTimeout: cdk.Duration.minutes(1),
      retentionPeriod: cdk.Duration.days(7),
      deadLetterQueue: {
        queue: ezlaSickLeavesSqsDlq,
        maxReceiveCount: 2,
      },
      fifo: true,
      encryptionMasterKey: sqsKMS,
    });

    const ezlaMain = new lambda.Function(this, "EzlaGetDocsAndProcessData", {
      memorySize: 256,
      functionName: "eZLA_main",
      timeout: cdk.Duration.minutes(1),
      retryAttempts: 0,
      code: lambda.Code.fromEcrImage(mainLambdaRepo, {
        cmd: ["./dist/lambda_main.createSickLeaveRecords"],
      }),
      handler: lambda.Handler.FROM_IMAGE,
      description:
        "main eZLA Lambda function to pull data from SharePoint, process it and save to DynamoDB",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        SENDER_MAIL: config.senderMail,
        HR_MAIL: config.hrMail,
        // AWS
        SQS_URL: ezlaSickLeavesSQS.queueUrl,
        // AZURE
        AZURE_APP_CLIENT_ID: azureAppId.secretValue.toString(), // secret going to be stored when CDK is deployed. OK for this use case
        AZURE_CLIENT_SECRET: azureAppSecret.secretValue.toString(),
        AZURE_TENANT_ID: azureTenant.secretValue.toString(),
        // SHAREPOINT
        SHAREPOINT_HOST: config.host,
        SHAREPOINT_SITE_WEB_ID: config.siteWebId,
        CHECK_SITE_WEB_ID: config.checkSiteWebID,
        MAIN_FOLDER_NAME: config.mainFolderName,
        DATA_FOLDER_NAME: config.dataFolderName,
        REQUEST_NAME: config.requestName,
        REPORT_FOLDER_NAME: config.reportFolderName,
        REPORT_BACKUP_FOLDER_NAME: config.reportBackupFolderName,
      },
      onFailure: new destinations.SnsDestination(ezlaDlqTopic),
    });
    // grant accesses
    ezlaDlqTopic.grantPublish(ezlaMain);
    azureTenant.grantRead(ezlaMain);
    azureAppId.grantRead(ezlaMain);
    azureAppSecret.grantRead(ezlaMain);
    // provide WRITE access TO MAIN Lambda
    ezlaSickLeavesSQS.grantSendMessages(ezlaMain);

    const scheduleCallEzla = new events.Rule(this, "callEzlaAt10am", {
      schedule: events.Schedule.cron({ hour: "08", minute: "01", weekDay: "MON-FRI" }),
      description:
        "Call eZLA function to get documents and process data to create records for further processing",
      ruleName: "callEzlaAt10amRule",
      enabled: false,
    });
    scheduleCallEzla.addTarget(new evTargets.LambdaFunction(ezlaMain, { retryAttempts: 0 }));

    const ezlaTracker = new lambda.Function(this, "EzlaPushMsgToDynamo", {
      memorySize: 256,
      timeout: cdk.Duration.minutes(1),
      retryAttempts: 0,
      code: lambda.Code.fromEcrImage(trackerLambdaRepo, {
        cmd: ["./dist/lambda_tracker.pushMsgToDynamo"],
      }),
      handler: lambda.Handler.FROM_IMAGE,
      description: "Get msg from sqs and try push it to Dynamo",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        AWS_REGION: this.region,
        DYNAMO_TABLE: ezlaTable.tableName,
        EZLA_SNS_DLQ_URL: ezlaDlqTopic.topicArn,
        DYNAMO_ENDPOINT: `https://dynamodb.${this.region}.amazonaws.com`,
      },
    });
    // grant accesses
    ezlaTable.grantReadWriteData(ezlaTracker);
    ezlaTracker.addEventSource(new lambdaESs.SqsEventSource(ezlaSickLeavesSQS));

    const ezlaFinal = new lambda.Function(this, "EzlaSendMsgToTLs.", {
      functionName: "eZLA_send_msg_to_TLs",
      memorySize: 256,
      timeout: cdk.Duration.minutes(2),
      retryAttempts: 0,
      code: lambda.Code.fromEcrImage(finalLambdaRepo, {
        cmd: ["./dist/lambda_final.sendMsgToTl"],
      }),
      handler: lambda.Handler.FROM_IMAGE,
      description: "Send message to TLs about Sick Leaves",
      runtime: lambda.Runtime.NODEJS_22_X,
      reservedConcurrentExecutions: 1,
      environment: {
        ENV: props.envPrefix,
        RECORDS_TABLE_NAME: ezlaTable.tableName,
        STATS_TABLE_NAME: genericStatsTable.tableName,
        HR_MAIL: config.hrMail,
        SENDER_MAIL: config.senderMail,
        AZURE_APP_CLIENT_ID: azureAppId.secretValue.toString(), // secret going to be stored when CDK is deployed. OK for this use case
        AZURE_CLIENT_SECRET: azureAppSecret.secretValue.toString(),
        AZURE_TENANT_ID: azureTenant.secretValue.toString(),
        AWS_REGION: this.region,
        DYNAMO_ENDPOINT: `https://dynamodb.${this.region}.amazonaws.com`,
      },
    });
    ezlaTable.grantReadWriteData(ezlaFinal);
    genericStatsTable.grantWriteData(ezlaFinal);
    azureTenant.grantRead(ezlaFinal);
    azureAppId.grantRead(ezlaFinal);
    azureAppSecret.grantRead(ezlaFinal);

    ezlaFinal.addEventSource(
      new lambdaESs.DynamoEventSource(ezlaTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 1,
        retryAttempts: 0,
        onFailure: new lambdaESs.SnsDlq(ezlaDlqTopic),
      }),
    );
    ezlaDlqTopic.grantPublish(ezlaFinal);
  }
}
