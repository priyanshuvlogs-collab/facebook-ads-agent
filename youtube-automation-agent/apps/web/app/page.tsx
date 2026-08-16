import Link from "next/link";
import { API_CATEGORY_LABELS } from "@yta/shared";
import type { ApiCategory, FreeTierQuality, HunterRunDto } from "@yta/shared";
import { fetchApi } from "@/lib/api";
import { CategoryBadge, FreeTierBadge, ScoreRing } from "@/components/badges";
import { formatStars, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Stats {
  total: number;
  byCategory: { category: ApiCategory; count: number }[];
  byFreeTier: { freeTierQuality: FreeTierQuality; count: number }[];
  topApis: {
    id: string;
    fullName: string;
    category: ApiCategory;
    stars: number;
    overallScore: number;
    freeTierQuality: FreeTierQuality;
  }[];
}

interface Capabilities {
  database: boolean;
  githubToken: boolean;
  aiProviders: string[];
  ttsProviders: string[];
  youtubePublishing: boolean;
}

export default async function DashboardPage() {
  const [stats, runs, capabilities] = await Promise.all([
    fetchApi<Stats>("/api/apis/stats"),
    fetchApi<{ items: HunterRunDto[]; inProgress: boolean }>("/api/hunter/runs"),
    fetchApi<Capabilities>("/api/capabilities"),
  ]);

  const offline = stats === null && capabilities === null;
  const lastRun = runs?.items?.[0];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">
          Faceless YouTube automation powered by free APIs discovered on GitHub.
        </p>
      </div>

      {offline && (
        <div className="notice">
          The API server is not reachable. Start it with{" "}
          <code>npm run dev</code> (and Postgres with{" "}
          <code>docker compose up -d</code>), then refresh.
        </div>
      )}

      <div className="stat-grid">
        <div className="card">
          <div className="stat-value">{stats?.total ?? "—"}</div>
          <div className="stat-label">Free APIs discovered</div>
        </div>
        <div className="card">
          <div className="stat-value">
            {stats?.byFreeTier?.find((f) => f.freeTierQuality === "EXCELLENT")
              ?.count ?? "—"}
          </div>
          <div className="stat-label">Excellent free tiers</div>
        </div>
        <div className="card">
          <div className="stat-value">{stats?.byCategory?.length ?? "—"}</div>
          <div className="stat-label">Categories covered</div>
        </div>
        <div className="card">
          <div className="stat-value">
            {lastRun ? timeAgo(lastRun.startedAt) : "never"}
          </div>
          <div className="stat-label">Last hunter run</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Top ranked free APIs
          </h2>
          {stats?.topApis?.length ? (
            <table className="data">
              <tbody>
                {stats.topApis.map((api) => (
                  <tr key={api.id}>
                    <td>
                      <Link href={`/apis/${api.id}`}>
                        <strong>{api.fullName}</strong>
                      </Link>
                      <div className="row" style={{ marginTop: 6 }}>
                        <CategoryBadge category={api.category} />
                        <FreeTierBadge quality={api.freeTierQuality} />
                        <span className="dim">★ {formatStars(api.stars)}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <ScoreRing score={api.overallScore} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              <h3>No APIs yet</h3>
              <p>
                Run the Free API Hunter from the{" "}
                <Link href="/hunter">
                  <u>Hunter Runs</u>
                </Link>{" "}
                page or seed demo data with <code>npm run db:seed</code>.
              </p>
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <h2 className="section-title" style={{ marginTop: 0 }}>
              APIs by category
            </h2>
            {stats?.byCategory?.length ? (
              stats.byCategory.map((row) => (
                <div key={row.category} style={{ marginBottom: 10 }}>
                  <div
                    className="row"
                    style={{ justifyContent: "space-between", marginBottom: 4 }}
                  >
                    <span style={{ fontSize: 13 }}>
                      {API_CATEGORY_LABELS[row.category]}
                    </span>
                    <span className="dim">{row.count}</span>
                  </div>
                  <div className="score-bar">
                    <div
                      className="score-bar-fill"
                      style={{
                        width: `${Math.min((row.count / Math.max(stats.total, 1)) * 100 * 2, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="dim">No data yet.</p>
            )}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2 className="section-title" style={{ marginTop: 0 }}>
              System capabilities
            </h2>
            <table className="data">
              <tbody>
                <CapabilityRow
                  label="Database"
                  value={capabilities?.database ? "connected" : "not configured"}
                  good={capabilities?.database}
                />
                <CapabilityRow
                  label="GitHub token"
                  value={capabilities?.githubToken ? "configured" : "missing (low rate limits)"}
                  good={capabilities?.githubToken}
                />
                <CapabilityRow
                  label="AI providers"
                  value={
                    capabilities?.aiProviders?.length
                      ? capabilities.aiProviders.join(", ")
                      : "none configured"
                  }
                  good={Boolean(capabilities?.aiProviders?.length)}
                />
                <CapabilityRow
                  label="TTS providers"
                  value={
                    capabilities?.ttsProviders?.length
                      ? capabilities.ttsProviders.join(", ")
                      : "none configured"
                  }
                  good={Boolean(capabilities?.ttsProviders?.length)}
                />
                <CapabilityRow
                  label="YouTube publishing"
                  value={capabilities?.youtubePublishing ? "ready" : "not configured"}
                  good={capabilities?.youtubePublishing}
                />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function CapabilityRow({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <tr>
      <td className="dim">{label}</td>
      <td style={{ textAlign: "right", color: good ? "var(--green)" : "var(--yellow)" }}>
        {value}
      </td>
    </tr>
  );
}
