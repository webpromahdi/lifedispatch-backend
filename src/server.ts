import app from "./app.js";
import config from "./config/index.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  try {
    await prisma.$connect();
    console.log("Database connected successfully");
    app.listen(config.port, () => {
      console.log(`Example app listening on port ${config.port}`);
    });
  } catch (err) {
    console.log("Error starting the server", err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
