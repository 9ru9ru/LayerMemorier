#!/bin/sh
# 배포용 zip (make-dist.ps1과 같은 내용, mac/Linux용). 패널 실행에 필요한 것만 담고 개발 파일은 뺀다.
# 파일명의 버전은 package.json에서 읽는다.
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
version=$(node -p "require('$root/package.json').version")
stage=$(mktemp -d)
mkdir -p "$stage/LayerMemorier" "$root/dist"
for i in CSXS client core host install README.md .debug; do
  [ -e "$root/$i" ] || { echo "missing: $i" >&2; exit 1; }
  cp -R "$root/$i" "$stage/LayerMemorier/"
done
zip="$root/dist/LayerMemorier-$version.zip"
rm -f "$zip"
(cd "$stage" && zip -qrX "$zip" LayerMemorier -x '*.DS_Store' -x '*/._*')
rm -rf "$stage"
echo "$zip ($(( $(wc -c < "$zip") / 1024 )) KB)"
