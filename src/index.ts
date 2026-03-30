import { createApp } from './app.js';
import { loadEnvConfig } from './config/env.js';

async function main() {
  const config = loadEnvConfig();
  const app = await createApp();

  try {
    await app.listen({
      host: config.server.host,
      port: config.server.port,
    });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

await main();
