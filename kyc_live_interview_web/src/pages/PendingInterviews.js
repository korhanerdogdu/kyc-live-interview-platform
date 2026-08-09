// src/pages/PendingInterviews.js
import React, { useState, useEffect, useRef } from 'react';
import { useCustomerApi } from '../api/customer_api';
import { useNavigate } from 'react-router-dom';

export default function PendingInterviews() {
  const [interviews, setInterviews] = useState([]);
  const { getPendingMeetings } = useCustomerApi();
  const navigate = useNavigate();

  const apiRef = useRef(getPendingMeetings);
  const inFlight = useRef(false);
  const fetchedOnce = useRef(false);

  const [nowTick, setNowTick] = useState(Date.now());
  const clockRef = useRef(null);

  useEffect(() => { apiRef.current = getPendingMeetings; }, [getPendingMeetings]);

  const normalizeList = (arr) =>
    (Array.isArray(arr) ? arr : []).map((item) => {
      const start =
        item.startAt ??
        item.startTimestamp ??
        item.start_timestamp ??
        item.startTime ??
        item.start_time ??
        item.createdAt ??
        item.created_at ??
        null;
      return { ...item, startAt: start };
    });

  const parseLocal = (val) => {
    if (val == null) return null;
    if (typeof val === 'number') {
      const d = new Date(val > 1e12 ? val : val * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof val === 'string') {
      let s = val.trim();
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(s)) s = s.replace(' ', 'T');
      let d = new Date(s);
      if (!Number.isNaN(d.getTime())) return d;
      if (!/[zZ]|[+\-]\d{2}:\d{2}$/.test(s)) {
        d = new Date(`${s}+03:00`);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
    return null;
  };

  const formatRelativeTR = (val, now = new Date()) => {
    const d = parseLocal(val);
    if (!d) return null;
    let diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSec < 0) diffSec = 0;
    if (diffSec < 5) return 'az önce';
    if (diffSec < 60) return `${diffSec} sn önce`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} dk önce`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} sa önce`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay === 1) return '1 gün önce';
    if (diffDay < 7) return `${diffDay} gün önce`;
    const diffWeek = Math.floor(diffDay / 7);
    if (diffWeek < 4) return `${diffWeek} hf önce`;
    const diffMon = Math.floor(diffDay / 30);
    if (diffMon < 12) return `${diffMon} ay önce`;
    const diffYr = Math.floor(diffDay / 365);
    return `${diffYr} yıl önce`;
  };

  const fetchList = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const data = await apiRef.current();
      setInterviews(normalizeList(data));
    } catch (e) {
      console.error('Pending görüşmeler alınamadı:', e);
      setInterviews([]);
    } finally {
      inFlight.current = false;
    }
  };



  useEffect(() => {
              if (!fetchedOnce.current) {
              fetchedOnce.current = true;
              fetchList(); // ⇦ tek sefer
            }


                  if (!clockRef.current) {
              clockRef.current = setInterval(() => setNowTick(Date.now()), 30000);
            }

      return () => {
        if (clockRef.current) { clearInterval(clockRef.current); clockRef.current = null; }
      };
  }, []);

  const list = Array.isArray(interviews) ? interviews : [];

  useEffect(() => { if (list.length) console.log('[pending] first item sample:', list[0]); }, [list]);

  const openPrejoin = (interview) => {
    navigate(`/live-interview/${interview.id}`, {
      state: { customer: interview, stage: 'prejoin' },
    });
  };

  // NEW: show "Resume in-progress meeting" if we have one locally
  let active = null;
  try {
    const raw = localStorage.getItem('ACTIVE_MEETING');
    if (raw) active = JSON.parse(raw);
  } catch {}

  const resumeActive = () => {
    if (!active?.id) return;
    navigate(`/live-interview/${active.id}`, {
      state: { stage: 'incall' },
    });
  };

  return (
    <div className="position-relative min-vh-100">
      <div className="container py-5">
        <h2 className="mb-5 text-center fw-bold modern-title">Beklemede Olan Görüşmeler</h2>

        {active?.id && (
          <div className="alert alert-info d-flex align-items-center justify-content-between rounded-4 shadow-sm">
            <div>
              <strong>Resume your in-progress call</strong><br />
              Meeting ID: <code>{active.id}</code>
            </div>
            <button className="btn btn-primary" onClick={resumeActive}>Resume</button>
          </div>
        )}

        {list.length === 0 ? (
          <div className="text-muted text-center">Şu anda bekleyen görüşme yok.</div>
        ) : (
          <div className="row">
            {list.map((interview) => (
              <div className="col-12 mb-4" key={interview.id}>
                <div
                  className="card rounded-5 p-4 hover-modern position-relative overflow-hidden"
                  style={{
                    cursor: 'pointer',
                    transition: '0.25s',
                    border: 'none',
                    boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
                  }}
                  onClick={() => openPrejoin(interview)}
                >
                  <img
                    src="/bg-wave-blue.svg"
                    alt="decor"
                    className="position-absolute"
                    style={{
                      bottom: '-5px',
                      right: '-5px',
                      width: '130px',
                      opacity: 0.45,
                      zIndex: 0,
                      filter: 'saturate(1.2) blur(1px)',
                    }}
                  />

                  <div
                    className="position-absolute top-0 end-0 m-3 small badge bg-light text-secondary shadow-sm"
                    style={{ zIndex: 2 }}
                  >
                    <i className="bi bi-clock me-1"></i>
                    {formatRelativeTR(interview.startAt, new Date(nowTick)) || 'Zaman bilgisi yok'}
                  </div>

                  <div
                    className="d-flex align-items-center gap-3 position-relative"
                    style={{ zIndex: 1 }}
                  >
                    <div className="rounded-circle d-flex align-items-center justify-content-center iconbubble-modern">
                      <i className="bi bi-camera-video-fill"></i>
                    </div>

                    <div className="flex-grow-1">
                      <h5 className="mb-1 customer-modern">Müşteri Adı</h5>
                      <div className="text-muted small font-monospace">{interview.id}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .modern-title { font-size: 2rem; color: #000; }
        .hover-modern:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(74,163,240,0.25); }
        .iconbubble-modern { width: 56px; height: 56px; background: #4aa3f0; color: #fff; font-size: 1.4rem; box-shadow: 0 4px 12px rgba(74,163,240,0.35); }
        .customer-modern { font-weight: 600; font-size: 1.25rem; color: #333; transition: color .2s ease; }
        .hover-modern:hover .customer-modern { color: #4aa3f0; }
      `}</style>
    </div>
  );
}
