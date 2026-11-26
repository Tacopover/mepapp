#!/bin/bash
cd /root/MepApp/.claude/worktrees/buildings-b7 || exit 1
pnpm --filter @mepapp/core test > /tmp/claude-0/-root-MepApp/cf5c37c1-d676-49ff-a984-22050b48ded8/scratchpad/core-run.txt 2>&1
echo "exit $?" >> /tmp/claude-0/-root-MepApp/cf5c37c1-d676-49ff-a984-22050b48ded8/scratchpad/core-run.txt
