import time

from scanner_v2.models import ScannerState
from scanner_v2.config import Config
from scanner_v2.alerts import check_and_alert


def run_gap_scanner(state: ScannerState, config: Config):
    """Periodically check for new gappers/runners and fire alerts."""
    while not state.shutdown_flag.is_set():
        time.sleep(config.gap_scanner_interval)
        check_and_alert(state, config)
