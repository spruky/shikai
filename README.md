# 🍁 Shikai

AI browser + multi-engine search — native Android app (Capacitor) with a
Hugging Face Spaces backend.

## Build the APK
Push to `main` → **GitHub Actions** builds `shikai.apk` (Actions → artifacts, and a Release).
No local Android tooling needed.

## Backend (Hugging Face Space)
The search engine "Shikai" lives in [`shikai-space/`](shikai-space/) as a single
self-contained `Dockerfile`. Create a Docker Space and drop the Dockerfile in.

- 10 search engines, queried in parallel
- AI overview + deep research (`grok-4.20-multi-agent-medium`)
- Email-OTP auth · in-app browser proxy (desktop UA + inspect element + AI page editor)

## App features
- Email OTP sign-in (bonsai + falling leaves, glassmorphism)
- Web search with AI overview
- `/search <topic>` → deep AI research with live sources (no overview)
- In-app desktop browser: inspect element (eruda) + live AI page editor
