#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { InfraStack } from "../lib/infra-stack";

const app = new cdk.App();

const qaEvn = {
  account: process.env.AWS_ACCOUNT_ID,
  region: process.env.AWS_REGION,
};
const qaStack = new InfraStack(app, "QAInfraStack", {
  env: qaEvn,
  envPrefix: "QA",
});
cdk.Tags.of(qaStack).add("environment", "qa");
cdk.Tags.of(qaStack).add("process", "eZLA");

const prodEvn = {
  account: process.env.AWS_ACCOUNT_ID,
  region: "us-east-1",
};
const prodStack = new InfraStack(app, "InfraStack", {
  env: prodEvn,
  envPrefix: "PROD",
});
cdk.Tags.of(prodStack).add("environment", "prod");
cdk.Tags.of(prodStack).add("process", "eZLA");
