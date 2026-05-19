"""In-memory live-progress store for document-processing jobs.

Tracks streaming output for a job_id so the polling job-status endpoint can
surface live feedback (token count, partial records emitted). Ephemeral on
purpose: cleared on job completion/failure and lost on server restart — the
job itself would restart on retry, so no information is permanently lost.
"""

from __future__ import annotations

import time
from typing import TypedDict


class JobProgress(TypedDict, total=False):
    phase: str
    output_tokens: int
    partial_record_count: int
    updated_at: float


_progress: dict[str, JobProgress] = {}


def set_progress(job_id: str, **fields) -> None:
    cur = _progress.get(job_id, {})
    cur.update(fields)
    cur["updated_at"] = time.time()
    _progress[job_id] = cur


def get_progress(job_id: str) -> JobProgress | None:
    return _progress.get(job_id)


def clear_progress(job_id: str) -> None:
    _progress.pop(job_id, None)
