import z from "zod";

export const email = z.email();
export type Email = z.infer<typeof email>;

export type GraphEmail = {
  subject: string;
  bodyHtml: string;
  recipients: Email[];
};

export class GraphApiError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "GraphApiError";
    this.cause = cause;
  }
}
