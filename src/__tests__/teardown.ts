async function teardown_(_globalConfig: any, _: any) {
  if ((globalThis as any).__ORIGINAL_ENV__) {
    process.env = { ...(globalThis as any).__ORIGINAL_ENV__ };
  }
}
export default teardown_;
