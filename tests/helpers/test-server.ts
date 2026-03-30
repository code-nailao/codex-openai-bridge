import { createApp } from '../../src/app.js';

export async function buildTestApp(options?: { env?: NodeJS.ProcessEnv }) {
  const app = await createApp(options);
  return app;
}
