# KYC Live Interview Platform

A multi-layer platform for running the **live video-interview** step of a KYC (Know Your Customer) flow. A customer starts a session from a mobile app, an operator picks it up from a web panel, and the two are connected over a **peer-to-peer WebRTC** call. The signaling backend keeps track of the meeting lifecycle and — the focus of this project — handles **participant drops and resumes**: if either side loses connection, the call is held open for a grace period and automatically renegotiated when they come back, or auto-ended if they don't.

> This repository is the "drop logic" line of work: the reconnection / auto-resume / auto-end behaviour is implemented end-to-end across the backend, web, and mobile clients.

---

## Architecture

```
                         ┌──────────────────────────┐
   Flutter (customer) ───┤                          ├─── React (operator panel)
                         │        NGINX (TLS)        │
                         │  /  → React SPA           │
                         │  /api/       → :8080      │
                         │  /socket.io/ → :8000      │
                         └────────────┬─────────────┘
                                      │
                         ┌────────────┴─────────────┐
                         │      Spring Boot API      │
                         │  REST  (:8080)  meetings  │
                         │  Socket.IO (:8000) signal │
                         └────────────┬─────────────┘
                                      │
                              PostgreSQL (:5432)
```

The platform is a monorepo of four parts:

| Directory                     | Role                                                                                  |
|-------------------------------|---------------------------------------------------------------------------------------|
| `kyc_live_interview_api/`     | Spring Boot backend: REST API for meeting lifecycle + Socket.IO WebRTC signaling server |
| `kyc_live_interview_web/`     | React operator panel (Create React App) — lists pending interviews and runs the call  |
| `kyc_live_interview_mobile/`  | Flutter customer app / SDK — starts an interview and joins the call                   |
| `nginx/`                      | TLS-terminating reverse proxy; serves the built SPA and proxies REST + Socket.IO      |
| `webrtc_temel/`               | Reference/prototype WebRTC peer-to-peer signaling demo the platform was built on top of |

Media flows **peer-to-peer** between the two clients (STUN: `stun.l.google.com:19302`); the backend only relays signaling messages (offer / answer / ICE candidates) and owns the meeting record.

---

## Tech stack

| Layer   | Stack                                                                                          |
|---------|------------------------------------------------------------------------------------------------|
| Backend | Java 17, Spring Boot 3.3.5, Spring Web, Spring Security + JWT (JJWT 0.11.5), Spring Data JPA, `netty-socketio` 1.7.19, PostgreSQL, (Redis dependency present) |
| Web     | React 19, React Router 7, `socket.io-client` **2.4.0** (required by netty-socketio), Axios, Bootstrap 5 |
| Mobile  | Flutter (Dart SDK ≥ 3.3), `flutter_webrtc` 0.14, `socket_io_client` 1.0.2, `http`, `lottie`    |
| Infra   | Docker Compose, NGINX (HTTP→HTTPS redirect + TLS), PostgreSQL 17                               |

---

## Meeting lifecycle & data model

A meeting is a single `Meeting` row that moves through these statuses:

```
waiting  ──(operator joins)──▶  in_progress  ──(end / timeout)──▶  completed
                                                                     cancelled
```

- **`waiting`** — customer created the session, no operator yet.
- **`in_progress`** — an operator joined; both peers are expected in the room.
- **`completed`** — ended explicitly (by either party) or auto-ended after a disconnect timeout.
- **`cancelled`** — reserved terminal state.

Entities (JPA, auto-DDL via `ddl-auto: update`):

- **`Meeting`** — `id (UUID)`, `customerId`, `operatorId`, `status`, `notes`, `startTimestamp`, `endTimestamp`.
- **`Screenshot`** — captured stills uploaded during the call (base64), linked to a meeting.
- **`MeetingRecord`** — uploaded recording blobs (multipart), linked to a meeting.

---

## REST API

Base path `/api/meeting`. Auth is a **Bearer JWT** (see [Authentication](#authentication)).

| Method & path                              | Auth | Description                                                  |
|--------------------------------------------|------|-------------------------------------------------------------|
| `POST /start`                              | ✅   | Customer creates a meeting → `status: waiting`              |
| `GET  /pending`                            | —    | List all `waiting` meetings (operator dashboard feed)       |
| `GET  /{id}`                               | —    | Fetch a meeting                                             |
| `GET  /{id}/status`                        | ✅   | Fetch just the current status                              |
| `POST /{id}/join`                          | ✅   | Operator joins → `status: in_progress`                     |
| `POST /{id}/end`                           | ✅   | End the meeting; also broadcasts `meetingEnded` over socket |
| `POST /{id}/screenshots/base64`            | —    | Upload a screenshot as base64 JSON                          |
| `POST /{id}/recordings`                    | —    | Upload a recording (`multipart/form-data`, field `file`)   |

Security rules are declared in `SecurityConfig`; `/pending` and the upload endpoints are currently open, the lifecycle endpoints require authentication.

---

## Real-time signaling (Socket.IO)

The signaling server runs on a **separate port (8000)** via `netty-socketio` (NGINX proxies `/socket.io/` to it). Clients connect with `?token=<jwt>&role=operator|customer`; the room id is the meeting `id`.

**Client → server events:** `joinRoom`, `leaveRoom`, `endMeeting`, `offer`, `answer`, `candidate`, `ready`

**Server → client events:** `setCaller`, `roomJoined`, `peerJoined`, `peerLeft`, `full`, `participantDropped`, `participantRejoined`, `meetingEnded`, `unauthorized`

### The drop / resume logic

This is the core behaviour of this repo:

1. **Caller election** — the first peer in the room is elected "caller" (the impolite side in [perfect negotiation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation)); `setCaller` tells clients who should send the offer. The caller is re-elected automatically if it leaves.
2. **Drop** — on disconnect, the participant is marked offline and a **grace timer** starts (`app.disconnect-timeout-seconds`, default **60s**). The server broadcasts `participantDropped` with the countdown so the remaining peer can show a "reconnecting…" banner.
3. **Resume** — if the participant rejoins before the timer fires, the timer is cancelled, `participantRejoined` is broadcast, and the caller re-sends an offer with **ICE restart** to rebuild the media path.
4. **Auto-end** — if the timer expires, the meeting is set to `completed` and `meetingEnded` (`reason: timeout_disconnect`) is broadcast to both peers so they redirect out of the call.

Explicit ends (`endMeeting` socket event or the REST `/{id}/end`) both converge on the same `meetingEnded` broadcast so the other peer always auto-exits.

---

## Authentication

All layers currently share a single dev JWT secret and a hardcoded dev token for convenience. The socket connection and REST calls both pass the token; the server validates it and reads `subject` and `role` claims (an explicit `role` query param can override for testing).

> ⚠️ **Security note:** the committed configs contain a demo `JWT_SECRET`, database password, TLS key material under `*/ssl/`, and an ngrok URL. **Rotate these and move them to environment variables / secrets before any non-local deployment**, and do not treat the checked-in values as safe.

---

## Getting started

### Option A — Docker Compose (full stack)

Brings up PostgreSQL, the backend (REST `:8080` + Socket.IO `:8000`), and NGINX (`:80`/`:443`) with the built web app:

```bash
# from repo root
docker compose up --build
# or, using the provided helper:
sh docker-run.sh        # = docker compose down -v --remove-orphans && docker compose up --build
```

Then open **https://localhost** (self-signed cert — accept the browser warning). It redirects to the operator panel at `/pending-interview`.

Compose provides `JWT_SECRET` and `DB_PASSWORD` from a root `.env` file.

### Option B — run services individually

**Backend** (needs a local PostgreSQL matching `application.yml`, DB `kyc_db`):
```bash
cd kyc_live_interview_api
./mvnw spring-boot:run          # REST on :8080, Socket.IO on :8000
```

**Web (operator panel):**
```bash
cd kyc_live_interview_web
npm install
npm start                        # CRA dev server on :3000
```
The web client talks to the backend through relative paths (`/api`, `/socket.io`), so run it behind the NGINX proxy (or point a proxy at the backend) for the socket upgrade to work.

**Mobile (customer app):**
```bash
cd kyc_live_interview_mobile
flutter pub get
flutter run
```
Set the backend endpoints via `--dart-define` (do **not** use `localhost` from a device/emulator — use your LAN IP or a tunnel):
```bash
flutter run \
  --dart-define=API_ORIGIN=http://192.168.1.33:8080 \
  --dart-define=SOCKET_ORIGIN=http://192.168.1.33:8000
```

---

## Configuration reference

| Setting                          | Where                                   | Default                     |
|----------------------------------|-----------------------------------------|-----------------------------|
| REST port                        | `application.properties` / `.yml`       | `8080`                      |
| Socket.IO host/port              | `application.properties` (`socket.*`)   | `0.0.0.0:8000`              |
| Disconnect grace period          | `app.disconnect-timeout-seconds`        | `60`                        |
| JWT secret / expiration          | `jwt.secret`, `jwt.expiration`          | dev value / `86400000` ms   |
| DB URL / user / pass             | `application.yml` / compose `db` service | `kyc_db` / `postgres` / … |
| Max upload size                  | `spring.servlet.multipart.max-*-size`   | `200MB`                     |
| Mobile API / socket origin       | `mobile/lib/utils/config.dart` (env)    | overridable via `--dart-define` |

---

## Repository layout

```
kyc-live-interview-platform/
├── docker-compose.yml              # backend + nginx + postgres
├── docker-run.sh / MakeFile        # convenience rebuild scripts
├── nginx/                          # reverse proxy config + TLS certs
├── kyc_live_interview_api/         # Spring Boot backend
│   └── src/main/java/tr/com/cs/kyc_live_interview_api/
│       ├── controller/             # MeetingController, exception handler
│       ├── service/                # MeetingService (lifecycle, uploads)
│       ├── websocket/SocketHandler # Socket.IO signaling + drop/resume logic
│       ├── security/               # JWT filter, token service, security config
│       ├── config/                 # Socket.IO server + web config
│       ├── model/ · dto/ · repository/
├── kyc_live_interview_web/         # React operator panel
│   └── src/{pages,components,api,utils}/  # socketClient.js = WebRTC + signaling
├── kyc_live_interview_mobile/      # Flutter customer app
│   └── lib/{core,services,ui,utils}/      # signaling_service.dart, api_service.dart
└── webrtc_temel/                   # reference p2p WebRTC prototype
```

---

## Contributors

- **Backend:** Korhan Erdoğdu, Kaan Erdem
- **Web:** Elif Akçan
- **Mobile:** Yusuf Mirhan Metin

## License

MIT — see [LICENSE](LICENSE).
