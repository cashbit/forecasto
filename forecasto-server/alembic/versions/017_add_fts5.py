"""Add FTS5 full-text search index for records

Revision ID: 017_add_fts5
Revises: 016_add_recipient_to_codes
Create Date: 2026-03-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '017_add_fts5'
down_revision: Union[str, None] = '016_add_recipient_to_codes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Create FTS5 virtual table in content-table mode.
    # content_rowid maps to SQLite's implicit integer rowid of the records table.
    # unicode61 tokenizer handles Italian accented characters (società, caffè, ecc.).
    conn.execute(sa.text("""
        CREATE VIRTUAL TABLE IF NOT EXISTS records_fts
        USING fts5(
            account,
            reference,
            note,
            owner,
            nextaction,
            transaction_id,
            project_code,
            content="records",
            content_rowid="rowid",
            tokenize="unicode61"
        )
    """))

    # Populate FTS index from existing records.
    # COALESCE handles NULL values in nullable fields.
    conn.execute(sa.text("""
        INSERT INTO records_fts(
            rowid, account, reference, note,
            owner, nextaction, transaction_id, project_code
        )
        SELECT
            rowid,
            account,
            COALESCE(reference, ''),
            COALESCE(note, ''),
            COALESCE(owner, ''),
            COALESCE(nextaction, ''),
            COALESCE(transaction_id, ''),
            COALESCE(project_code, '')
        FROM records
    """))

    # AFTER INSERT trigger: add new record to FTS index.
    conn.execute(sa.text("""
        CREATE TRIGGER records_fts_insert AFTER INSERT ON records BEGIN
            INSERT INTO records_fts(
                rowid, account, reference, note,
                owner, nextaction, transaction_id, project_code
            )
            VALUES (
                new.rowid,
                new.account,
                COALESCE(new.reference, ''),
                COALESCE(new.note, ''),
                COALESCE(new.owner, ''),
                COALESCE(new.nextaction, ''),
                COALESCE(new.transaction_id, ''),
                COALESCE(new.project_code, '')
            );
        END
    """))

    # BEFORE DELETE trigger: remove record from FTS index before row is deleted.
    # Uses FTS5 'delete' sentinel to remove the entry from the index.
    conn.execute(sa.text("""
        CREATE TRIGGER records_fts_delete BEFORE DELETE ON records BEGIN
            INSERT INTO records_fts(
                records_fts, rowid, account, reference, note,
                owner, nextaction, transaction_id, project_code
            )
            VALUES (
                'delete',
                old.rowid,
                old.account,
                COALESCE(old.reference, ''),
                COALESCE(old.note, ''),
                COALESCE(old.owner, ''),
                COALESCE(old.nextaction, ''),
                COALESCE(old.transaction_id, ''),
                COALESCE(old.project_code, '')
            );
        END
    """))

    # AFTER UPDATE trigger: remove old FTS entry then insert new one.
    conn.execute(sa.text("""
        CREATE TRIGGER records_fts_update AFTER UPDATE ON records BEGIN
            INSERT INTO records_fts(
                records_fts, rowid, account, reference, note,
                owner, nextaction, transaction_id, project_code
            )
            VALUES (
                'delete',
                old.rowid,
                old.account,
                COALESCE(old.reference, ''),
                COALESCE(old.note, ''),
                COALESCE(old.owner, ''),
                COALESCE(old.nextaction, ''),
                COALESCE(old.transaction_id, ''),
                COALESCE(old.project_code, '')
            );
            INSERT INTO records_fts(
                rowid, account, reference, note,
                owner, nextaction, transaction_id, project_code
            )
            VALUES (
                new.rowid,
                new.account,
                COALESCE(new.reference, ''),
                COALESCE(new.note, ''),
                COALESCE(new.owner, ''),
                COALESCE(new.nextaction, ''),
                COALESCE(new.transaction_id, ''),
                COALESCE(new.project_code, '')
            );
        END
    """))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TRIGGER IF EXISTS records_fts_update"))
    conn.execute(sa.text("DROP TRIGGER IF EXISTS records_fts_delete"))
    conn.execute(sa.text("DROP TRIGGER IF EXISTS records_fts_insert"))
    conn.execute(sa.text("DROP TABLE IF EXISTS records_fts"))
