import { migrate } from "../lib/db";

function describeTarget() {
  const url = process.env.DATABASE_URL;
  if (!url) return "(DATABASE_URL not set)";
  try {
    const parsed = new URL(url);
    const port = parsed.port || "5432";
    return `${parsed.hostname}:${port}${parsed.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

console.log(`Migrating ${describeTarget()}`);

migrate()
  .then(() => console.log("✓ Schema applied: transactions, category_rules"))
  .catch((err) => {
    console.error("✗ Migration failed:", err.message);
    process.exit(1);
  });
