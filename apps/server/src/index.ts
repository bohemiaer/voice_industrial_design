import Fastify from "fastify";

const app = Fastify({
  logger: true
});

app.get("/health", async () => {
  return {
    ok: true,
    service: "voice-industrial-design-server"
  };
});

const port = Number(process.env.SERVER_PORT ?? 8787);
const host = "0.0.0.0";

app
  .listen({ port, host })
  .then(() => {
    app.log.info(`server listening on http://${host}:${port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
