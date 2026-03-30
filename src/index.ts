import { createApp } from './app.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? '8787');

async function main() {
  const app = await createApp();

  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

await main();
