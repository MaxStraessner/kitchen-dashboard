"""Add household family photos.

Revision ID: 20260811_0005
Revises: 20260716_0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260811_0005"
down_revision: str | None = "20260716_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "photos",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "household_id",
            sa.String(36),
            sa.ForeignKey("households.id", ondelete="CASCADE"),
            nullable=False,
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
        sa.Column("mime_type", sa.String(80), nullable=False),
        sa.Column("original_file_size", sa.Integer(), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("original_file_size > 0", name="ck_photos_original_file_size"),
        sa.CheckConstraint("file_size > 0", name="ck_photos_file_size"),
        sa.CheckConstraint("width > 0", name="ck_photos_width"),
        sa.CheckConstraint("height > 0", name="ck_photos_height"),
    )
    op.create_index("ix_photos_household_id", "photos", ["household_id"])
    op.create_index("ix_photos_uploader_user_id", "photos", ["uploader_user_id"])
    op.create_index("ix_photos_uploaded_at", "photos", ["uploaded_at"])
    op.create_index("ix_photos_household_uploaded_at", "photos", ["household_id", "uploaded_at"])


def downgrade() -> None:
    op.drop_table("photos")
