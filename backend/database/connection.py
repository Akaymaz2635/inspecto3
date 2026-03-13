import sys
import aiosqlite
from pathlib import Path
from backend.config import DB_PATH

# PyInstaller frozen: dosyalar _MEIPASS geçici klasörüne açılır
_BASE = Path(getattr(sys, '_MEIPASS', Path(__file__).parent.parent.parent))
_SCHEMA = _BASE / "backend" / "database" / "schema.sql"


async def get_db():
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys = ON")
        yield db


async def _migrate_db(db: aiosqlite.Connection) -> None:
    """Run all pending schema migrations in order."""

    # ── Migration 1: add repair_ref / scrap_reason + REPAIR/SCRAP decisions ──
    async with db.execute("PRAGMA table_info(dispositions)") as cur:
        disp_cols = {row[1] async for row in cur}

    if "repair_ref" not in disp_cols:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS dispositions_m1 (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                defect_id     INTEGER NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
                decision      TEXT NOT NULL,
                entered_by    TEXT NOT NULL,
                decided_at    TEXT NOT NULL,
                note          TEXT NOT NULL,
                spec_ref      TEXT,
                engineer      TEXT,
                reinspector   TEXT,
                concession_no TEXT,
                void_reason   TEXT,
                repair_ref    TEXT,
                scrap_reason  TEXT,
                created_at    TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO dispositions_m1
                (id, defect_id, decision, entered_by, decided_at, note,
                 spec_ref, engineer, reinspector, concession_no, void_reason,
                 repair_ref, scrap_reason, created_at)
            SELECT id, defect_id, decision, entered_by, decided_at, note,
                   spec_ref, engineer, reinspector, concession_no, void_reason,
                   NULL, NULL, created_at
            FROM dispositions;
            DROP TABLE dispositions;
            ALTER TABLE dispositions_m1 RENAME TO dispositions;
            CREATE INDEX IF NOT EXISTS idx_dispositions_defect ON dispositions(defect_id);
        """)
        await db.commit()

    # ── Migration 2: replace MRB with MRB_SUBMITTED / MRB_CTP / MRB_ACCEPTED ─
    async with db.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='dispositions'"
    ) as cur:
        row = await cur.fetchone()
    disp_sql = row[0] if row else ""

    if "MRB_SUBMITTED" not in disp_sql:
        # Remap MRB → MRB_ACCEPTED inside the INSERT SELECT so the old
        # CHECK constraint (which only knows 'MRB') is never violated.
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS dispositions_m2 (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                defect_id     INTEGER NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
                decision      TEXT NOT NULL CHECK(decision IN (
                                  'USE_AS_IS','REWORK',
                                  'MRB_SUBMITTED','MRB_CTP','MRB_ACCEPTED',
                                  'VOID','REPAIR','SCRAP')),
                entered_by    TEXT NOT NULL,
                decided_at    TEXT NOT NULL,
                note          TEXT NOT NULL,
                spec_ref      TEXT,
                engineer      TEXT,
                reinspector   TEXT,
                concession_no TEXT,
                void_reason   TEXT,
                repair_ref    TEXT,
                scrap_reason  TEXT,
                created_at    TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO dispositions_m2
                SELECT id, defect_id,
                       CASE WHEN decision='MRB' THEN 'MRB_ACCEPTED' ELSE decision END,
                       entered_by, decided_at, note,
                       spec_ref, engineer, reinspector,
                       concession_no, void_reason, repair_ref, scrap_reason, created_at
                FROM dispositions;
            DROP TABLE dispositions;
            ALTER TABLE dispositions_m2 RENAME TO dispositions;
            CREATE INDEX IF NOT EXISTS idx_dispositions_defect ON dispositions(defect_id);
        """)
        await db.commit()

    # ── Migration 3: remove severity column from defect_types ─────────────────
    async with db.execute("PRAGMA table_info(defect_types)") as cur:
        dt_cols = {row[1] async for row in cur}

    if "severity" in dt_cols:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS defect_types_m3 (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO defect_types_m3 (id, name, description, created_at, updated_at)
            SELECT id, name, description, created_at, updated_at FROM defect_types;
            DROP TABLE defect_types;
            ALTER TABLE defect_types_m3 RENAME TO defect_types;
        """)
        await db.commit()

    # ── Migration 4: origin_defect_id on defects + RE_INSPECT in dispositions ─
    async with db.execute("PRAGMA table_info(defects)") as cur:
        defect_cols = {row[1] async for row in cur}

    if "origin_defect_id" not in defect_cols:
        await db.execute(
            "ALTER TABLE defects ADD COLUMN origin_defect_id INTEGER REFERENCES defects(id)"
        )
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS dispositions_m4 (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                defect_id     INTEGER NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
                decision      TEXT NOT NULL CHECK(decision IN (
                                  'USE_AS_IS','REWORK','RE_INSPECT',
                                  'MRB_SUBMITTED','MRB_CTP','MRB_ACCEPTED',
                                  'VOID','REPAIR','SCRAP')),
                entered_by    TEXT NOT NULL,
                decided_at    TEXT NOT NULL,
                note          TEXT NOT NULL,
                spec_ref      TEXT,
                engineer      TEXT,
                reinspector   TEXT,
                concession_no TEXT,
                void_reason   TEXT,
                repair_ref    TEXT,
                scrap_reason  TEXT,
                created_at    TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO dispositions_m4 SELECT * FROM dispositions;
            DROP TABLE dispositions;
            ALTER TABLE dispositions_m4 RENAME TO dispositions;
            CREATE INDEX IF NOT EXISTS idx_dispositions_defect ON dispositions(defect_id);
        """)
        await db.commit()

    # ── Migration 5: add KABUL_RESIM decision ────────────────────────────────
    async with db.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='dispositions'"
    ) as cur:
        row = await cur.fetchone()
    disp_sql5 = row[0] if row else ""

    if "KABUL_RESIM" not in disp_sql5:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS dispositions_m5 (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                defect_id     INTEGER NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
                decision      TEXT NOT NULL CHECK(decision IN (
                                  'USE_AS_IS','KABUL_RESIM','REWORK','RE_INSPECT',
                                  'MRB_SUBMITTED','MRB_CTP','MRB_ACCEPTED',
                                  'VOID','REPAIR','SCRAP')),
                entered_by    TEXT NOT NULL,
                decided_at    TEXT NOT NULL,
                note          TEXT NOT NULL,
                spec_ref      TEXT,
                engineer      TEXT,
                reinspector   TEXT,
                concession_no TEXT,
                void_reason   TEXT,
                repair_ref    TEXT,
                scrap_reason  TEXT,
                created_at    TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO dispositions_m5 SELECT * FROM dispositions;
            DROP TABLE dispositions;
            ALTER TABLE dispositions_m5 RENAME TO dispositions;
            CREATE INDEX IF NOT EXISTS idx_dispositions_defect ON dispositions(defect_id);
        """)
        await db.commit()

    # ── Migration 6: CONFORMS decision + measurements_snapshot column ─────────
    async with db.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='dispositions'"
    ) as cur:
        row = await cur.fetchone()
    disp_sql6 = row[0] if row else ""

    if "CONFORMS" not in disp_sql6:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS dispositions_m6 (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                defect_id             INTEGER NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
                decision              TEXT NOT NULL CHECK(decision IN (
                                          'USE_AS_IS','KABUL_RESIM','CONFORMS',
                                          'REWORK','RE_INSPECT',
                                          'MRB_SUBMITTED','MRB_CTP','MRB_ACCEPTED',
                                          'VOID','REPAIR','SCRAP')),
                entered_by            TEXT NOT NULL,
                decided_at            TEXT NOT NULL,
                note                  TEXT NOT NULL,
                spec_ref              TEXT,
                engineer              TEXT,
                reinspector           TEXT,
                concession_no         TEXT,
                void_reason           TEXT,
                repair_ref            TEXT,
                scrap_reason          TEXT,
                measurements_snapshot TEXT,
                created_at            TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO dispositions_m6
                SELECT id, defect_id, decision, entered_by, decided_at, note,
                       spec_ref, engineer, reinspector, concession_no, void_reason,
                       repair_ref, scrap_reason, NULL, created_at
                FROM dispositions;
            DROP TABLE dispositions;
            ALTER TABLE dispositions_m6 RENAME TO dispositions;
            CREATE INDEX IF NOT EXISTS idx_dispositions_defect ON dispositions(defect_id);
        """)
        await db.commit()


    # ── Migration 7: add MRB_REJECTED decision ───────────────────────────────
    async with db.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='dispositions'"
    ) as cur:
        row = await cur.fetchone()
    disp_sql7 = row[0] if row else ""

    if "MRB_REJECTED" not in disp_sql7:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS dispositions_m7 (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                defect_id             INTEGER NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
                decision              TEXT NOT NULL CHECK(decision IN (
                                          'USE_AS_IS','KABUL_RESIM','CONFORMS',
                                          'REWORK','RE_INSPECT',
                                          'MRB_SUBMITTED','MRB_CTP','MRB_ACCEPTED','MRB_REJECTED',
                                          'VOID','REPAIR','SCRAP')),
                entered_by            TEXT NOT NULL,
                decided_at            TEXT NOT NULL,
                note                  TEXT NOT NULL,
                spec_ref              TEXT,
                engineer              TEXT,
                reinspector           TEXT,
                concession_no         TEXT,
                void_reason           TEXT,
                repair_ref            TEXT,
                scrap_reason          TEXT,
                measurements_snapshot TEXT,
                created_at            TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO dispositions_m7 SELECT * FROM dispositions;
            DROP TABLE dispositions;
            ALTER TABLE dispositions_m7 RENAME TO dispositions;
            CREATE INDEX IF NOT EXISTS idx_dispositions_defect ON dispositions(defect_id);
        """)
        await db.commit()


    # ── Migration 8: add operation_number to inspections ─────────────────────
    async with db.execute("PRAGMA table_info(inspections)") as cur:
        insp_cols = {row[1] async for row in cur}

    if "operation_number" not in insp_cols:
        await db.execute(
            "ALTER TABLE inspections ADD COLUMN operation_number TEXT NOT NULL DEFAULT ''"
        )
        await db.commit()

    # ── Migration 9: add CTP_RE_INSPECT decision ──────────────────────────────
    async with db.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='dispositions'"
    ) as cur:
        row = await cur.fetchone()
    disp_sql9 = row[0] if row else ""

    if "CTP_RE_INSPECT" not in disp_sql9:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS dispositions_m9 (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                defect_id             INTEGER NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
                decision              TEXT NOT NULL CHECK(decision IN (
                                          'USE_AS_IS','KABUL_RESIM','CONFORMS',
                                          'REWORK','RE_INSPECT','CTP_RE_INSPECT',
                                          'MRB_SUBMITTED','MRB_CTP','MRB_ACCEPTED','MRB_REJECTED',
                                          'VOID','REPAIR','SCRAP')),
                entered_by            TEXT NOT NULL,
                decided_at            TEXT NOT NULL,
                note                  TEXT NOT NULL,
                spec_ref              TEXT,
                engineer              TEXT,
                reinspector           TEXT,
                concession_no         TEXT,
                void_reason           TEXT,
                repair_ref            TEXT,
                scrap_reason          TEXT,
                measurements_snapshot TEXT,
                created_at            TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO dispositions_m9 SELECT * FROM dispositions;
            DROP TABLE dispositions;
            ALTER TABLE dispositions_m9 RENAME TO dispositions;
            CREATE INDEX IF NOT EXISTS idx_dispositions_defect ON dispositions(defect_id);
        """)
        await db.commit()


async def init_db():
    sql = _SCHEMA.read_text(encoding="utf-8")
    async with aiosqlite.connect(str(DB_PATH)) as db:
        await db.executescript(sql)
        await _migrate_db(db)
        await db.commit()
