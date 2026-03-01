# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

STCKRSLAP is a virtual lamp pole sticker-slapping web application. Users can upload image stickers (PNG, JPG, WEBP), place them on a shared canvas, rotate them (once per sticker), and scrape/deface other stickers via drag interaction. No persistent data or user identifiers are stored — the canvas resets when the container restarts.

## Deployment

- Runs as a Docker container on port **10014**
- Optional `INVITE_KEY` environment variable restricts access (appended to the URL to join)
- Should be placed behind a reverse proxy for production use

## License

Custom license: no commercial use or resale without author permission. Personal hosting and modification are allowed.
