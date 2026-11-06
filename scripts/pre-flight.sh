#!/bin/bash
echo "==========================================="
echo "🛡️  物理基线契约校验 Pre-flight"
echo "==========================================="
if [ ! -f docs/BASELINE.yaml ]; then echo "❌ 错误：找不到 docs/BASELINE.yaml"; exit 1; fi
EXPECTED_HEAD=$(grep 'head_commit:' docs/BASELINE.yaml | awk -F'"' '{print $2}')
EXPECTED_TESTS=$(grep 'test_cases:' docs/BASELINE.yaml | awk '{print $2}')

echo "🔍 契约要求最低基线：$EXPECTED_HEAD"

git fetch origin &> /dev/null
CURRENT_HEAD=$(git rev-parse origin/main)
echo "🔍 当前远端 main：$CURRENT_HEAD"

# 物理断言：当前的 main 必须包含契约中的 HEAD（即不能比契约要求的代码旧）
if ! git merge-base --is-ancestor "$EXPECTED_HEAD" origin/main; then
  echo "❌ 致命错误：远端 main 落后于契约基线，或者发生了分支漂移！"
  exit 1
fi

echo "✅ 物理基线校验通过！允许开工。"
