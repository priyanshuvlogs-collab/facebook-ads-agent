/**
 * CLI entrypoint for the Free API Hunter.
 *
 * Usage:
 *   npm run hunter:run                                   # all categories
 *   npm run hunter:run -- TEXT_TO_SPEECH YOUTUBE_DATA    # specific categories
 */
import { API_CATEGORIES, createLogger } from "@yta/shared";
import type { ApiCategory } from "@yta/shared";
import { FreeApiHunter } from "@yta/api-hunter";

const logger = createLogger("hunter-cli");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const categories = args.filter((arg): arg is ApiCategory =>
    (API_CATEGORIES as readonly string[]).includes(arg)
  );
  const invalid = args.filter((a) => !(API_CATEGORIES as readonly string[]).includes(a));
  if (invalid.length > 0) {
    logger.error(`Unknown categories: ${invalid.join(", ")}`);
    logger.info(`Valid categories: ${API_CATEGORIES.join(", ")}`);
    process.exit(1);
  }

  const hunter = new FreeApiHunter();
  const result = await hunter.run(
    categories.length > 0 ? { categories } : {}
  );

  logger.info("Run complete", {
    runId: result.runId,
    status: result.status,
    reposScanned: result.reposScanned,
    discovered: result.apisDiscovered,
    updated: result.apisUpdated,
  });
  if (result.errors.length > 0) {
    logger.warn(`Completed with ${result.errors.length} errors`);
    for (const error of result.errors.slice(0, 10)) logger.warn(`  - ${error}`);
  }
  process.exit(result.status === "COMPLETED" ? 0 : 1);
}

main().catch((error) => {
  logger.error("Hunter CLI crashed", { error });
  process.exit(1);
});
