import { createApp } from '../../src/app.js';

export async function buildTestApp() {
  const app = await createApp();
  return app;
}
