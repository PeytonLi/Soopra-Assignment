import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

function readEnvFile(path) {
  if (!existsSync(path)) return {};

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((rawLine) => rawLine.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        return [key, value];
      }),
  );
}

const env = {
  ...readEnvFile(".env"),
  ...readEnvFile(".env.local"),
  ...process.env,
};

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const sessionId = `supabase-check-${randomUUID()}`;

async function insertAndDelete(table, row) {
  const { data, error } = await supabase.from(table).insert(row).select("id").single();

  if (error) {
    return {
      table,
      ok: false,
      code: error.code,
      message: error.message,
    };
  }

  const { error: deleteError } = await supabase.from(table).delete().eq("id", data.id);

  return {
    table,
    ok: !deleteError,
    inserted: true,
    deleted: !deleteError,
    code: deleteError?.code,
    message: deleteError?.message,
  };
}

const results = await Promise.all([
  insertAndDelete("assistant_events", {
    session_id: sessionId,
    event_type: "connection_check",
    payload: { source: "check-supabase" },
  }),
  insertAndDelete("pickup_orders", {
    session_id: sessionId,
    customer_name: "Connection Check",
    pickup_time: "12:30",
    status: "submitted",
    items: [{ menuItemId: "harvest-bowl", name: "Harvest Bowl", quantity: 1 }],
    total_nutrition: { calories: 685, protein: 33, carbs: 65, fat: 34 },
    allergy_warnings: [],
    constraints: { allergens: [], avoidIngredients: [], dietaryPrefs: [], nutritionGoal: "balanced" },
  }),
]);

console.log(JSON.stringify(results, null, 2));

if (results.some((result) => !result.ok)) {
  process.exitCode = 1;
}
