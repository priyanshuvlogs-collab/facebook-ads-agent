import Link from "next/link";
import {
  API_CATEGORIES,
  API_CATEGORY_LABELS,
  API_STATUSES,
  FREE_TIER_QUALITIES,
} from "@yta/shared";
import type { DiscoveredApiDto, Paginated } from "@yta/shared";
import { fetchApi } from "@/lib/api";
import { CategoryBadge, FreeTierBadge, ScoreRing, StatusBadge } from "@/components/badges";
import { formatStars, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function ApiDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of [
    "category",
    "minStars",
    "updatedWithinDays",
    "freeTierQuality",
    "status",
    "search",
    "sort",
    "order",
    "page",
  ]) {
    const value = first(params[key]);
    if (value) query.set(key, value);
  }

  const result = await fetchApi<Paginated<DiscoveredApiDto>>(
    `/api/apis?${query.toString()}`
  );

  const page = Number(first(params.page) || "1");

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Free API Directory</h1>
        <p className="page-sub">
          Every free/public API discovered by the hunter, ranked by reliability
          and usefulness for YouTube automation.
        </p>
      </div>

      <form method="get" className="filters">
        <div className="filter-field">
          <label htmlFor="search">Search</label>
          <input
            id="search"
            type="search"
            name="search"
            placeholder="repo, keyword, topic..."
            defaultValue={first(params.search)}
          />
        </div>
        <div className="filter-field">
          <label htmlFor="category">Category</label>
          <select id="category" name="category" defaultValue={first(params.category)}>
            <option value="">All categories</option>
            {API_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {API_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="minStars">Min stars</label>
          <select id="minStars" name="minStars" defaultValue={first(params.minStars)}>
            <option value="">Any</option>
            <option value="100">100+</option>
            <option value="500">500+</option>
            <option value="1000">1,000+</option>
            <option value="5000">5,000+</option>
            <option value="20000">20,000+</option>
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="updatedWithinDays">Last update</label>
          <select
            id="updatedWithinDays"
            name="updatedWithinDays"
            defaultValue={first(params.updatedWithinDays)}
          >
            <option value="">Any time</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 3 months</option>
            <option value="180">Last 6 months</option>
            <option value="365">Last year</option>
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="freeTierQuality">Free tier</label>
          <select
            id="freeTierQuality"
            name="freeTierQuality"
            defaultValue={first(params.freeTierQuality)}
          >
            <option value="">Any quality</option>
            {FREE_TIER_QUALITIES.map((quality) => (
              <option key={quality} value={quality}>
                {quality.charAt(0) + quality.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={first(params.status)}>
            <option value="">Any status</option>
            {API_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0) + status.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="sort">Sort by</label>
          <select id="sort" name="sort" defaultValue={first(params.sort) || "overallScore"}>
            <option value="overallScore">Overall score</option>
            <option value="stars">Stars</option>
            <option value="lastCommitAt">Last update</option>
            <option value="firstSeenAt">Recently discovered</option>
          </select>
        </div>
        <button type="submit" className="btn">
          Apply filters
        </button>
        <Link href="/apis" className="btn btn-ghost">
          Reset
        </Link>
      </form>

      {result === null ? (
        <div className="notice">
          Could not load APIs - is the API server running? Start it with{" "}
          <code>npm run dev</code>.
        </div>
      ) : result.items.length === 0 ? (
        <div className="empty">
          <h3>No APIs match these filters</h3>
          <p>
            Try relaxing the filters, or trigger a hunt from the{" "}
            <Link href="/hunter">
              <u>Hunter Runs</u>
            </Link>{" "}
            page.
          </p>
        </div>
      ) : (
        <>
          <p className="dim" style={{ marginBottom: 12 }}>
            {result.total} API{result.total === 1 ? "" : "s"} found
          </p>
          <div className="api-grid">
            {result.items.map((api) => (
              <Link key={api.id} href={`/apis/${api.id}`} className="api-card">
                <div className="api-card-top">
                  <div>
                    <div className="api-name">{api.fullName}</div>
                    <div className="row" style={{ marginTop: 6 }}>
                      <CategoryBadge category={api.category} />
                      <StatusBadge status={api.status} />
                    </div>
                  </div>
                  <ScoreRing score={api.overallScore} />
                </div>
                <p className="api-desc">
                  {api.description ?? "No description available."}
                </p>
                <div className="api-meta">
                  <FreeTierBadge quality={api.freeTierQuality} />
                  <span>★ {formatStars(api.stars)}</span>
                  <span>updated {timeAgo(api.lastCommitAt)}</span>
                  {api.license && <span>{api.license}</span>}
                  {api.endpoints.length > 0 && (
                    <span>{api.endpoints.length}+ endpoints</span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {result.totalPages > 1 && (
            <div className="pagination">
              {page > 1 && (
                <Link
                  className="btn btn-ghost"
                  href={`/apis?${buildPageQuery(query, page - 1)}`}
                >
                  ← Prev
                </Link>
              )}
              <span>
                Page {result.page} of {result.totalPages}
              </span>
              {page < result.totalPages && (
                <Link
                  className="btn btn-ghost"
                  href={`/apis?${buildPageQuery(query, page + 1)}`}
                >
                  Next →
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function buildPageQuery(current: URLSearchParams, page: number): string {
  const next = new URLSearchParams(current);
  next.set("page", String(page));
  return next.toString();
}
