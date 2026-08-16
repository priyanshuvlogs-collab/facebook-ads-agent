import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "YouTube Automation Agent",
  description:
    "Automate faceless YouTube channels and discover free APIs with the Free API Hunter.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <Link href="/" className="brand">
              <div className="brand-logo">YA</div>
              <div>
                <div className="brand-name">YouTube Agent</div>
                <div className="brand-sub">automation console</div>
              </div>
            </Link>
            <nav className="nav">
              <div className="nav-label">Overview</div>
              <Link href="/">Dashboard</Link>
              <div className="nav-label">Free API Hunter</div>
              <Link href="/apis">API Directory</Link>
              <Link href="/hunter">Hunter Runs</Link>
              <div className="nav-label">Automation</div>
              <Link href="/pipeline">Video Pipeline</Link>
              <Link href="/niches">Niche Research</Link>
            </nav>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
