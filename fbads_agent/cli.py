"""Command-line interface for the Facebook Ads agent.

Examples:
    python -m fbads_agent plan     --profile profiles/dental_clinic.yaml
    python -m fbads_agent launch   --profile profiles/dental_clinic.yaml
    python -m fbads_agent cycle    --profile profiles/dental_clinic.yaml
    python -m fbads_agent run      --profile profiles/dental_clinic.yaml --every 6
    python -m fbads_agent leads    --profile profiles/dental_clinic.yaml
    python -m fbads_agent status   --profile profiles/dental_clinic.yaml
"""

from __future__ import annotations

import argparse
import os
import sys

from rich.console import Console

from .orchestrator import FacebookAdsAgent
from .profile import ProfileError

console = Console()


def _add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--profile", required=True,
                        help="Path to the business profile YAML (the plug-and-play input)")
    parser.add_argument("--env", default=None,
                        help="Path to a .env file with credentials (default: ./.env)")
    parser.add_argument("--live", action="store_true",
                        help="Force live mode (requires Meta credentials; overrides DRY_RUN)")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="fbads-agent",
        description="Autonomous Facebook Ads agent for lead generation.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    for name, help_text in [
        ("plan", "Show the campaign plan and an ad copy preview (no changes made)"),
        ("launch", "Create the full campaign (lead form, ad sets, ads) and activate it"),
        ("optimize", "One optimization pass: read insights, kill/scale/trim ad sets"),
        ("leads", "Fetch new leads, score them, export CSV and push to webhook"),
        ("cycle", "Full heartbeat: optimize + sync leads + report + notify"),
        ("run", "Run continuously, one cycle every N hours"),
        ("status", "Show launched entities and recent agent actions"),
    ]:
        p = sub.add_parser(name, help=help_text)
        _add_common(p)
        if name == "launch":
            p.add_argument("--paused", action="store_true",
                           help="Create everything but leave it PAUSED for manual review")
        if name == "run":
            p.add_argument("--every", type=float, default=6.0, metavar="HOURS",
                           help="Hours between cycles (default: 6)")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.live:
        os.environ["DRY_RUN"] = "false"

    try:
        agent = FacebookAdsAgent.from_files(args.profile, args.env)
    except ProfileError as exc:
        console.print(f"[red]Profile error:[/red] {exc}")
        return 2
    except Exception as exc:
        console.print(f"[red]Startup error:[/red] {exc}")
        return 2

    if args.live and agent.settings.effective_dry_run:
        console.print("[red]--live requested but Meta credentials are missing "
                      "(META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_PAGE_ID). "
                      "Staying in dry-run.[/red]")

    try:
        if args.command == "plan":
            agent.show_plan()
        elif args.command == "launch":
            agent.launch(activate=not args.paused)
        elif args.command == "optimize":
            agent.optimize()
        elif args.command == "leads":
            agent.sync_leads()
        elif args.command == "cycle":
            agent.run_cycle()
        elif args.command == "run":
            agent.run_forever(interval_hours=args.every)
        elif args.command == "status":
            agent.status()
    except KeyboardInterrupt:
        console.print("\n[dim]Stopped.[/dim]")
        return 130
    except Exception as exc:
        console.print(f"[red]Error:[/red] {exc}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
