// src/components/MeetingRecorderStreams.jsx
import React from "react";

const MeetingRecorder = React.forwardRef(function MeetingRecorder(
    { localStream, remoteStream, autoStart = true },
    ref
) {
    const [recording, setRecording] = React.useState(false);
    const [status, setStatus] = React.useState("Hazır");

    const refs = React.useRef({
        rafId: null,
        audioCtx: null,
        recorder: null,
        finalStream: null,
        vLocal: null,
        vRemote: null,
        mime: "video/webm",
        chunks: [],
        waiter: null, // stop sonrası blob’u resolve etmek için
    });

    function drawContain(ctx, video, dx, dy, dW, dH) {
        if (!video || video.readyState < 2) return;
        const sW = video.videoWidth, sH = video.videoHeight;
        if (!sW || !sH) return;
        const destAR = dW / dH, srcAR = sW / sH;
        let drawW, drawH, offX, offY;
        if (srcAR > destAR) { drawW = dW; drawH = dW / srcAR; offX = dx; offY = dy + (dH - drawH) / 2; }
        else { drawH = dH; drawW = dH * srcAR; offX = dx + (dW - drawW) / 2; offY = dy; }
        ctx.drawImage(video, offX, offY, drawW, drawH);
    }

    function mixAudio(local, remote) {
        const AC = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AC();
        const dest = audioCtx.createMediaStreamDestination();
        const add = (s) => {
            if (!s) return;
            s.getAudioTracks().forEach((t) => {
                const src = audioCtx.createMediaStreamSource(new MediaStream([t]));
                src.connect(dest);
            });
        };
        add(local); add(remote);
        const track = dest.stream.getAudioTracks()[0] || null;
        return { audioCtx, track };
    }

    function pickMime() {
        if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")) return "video/webm;codecs=vp8,opus";
        if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) return "video/webm;codecs=vp9,opus";
        return "video/webm";
    }

    async function waitForMetadata(videoEl, timeoutMs = 3000) {
        if (!videoEl?.srcObject) return;
        if (videoEl.readyState >= 2) return;
        await new Promise((resolve) => {
            const done = () => resolve();
            const to = setTimeout(done, timeoutMs);
            videoEl.onloadedmetadata = () => { clearTimeout(to); done(); };
            videoEl.play?.().catch(() => {});
        });
    }

    async function buildHiddenVideos({ timeoutMs = 3000 } = {}) {
        const hasLocal  = !!(localStream  && localStream.getVideoTracks?.().length);
        const hasRemote = !!(remoteStream && remoteStream.getVideoTracks?.().length);
        if (!hasLocal && !hasRemote) throw new Error("local/remote stream yok.");

        const vLocal  = document.createElement("video");
        const vRemote = document.createElement("video");
        [vLocal, vRemote].forEach(v => { v.playsInline = true; v.muted = true; v.autoplay = true; });

        if (hasLocal)  vLocal.srcObject  = localStream;
        if (hasRemote) vRemote.srcObject = remoteStream;

        await Promise.all([waitForMetadata(vLocal, timeoutMs), waitForMetadata(vRemote, timeoutMs)]);
        return { vLocal: hasLocal ? vLocal : null, vRemote: hasRemote ? vRemote : null };
    }

    // kalite preset'i: medium/low
    const REC = { W: 854, H: 480, FPS: 12, VBIT: 450_000, ABIT: 64_000 };



    async function start() {
        try {
            setStatus("Hazırlanıyor…");
            // kısa bekleme
            for (let i=0;i<4;i++){
                const anyLocal  = !!localStream?.getVideoTracks?.().length;
                const anyRemote = !!remoteStream?.getVideoTracks?.().length;
                if (anyLocal || anyRemote) break;
                // eslint-disable-next-line no-await-in-loop
                await new Promise(r => setTimeout(r, 250));
            }

            const { vLocal, vRemote } = await buildHiddenVideos();

            const W = REC.W, H = REC.H;
            const canvas = document.createElement("canvas");
            canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext("2d");

            const render = () => {
                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, W, H);
                if (refs.current.vRemote) drawContain(ctx, refs.current.vRemote, 0, 0, W/2, H);
                if (refs.current.vLocal)  drawContain(ctx, refs.current.vLocal,  W/2, 0, W/2, H);
                refs.current.rafId = requestAnimationFrame(render);
            };
            refs.current.vLocal = vLocal;
            refs.current.vRemote = vRemote;
            refs.current.rafId = requestAnimationFrame(render);

            const videoTrack = canvas.captureStream(REC.FPS).getVideoTracks()[0];
             try {
                   // bazı tarayıcılarda captureStream fps'i tam uygulanmıyor → ek kısıt
                       await videoTrack.applyConstraints?.({ frameRate: REC.FPS });
                 } catch {}
            const { audioCtx, track: audioTrack } = mixAudio(localStream, remoteStream);
            const finalStream = new MediaStream([videoTrack, ...(audioTrack ? [audioTrack] : [])]);

            const mime = pickMime();
            let recorder;
             try {
                   recorder = new MediaRecorder(finalStream, {
                         mimeType: mime,
                         videoBitsPerSecond: REC.VBIT,
                         audioBitsPerSecond: REC.ABIT,
                       });
                 } catch (e1) {
                   // Safari / bazı Chromium türevleri bitrate paramlarını reddedebilir
                       try {
                         recorder = new MediaRecorder(finalStream, { mimeType: mime });
                       } catch (e2) {
                         recorder = new MediaRecorder(finalStream); // tamamen saf fallback
                       }
                 }
            refs.current.mime = mime;
            refs.current.chunks = [];
            recorder.ondataavailable = (e) => e.data?.size && refs.current.chunks.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(refs.current.chunks, { type: mime });
                // cleanup
                cancelAnimationFrame(refs.current.rafId);
                try { if (audioCtx && audioCtx.state !== 'closed') audioCtx.close(); } catch {}
                try { finalStream.getTracks().forEach(t => t.stop()); } catch {}
                refs.current.rafId = null;
                refs.current.audioCtx = null;
                refs.current.recorder = null;
                refs.current.finalStream = null;
                refs.current.vLocal = null;
                refs.current.vRemote = null;

                setRecording(false);
                setStatus("Kaydedildi");

                // bekleyen promise varsa resolve et
                if (refs.current.waiter) { refs.current.waiter(blob); refs.current.waiter = null; }
            };

            recorder.start(4000);
            refs.current.audioCtx = audioCtx;
            refs.current.recorder = recorder;
            refs.current.finalStream = finalStream;

            setRecording(true);
            setStatus("Kayıtta…");
        } catch (e) {
            console.error(e);
            setStatus("Hata: " + (e?.message || e));
        }
    }

    function stop() {
        const r = refs.current.recorder;
        if (r && r.state !== "inactive") {
            r.stop();
            setStatus("Durduruluyor…");
        }
    }

    React.useEffect(() => {
        const hasAnyVideo =
            (localStream  && localStream.getVideoTracks?.().length) ||
            (remoteStream && remoteStream.getVideoTracks?.().length);

        if (autoStart && hasAnyVideo && !recording && !refs.current.recorder) {
            start();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoStart, localStream, remoteStream]);

    React.useEffect(() => {
        const attachLateVideo = async (which) => {
            if (!recording) return;
            const stream = which === "remote" ? remoteStream : localStream;
            const hasVideo = !!stream?.getVideoTracks?.().length;
            if (!hasVideo) return;

            const v = document.createElement("video");
            v.playsInline = true; v.muted = true; v.autoplay = true;
            v.srcObject = stream;
            await waitForMetadata(v, 3000);
            if (which === "remote") refs.current.vRemote = v;
            else refs.current.vLocal = v;
        };
        attachLateVideo("remote");
        attachLateVideo("local");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remoteStream, localStream, recording]);

    React.useEffect(() => {
        return () => {
            try { refs.current.recorder?.state !== "inactive" && refs.current.recorder?.stop(); } catch {}
            try { cancelAnimationFrame(refs.current.rafId); } catch {}
            try { refs.current.finalStream?.getTracks?.().forEach(t => t.stop()); } catch {}
            try { refs.current.audioCtx?.close?.(); } catch {}
            refs.current.vLocal = null; refs.current.vRemote = null;
        };
    }, []);

    // dışarı API
    React.useImperativeHandle(ref, () => ({
        stopAndGetBlob: () =>
            new Promise((resolve) => {
                // kayıt aktifse durdur, yoksa null
                const r = refs.current.recorder;
                if (r && r.state !== "inactive") {
                    refs.current.waiter = resolve;
                    try { r.stop(); } catch { resolve(null); }
                } else {
                    resolve(null);
                }
            }),
        getMime: () => refs.current.mime || "video/webm",
    }));

    return (
        <div className="small text-muted mt-2" style={{ display: "none", pointerEvents: "none" }}>
            {status}
        </div>
    );
});

export default MeetingRecorder;
