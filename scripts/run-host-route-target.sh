#!/usr/bin/env sh
exec deno run --unstable-sloppy-imports --allow-env --allow-ffi --allow-net=127.0.0.1,localhost --allow-read --allow-write "$(dirname "$0")/run-host-route-target.ts" "$@"
