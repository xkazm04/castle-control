#!/usr/bin/env bash
# gen_one.sh <name> <prompt> : one agy image into img/<name>.png, one retry, logged to log/<name>.json
name="$1"; prompt="$2"
cd "$(dirname "$0")"
mkdir -p log
out="C:\\Users\\kazda\\Spooky\\CastleControl\\prototype\\assets-2026-10-30\\img\\${name}.png"
[ -s "img/${name}.png" ] && { echo "skip $name"; exit 0; }
for try in 1 2; do
  "$LOCALAPPDATA/agy/bin/agy.exe" -p "Generate exactly one image with your image generation tool and save it as ${out} . Image: ${prompt} Reply with only the saved path." \
    --model gemini-3.8-flash-high --output-format json > "log/${name}.${try}.json" 2>&1
  if [ -s "img/${name}.png" ]; then echo "ok $name ($(stat -c %s img/${name}.png) bytes, try $try)"; exit 0; fi
done
echo "FAIL $name"
