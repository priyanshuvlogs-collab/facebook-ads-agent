import { API_CATEGORY_LABELS } from "@yta/shared";
import type { ApiCategory, FreeTierQuality } from "@yta/shared";

export function CategoryBadge({ category }: { category: ApiCategory }) {
  return <span className="badge badge-cat">{API_CATEGORY_LABELS[category]}</span>;
}

const FREE_TIER_CLASS: Record<FreeTierQuality, string> = {
  EXCELLENT: "badge-excellent",
  GOOD: "badge-good",
  LIMITED: "badge-limited",
  POOR: "badge-poor",
  UNKNOWN: "badge-unknown",
};

const FREE_TIER_LABEL: Record<FreeTierQuality, string> = {
  EXCELLENT: "Free: Excellent",
  GOOD: "Free: Good",
  LIMITED: "Free: Limited",
  POOR: "Free: Poor",
  UNKNOWN: "Free: Unknown",
};

export function FreeTierBadge({ quality }: { quality: FreeTierQuality }) {
  return (
    <span className={`badge ${FREE_TIER_CLASS[quality]}`}>
      {FREE_TIER_LABEL[quality]}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className="badge badge-status">{status}</span>;
}

export function ScoreRing({ score }: { score: number }) {
  const cls = score >= 70 ? "score-high" : score >= 45 ? "score-mid" : "score-low";
  return (
    <span className={`score-ring ${cls}`} title={`Overall score: ${score}/100`}>
      {Math.round(score)}
    </span>
  );
}
