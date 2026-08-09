import React, { useEffect, useMemo, useRef, useState, useImperativeHandle } from 'react';
import { useCustomerApi } from "../api/customer_api";

/* ---------------------------- SettingsAVPanel ---------------------------- */
const SettingsAVPanel = React.forwardRef(function SettingsAVPanel(
    { localStream },
    ref
) {
    const [videoDevices, setVideoDevices]   = React.useState([]);
    const [audioDevices, setAudioDevices]   = React.useState([]);
    const [outputDevices, setOutputDevices] = React.useState([]);

    const [videoId, setVideoId]     = React.useState('');
    const [audioId, setAudioId]     = React.useState('');
    const [speakerId, setSpeakerId] = React.useState('');

    const [micVol, setMicVol]   = React.useState(100);
    const [spkVol, setSpkVol]   = React.useState(100);
    const [applying, setApplying] = React.useState(false);

    React.useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                let devs = await navigator.mediaDevices.enumerateDevices();
                let cams = devs.filter(d => d.kind === 'videoinput');
                let mics = devs.filter(d => d.kind === 'audioinput');
                let outs = devs.filter(d => d.kind === 'audiooutput');

                if ((!cams.some(d => d.label) || !mics.some(d => d.label) || !outs.some(d => d.label))
                    && (cams.length || mics.length || outs.length)) {
                    try {
                        const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                        probe.getTracks().forEach(t => t.stop());
                        devs = await navigator.mediaDevices.enumerateDevices();
                        cams = devs.filter(d => d.kind === 'videoinput');
                        mics = devs.filter(d => d.kind === 'audioinput');
                        outs = devs.filter(d => d.kind === 'audiooutput');
                    } catch {}
                }

                if (!mounted) return;
                setVideoDevices(cams);
                setAudioDevices(mics);
                setOutputDevices(outs);

                if (cams.length && !videoId)   setVideoId(cams[0].deviceId);
                if (mics.length && !audioId)   setAudioId(mics[0].deviceId);
                if (outs.length && !speakerId) setSpeakerId(outs[0].deviceId);
            } catch (e) {
                console.error('Cihaz listesi alınamadı:', e);
            }
        })();
        return () => { mounted = false; };
    }, [videoId, audioId, speakerId]);

    const applyToLocal = async () => {
        setApplying(true);
        try {
            const constraints = {
                video: videoId ? { deviceId: { exact: videoId } } : false,
                audio: audioId ? { deviceId: { exact: audioId } } : false,
            };
            const tmp = await navigator.mediaDevices.getUserMedia(constraints);

            const vNew = tmp.getVideoTracks()[0] || null;
            const aNew = tmp.getAudioTracks()[0] || null;

            if (localStream) {
                localStream.getVideoTracks().forEach(t => { localStream.removeTrack(t); t.stop?.(); });
                if (vNew) localStream.addTrack(vNew);

                localStream.getAudioTracks().forEach(t => { localStream.removeTrack(t); t.stop?.(); });
                if (aNew) {
                    aNew.enabled = micVol > 0;
                    localStream.addTrack(aNew);
                }
            }
        } catch (e) {
            console.warn('Seçilen cihazlar uygulanamadı:', e);
        } finally {
            setApplying(false);
        }
    };

    const applySpeaker = async (mediaEl) => {
        if (!mediaEl) return;
        try {
            if (typeof mediaEl.setSinkId === 'function' && speakerId) {
                await mediaEl.setSinkId(speakerId);
            }
        } catch (e) {
            console.warn('Hoparlör değiştirilemedi (setSinkId):', e);
        }
        try {
            mediaEl.volume = Math.max(0, Math.min(1, spkVol / 100));
        } catch {}
    };

    React.useImperativeHandle(ref, () => ({
        applyToLocal,
        applySpeaker,
    }));

    return (
        <div className="d-flex flex-column gap-3">
            {/* === Video === */}
            <h6 className="text-muted fw-semibold mb-0">Video</h6>
            <div className="d-flex align-items-center gap-2">
                <label className="small text-muted mb-0" style={{ minWidth: 90 }}>Kamera</label>
                <select
                    className="form-select form-select-sm"
                    value={videoId}
                    onChange={e => setVideoId(e.target.value)}
                    style={{ maxWidth: 360 }}
                >
                    {videoDevices.length === 0 && <option>Kamera bulunamadı</option>}
                    {videoDevices.map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label || 'Kamera'}</option>
                    ))}
                </select>
            </div>

            {/* === Ses === */}
            <h6 className="text-muted fw-semibold mb-0 mt-2">Ses</h6>

            {/* Mikrofon */}
            <div className="d-flex flex-column gap-2">
                <div className="d-flex align-items-center gap-2">
                    <label className="small text-muted mb-0" style={{ minWidth: 90 }}>Mikrofon</label>
                    <select
                        className="form-select form-select-sm"
                        value={audioId}
                        onChange={e => setAudioId(e.target.value)}
                        style={{ maxWidth: 360 }}
                    >
                        {audioDevices.length === 0 && <option>Mikrofon bulunamadı</option>}
                        {audioDevices.map(d => (
                            <option key={d.deviceId} value={d.deviceId}>{d.label || 'Mikrofon'}</option>
                        ))}
                    </select>
                </div>

                <div className="d-flex align-items-center gap-2">
                    <label className="small text-muted mb-0" style={{ minWidth: 90 }}>Mic seviyesi</label>
                    <input
                        type="range" min={0} max={100} step={1}
                        value={micVol}
                        onChange={e => setMicVol(parseInt(e.target.value, 10))}
                        style={{ maxWidth: 360, accentColor: '#0d6efd' }}
                    />
                    <span className="small text-muted" style={{ width: 36, textAlign: 'right' }}>{micVol}%</span>
                </div>
            </div>

            {/* Hoparlör */}
            <div className="d-flex flex-column gap-2">
                <div className="d-flex align-items-center gap-2">
                    <label className="small text-muted mb-0" style={{ minWidth: 90 }}>Hoparlör</label>
                    <select
                        className="form-select form-select-sm"
                        value={speakerId}
                        onChange={e => setSpeakerId(e.target.value)}
                        style={{ maxWidth: 360 }}
                    >
                        {outputDevices.length === 0 && <option>Çıkış aygıtı bulunamadı</option>}
                        {outputDevices.map(d => (
                            <option key={d.deviceId} value={d.deviceId}>{d.label || 'Hoparlör'}</option>
                        ))}
                    </select>
                </div>

                <div className="d-flex align-items-center gap-2">
                    <label className="small text-muted mb-0" style={{ minWidth: 90 }}>Ses düzeyi</label>
                    <input
                        type="range" min={0} max={100} step={1}
                        value={spkVol}
                        onChange={e => setSpkVol(parseInt(e.target.value, 10))}
                        style={{ maxWidth: 360, accentColor: '#0d6efd' }}
                    />
                    <span className="small text-muted" style={{ width: 36, textAlign: 'right' }}>{spkVol}%</span>
                </div>
            </div>

            {applying && <div className="text-muted small">Uygulanıyor…</div>}
        </div>
    );
});

/* -------------------------------- VideoPanel -------------------------------- */
const VideoPanel = React.forwardRef(function VideoPanel({
                                                            meetingId,          // ← eklendi: upload için gerekli
                                                            seconds,
                                                            onEnd,
                                                            localStream,
                                                            remoteStream,
                                                            remoteMuted,
                                                            onToggleRemoteAudio,
                                                            setFocusLayout,
                                                            focusLayout,
                                                        }, ref) {
    const mainRef = useRef(null);
    const menuRef = useRef(null);
    const containerRef = useRef(null);

    const { uploadScreenshot } = useCustomerApi();

    // Screenshot’ları base64 data URL olarak burada toplayacağız
    const screenshotsRef = useRef([]);
    const [shotCount, setShotCount] = useState(0);

    // upload kuyruğu (aynı anda 1 istek)
    const queueRef = useRef([]);
    const uploadingRef = useRef(false);
    const flushQueue = async () => {
        if (uploadingRef.current) return;
        uploadingRef.current = true;
        console.log('[screenshots] flush start');
        try {
            while (queueRef.current.length) {
                const img = queueRef.current.shift();
                console.log('[screenshots] uploading...', { meetingId, remaining: queueRef.current.length });
                try {
                    await uploadScreenshot(meetingId, img, {
                           takenBy: 'operator-123',
                           note: 'live shot'
                     });
                    console.log('[screenshots] OK');
                } catch (e) {
                    console.error('screenshot upload failed:', e?.response?.data || e?.message || e);
                }
            }
        } finally {
            uploadingRef.current = false;
            console.log('[screenshots] flush end');
        }
    };

    // === Ana akış kaydı (UI butonu yok; otomatik başlar) ===
    const [isRecording, setIsRecording] = useState(false);
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const mainWaiterRef = useRef(null);

    // === FULL SCREEN RECORD (preview'siz) ===
    const fsRecRef = useRef(null);
    const fsChunksRef = useRef([]);
    const fsDispRef = useRef(null);
    const fsMicRef = useRef(null);
    const fsAudioCtxRef = useRef(null);
    const [fsRecording, setFsRecording] = useState(false);

    const hasRemote = useMemo(() => {
        try {
            return !!(remoteStream && remoteStream.getTracks && remoteStream.getTracks().length);
        } catch {
            return false;
        }
    }, [remoteStream]);

    useEffect(() => {
        if (!mainRef.current) return;
        mainRef.current.srcObject = hasRemote ? remoteStream : null;

        // görüşme başlarken ana akış kaydını başlat
        if (remoteStream && !recorderRef.current) {
            try {
                const recorder = new MediaRecorder(remoteStream, { mimeType: "video/webm;codecs=vp9" });
                const chunks = [];
                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) chunks.push(e.data);
                };
                recorder.onstop = () => {
                    const blob = new Blob(chunks, { type: "video/webm" });
                    chunksRef.current = [blob];
                };
                recorder.start();
                recorderRef.current = recorder;
                setIsRecording(true);
            } catch (err) {
                console.error("Recorder start error:", err);
            }
        }
    }, [remoteStream, hasRemote]);

    useEffect(() => {
        const onDown = (e) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(e.target)) setShowMenu(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    const [showMenu, setShowMenu] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const settingsRef = useRef(null);

    // Screenshot: JPEG + yeniden boyutlandırma (daha küçük payload)
    const takeScreenshot = (maxW = 1280, quality = 0.92) => {
        if (!mainRef.current) return;
        const video = mainRef.current;
        if (!video.videoWidth || !video.videoHeight) return;
        const ratio = video.videoWidth / video.videoHeight;
        const width = Math.min(maxW, video.videoWidth);
        const height = Math.round(width / ratio);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/png', quality);

        // local hafızaya ekle
        screenshotsRef.current.push(dataUrl);
        if (screenshotsRef.current.length > 10) {
            screenshotsRef.current = screenshotsRef.current.slice(-10);
        }
        setShotCount((n) => n + 1);

        // API kuyruğuna ekle ve çalıştır
        if (meetingId) {
            queueRef.current.push(dataUrl);
            console.log('[screenshots] queued', {
                   meetingId,
                   queueLen: queueRef.current.length
             });
            flushQueue();
        } else {
            console.warn("meetingId yok; screenshot sadece localde tutuldu");
        }
    };

    // === ANA AKIŞ otomatik kayıt (fallback local veya remote) ===
    const autoStartedRef = useRef(false);
    const startMainRecorder = (stream) => {
        if (!stream || typeof window.MediaRecorder === 'undefined') return;
        const mr = new MediaRecorder(stream);
        recorderRef.current = mr;
        chunksRef.current = [];
        mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
        mr.onstop = () => {
            setIsRecording(false);
            let blob = null;
            try { blob = new Blob(chunksRef.current, { type: mr.mimeType || 'video/webm' }); } catch {}
            chunksRef.current = [];
            if (mainWaiterRef.current) { mainWaiterRef.current(blob); mainWaiterRef.current = null; }
        };
        mr.start();
        setIsRecording(true);
    };

    useEffect(() => {
        if (autoStartedRef.current || isRecording) return;
        const candidate =
            mainRef.current?.srcObject ||
            remoteStream ||
            localStream;
        if (candidate) {
            autoStartedRef.current = true;
            startMainRecorder(candidate);
        }
    }, [localStream, remoteStream, hasRemote, isRecording]);

    // cleanup
    useEffect(() => {
        return () => {
            try { recorderRef.current?.state === 'recording' && recorderRef.current.stop(); } catch {}
            try { if (fsRecRef.current?.state === 'recording') fsRecRef.current.stop(); } catch {}
            try { fsDispRef.current?.getTracks()?.forEach(t => t.stop()); } catch {}
            try { fsMicRef.current?.getTracks()?.forEach(t => t.stop()); } catch {}
            try { fsAudioCtxRef.current?.close?.(); } catch {}
        };
    }, []);

    /* ---------- FULL SCREEN helpers (devre dışı) ---------- */
    const pickMime = () => {
        const cands = [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm",
        ];
        return cands.find((t) => MediaRecorder.isTypeSupported?.(t)) || "";
    };

    const startFullScreen = async () => { alert("Ekran kaydı özelliği kaldırıldı."); return; };
    const stopFullScreen = () => Promise.resolve(null);

    // ==== Parent'a kontrol ver ====
    useImperativeHandle(ref, () => ({
        // Tüm kayıtları durdurur ve blob döner (öncelik: full screen -> main)
        stopAndGetRecording: async () => {
            const stopMain = () => new Promise(resolve => {
                if (recorderRef.current && recorderRef.current.state !== 'inactive') {
                    mainWaiterRef.current = resolve;
                    try { recorderRef.current.stop(); } catch { resolve(null); }
                } else resolve(null);
            });
            const [screenBlob, mainBlob] = await Promise.all([stopFullScreen(), stopMain()]);
            return screenBlob || mainBlob || null;
        },

        // screenshot’ları al ve temizle
        getAndClearScreenshots: () => {
            const arr = screenshotsRef.current.slice();
            screenshotsRef.current = [];
            setShotCount(0);
            return arr; // ["data:image/jpeg;base64,....", ...]
        },
    }));

    return (
        <div className="d-flex flex-column">
            <div ref={containerRef} className="position-relative shadow-sm rounded-4 overflow-hidden" style={{ height: '550px' }}>
                <div className="position-absolute top-0 start-50 translate-middle-x text-white fw-semibold bg-dark bg-opacity-50 px-2 py-1 rounded mt-2" style={{ fontSize: '0.85rem', zIndex: 10 }}>
                    {seconds}
                </div>

                <video ref={mainRef} autoPlay playsInline className="w-100 h-100" style={{ objectFit: 'contain', background: '#111' }} />

                {!hasRemote && (
                    <div className="position-absolute top-50 start-50 text-white-50" style={{ transform: 'translate(-50%, -50%)', fontWeight: 500 }}>
                        Karşı taraf bekleniyor…
                    </div>
                )}

                {/* Alt butonlar */}
                <div className="d-flex justify-content-center gap-3 position-absolute w-100" style={{ bottom: '10px' }}>
                    {/* Ekran görüntüsü */}
                    <button
                        type="button"
                        className="btn btn-light rounded-circle icon-button btn-tt"
                        style={{ width: 56, height: 56 }}
                        onClick={() => takeScreenshot()}
                        data-title="Ekran görüntüsü al"
                    >
                        <i className="bi bi-camera fs-5" />
                    </button>

                    {/* Görüşmeyi Bitir */}
                    <button
                        type="button"
                        className="btn btn-danger rounded-circle icon-button btn-tt"
                        style={{ width: 56, height: 56 }}
                        onClick={onEnd}
                        data-title="Görüşmeyi bitir"
                    >
                        <i className="bi bi-telephone-x-fill fs-5" />
                    </button>

                    {/* Hoparlör: karşı tarafın sesi */}
                    <button
                        type="button"
                        className="btn btn-light rounded-circle icon-button btn-tt"
                        style={{ width: 56, height: 56 }}
                        onClick={onToggleRemoteAudio}
                        data-title={remoteMuted ? 'Hoparlörü aç' : 'Hoparlörü kapat'}
                        aria-pressed={!remoteMuted}
                    >
                        <i className={`bi ${remoteMuted ? 'bi-volume-mute-fill text-danger' : 'bi-volume-up-fill'} fs-5`} />
                    </button>

                    {/* 3 Nokta (Ayarlar) */}
                    <div className="position-relative" ref={menuRef}>
                        <button
                            type="button"
                            className="btn btn-light rounded-circle icon-button btn-tt"
                            style={{ width: 56, height: 56 }}
                            data-title="Diğer seçenekler"
                            onClick={() => setShowMenu(v => !v)}
                        >
                            <i className="bi bi-three-dots fs-5" />
                        </button>

                        {showMenu && (
                            <ul
                                className="dropdown-menu show p-2"
                                style={{ position: "absolute", bottom: "70px", right: 0, minWidth: 220, zIndex: 1050 }}
                                role="menu"
                                aria-label="Diğer seçenekler"
                            >
                                <li>
                                    <button
                                        className="dropdown-item d-flex align-items-center gap-2"
                                        onClick={() => { setShowMenu(false); setShowSettings(true); }}
                                    >
                                        <i className="bi bi-gear fs-5" />
                                        <span>Ayarlar</span>
                                    </button>
                                </li>
                            </ul>
                        )}
                    </div>

                    {/* AYARLAR MODALI */}
                    {showSettings && (
                        <div
                            className="modal-backdrop show"
                            style={{ backgroundColor: 'rgba(0,0,0,0.85)', opacity: 1, zIndex: 1060 }}
                            onClick={() => setShowSettings(false)}
                        >
                            <div className="modal d-block" style={{ zIndex: 1070 }} onClick={(e) => e.stopPropagation()}>
                                <div className="modal-dialog modal-dialog-centered">
                                    <div className="modal-content">
                                        <div className="modal-header">
                                            <h5 className="modal-title">Ayarlar</h5>
                                            <button className="btn-close" onClick={() => setShowSettings(false)} />
                                        </div>
                                        <div className="modal-body">
                                            <SettingsAVPanel
                                                ref={settingsRef}
                                                active={showSettings}
                                                localStream={localStream}
                                            />
                                        </div>
                                        <div className="modal-footer">
                                            <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>Kapat</button>
                                            <button
                                                className="btn btn-primary"
                                                onClick={async () => {
                                                    await settingsRef.current?.applyToLocal();
                                                    if (mainRef.current) {
                                                        await settingsRef.current?.applySpeaker(mainRef.current);
                                                    }
                                                    setShowSettings(false);
                                                }}
                                            >
                                                Uygula
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default VideoPanel;
