import { runPopulate } from "./populateService";

runPopulate().catch((e) => {
  console.error("❌  Fatal error:", e);
  process.exit(1);
});
