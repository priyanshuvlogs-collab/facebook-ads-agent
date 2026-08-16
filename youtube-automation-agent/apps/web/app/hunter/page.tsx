import { API_CATEGORY_LABELS } from "@yta/shared";
import type { ApiCategory, HunterRunDto } from "@yta/shared";
import { fetchApi } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/format";
import { RunHunterButton } from "./run-button";

export const dynamic = "force-dynamic";

interface CategoriesResponse {
  categories: { category: ApiCategory; label: string; queries: number; weight: number }[];
}

export default async function HunterPage() {
  const [runs, categories] = await Promise.all([
    fetchApi<{ items: HunterRunDto[]; inProgress: boolean }>("/api/hunter/runs"),
    fetchApi<CategoriesResponse>("/api/hunter/categories"),
  ]);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Free API Hunter</h1>
        <p className="page-sub">
          The hunter searches GitHub for free/public APIs, analyzes READMEs for
          endpoints, rate limits and free-tier quality, then scores and stores
          everything in the directory.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <strong>
              {runs?.inProgress ? "A hunt is currently running..." : "Ready to hunt"}
            </strong>
            <p className="dim" style={{ fontSize: 13 }}>
              Scans {categories?.categories?.length ?? 10} categories. A GitHub
              token (GITHUB_TOKEN) is strongly recommended for higher rate limits.
            </p>
          </div>
          <RunHunterButton disabled={runs === null || runs.inProgress} />
        </div>
      </div>

      {categories?.categories && (
        <>
          <h2 className="section-title">Hunt categories</h2>
          <div className="api-grid" style={{ marginBottom: 24 }}>
            {categories.categories.map((entry) => (
              <div key={entry.category} className="card">
                <strong style={{ fontSize: 14 }}>{entry.label}</strong>
                <p className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>
                  {entry.queries} search queries · pipeline weight{" "}
                  {(entry.weight * 100).toFixed(0)}%
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="section-title">Run history</h2>
      {runs === null ? (
        <div className="notice">
          Could not load runs - is the API server running?
        </div>
      ) : runs.items.length === 0 ? (
        <div className="empty">
          <h3>No hunts yet</h3>
          <p>Start your first hunt above, or run: npm run hunter:run</p>
        </div>
      ) : (
        <div className="card">
          <table className="data">
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
                <th>Categories</th>
                <th>Queries</th>
                <th>Repos scanned</th>
                <th>New APIs</th>
                <th>Updated</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.items.map((run) => (
                <tr key={run.id}>
                  <td>
                    {formatDate(run.startedAt)}
                    <div className="dim" style={{ fontSize: 12 }}>
                      {timeAgo(run.startedAt)}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        run.status === "COMPLETED"
                          ? "badge-excellent"
                          : run.status === "RUNNING"
                            ? "badge-limited"
                            : "badge-poor"
                      }`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="dim" style={{ maxWidth: 220 }}>
                    {run.categories.length >= 10
                      ? "All"
                      : run.categories
                          .map((category) => API_CATEGORY_LABELS[category])
                          .join(", ")}
                  </td>
                  <td>{run.queriesExecuted}</td>
                  <td>{run.reposScanned}</td>
                  <td style={{ color: "var(--green)" }}>+{run.apisDiscovered}</td>
                  <td>{run.apisUpdated}</td>
                  <td className="dim">
                    {run.finishedAt
                      ? `${Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000)}s`
                      : "running"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
