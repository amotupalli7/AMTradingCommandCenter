import os
from pathlib import Path
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()

@dataclass
class Config:
    API_KEY: str = field(default_factory=lambda: os.getenv("POLYGON_API_KEY", ""))
    save_interval: int = 30          # seconds between JSON flushes to disk
    gap_scanner_interval: int = 5    # seconds between gap table prints
    gap_webhook: str = field(default_factory=lambda: os.getenv("GAP_WEBHOOK_URL", ""))
    runner_webhook: str = field(default_factory=lambda: os.getenv("RUNNER_WEBHOOK_URL", ""))
    big_candle_webhook: str = field(default_factory=lambda: os.getenv("BIG_CANDLE_WEBHOOK_URL", ""))
    hod_webhook: str = field(default_factory=lambda: os.getenv("HOD_WEBHOOK_URL", ""))
    backside_webhook: str = field(default_factory=lambda: os.getenv("BACKSIDE_WEBHOOK_URL", ""))
    hod_rvol_window: int = 10  # minutes for rolling volume average at HOD
    backside_min_wait_ms: int = 600_000  # 10 minutes in ms before backside bounce alerts
    log_dir: Path = field(default_factory=lambda: Path("scanner_v2/logs"))
    data_file: Path = field(init=False)
    log_file: Path = field(init=False)

    def __post_init__(self):
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.data_file = self.log_dir / "scanner_data.json"
        self.log_file = self.log_dir / "scanner.log"
