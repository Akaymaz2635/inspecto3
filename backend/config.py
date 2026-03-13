import json
import sys
from pathlib import Path

# PyInstaller frozen exe → exe'nin yanındaki klasör
# Normal çalışma       → proje kök dizini
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).resolve().parent.parent

# ── Shared directory config ───────────────────────────────────────────────────
# Read config.json from project root.
# Set "shared_dir" to a network path to store DB + uploads on a shared drive.
# Leave null to use local folders (development / single-machine use).
_CONFIG_FILE = BASE_DIR / "config.json"
_shared_dir: Path | None = None

if _CONFIG_FILE.exists():
    try:
        _cfg = json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
        _raw = _cfg.get("shared_dir")
        if _raw:
            _shared_dir = Path(str(_raw))
    except Exception:
        pass  # malformed config → fall back to local

if _shared_dir:
    DB_PATH     = _shared_dir / "data"    / "inspection.db"
    UPLOADS_DIR = _shared_dir / "uploads"
else:
    DB_PATH     = BASE_DIR / "data"    / "inspection.db"
    UPLOADS_DIR = BASE_DIR / "uploads"

DB_PATH.parent.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
