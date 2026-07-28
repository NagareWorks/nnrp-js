@echo off
deno run --unstable-sloppy-imports --allow-env --allow-ffi --allow-net=127.0.0.1,localhost --allow-read --allow-run --allow-write "%~dp0run-host-route-target.ts" %*
