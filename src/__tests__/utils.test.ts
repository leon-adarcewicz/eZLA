import { returnConfirmedEnv } from "../utils";

describe("returnConfirmedEnv", () => {
  const ORIGINAL_ENV = process.env;

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("returns value of existing env variable", () => {
    process.env.TEST_VAR = "hello";
    expect(returnConfirmedEnv("TEST_VAR")).toBe("hello");
  });

  it("throws when env variable does not exist", () => {
    delete process.env.TEST_VAR;
    expect(() => returnConfirmedEnv("TEST_VAR")).toThrow("Couldn't find env variable: TEST_VAR");
  });
});
