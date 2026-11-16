"""Add the current household meal plan without changing existing data."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261116_0007"
down_revision: str | None = "20260822_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "meal_plans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "household_id",
            sa.String(36),
            sa.ForeignKey("households.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "uploader_user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("storage_name", sa.String(80), nullable=False, unique=True),
        sa.Column("thumbnail_storage_name", sa.String(80), nullable=False, unique=True),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column("original_mime_type", sa.String(80), nullable=False),
        sa.Column("original_file_size", sa.Integer(), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("width > 0 AND height > 0", name="ck_meal_plans_dimensions"),
        sa.CheckConstraint("file_size > 0", name="ck_meal_plans_file_size"),
    )


def downgrade() -> None:
    op.drop_table("meal_plans")
