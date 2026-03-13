-- Inspection Management System Schema

CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    customer    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS defect_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inspections (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id       INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    part_number      TEXT NOT NULL,
    serial_number    TEXT NOT NULL,
    operation_number TEXT NOT NULL DEFAULT '',
    inspector        TEXT NOT NULL DEFAULT '',
    date             TEXT NOT NULL DEFAULT (date('now')),
    status           TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','rejected')),
    notes            TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS defects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id   INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    defect_type_id  INTEGER NOT NULL REFERENCES defect_types(id) ON DELETE RESTRICT,
    depth           REAL,
    width           REAL,
    length          REAL,
    radius          REAL,
    angle           REAL,
    color           TEXT,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photo_defects (
    photo_id  INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    defect_id INTEGER NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
    PRIMARY KEY (photo_id, defect_id)
);
CREATE INDEX IF NOT EXISTS idx_photo_defects_photo  ON photo_defects(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_defects_defect ON photo_defects(defect_id);

CREATE TABLE IF NOT EXISTS dispositions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    defect_id     INTEGER NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
    decision      TEXT NOT NULL CHECK(decision IN (
                                          'USE_AS_IS','KABUL_RESIM','CONFORMS',
                                          'REWORK','RE_INSPECT','CTP_RE_INSPECT',
                                          'MRB_SUBMITTED','MRB_CTP','MRB_ACCEPTED','MRB_REJECTED',
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dispositions_defect   ON dispositions(defect_id);
CREATE INDEX IF NOT EXISTS idx_inspections_project ON inspections(project_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status  ON inspections(status);
CREATE INDEX IF NOT EXISTS idx_defects_inspection  ON defects(inspection_id);
CREATE INDEX IF NOT EXISTS idx_photos_inspection   ON photos(inspection_id);

-- Triggers to update updated_at
CREATE TRIGGER IF NOT EXISTS trg_projects_updated
    AFTER UPDATE ON projects FOR EACH ROW
    BEGIN UPDATE projects SET updated_at = datetime('now') WHERE id = OLD.id; END;

CREATE TRIGGER IF NOT EXISTS trg_defect_types_updated
    AFTER UPDATE ON defect_types FOR EACH ROW
    BEGIN UPDATE defect_types SET updated_at = datetime('now') WHERE id = OLD.id; END;

CREATE TRIGGER IF NOT EXISTS trg_inspections_updated
    AFTER UPDATE ON inspections FOR EACH ROW
    BEGIN UPDATE inspections SET updated_at = datetime('now') WHERE id = OLD.id; END;

CREATE TRIGGER IF NOT EXISTS trg_defects_updated
    AFTER UPDATE ON defects FOR EACH ROW
    BEGIN UPDATE defects SET updated_at = datetime('now') WHERE id = OLD.id; END;

-- Seed data: Projects
INSERT OR IGNORE INTO projects (id, name, description) VALUES
    (1, 'TS1400', 'TS1400 Motor Projesi'),
    (2, 'PD170',  'PD170 Motor Projesi'),
    (3, 'PG50',   'PG50 Motor Projesi'),
    (4, 'TF6000', 'TF6000 Motor Projesi');

-- Seed data: Defect types
INSERT OR IGNORE INTO defect_types (id, name) VALUES
    (1, 'Braze Void'),
    (2, 'Burrs'),
    (3, 'Dent'),
    (4, 'Deformation'),
    (5, 'Discoloration'),
    (6, 'Excess of Material'),
    (7, 'Nick'),
    (8, 'Scratch');
