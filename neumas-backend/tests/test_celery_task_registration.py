"""Celery discovery must register the complete intended task set."""

from __future__ import annotations

from app.core.celery_app import TASK_MODULES, celery_app, discover_tasks

REQUIRED_TASK_NAMES = {
    "app.tasks.inventory_tasks.create_daily_snapshots",
    "alerts.evaluate_inventory_alerts",
    "reports.send_weekly_digest",
    "evaluation.backfill_actual_values",
    "operations.run_post_scan_workflow",
}


def test_task_modules_cover_inventory_and_ops_modules():
    assert "app.tasks.inventory_tasks" in TASK_MODULES
    assert "app.tasks.alert_tasks" in TASK_MODULES
    assert "app.tasks.report_tasks" in TASK_MODULES
    assert "app.tasks.evaluation_tasks" in TASK_MODULES
    assert "app.tasks.operational_tasks" in TASK_MODULES
    assert "app.tasks.prediction_tasks" not in TASK_MODULES
    assert "app.tasks.maintenance" not in TASK_MODULES


def test_discover_tasks_registers_inventory_snapshot_task():
    discover_tasks()
    registered = set(celery_app.tasks.keys())
    missing = REQUIRED_TASK_NAMES - registered
    assert not missing, f"Missing registered Celery tasks: {sorted(missing)}"
