import type { Client } from "@microsoft/microsoft-graph-client";
import type { Email, GraphEmail } from "./types";
import type { Message } from "@microsoft/microsoft-graph-types";

export async function sendEmail(client: Client, fromEmail: Email, message: GraphEmail) {
  console.log(`[ sendEmail ] sending email to ${message.recipients}`);
  const graphMessage: Message = {
    subject: message.subject,
    body: {
      contentType: "html",
      content: message.bodyHtml,
    },
    toRecipients: message.recipients.map((email) => ({ emailAddress: { address: email } })),
  };
  return await sendGraphEmail(client, fromEmail, graphMessage);
}

export async function sendGraphEmail(client: Client, userMail: string, message: Message) {
  console.log(`[ sendEmailGraphApi ] sending emails with GraphAPI`);

  const requestBody = {
    message,
    saveToSentItems: false, // Indicates whether to save the message in Sent Items. Specify it only if the parameter is false; default is true. Optional.
  };
  // If successful, this method returns 202 Accepted response code. It doesn't return anything in the response body.
  await client.api(`users/${userMail}/sendMail`).post(requestBody);
}
