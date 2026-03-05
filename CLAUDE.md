# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

STCKRSLAP is a virtual lamp pole sticker-slapping web application. Users can upload image stickers (PNG, JPG, WEBP, animated GIF), place them on a shared canvas via a drag-from-tray flow, and each sticker is auto-rotated with a random wobble (±30°) on placement. No persistent data or user identifiers are stored — the canvas resets when the container restarts.

## Build & Run

- **Go build:** `go build ./...`
- **Docker build:** `docker build -f Dockerfile.dockerbuild -t stckrslap:latest .`
- **Run:** `docker run -p 10014:10014 stckrslap:latest`
- Port **10014** by default (configurable via `PORT` env var)
- Optional `INVITE_KEY` environment variable restricts access (appended to the URL to join)
- Should be placed behind a reverse proxy for production use

## Architecture

### Backend (Go)

- `main.go` — Entry point; wires up canvas, hub, and HTTP server
- `internal/server/` — HTTP server, routing, auth middleware, config
- `internal/ws/` — WebSocket hub, client handling, message protocol
  - `hub.go` — Client registry, broadcast, connection count tracking, last-sticker timestamp
  - `client.go` — Read/write pumps, message dispatch (place, finalize)
  - `protocol.go` — Message type definitions (place, finalize, status, sticker_placed, sticker_finalized, error)
- `internal/canvas/` — Canvas and sticker state (in-memory, no persistence)
- `internal/upload/` — Image upload handler, format validation, resizing
  - Supports PNG, JPEG, WebP (resized to fit), and animated GIF (no resizing; rejected if too large)
  - Max file size: **5MB** (static images are iteratively downscaled to fit; GIFs are rejected if they exceed it)
  - Max sticker dimension: 2048px; canvas-relative limits also apply

### Frontend (vanilla JS, no framework)

- `static/index.html` — Single page with canvas, GIF overlay, sticker tray, toolbar, HUD
- `static/js/canvas.js` — `CanvasRenderer` class: viewport, pan/zoom, sticker rendering, GIF overlay positioning
- `static/js/sticker.js` — Upload, tray management, drag-to-place, ghost preview, placement with random wobble
- `static/js/websocket.js` — `StckrSocket` class: auto-reconnect WebSocket with message buffering
- `static/js/input.js` — Unified mouse/touch input handler
- `static/js/main.js` — App init, WS message handlers, state management
- `static/css/style.css` — All styles

### Key Design Decisions

- **Tray-based placement:** Upload adds stickers to a bottom tray. User drags from tray to canvas. ESC returns sticker to tray. No rotation mode — stickers auto-wobble on placement and are immediately finalized.
- **Animated GIF rendering:** GIFs cannot be drawn onto a `<canvas>` element with animation. They are rendered as actual `<img>` DOM elements in a `#gif-overlay` div positioned over the canvas, with CSS transforms matching the viewport (pan/zoom/rotation). Static stickers use offscreen canvas rendering.
- **Horizontal wrapping:** The canvas wraps horizontally (infinite scroll). Stickers render at up to 3 offsets (0, ±CANVAS_W) for seamless wrapping.
- **Connection status:** HUD shows connected user count and relative time since last sticker placement, updated via `status` WS broadcasts on connect/disconnect/placement events.

## License

Custom license: no commercial use or resale without author permission. Personal hosting and modification are allowed.
