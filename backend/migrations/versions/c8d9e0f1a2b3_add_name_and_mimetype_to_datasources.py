"""add name and mimeType to datasources table

Revision ID: c8d9e0f1a2b3
Revises: 152c4439adad
Create Date: 2026-09-27 02:24:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8d9e0f1a2b3'
down_revision: Union[str, Sequence[str], None] = '152c4439adad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('datasources', sa.Column('name', sa.String(), nullable=True))
    op.add_column('datasources', sa.Column('mimeType', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('datasources', 'mimeType')
    op.drop_column('datasources', 'name')
