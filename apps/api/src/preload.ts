import SentenceTransformer from "@ts-rag/embeddings";
import CrossEncoder from "./service/rag/crossEncoder";
import { rm } from "node:fs/promises";
import path from "node:path";

const main = async () => {
  // Resolved rather than derived from process.cwd(), since workspace installs
  // typically hoist this package to the repo root's node_modules, not this package's own.
  const resolvedEntry = require.resolve("@huggingface/transformers");
  const packageDir = path.join("node_modules", "@huggingface", "transformers");
  const packageRoot = resolvedEntry.slice(0, resolvedEntry.lastIndexOf(packageDir) + packageDir.length);
  const cacheDir = path.join(packageRoot, ".cache");

  try {
    await rm(cacheDir, { recursive: true, force: true });
    console.log(`🧹  Cleared cache at ${cacheDir}`);
  } catch (err) {
    console.warn(`⚠️  Could not clear cache (it may not exist):\n${err}`);
  }

  await Promise.all([SentenceTransformer.encode(["yo"]), CrossEncoder.getInstance()]);

  console.log("✅  Models preloaded");
};

main().catch((e) => {
  console.error("❌  Fatal error:", e);
  process.exit(1);
});
