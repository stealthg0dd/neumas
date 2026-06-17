#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SENDGRID_API_KEY:-}" ]]; then
  echo "WARNING SENDGRID_API_KEY not set — weekly digest emails will not send" >&2
fi

celery -A app.core.celery_app worker \
  --loglevel=info \
  --queues=neumas_default,scans,agents,neumas.predictions,neumas.shopping,alerts,reports,evaluation \
  --concurrency="${CELERY_CONCURRENCY:-2}" &
worker_pid="$!"

# Beat uses /tmp so it's writable by the non-root appuser.
# Beat is non-critical: if it crashes (e.g. schedule-file permission denied)
# we log the failure but keep the worker running so scan tasks keep processing.
celery -A app.core.celery_app beat \
  --loglevel=info \
  --schedule=/tmp/celerybeat-schedule &
beat_pid="$!"

# Monitor beat in background: restart or log if it exits early.
(
  wait "$beat_pid" 2>/dev/null || true
  echo "celery beat exited (pid=$beat_pid); worker continues" >&2
) &

trap 'kill "$worker_pid" "$beat_pid" 2>/dev/null || true' TERM INT

# Container lifetime = worker lifetime. Beat crash does NOT kill the worker.
wait "$worker_pid"
exit_code="$?"
kill "$beat_pid" 2>/dev/null || true
exit "$exit_code"
