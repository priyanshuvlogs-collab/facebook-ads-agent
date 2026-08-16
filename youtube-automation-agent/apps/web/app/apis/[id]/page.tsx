import Link from "next/link";
import { notFound } from "next/navigation";
import type { DiscoveredApiDto } from "@yta/shared";
import { fetchApi } from "@/lib/api";
import { CategoryBadge, FreeTierBadge, ScoreRing, StatusBadge } from "@/components/badges";
import { formatDate, formatStars, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ApiDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await fetchApi<DiscoveredApiDto>(`/api/apis/${id}`);
  if (!api) notFound();

  return (
    <>
      <p style={{ marginBottom: 16 }}>
        <Link href="/apis" className="dim">
          ← Back to directory
        </Link>
      </p>

      <div className="page-header">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 className="page-title">{api.fullName}</h1>
            <div className="row" style={{ marginTop: 8 }}>
              <CategoryBadge category={api.category} />
              <FreeTierBadge quality={api.freeTierQuality} />
              <StatusBadge status={api.status} />
            </div>
          </div>
          <ScoreRing score={api.overallScore} />
        </div>
        <p className="page-sub" style={{ marginTop: 12 }}>
          {api.description ?? "No description available."}
        </p>
      </div>

      <div className="stat-grid">
        <div className="card">
          <div className="stat-value">★ {formatStars(api.stars)}</div>
          <div className="stat-label">Stars ({api.forks} forks)</div>
        </div>
        <div className="card">
          <div className="stat-value">{Math.round(api.reliabilityScore)}</div>
          <div className="stat-label">Reliability score</div>
        </div>
        <div className="card">
          <div className="stat-value">{Math.round(api.usefulnessScore)}</div>
          <div className="stat-label">Usefulness score</div>
        </div>
        <div className="card">
          <div className="stat-value">{Math.round(api.docsQualityScore)}</div>
          <div className="stat-label">Docs quality</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Repository
          </h2>
          <table className="data">
            <tbody>
              <tr>
                <td className="dim">GitHub</td>
                <td>
                  <a href={api.url} target="_blank" rel="noopener noreferrer">
                    <u>{api.url}</u>
                  </a>
                </td>
              </tr>
              {api.homepage && (
                <tr>
                  <td className="dim">Homepage</td>
                  <td>
                    <a href={api.homepage} target="_blank" rel="noopener noreferrer">
                      <u>{api.homepage}</u>
                    </a>
                  </td>
                </tr>
              )}
              <tr>
                <td className="dim">License</td>
                <td>{api.license ?? "Unknown"}</td>
              </tr>
              <tr>
                <td className="dim">Language</td>
                <td>{api.language ?? "—"}</td>
              </tr>
              <tr>
                <td className="dim">Last commit</td>
                <td>
                  {formatDate(api.lastCommitAt)} ({timeAgo(api.lastCommitAt)})
                </td>
              </tr>
              <tr>
                <td className="dim">First discovered</td>
                <td>{formatDate(api.firstSeenAt)}</td>
              </tr>
              <tr>
                <td className="dim">Last checked</td>
                <td>{timeAgo(api.lastCheckedAt)}</td>
              </tr>
              {api.topics.length > 0 && (
                <tr>
                  <td className="dim">Topics</td>
                  <td>
                    <div className="row">
                      {api.topics.slice(0, 10).map((topic) => (
                        <span key={topic} className="badge badge-status">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>
            Free tier analysis
          </h2>
          <p style={{ fontSize: 13.5, marginBottom: 12 }}>
            {api.freeTierNotes ?? "No free-tier signals extracted yet."}
          </p>
          <h2 className="section-title">Rate limits</h2>
          <p style={{ fontSize: 13.5 }}>
            {api.rateLimitNotes ?? "No rate limit information found in the README."}
          </p>
        </div>
      </div>

      {api.endpoints.length > 0 && (
        <>
          <h2 className="section-title">Extracted endpoints</h2>
          <div className="card">
            <table className="data">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>URL</th>
                  <th>Auth</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {api.endpoints.map((endpoint) => (
                  <tr key={endpoint.id}>
                    <td className="mono">{endpoint.method}</td>
                    <td className="mono" style={{ wordBreak: "break-all" }}>
                      {endpoint.url}
                    </td>
                    <td>{endpoint.requiresAuth ? "key/token" : "none"}</td>
                    <td className="dim">{endpoint.description ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {api.usageExamples.length > 0 && (
        <>
          <h2 className="section-title">Usage examples (from README)</h2>
          {api.usageExamples.map((example) => (
            <div key={example.id} style={{ marginBottom: 14 }}>
              <p className="dim" style={{ marginBottom: 6, fontSize: 12 }}>
                {example.language}
              </p>
              <pre className="code">{example.code}</pre>
            </div>
          ))}
        </>
      )}
    </>
  );
}
