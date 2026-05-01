# CBRA daily
python ingest_trades.py --data-dir "Trades/CBRA 2026" 4-30-26

# Multiple CBRA days
python ingest_trades.py --data-dir "Trades/CBRA 2026" 4-28-26 4-29-26 4-30-26

# All CBRA files in folder
python ingest_trades.py --data-dir "Trades/CBRA 2026" --all

# Re-ingest a CBRA day (preserves journal notes via legacy_trade_id snapshot)
python ingest_trades.py --data-dir "Trades/CBRA 2026" --force 4-30-26

# TOS (still uses --tos flag, single combined file)
python ingest_trades.py --tos "Trades/TOS/25-26.csv"

# TOS re-ingest
python ingest_trades.py --tos "Trades/TOS/25-26.csv" --force

# Without specifying days — process everything in the folder:
python ingest_trades.py --data-dir "Trades/CBRA 2026" --all