#!/bin/bash
cd /root/MepApp/.claude/worktrees/buildings-b7
pnpm --filter @mepapp/core test > /tmp/claude-0/-root-MepApp/cf5c37c1-d676-49ff-a984-22050b48ded8/scratchpad/core-b7t09a3.log 2>&1
echo "exit $?" >> /tmp/claude-0/-root-MepApp/cf5c37c1-d676-49ff-a984-22050b48ded8/scratchpad/core-b7t09a3.log
