// src/utils/socketClient.js
// socket.io-client v2.4.0 (required for netty-socketio)
import io from "socket.io-client";

let socket = null;

// WebRTC
let pc;
let localStream;
let remoteStream;

// room / role
let roomId;
let isCaller = false;
let joinedOnce = false;

// Perfect Negotiation helpers
let polite = true;          // second joiner is polite; first (caller) is impolite
let makingOffer = false;
let ignoreOffer = false;

// drop / resume guard
let sawDrop = false;

// meeting ended (global)
let meetingEndedHandlerAttached = false;
let _onMeetingEnded = null;

// UI drop banner callbacks (optional)
let _onDropUpdate = null;
let _onDropClear = null;

// drop countdown
let dropCountdownInterval = null;
let dropDeadlineTs = null;

const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
const AV_CONSTRAINTS = { audio: true, video: true };
const AUDIO_ONLY = { audio: true, video: false };

const log = (...a) => console.log("[RTC]", ...a);

// Token = the shared symmetric secret the backend checks (see JwtTokenService).
// Override at runtime via localStorage "API_TOKEN" or build-time via REACT_APP_API_TOKEN.
// The default is an insecure dev placeholder — must match the backend's JWT_SECRET.
const getAuthToken = () =>
  localStorage.getItem("API_TOKEN") ||
  process.env.REACT_APP_API_TOKEN ||
  "dev-insecure-shared-secret-change-me";

// -------------------- helpers --------------------

function removeRoomEventHandlers() {
  if (!socket) return;
  [
    "roomJoined",
    "peerJoined",
    "setCaller",
    "offer",
    "answer",
    "candidate",
    "peerLeft",
    "full",
    "participantDropped",
    "participantRejoined",
  ].forEach((evt) => {
    try { socket.removeAllListeners(evt); } catch {}
  });

  clearInterval(dropCountdownInterval);
  dropCountdownInterval = null;
  dropDeadlineTs = null;
  sawDrop = false;
}

export function registerDropHandlers({ onUpdate, onClear } = {}) {
  _onDropUpdate = onUpdate || null;
  _onDropClear = onClear || null;
}

export const connectSocket = () => {
  if (socket) return;

  socket = io(window.location.origin, {
    path: "/socket.io",
    transports: ["websocket"],
    upgrade: false,
    secure: window.location.protocol === "https:",
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 500,
    query: { token: getAuthToken(), role: "operator" },
  });

  socket.on("connect", () => log("Socket connected:", socket.id));
  socket.on("connect_error", (err) =>
    console.warn("Socket connect_error:", err?.message || err)
  );
  socket.on("reconnect_error", (err) =>
    console.warn("Socket reconnect_error:", err?.message || err)
  );
  socket.on("disconnect", (reason) => log("Socket disconnected:", reason));

  socket.on("unauthorized", (msg) => {
    console.error("Socket unauthorized:", msg || "invalid token");
    try { socket.close(); } catch {}
  });

  if (!meetingEndedHandlerAttached) {
    meetingEndedHandlerAttached = true;
    socket.on("meetingEnded", (payload) => {
      log("meetingEnded received:", payload);
      try { closePeerConnectionAndMedia(); } catch {}
      try { leaveRoom(); } catch {}
      try { localStorage.removeItem("ACTIVE_MEETING"); } catch {}
      if (_onMeetingEnded) _onMeetingEnded(payload);
    });
  }
};

export function registerMeetingEndedHandler(fn) { _onMeetingEnded = fn; }

export function endMeeting(sessionId, who = "operator") {
  if (!socket || !socket.connected) return;
  const sid = sessionId || roomId;
  if (!sid) return;
  socket.emit("endMeeting", { sessionId: sid, by: who });
}

// -------------------- media --------------------

const initLocalMedia = async () => {
  localStream = null;

  try {
    const ls = await navigator.mediaDevices.getUserMedia(AV_CONSTRAINTS);
    localStream = ls;
    log("Got local A/V");
    return "av";
  } catch (e1) {
    log("A/V getUserMedia failed, trying audio-only…", e1?.name || e1?.message || e1);
  }

  try {
    const ls = await navigator.mediaDevices.getUserMedia(AUDIO_ONLY);
    localStream = ls;
    log("Got local audio-only");
    return "audio";
  } catch (e2) {
    log("Audio-only getUserMedia failed; proceeding with receive-only.", e2?.name || e2?.message || e2);
    return "none";
  }
};

// -------------------- join --------------------

export const joinRoom = async (_roomId, onLocal, onRemote) => {
  if (joinedOnce) return;
  joinedOnce = true;

  roomId = _roomId;

  try { localStorage.setItem("ACTIVE_MEETING", JSON.stringify({ id: roomId, role: "operator" })); } catch {}

  removeRoomEventHandlers();

  const mode = await initLocalMedia();
  if (onLocal && localStream) onLocal(localStream);

  ensurePeer(onRemote);

  const doJoin = () => socket.emit("joinRoom", roomId);
  if (socket && socket.connected) doJoin();
  else socket?.once("connect", doJoin);

  socket.on("roomJoined", async ({ participants }) => {
    isCaller = participants === 1;
    polite = !isCaller;

    if (participants === 2 && isCaller && pc && pc.signalingState === "stable") {
      await makeOffer();
    }
  });

  socket.on("peerJoined", async () => {
    if (isCaller && pc && pc.signalingState === "stable") {
      await makeOffer();
    }
  });

  socket.on("setCaller", (callerSid) => {
    isCaller = (socket.id === callerSid);
    polite = !isCaller;
  });

  // ---- drop / resume banner + gated renegotiation ----
  socket.on("participantDropped", ({ role, timeoutSeconds }) => {
    sawDrop = true;

    dropDeadlineTs = Date.now() + timeoutSeconds * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((dropDeadlineTs - Date.now()) / 1000));
      if (_onDropUpdate) _onDropUpdate({ role, secondsLeft: left });
      if (left === 0 && dropCountdownInterval) {
        clearInterval(dropCountdownInterval);
        dropCountdownInterval = null;
      }
    };
    tick();
    clearInterval(dropCountdownInterval);
    dropCountdownInterval = setInterval(tick, 1000);
  });

  socket.on("participantRejoined", async ({ role }) => {
    clearInterval(dropCountdownInterval);
    dropCountdownInterval = null;
    dropDeadlineTs = null;
    if (_onDropClear) _onDropClear({ role });

    if (!sawDrop) return;
    sawDrop = false;

    if (pc && isCaller) {
      try {
        if (pc.signalingState !== "stable") {
          await new Promise((r) => setTimeout(r, 50));
        }
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        socket.emit("offer", { room: roomId, sdp: pc.localDescription });
        log("Caller sent offer after rejoin (ICE restart).");
      } catch (e) {
        console.warn("Rejoin renegotiate failed:", e?.message || e);
      }
    }
  });

  // -------------------- Perfect Negotiation handlers --------------------

  socket.on("offer", async ({ sdp }) => {
    if (!pc) return;
    const desc = new RTCSessionDescription(sdp);

    const offerCollision =
      desc.type === "offer" && (makingOffer || pc.signalingState !== "stable");

    ignoreOffer = !polite && offerCollision;
    if (ignoreOffer) {
      log("Ignoring remote offer due to glare (impolite side).");
      return;
    }

    try {
      await pc.setRemoteDescription(desc);

      if (desc.type === "offer") {
        const answer = await pc.createAnswer();

        if (pc.signalingState !== "have-remote-offer") {
          log("Skip setLocalDescription(answer); state=", pc.signalingState);
          return;
        }

        try {
          await pc.setLocalDescription(answer);
        } catch (e) {
          if (e?.name === "InvalidStateError") {
            console.warn("Ignoring benign glare (answer set):", e.message);
            return;
          }
          throw e;
        }

        socket.emit("answer", { room: roomId, sdp: pc.localDescription });
        log("Answer sent.");
      }
    } catch (e) {
      if (e?.name === "InvalidStateError") {
        console.warn("Ignoring benign glare (offer handler):", e.message);
      } else {
        console.warn("offer handler error:", e);
      }
    }
  });

  socket.on("answer", async ({ sdp }) => {
    if (!pc) return;
    try {
      if (pc.signalingState !== "have-local-offer") return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      log("Answer applied.");
    } catch (e) {
      if (e?.name === "InvalidStateError") {
        console.warn("Ignoring benign glare (answer handler):", e.message);
      } else {
        console.warn("answer handler error:", e);
      }
    }
  });

  socket.on("candidate", async ({ candidate }) => {
    try {
      if (!pc || !candidate) return;
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error("addIceCandidate error", e);
    }
  });

  socket.on("peerLeft", () => {
    onRemote && onRemote(null);
    resetPeer(onRemote);
  });

  socket.on("full", () => {
    alert("Room is full!");
    leaveRoom();
  });

  log(`Joined room ${roomId} with local mode: ${mode}`);
};

// -------------------- RTCPeerConnection --------------------

const ensurePeer = (onRemote) => {
  if (pc) return;

  pc = new RTCPeerConnection(rtcConfig);

  const hasAudio = !!(localStream?.getAudioTracks?.().length);
  const hasVideo = !!(localStream?.getVideoTracks?.().length);

  if (hasAudio) localStream.getAudioTracks().forEach((t) => pc.addTrack(t, localStream));
  if (hasVideo) localStream.getVideoTracks().forEach((t) => pc.addTrack(t, localStream));

  if (!hasVideo) { try { pc.addTransceiver("video", { direction: "recvonly" }); } catch {} }
  if (!hasAudio) { try { pc.addTransceiver("audio", { direction: "recvonly" }); } catch {} }

  try { if (localStream) localStream._pc = pc; } catch {}

  pc.onicecandidate = (e) => {
    if (e.candidate && socket) {
      socket.emit("candidate", { room: roomId, candidate: e.candidate });
    }
  };

  pc.ontrack = (e) => {
    if (e.streams && e.streams[0]) {
      remoteStream = e.streams[0];
    } else {
      if (!remoteStream) remoteStream = new MediaStream();
      remoteStream.addTrack(e.track);
    }
    onRemote && onRemote(remoteStream);
  };

  pc.onconnectionstatechange = () => {
    log("PC state:", pc.connectionState);
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      try { closePeerConnectionAndMedia(); } catch {}
    }
  };

  pc.onnegotiationneeded = async () => {
    if (!pc || pc.signalingState !== "stable") return;
    if (!isCaller) return;
    await makeOffer();
  };
};

const makeOffer = async () => {
  if (!pc) return;
  try {
    makingOffer = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer", { room: roomId, sdp: pc.localDescription });
  } catch (e) {
    if (e?.name === "InvalidStateError") {
      console.warn("Offer skipped due to state race:", e.message);
    } else {
      console.warn("makeOffer error:", e);
    }
  } finally {
    makingOffer = false;
  }
};

const resetPeer = (onRemote) => {
  try { pc && pc.close(); } catch {}
  pc = null;
  remoteStream = null;
  onRemote && onRemote(null);
  ensurePeer(onRemote);
};

function closePeerConnectionAndMedia() {
  try { localStream && localStream.getTracks().forEach((t) => t.stop()); } catch {}
  try { pc && pc.close(); } catch {}
  try { if (localStream && localStream._pc) delete localStream._pc; } catch {}
  pc = null;
  localStream = null;
  remoteStream = null;
}

// -------------------- leave --------------------

export const leaveRoom = (opts = { closeSocket: false }) => {
  try { socket && roomId && socket.emit("leaveRoom", roomId); } catch {}

  removeRoomEventHandlers();

  try { localStream && localStream.getTracks().forEach((t) => t.stop()); } catch {}
  try { pc && pc.close(); } catch {}
  try { if (localStream && localStream._pc) delete localStream._pc; } catch {}

  pc = null;
  localStream = null;
  remoteStream = null;
  roomId = null;
  isCaller = false;
  joinedOnce = false;

  polite = true;
  makingOffer = false;
  ignoreOffer = false;
  sawDrop = false;

  try { localStorage.removeItem("ACTIVE_MEETING"); } catch {}

  if (opts.closeSocket && socket) {
    try { socket.removeAllListeners(); socket.close(); } catch {}
    socket = null;
    meetingEndedHandlerAttached = false;
  }
};

// -------------------- UI helpers --------------------

export const toggleTrack = (type, updateUI) => {
  if (!localStream) return;
  const track =
    type === "video" ? localStream.getVideoTracks()[0] : localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  updateUI && updateUI(track.enabled);
};

export const getLocalStream = () => localStream;
export const getRemoteStream = () => remoteStream;
