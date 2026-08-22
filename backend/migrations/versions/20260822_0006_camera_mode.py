"""Add shared camera mode state.

Revision ID: 20260822_0006
Revises: 20260811_0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260822_0006"
down_revision: str | None = "20260811_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    camera_mode_state = op.create_table(
        "camera_mode_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("id = 1", name="ck_camera_mode_state_singleton"),
        sa.CheckConstraint("revision >= 0", name="ck_camera_mode_state_revision"),
    )
    op.bulk_insert(
        camera_mode_state,
        [{"id": 1, "active": False, "expires_at": None, "revision": 0}],
    )


def downgrade() -> None:
    op.drop_table("camera_mode_state")
