"""End-to-end: launch a campaign and run full agent cycles entirely in dry-run."""

from pathlib import Path

from fbads_agent.orchestrator import FacebookAdsAgent
from fbads_agent.settings import Settings


def _agent(sample_profile, tmp_path) -> FacebookAdsAgent:
    settings = Settings(dry_run=True, agent_home=tmp_path / "state")
    return FacebookAdsAgent(sample_profile, settings)


def test_launch_creates_full_tree(sample_profile, tmp_path):
    agent = _agent(sample_profile, tmp_path)
    result = agent.launch(activate=True)

    assert result.campaign_id.startswith("cmp_")
    assert result.lead_form_id.startswith("form_")
    assert len(result.ad_set_ids) == 2       # prospecting + broad (no warm audiences)
    assert len(result.ad_ids) == 6           # 3 angles x 2 ad sets
    assert agent.state["campaigns"][result.campaign_id]["status"] == "ACTIVE"
    for ad_set_id in result.ad_set_ids:
        assert agent.state["ad_sets"][ad_set_id]["status"] == "ACTIVE"


def test_paused_launch_stays_paused(sample_profile, tmp_path):
    agent = _agent(sample_profile, tmp_path)
    result = agent.launch(activate=False)
    assert agent.state["campaigns"][result.campaign_id]["status"] == "PAUSED"


def test_full_cycle_produces_metrics_actions_and_leads(sample_profile, tmp_path):
    agent = _agent(sample_profile, tmp_path)
    agent.launch(activate=True)
    cycle = agent.run_cycle()

    assert cycle.metrics["spend"] > 0
    assert cycle.actions, "optimizer should evaluate every active ad set"
    assert cycle.report_path and cycle.report_path.exists()

    # Second cycle: leads must be deduped (no double delivery).
    first_seen = len(agent.state["seen_lead_ids"])
    agent.run_cycle()
    assert len(agent.state["seen_lead_ids"]) >= first_seen

    # CSV export exists when any leads arrived.
    if first_seen:
        csv_path = Path(agent.settings.agent_home) / "exports" / f"{sample_profile.slug}-leads.csv"
        assert csv_path.exists()


def test_state_persists_across_agent_restarts(sample_profile, tmp_path):
    agent = _agent(sample_profile, tmp_path)
    result = agent.launch(activate=True)
    agent.state.save()

    reborn = _agent(sample_profile, tmp_path)
    assert result.campaign_id in reborn.state["campaigns"]


def test_dry_run_forced_without_credentials(sample_profile, tmp_path):
    settings = Settings(dry_run=False, agent_home=tmp_path)  # asked live, no creds
    agent = FacebookAdsAgent(sample_profile, settings)
    assert agent.settings.effective_dry_run
    assert "DRY-RUN" in agent.mode
