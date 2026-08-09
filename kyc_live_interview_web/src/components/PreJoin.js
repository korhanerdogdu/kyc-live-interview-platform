import React, { useState, useEffect, useRef } from "react";

function PreJoin({ onJoin }) {
    const videoRef = useRef(null);
    const [videoDevices, setVideoDevices] = useState([]);
    const [audioDevices, setAudioDevices] = useState([]);
    const [videoId, setVideoId] = useState("");
    const [audioId, setAudioId] = useState("");
    const [camOn, setCamOn] = useState(true);
    const [micOn, setMicOn] = useState(true);
    const streamRef = useRef(null);


    useEffect(() => {
        (async () => {
            const devs = await navigator.mediaDevices.enumerateDevices();
            const cams = devs.filter((d) => d.kind === "videoinput");
            const mics = devs.filter((d) => d.kind === "audioinput");
            setVideoDevices(cams);
            setAudioDevices(mics);
            if (cams.length && !videoId) setVideoId(cams[0].deviceId);
            if (mics.length && !audioId) setAudioId(mics[0].deviceId);
        })();
    }, [videoId, audioId]);

    // önizleme
    useEffect(() => {
        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: videoId ? { deviceId: { exact: videoId } } : true,
                    audio: audioId ? { deviceId: { exact: audioId } } : true,
                });
                streamRef.current = stream;
                if (videoRef.current) videoRef.current.srcObject = stream;

                const v = stream.getVideoTracks()[0];
                const a = stream.getAudioTracks()[0];
                if (v) v.enabled = camOn;
                if (a) a.enabled = micOn;
            } catch (e) {
                console.warn("preview açılamadı", e);
            }
        })();

        return () => {
            try {
                streamRef.current?.getTracks?.().forEach((t) => t.stop());
            } catch {}
            streamRef.current = null;
        };
    }, [videoId, audioId]);

    useEffect(() => {
        const v = streamRef.current?.getVideoTracks?.()[0];
        if (v) v.enabled = camOn;
    }, [camOn]);

    useEffect(() => {
        const a = streamRef.current?.getAudioTracks?.()[0];
        if (a) a.enabled = micOn;
    }, [micOn]);

    const toggleCam = () => setCamOn((prev) => !prev);
    const toggleMic = () => setMicOn((prev) => !prev);

    const handleJoinClick = () => {
        try {
            localStorage.setItem("preferredCam", videoId || "");
            localStorage.setItem("preferredMic", audioId || "");
            localStorage.setItem("preferredCamOn", camOn ? "1" : "0");
            localStorage.setItem("preferredMicOn", micOn ? "1" : "0");
        } catch {}
        onJoin({ camOn, micOn, videoId, audioId });
        try {
            streamRef.current?.getTracks?.().forEach((t) => t.stop());
        } catch {}
    };

    return (
        <div className="container py-4">
            <div className="row g-4">
                <div className="col-12 col-lg-8">
                    <div
                        className="rounded-4 shadow-sm overflow-hidden position-relative"
                        style={{ aspectRatio: "16/9", background: "#111" }}
                    >
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-100 h-100"
                            style={{ objectFit: "cover" }}
                        />
                        {!camOn && (
                            <div
                                className="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
                                style={{
                                    background: "rgba(0,0,0,0.8)",
                                    color: "#fff",
                                    fontWeight: 600,
                                }}
                            >
                                Kamera kapalı
                            </div>
                        )}
                        <div
                            className="position-absolute start-50 translate-middle-x d-flex gap-3"
                            style={{ bottom: 12 }}
                        >
                            {/* mikrofon */}
                            <button
                                className="btn btn-light rounded-circle"
                                style={{ width: 48, height: 48 }}
                                onClick={toggleMic}
                                aria-pressed={micOn}
                            >
                                <i
                                    className={`bi ${
                                        micOn ? "bi-mic-fill" : "bi-mic-mute-fill text-danger"
                                    }`}
                                />
                            </button>
                            {/* kamera */}
                            <button
                                className="btn btn-light rounded-circle icon-button btn-tt"
                                style={{ width: 48, height: 48 }}
                                onClick={toggleCam}
                                aria-pressed={camOn}
                            >
                                <i
                                    className={`bi ${
                                        camOn ? 'bi-camera-video-fill text-dark' : 'bi-camera-video-off-fill text-danger'
                                    } fs-5`}
                                />
                            </button>
                        </div>
                    </div>

                    <div className="d-flex gap-3 mt-3 flex-wrap">
                        <div className="d-flex align-items-center gap-2">
                            <label className="small text-muted mb-0">Kamera</label>
                            <select
                                className="form-select form-select-sm"
                                value={videoId}
                                onChange={(e) => setVideoId(e.target.value)}
                            >
                                {videoDevices.map((d) => (
                                    <option key={d.deviceId} value={d.deviceId}>
                                        {d.label || "Kamera"}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="d-flex align-items-center gap-2">
                            <label className="small text-muted mb-0">Mikrofon</label>
                            <select
                                className="form-select form-select-sm"
                                value={audioId}
                                onChange={(e) => setAudioId(e.target.value)}
                            >
                                {audioDevices.map((d) => (
                                    <option key={d.deviceId} value={d.deviceId}>
                                        {d.label || "Mikrofon"}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="col-12 col-lg-4 d-flex flex-column justify-content-center">
                    <h4 className="mb-3">Katılmaya hazır mısınız?</h4>
                    <button className="btn btn-primary btn-lg" onClick={handleJoinClick}>
                        Katılma isteği
                    </button>
                </div>
            </div>
        </div>
    );
}

export default PreJoin;
