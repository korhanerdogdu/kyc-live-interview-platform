const getElement = id => document.getElementById(id);
const [btnConnect, btnToggleVideo, btnToggleAudio, divRoomConfig, roomDiv, roomNameInput, localVideo, remoteVideo] = [
  "btnConnect", "toggleVideo", "toggleAudio", "roomConfig", "roomDiv", "roomName", "localVideo", "remoteVideo"
].map(getElement);

let remoteDescriptionPromise, roomName, localStream, remoteStream, rtcPeerConnection, isCaller;

// ✅ Public STUN server (global erişim için güvenli)
const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

const streamConstraints = { audio: true, video: true };

// ✅ NGROK UYUMLU socket bağlantısı
let socket = io.connect(window.location.origin, { secure: true });

//let socket = io.connect('http://localhost:8000', { secure: false });

btnToggleVideo.addEventListener("click", () => toggleTrack("video"));
btnToggleAudio.addEventListener("click", () => toggleTrack("audio"));

function toggleTrack(trackType) {
  if (!localStream) return;
  const track = trackType === "video" ? localStream.getVideoTracks()[0] : localStream.getAudioTracks()[0];
  const enabled = !track.enabled;
  track.enabled = enabled;

  const toggleButton = getElement(`toggle${trackType.charAt(0).toUpperCase() + trackType.slice(1)}`);
  const icon = getElement(`${trackType}Icon`);
  toggleButton.classList.toggle("disabled-style", !enabled);
  toggleButton.classList.toggle("enabled-style", enabled);
  icon.classList.toggle("bi-camera-video-fill", trackType === "video" && enabled);
  icon.classList.toggle("bi-camera-video-off-fill", trackType === "video" && !enabled);
  icon.classList.toggle("bi-mic-fill", trackType === "audio" && enabled);
  icon.classList.toggle("bi-mic-mute-fill", trackType === "audio" && !enabled);
}

btnConnect.onclick = () => {
  if (roomNameInput.value === "") {
    alert("Room can not be null!");
  } else {
    roomName = roomNameInput.value;
    socket.emit("joinRoom", roomName);
    divRoomConfig.classList.add("d-none");
    roomDiv.classList.remove("d-none");
  }
};

const handleSocketEvent = (eventName, callback) => socket.on(eventName, callback);

handleSocketEvent("created", () => {
  navigator.mediaDevices.getUserMedia(streamConstraints).then(stream => {
    localStream = stream;
    localVideo.srcObject = stream;
    isCaller = true;
  }).catch(console.error);
});

handleSocketEvent("joined", () => {
  navigator.mediaDevices.getUserMedia(streamConstraints).then(stream => {
    localStream = stream;
    localVideo.srcObject = stream;
    socket.emit("ready", roomName);
  }).catch(console.error);
});

handleSocketEvent("candidate", e => {
  if (rtcPeerConnection) {
    const candidate = new RTCIceCandidate({
      sdpMLineIndex: e.label,
      candidate: e.candidate
    });

    rtcPeerConnection.onicecandidateerror = error => {
      console.error("ICE candidate error:", error);
    };

    if (remoteDescriptionPromise) {
      remoteDescriptionPromise
        .then(() => candidate && rtcPeerConnection.addIceCandidate(candidate))
        .catch(error => console.log("ICE error after remote desc:", error));
    }
  }
});

handleSocketEvent("ready", () => {
  if (isCaller) {
    rtcPeerConnection = new RTCPeerConnection(iceServers);
    rtcPeerConnection.onicecandidate = onIceCandidate;
    rtcPeerConnection.ontrack = onAddStream;

    localStream.getTracks().forEach(track => {
      rtcPeerConnection.addTrack(track, localStream);
    });

    rtcPeerConnection.createOffer()
      .then(desc => {
        rtcPeerConnection.setLocalDescription(desc);
        socket.emit("offer", {
          type: "offer", sdp: desc, room: roomName
        });
      })
      .catch(console.error);
  }
});

handleSocketEvent("offer", e => {
  if (!isCaller) {
    rtcPeerConnection = new RTCPeerConnection(iceServers);
    rtcPeerConnection.onicecandidate = onIceCandidate;
    rtcPeerConnection.ontrack = onAddStream;

    localStream.getTracks().forEach(track => {
      rtcPeerConnection.addTrack(track, localStream);
    });

    if (rtcPeerConnection.signalingState === "stable") {
      remoteDescriptionPromise = rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(e));
      remoteDescriptionPromise
        .then(() => rtcPeerConnection.createAnswer())
        .then(answer => {
          rtcPeerConnection.setLocalDescription(answer);
          socket.emit("answer", {
            type: "answer", sdp: answer, room: roomName
          });
        })
        .catch(console.error);
    }
  }
});

handleSocketEvent("answer", e => {
  if (isCaller && rtcPeerConnection.signalingState === "have-local-offer") {
    remoteDescriptionPromise = rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(e));
    remoteDescriptionPromise.catch(console.error);
  }
});

handleSocketEvent("userDisconnected", () => {
  remoteVideo.srcObject = null;
  isCaller = true;
});

handleSocketEvent("setCaller", callerId => {
  isCaller = socket.id === callerId;
});

handleSocketEvent("full", () => {
  alert("Room is full!");
  window.location.reload();
});

const onIceCandidate = e => {
  if (e.candidate) {
    console.log("Sending ICE candidate");
    socket.emit("candidate", {
      type: "candidate",
      label: e.candidate.sdpMLineIndex,
      id: e.candidate.sdpMid,
      candidate: e.candidate.candidate,
      room: roomName
    });
  }
};

const onAddStream = e => {
  remoteVideo.srcObject = e.streams[0];
  remoteStream = e.stream;
};