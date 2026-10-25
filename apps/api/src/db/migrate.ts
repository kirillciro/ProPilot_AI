import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.js";

// Uses drizzle-orm directly because drizzle-kit is a dev dependency and is pruned from deploys.
// Relative to the working directory, which npm sets to apps/api.
await migrate(db, { migrationsFolder: "drizzle" });
await pool.end();
console.log("Migrations applied");
