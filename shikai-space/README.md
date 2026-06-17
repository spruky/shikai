---
title: Shikai
emoji: 🍁
colorFrom: red
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
short_description: Multi-engine search + AI overview + deep research backend
---

# 🍁 Shikai

Backend search engine for the **Shikai** mobile browser app.

- `GET /search?q=…&n=8&format=json|pretty|text` — 10 engines, queried in parallel
- `GET /ai?q=…&snippets=[…]` — AI overview (SSE)
- `GET /research?q=…` — deep research: plan → parallel search → synthesis (SSE)
- `POST /otp/send` `{email}` / `POST /otp/verify` `{email,code}` — email OTP auth
- `GET /proxy?url=…` — in-app browser proxy (desktop UA + inspect element + AI editor)
- `GET /engines` · `GET /health`

Engines: ddg · bing · brave · startpage · mojeek · yahoo · ecosia · wikipedia · archive · gnews
