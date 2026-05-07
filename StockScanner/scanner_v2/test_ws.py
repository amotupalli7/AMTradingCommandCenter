"""Quick test: connect to trade WebSocket and print raw trade data. Ctrl+C to stop."""
import os
import pprint
from dotenv import load_dotenv
from massive import WebSocketClient
from massive.websocket.models import Feed, Market

load_dotenv()

COUNT = 0

def on_msgs(msgs):
    global COUNT
    for msg in msgs:
        COUNT += 1
        print(f"--- Trade #{COUNT} ---")
        print(f"  type(msg): {type(msg)}")
        print(f"  vars(msg): {pprint.pformat(vars(msg))}")
        print()

client = WebSocketClient(
    api_key=os.getenv("POLYGON_API_KEY", ""),
    feed=Feed.RealTime,
    market=Market.Stocks,
)
client.subscribe("T.*")
print("Connected — streaming trades. Ctrl+C to stop.\n")
client.run(on_msgs)