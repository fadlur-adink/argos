#!/bin/bash

# test-webhook.sh

SERVER_URL="http://localhost:8000/webhook"

echo "=== Testing Valid Payload ==="
curl -X POST $SERVER_URL \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "12345",
    "subject": "Merge Request opened: my-project !42 Some New Feature",
    "body": "View merge request: https://gitlab.example.com/my-group/my-project/-/merge_requests/42"
  }'

# echo -e "\n\n=== Testing Unconfigured Project Payload ==="
# curl -X POST $SERVER_URL \
#   -H "Content-Type: application/json" \
#   -d '{
#     "messageId": "12346",
#     "subject": "Merge Request opened: unknown-project !1 Fix Bug",
#     "body": "View merge request: https://gitlab.com/group/unknown-project/-/merge_requests/1"
#   }'

# echo -e "\n\n=== Testing Malformed Payload ==="
# curl -X POST $SERVER_URL \
#   -H "Content-Type: application/json" \
#   -d '{
#     "messageId": "12347"
#   }'

# echo -e "\n"
