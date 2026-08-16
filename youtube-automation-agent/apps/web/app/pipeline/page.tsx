import type { VideoStatus } from "@yta/shared";
import { fetchApi } from "@/lib/api";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

interface ChannelRow {
  id: string;
  name: string;
  description: string | null;
  niche: { name: string } | null;
  _count: { videos: number; ideas: number };
}

interface VideoRow {
  id: string;
  title: string;
  status: VideoStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  youtubeVideoId: string | null;
  createdAt: string;
  channel: { name: string };
  script: { wordCount: number } | null;
}

const PIPELINE_STAGES: VideoStatus[] = [
  "IDEA",
  "SCRIPTED",
  "VOICED",
  "RENDERED",
  "THUMBNAILED",
  "OPTIMIZED",
  "SCHEDULED",
  "PUBLISHED",
];

export default async function PipelinePage() {
  const [channels, videos] = await Promise.all([
    fetchApi<{ items: ChannelRow[] }>("/api/channels"),
    fetchApi<{ items: VideoRow[] }>("/api/videos"),
  ]);

  const stageCounts = new Map<VideoStatus, number>();
  for (const video of videos?.items ?? []) {
    stageCounts.set(video.status, (stageCounts.get(video.status) ?? 0) + 1);
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Video Pipeline</h1>
        <p className="page-sub">
          Idea → script → voiceover → render → thumbnail → SEO → schedule →
          publish. Drive each stage via the REST API; see docs/youtube-automation.md.
        </p>
      </div>

      {videos === null && (
        <div className="notice">
          Could not reach the API server. Start it with <code>npm run dev</code>.
        </div>
      )}

      <div className="stat-grid">
        {PIPELINE_STAGES.map((stage) => (
          <div className="card" key={stage}>
            <div className="stat-value">{stageCounts.get(stage) ?? 0}</div>
            <div className="stat-label">{stage.toLowerCase()}</div>
          </div>
        ))}
      </div>

      <h2 className="section-title">Channels</h2>
      {channels?.items?.length ? (
        <div className="api-grid" style={{ marginBottom: 24 }}>
          {channels.items.map((channel) => (
            <div key={channel.id} className="card">
              <strong>{channel.name}</strong>
              {channel.niche && (
                <p className="dim" style={{ fontSize: 12.5 }}>
                  Niche: {channel.niche.name}
                </p>
              )}
              <p className="dim" style={{ fontSize: 13, marginTop: 6 }}>
                {channel.description ?? "No description."}
              </p>
              <div className="row" style={{ marginTop: 10 }}>
                <span className="badge badge-cat">
                  {channel._count.videos} videos
                </span>
                <span className="badge badge-status">
                  {channel._count.ideas} ideas
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty" style={{ marginBottom: 24 }}>
          <h3>No channels yet</h3>
          <p>
            Create one via the API: POST /api/channels with a name and optional
            nicheId (seed demo data with npm run db:seed).
          </p>
        </div>
      )}

      <h2 className="section-title">Recent videos</h2>
      {videos?.items?.length ? (
        <div className="card">
          <table className="data">
            <thead>
              <tr>
                <th>Title</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Script</th>
                <th>Scheduled</th>
                <th>YouTube</th>
              </tr>
            </thead>
            <tbody>
              {videos.items.map((video) => (
                <tr key={video.id}>
                  <td style={{ maxWidth: 320 }}>
                    <strong style={{ fontSize: 13.5 }}>{video.title}</strong>
                    <div className="dim" style={{ fontSize: 12 }}>
                      created {formatDate(video.createdAt)}
                    </div>
                  </td>
                  <td>{video.channel.name}</td>
                  <td>
                    <span className="badge badge-status">{video.status}</span>
                  </td>
                  <td className="dim">
                    {video.script ? `${video.script.wordCount} words` : "—"}
                  </td>
                  <td className="dim">{formatDate(video.scheduledAt)}</td>
                  <td>
                    {video.youtubeVideoId ? (
                      <a
                        href={`https://www.youtube.com/watch?v=${video.youtubeVideoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <u>watch</u>
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <h3>No videos in the pipeline</h3>
          <p>Create one via POST /api/videos, then generate a script, voiceover and SEO.</p>
        </div>
      )}
    </>
  );
}
