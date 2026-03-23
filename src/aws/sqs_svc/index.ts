import { SQSClient, SendMessageCommand, type SendMessageCommandInput } from "@aws-sdk/client-sqs";
import { SickLeaveByTL } from "../../types";
import { randomUUID } from "node:crypto";

const client = new SQSClient();

export async function pushSickLeavesToSqs(sickLeaves: SickLeaveByTL[], url: string) {
  console.log("[ pushSickLeave ] sending messages to SQS");

  try {
    const promises = sickLeaves.map((sickLeave, i) => {
      console.log(`[ pushSickLeave ] sending ${i} message`);

      const input: SendMessageCommandInput = {
        QueueUrl: url,
        MessageBody: JSON.stringify(sickLeave),
        MessageDeduplicationId: randomUUID(),
        MessageGroupId: "queue_sick_leave_message",
      };

      const command = new SendMessageCommand(input);

      return client.send(command);
    });

    const res = await Promise.all(promises);
    return res;
  } catch (e) {
    console.error(`[ pushSickLeave ] error while sending sqs: ${e}`);
    throw new Error(`[ pushSickLeave ] error while sending sqs: ${e}`);
  }
}
