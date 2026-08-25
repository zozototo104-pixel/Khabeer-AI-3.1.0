import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const databaseUrl = process.env.DATABASE_URL;
const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;
const port = Number(process.env.SQL_PORT || 5432);
const sslMode = process.env.SQL_SSL_MODE?.trim().toLowerCase();

if (!databaseUrl && (!sqlHost || !sqlDbName || !user || !password)) {
  throw new Error("Missing database credentials in environment variables.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: databaseUrl
    ? { url: databaseUrl }
    : {
        host: sqlHost!,
        port: Number.isInteger(port) ? port : 5432,
        user: user!,
        password: password!,
        database: sqlDbName!,
        ssl: sslMode === 'require' || sslMode === 'verify-full',
      },
  verbose: true,
});
