import React, { useState, useEffect } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { useCustomerApi } from "../api/customer_api";
import PreJoin from "../components/PreJoin";

import { formatTime } from "../utils/formatTime";
import { interviewStyles } from "../styles/interviewStyles";
import UserInfo from "../components/UserInfo";
import VideoPanel from "../components/VideoPanel";
import OperatorPanel from "../components/OperatorPanel";
import MeetingRecorder from "../components/MeetingRecorderStreams";

import {
  connectSocket,
  joinRoom,
  leaveRoom,
  toggleTrack,
  registerMeetingEndedHandler,
  registerDropHandlers,
} from "../utils/socketClient";

// ---- helper: device swap ----
async function replaceMediaTrack(localStream, kind, deviceId) {
  const constraints =
    kind === "video"
      ? { video: { deviceId: { exact: deviceId } }, audio: false }
      : { audio: { deviceId: { exact: deviceId } }, video: false };

  const tmp = await navigator.mediaDevices.getUserMedia(constraints);
  const newTrack = kind === "video" ? tmp.getVideoTracks()[0] : tmp.getAudioTracks()[0];

  const old = kind === "video"
    ? localStream.getVideoTracks()[0]
    : localStream.getAudioTracks()[0];

  if (old) localStream.removeTrack(old);
  localStream.addTrack(newTrack);

  try {
    if (localStream._pc && localStream._pc.getSenders) {
      const sender = localStream._pc
        .getSenders()
        .find((s) => s.track && s.track.kind === kind);
      if (sender && sender.replaceTrack) await sender.replaceTrack(newTrack);
    }
  } catch (e) {
    console.debug("replaceTrack not wired; only local stream swapped.", e);
  }

  try { old?.stop?.(); } catch {}
  tmp.getTracks().forEach((t) => { if (t !== newTrack) t.stop?.(); });

  return newTrack;
}

function LiveInterview() {
  const recorderRef = React.useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const videoRef = React.useRef(null);

  const { endMeeting, uploadRecordingMultipart } = useCustomerApi();

  const customer = location.state?.customer;
  const [mode, setMode] = useState(location.state?.stage === "prejoin" ? "prejoin" : "incall");
  const [initialAV, setInitialAV] = useState(location.state?.initialAV || null);

  const [seconds, setSeconds] = useState(0);
  const [interviewStatus, setInterviewStatus] = useState(null);
  const [local, setLocal] = useState(null);
  const [remote, setRemote] = useState(null);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [remoteMuted, setRemoteMuted] = useState(false);

  const [showEndModal, setShowEndModal] = useState(false);
  const [notes, setNotes] = useState("");
  const [ending, setEnding] = useState(false);

  const [focusLayout, setFocusLayout] = useState(true);

  // NEW: drop banner state
  const [dropLeft, setDropLeft] = useState(0);
  const [dropRole, setDropRole] = useState(null); // "customer" | "operator"

  const toggleLocal = (kind, setState) => {
    try {
      const stream = local;
      if (!stream) return;

      const track =
        kind === "video" ? stream.getVideoTracks?.()[0] : stream.getAudioTracks?.()[0];
      if (!track) return;

      track.enabled = !track.enabled;
      setState(!!track.enabled);

      try {
        const pc = stream._pc;
        const sender = pc?.getSenders?.().find((s) => s.track && s.track.kind === kind);
        if (sender && sender.track !== track && sender.replaceTrack) {
          sender.replaceTrack(track);
        }
      } catch (e) {
        console.debug("sender sync skipped:", e);
      }
    } catch (e) {
      console.warn("toggleLocal failed:", e);
      setState(false);
    }
  };

  // timer
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { connectSocket(); }, []);

  // meeting ended → cleanup + redirect
  useEffect(() => {
    registerMeetingEndedHandler(() => {
      try { leaveRoom(); } catch {}
      navigate("/pending-interview", { replace: true });
    });
  }, [navigate]);

  // NEW: drop banner handlers
  useEffect(() => {
    registerDropHandlers({
      onUpdate: ({ role, secondsLeft }) => {
        setDropRole(role);
        setDropLeft(secondsLeft);
      },
      onClear: ({ role }) => {
        setDropRole(null);
        setDropLeft(0);
      },
    });
  }, []);

  // Join room (socket-only)
  useEffect(() => {
    if (!id || mode !== "incall") return;
    let canceled = false;

    const run = async () => {
      try {
        await joinRoom(
          id,
          (ls) => {
            if (canceled) return;
            setLocal(ls);
            setRemote(null);
          },
          (rs) => !canceled && setRemote(rs)
        );

        if (!canceled) {
          setInterviewStatus("started");
        }
      } catch (err) {
        if (!canceled) {
          console.error("Join error:", err?.response?.data || err?.message);
          setInterviewStatus("error");
        }
      }
    };

    run();

    return () => {
      leaveRoom();
      setLocal(null);
      setRemote(null);
      setDropRole(null);
      setDropLeft(0);
    };
  }, [id, mode]);

  // Apply PreJoin selections
  useEffect(() => {
    if (!local || !initialAV) return;

    const applyInitial = async () => {
      try {
        const v = local?.getVideoTracks?.()[0];
        const a = local?.getAudioTracks?.()[0];

        const wantV = initialAV.videoId;
        const wantA = initialAV.audioId;

        if (wantV && v?.getSettings && v.getSettings().deviceId !== wantV) {
          await replaceMediaTrack(local, "video", wantV);
        }
        if (wantA && a?.getSettings && a.getSettings().deviceId !== wantA) {
          await replaceMediaTrack(local, "audio", wantA);
        }

        const v2 = local?.getVideoTracks?.()[0];
        const a2 = local?.getAudioTracks?.()[0];

        if (typeof initialAV.camOn === "boolean" && v2) v2.enabled = initialAV.camOn;
        if (typeof initialAV.micOn === "boolean" && a2) a2.enabled = initialAV.micOn;

        setCamOn(!!v2?.enabled);
        setMicOn(!!a2?.enabled);
      } catch (e) {
        console.warn("initialAV apply failed:", e);
      }
    };

    applyInitial();
  }, [local, initialAV]);

  const handleToggleAudio = () => toggleLocal("audio", setMicOn);
  const handleToggleVideo = () => toggleLocal("video", setCamOn);
  const handleToggleRemoteAudio = () => setRemoteMuted((m) => !m);

  const handleConfirmEnd = async () => {
    if (ending) return;
    setEnding(true);
    try {
      // 1) Stop recorders and get a Blob
      const mixBlob  = await recorderRef.current?.stopAndGetBlob?.();
      let mainBlob   = null;
      try { mainBlob = await videoRef.current?.stopAndGetRecording?.(); } catch {}
      const finalBlob = mixBlob || mainBlob || null;

      // 2) Fire-and-forget multipart upload
      if (finalBlob) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `meeting-${id}-${ts}.webm`;
        uploadRecordingMultipart(id, finalBlob, {
          filename,
          takenBy: 'operator',
          note: notes || ''
        }).then(
          () => console.log('[recording] upload OK'),
          (err) => console.error('[recording] upload FAIL', err)
        );
      }

      // 3) End immediately (do not wait for upload)
      await endMeeting(id, { by: 'operator', notes });

      setInterviewStatus('completed');
    } catch (e) {
      console.error('Could not end meeting:', e?.response?.data || e?.message);
    } finally {
      setShowEndModal(false);
      leaveRoom();
      navigate('/pending-interview', { replace: true });
      setEnding(false);
    }
  };

  if (mode === "prejoin") {
    return (
      <div className="container mt-4">
        <PreJoin
          onJoin={(opts) => {
            setInitialAV(opts);
            setMode("incall");
          }}
        />
      </div>
    );
  }

  return (
    <>
      <style>{interviewStyles}</style>
      <div className="container-fluid mt-4">
        <h3 className="mb-4 fw-semibold">Görüşme Ekranı</h3>

        {/* Drop banner */}
        {dropLeft > 0 && (
          <div className="alert alert-warning rounded-4 shadow-sm py-2 px-3">
            <strong>
              {dropRole === "customer" ? "Customer" : "Operator"} lost connection.
            </strong>{" "}
            Waiting for them to return… The meeting will end automatically in{" "}
            <b>{dropLeft}s</b> if they don’t rejoin.
          </div>
        )}

        <UserInfo customer={customer} />

        <div className="row g-3 align-items-start">
          <div className={focusLayout ? "col-12 col-lg-8" : "col-12 col-lg-6"}>
            <VideoPanel
              meetingId={id}
              ref={videoRef}
              seconds={formatTime(seconds)}
              onEnd={() => setShowEndModal(true)}
              localStream={local}
              remoteStream={remote}
              remoteMuted={remoteMuted}
              onToggleRemoteAudio={handleToggleRemoteAudio}
              focusLayout={focusLayout}
              setFocusLayout={setFocusLayout}
            />

            <MeetingRecorder
              ref={recorderRef}
              localStream={local}
              remoteStream={remote}
              autoStart={true}
            />
          </div>

          <div className={focusLayout ? "col-12 col-lg-4" : "col-12 col-lg-6"}>
            {local && (
              <OperatorPanel
                localStream={local}
                camOn={camOn}
                micOn={micOn}
                onToggleVideo={handleToggleVideo}
                onToggleAudio={handleToggleAudio}
              />
            )}
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="notes" className="form-label">
            <strong>Notlar</strong>
          </label>
          <textarea
            id="notes"
            className="form-control shadow-lg rounded-4 p-3"
            rows="4"
            placeholder="Bu görüşmeye dair notlarınızı buraya yazabilirsiniz..."
            style={{ minHeight: "100px", resize: "vertical", border: "none" }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {showEndModal && (
        <div className="modal fade show d-block" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow-lg rounded-4">
              <div className="modal-header bg-light">
                <h5 className="modal-title">
                  <i className="bi bi-x-circle-fill me-2 text-danger" /> Görüşmeyi Bitir
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowEndModal(false)}
                />
              </div>
              <div className="modal-body">Bu görüşmeyi sonlandırmak istiyor musunuz?</div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowEndModal(false)}>
                  Hayır
                </button>
                <button className="btn btn-danger" onClick={handleConfirmEnd}>
                  Evet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default LiveInterview;
