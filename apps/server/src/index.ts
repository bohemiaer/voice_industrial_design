import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";

const host = "0.0.0.0";

async function start(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({
    persistenceMode: "postgres"
  });

  try {
    await app.listen({
      port: config.serverPort,
      host
    });
    app.log.info(`server listening on http://${host}:${config.serverPort}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
