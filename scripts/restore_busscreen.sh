#!/bin/bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
echo "Restoring BusScreen.tsx from d6d6504 and applying favorite-direction patch..."
git checkout d6d650421abafa4a1c37cea14c28ddaa5dd9f80a -- src/screens/BusScreen.tsx
git apply scripts/bus-screen-favorite-fix.patch
git add src/screens/BusScreen.tsx
git status
git commit -m "fix: BusScreen 즐겨찾기 방향 분리 복구 (PLACEHOLDER 제거)"
echo "Commit created. Run: git push"
