const http = require("node:http");

const app = require("./server");
const { connectToMongo } = require("./mongo");

const PORT = Number.parseInt(process.env.PORT || "3000", 10);

async function main() {
  await connectToMongo();

  const server = http.createServer(app);
  server.listen(PORT, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`[api] listening on :${PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[api] fatal error:", err);
  process.exitCode = 1;
});

