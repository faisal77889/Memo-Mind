"""add gmailHistoryId to users

Revision ID: 8c9a01ebc373
Revises: 7d5ff7af9c99
Create Date: 2026-10-20 21:21:55.267853

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8c9a01ebc373'
down_revision: Union[str, Sequence[str], None] = '7d5ff7af9c99'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('gmailHistoryId', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'gmailHistoryId')
