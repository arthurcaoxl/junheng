#!/bin/bash
echo "==========================================="
echo "🛡️  物理基线契约校验 Pre-flight"
echo "==========================================="
if [ ! -f docs/BASELINE.yaml ]; then echo "❌ 错误：找不到 docs/BASELINE.yaml"; exit 1; fi
EXPECTED_HEAD=$(grep 'head_commit:' docs/BASELINE.yaml | awk -F'"' '{print $2}')
EXPECTED_TESTS=$(grep 'test_cases:' docs/BASELINE.yaml | awk '{print $2}')
if [ -z "$EXPECTED_HEAD" ]; then echo "❌ 错误：无法解析 head_commit"; exit 1; fi
echo "🔍 契约要求基线：$EXPECTED_HEAD"
echo "🔍 契约要求测试：$EXPECTED_TESTS 项"
git fetch origin &> /dev/null
CURRENT_HEAD=$(git rev-parse origin/main)
echo "🔍 远端 main 物理状态：$CURRENT_HEAD"
if [ "$EXPECTED_HEAD" != "$CURRENT_HEAD" ]; then
  echo "❌ 致命错误：基线不一致！"
  exit 1
fi
echo "✅ 物理基线校验通过！允许开工。"
