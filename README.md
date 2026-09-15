# Ripple

Live audience polling. Create a poll, share a short code (or QR), and watch the bars move as people vote — no refresh.

**Flow:** Create poll → Share link → Audience votes → Live results

## Stack

| Layer | Use |
| --- | --- |
| Frontend | React (Vite) in `/frontend` |
| Backend | Go + Gin in `/backend` |
| Database | MongoDB (polls, votes, users) |
| Realtime | Redis (live counts + pub/sub) |

All four do real work:

- **MongoDB** is the source of truth: users, poll documents, and one vote row per device (unique `pollId + voterHash`).
- **Redis** holds the live tally (`HINCRBY poll:counts:{id}`) and **publishes** every change on `poll:live:{slug}`. The API streams those messages as **Server-Sent Events**. If Redis is empty after a restart, counts are rebuilt from Mongo and written back.
- **Gin** validates every write server-side. Creating or managing a poll requires a session cookie. Voting does not.

## Run locally

Need Go 1.23+, Node 22+, Docker (for Mongo + Redis).

```bash
docker compose up -d
cd backend && go run .
cd frontend && npm install && npm run dev
```

The Vite app proxies `/api` to the Go service. Open the printed local URL and try the demo code `WELCOME`.

Sign in with email + password (at least 8 characters) to create a poll.

## Layout

```
/frontend   React UI
/backend    Go (Gin) service
README.md   this file
```

## Decisions

- **SSE over websockets.** One-way “here are the new bars” fits voting; Redis pub/sub fans out to every watcher.
- **Hashed voter token**, not accounts, for the audience. One vote per poll per browser. Hosts sign in with email/password (bcrypt + httpOnly JWT cookie).
- **Custom share codes** (3–16 letters/numbers) so a room can remember `/p/LUNCH`.
- **QR code** on the poll so a projector works when copy-paste does not.
- **Hide results until vote** is optional; the host always sees the tally.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `HTTP_ADDR` | `127.0.0.1:8081` | Go listen address |
| `MONGO_URI` | `mongodb://127.0.0.1:27017` | |
| `MONGO_DB` | `ripple` | |
| `REDIS_ADDR` | `127.0.0.1:6379` | |
| `JWT_SECRET` | dev fallback | **Set this in production** |
| `COOKIE_SECURE` | off | Set `1` behind HTTPS |

## Deploy

Run MongoDB, Redis, and the Go binary behind HTTPS. Point the React build’s `/api` at the Go service (reverse proxy). Set `JWT_SECRET` and `COOKIE_SECURE=1`.
