import type { NicheDto } from "@yta/shared";
import { fetchApi } from "@/lib/api";
import { ScoreRing } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function NichesPage() {
  const niches = await fetchApi<{ items: NicheDto[] }>("/api/niches");

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Niche Research</h1>
        <p className="page-sub">
          High-CPM niches ranked by monetization potential, demand, trend and
          competition. Generate more with POST /api/niches/research (requires an
          AI provider key).
        </p>
      </div>

      {niches === null ? (
        <div className="notice">
          Could not reach the API server. Start it with <code>npm run dev</code>.
        </div>
      ) : niches.items.length === 0 ? (
        <div className="empty">
          <h3>No niches researched yet</h3>
          <p>
            Run: curl -X POST http://localhost:4000/api/niches/research -H
            &quot;Content-Type: application/json&quot; -d &apos;{"{}"}&apos;
          </p>
        </div>
      ) : (
        <div className="api-grid">
          {niches.items.map((niche) => (
            <div key={niche.id} className="api-card">
              <div className="api-card-top">
                <strong style={{ fontSize: 15 }}>{niche.name}</strong>
                <ScoreRing score={niche.overallScore} />
              </div>
              <p className="api-desc" style={{ WebkitLineClamp: 4 }}>
                {niche.description}
              </p>
              <div className="api-meta">
                <span className="badge badge-excellent">
                  CPM ${niche.cpmEstimateLowUsd}–${niche.cpmEstimateHighUsd}
                </span>
                <span className="badge badge-status">
                  demand {Math.round(niche.searchDemandScore)}
                </span>
                <span className="badge badge-status">
                  trend {Math.round(niche.trendScore)}
                </span>
                <span className="badge badge-status">
                  competition {Math.round(niche.competitionScore)}
                </span>
              </div>
              {niche.exampleTitles.length > 0 && (
                <div className="dim" style={{ fontSize: 12.5 }}>
                  e.g. “{niche.exampleTitles[0]}”
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
