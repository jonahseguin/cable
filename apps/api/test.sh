#!/bin/bash

TOKEN_ID="test-socket-123"
ACCOUNT_ID="[removed]"
CHANNEL_NAME="global"

echo "🔌 Connecting WebSocket client..."
# Keep stdin open by piping from `cat`
cat | websocat -E -H="x-socket-id: $TOKEN_ID" \
               -H="x-account: $ACCOUNT_ID" \
               -H="x-region: ca-west" \
               -H="x-channels: [\"$CHANNEL_NAME\"]" \
               ws://localhost:8787/connect/$TOKEN_ID &
WS_PID=$!

sleep 1

echo "📤 Publishing message to channel..."
curl -X POST http://localhost:8787/publish \
     -H "Content-Type: application/json" \
     -d @- <<EOF
{
  "account": "$ACCOUNT_ID",
  "channel": "$CHANNEL_NAME",
  "payload": "hello from curl 🚀"
}
EOF

sleep 2

kill $WS_PID 2>/dev/null
echo "✅ Test complete."
