"""Create provider cache tables.

Revision ID: 20260713_0001
Revises:
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260713_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "weather_cache",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("location_name", sa.String(length=120), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_error", sa.String(length=240), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_weather_cache_expires_at", "weather_cache", ["expires_at"])
    op.create_table(
        "calendar_source_status",
        sa.Column("source_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("stale", sa.Boolean(), nullable=False),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(length=240), nullable=True),
        sa.PrimaryKeyConstraint("source_id"),
    )
    op.create_table(
        "calendar_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("external_id", sa.String(length=200), nullable=False),
        sa.Column("source_id", sa.String(length=64), nullable=False),
        sa.Column("calendar_name", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("all_day", sa.Boolean(), nullable=False),
        sa.Column("location", sa.String(length=240), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(length=7), nullable=False),
        sa.Column("source_label", sa.String(length=80), nullable=False),
        sa.Column("last_modified", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled", sa.Boolean(), nullable=False),
        sa.Column("stale", sa.Boolean(), nullable=False),
        sa.Column("refreshed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_id", "external_id", name="uq_source_external_event"),
    )
    op.create_index("ix_calendar_events_external_id", "calendar_events", ["external_id"])
    op.create_index("ix_calendar_events_source_id", "calendar_events", ["source_id"])
    op.create_index("ix_calendar_events_start_at", "calendar_events", ["start_at"])
    op.create_index("ix_calendar_events_start_date", "calendar_events", ["start_date"])


def downgrade() -> None:
    op.drop_table("calendar_events")
    op.drop_table("calendar_source_status")
    op.drop_table("weather_cache")
