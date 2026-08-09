import React, { useEffect, useRef } from 'react';

function OperatorPanel({ localStream, camOn, micOn, onToggleVideo, onToggleAudio }) {
  const localRef = useRef(null);

  useEffect(() => {
    if (localRef.current) {
      localRef.current.srcObject = localStream || null;
    }
  }, [localStream]);

  return (
    <div className="d-flex flex-column">
      {/* Local video */}
      <div className="mb-3" style={{ height: '280px' }}>
        <div className="shadow-sm rounded-4 overflow-hidden h-100 position-relative bg-dark">
          <video
            ref={localRef}
            autoPlay
            muted
            playsInline
            className="w-100 h-100"
            style={{ objectFit: 'cover', background: '#111', pointerEvents: 'none' }}
          />

          {/* Kontrol butonları */}
          <div
            className="position-absolute w-100 d-flex justify-content-center gap-2"
            style={{ bottom: '10px', zIndex: 20, pointerEvents: 'auto' }}
          >
            {/* Mikrofon */}
            <button
              className="btn btn-light rounded-circle icon-button btn-tt"
              style={{ width: 48, height: 48 }}
              onClick={() => {
                console.log("Mic button clicked"); // 🔴 test log
                onToggleAudio();
              }}
              data-title={micOn ? 'Sesi kapat' : 'Sesi aç'}
              aria-pressed={micOn}
            >
              <i
                className={`bi ${
                  micOn ? 'bi-mic-fill text-dark' : 'bi-mic-mute-fill text-danger'
                } fs-5`}
              />
            </button>

            {/* Kamera */}
            <button
              className="btn btn-light rounded-circle icon-button btn-tt"
              style={{ width: 48, height: 48 }}
              onClick={() => {
                console.log("Cam button clicked"); // 🔴 test log
                onToggleVideo();
              }}
              data-title={camOn ? 'Kamerayı kapat' : 'Kamerayı aç'}
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
      </div>

      {/* Talimatlar */}
      <div
        className="shadow-sm rounded-4 p-3"
        style={{ maxHeight: '250px', overflowY: 'auto', fontSize: '0.8rem' }}
      >
        <h5 className="mb-3 fs-6">Talimatlar</h5>
        <ol className="mb-0">
          {[
            'Kimlik doğrulaması yapın.',
            'Kayıt onayı alın.',
            'Kimlik belgesini hazırlatın.',
            'Kimliğin ön yüzünü gösterin.',
            'Kimliğin arka yüzünü gösterin.',
            'Kamera hareketlerini isteyin.',
            'Cümleyi tekrarlatın.',
            'Görüntü karşılaştırması yapın.',
            'Onay verin.',
            'Teşekkür edip görüşmeyi bitirin.',
          ].map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default OperatorPanel;
