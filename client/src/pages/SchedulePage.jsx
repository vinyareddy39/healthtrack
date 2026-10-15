import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../api/client';

export default function SchedulePage() {
  const { user } = useAuth();
  const [doses, setDoses] = useState([]);
  const [progress, setProgress] = useState({ takenCount: 0, totalCount: 0, percentage: 0, label: '0 of 0 taken' });
  const [loading, setLoading] = useState(true);
  const [undoToast, setUndoToast] = useState(null);

  useEffect(() => {
    async function loadTodayDoses() {
      setLoading(true);
      try {
        const res = await apiFetch('/doses/today?profileId=everyone');
        if (res.ok && res.data) {
          setDoses(res.data.doses || []);
          if (res.data.progress) {
            setProgress(res.data.progress);
          }
        }
      } catch (err) {
        console.error('Failed to load patient doses:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTodayDoses();
  }, []);

  const handleAction = async (doseEventId, action) => {
    try {
      const res = await apiFetch('/doses/action', {
        method: 'POST',
        body: JSON.stringify({ action, doseEventId })
      });
      if (res.ok) {
        // Show 5-second undo toast if action was taken or skip
        if (action === 'taken' || action === 'skip') {
          setUndoToast({
            doseEventId,
            action,
            message: `Dose recorded as ${action}. Undo available for 5s.`
          });
          setTimeout(() => {
            setUndoToast(prev => (prev?.doseEventId === doseEventId ? null : prev));
          }, 5000);
        } else if (action === 'undo') {
          setUndoToast(null);
        }

        // Refresh doses
        const refresh = await apiFetch('/doses/today?profileId=everyone');
        if (refresh.ok && refresh.data) {
          setDoses(refresh.data.doses || []);
          if (refresh.data.progress) setProgress(refresh.data.progress);
        }
      }
    } catch (err) {
      console.error('Action failed:', err);
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <span className="badge badge-patient">Patient Workspace</span>
          <h1 className="page-heading">My Recovery Schedule</h1>
          <p className="page-subheading">
            Logged in as <strong>{user?.name}</strong> • Today's medication check-in and reminder timeline
          </p>
        </div>
      </div>

      <div className="progress-banner-card">
        <div className="progress-circle-wrapper">
          <div className="progress-stat">{progress.percentage}%</div>
          <span className="progress-sub">Adherence</span>
        </div>
        <div className="progress-meta">
          <h2 className="progress-title">Today's Dose Compliance</h2>
          <p className="progress-desc">{progress.label}</p>
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${progress.percentage}%` }}></div>
          </div>
        </div>
      </div>

      {undoToast && (
        <div className="alert alert-toast" role="alert">
          <span>{undoToast.message}</span>
          <button
            onClick={() => handleAction(undoToast.doseEventId, 'undo')}
            className="btn btn-sm btn-outline-white"
          >
            Undo (5s)
          </button>
        </div>
      )}

      <div className="card content-card">
        <div className="card-header">
          <h2 className="card-title">Today's Scheduled Medication</h2>
          <span className="badge badge-default">Real-time Check-ins</span>
        </div>

        {loading ? (
          <div className="panel-loading">
            <div className="spinner-sm"></div>
            <span>Loading today's medication timeline...</span>
          </div>
        ) : doses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💊</div>
            <h3>No medications pending for today</h3>
            <p>You have taken all scheduled doses, or your caregiver has not activated a schedule yet.</p>
          </div>
        ) : (
          <div className="dose-list">
            {doses.map(d => (
              <div key={d._id} className={`dose-item ${d.status}`}>
                <div className="dose-time-badge">
                  {new Date(d.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="dose-info">
                  <h3 className="dose-name">{d.medicineName}</h3>
                  <p className="dose-meta">{d.dosageDescription} • {d.foodTiming}</p>
                </div>
                <div className="dose-status-pill">
                  <span className={`status-pill ${d.status}`}>{d.status.toUpperCase()}</span>
                </div>
                <div className="dose-actions">
                  {d.status === 'pending' || d.status === 'snoozed' ? (
                    <>
                      <button
                        onClick={() => handleAction(d._id, 'taken')}
                        className="btn btn-sm btn-primary"
                      >
                        ✓ Mark Taken
                      </button>
                      <button
                        onClick={() => handleAction(d._id, 'snooze')}
                        className="btn btn-sm btn-secondary"
                      >
                        ⏱ Snooze 30m
                      </button>
                      <button
                        onClick={() => handleAction(d._id, 'skip')}
                        className="btn btn-sm btn-ghost"
                      >
                        Skip
                      </button>
                    </>
                  ) : (
                    <span className="text-muted">Recorded</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
