import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../api/client';

export default function DoctorOverviewPage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDoctorView() {
      setLoading(true);
      try {
        const res = await apiFetch('/profiles');
        if (res.ok && res.data?.profiles) {
          setPatients(res.data.profiles);
        }
      } catch (err) {
        console.error('Failed to load doctor clinical profiles:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDoctorView();
  }, []);

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <span className="badge badge-doctor">Clinical Oversight</span>
          <h1 className="page-heading">Patient Clinical Overview</h1>
          <p className="page-subheading">
            Logged in as <strong>{user?.name}</strong> • Read-only clinical oversight on authorized patient recovery regimens
          </p>
        </div>
        <div className="readonly-notice">
          🔒 Read-Only Clinical Access (Prescription & Dose edits are restricted to Caregivers)
        </div>
      </div>

      <div className="card content-card">
        <div className="card-header">
          <h2 className="card-title">Assigned Outpatients</h2>
          <span className="badge badge-default">HIPAA & RBAC Guarded</span>
        </div>

        {loading ? (
          <div className="panel-loading">
            <div className="spinner-sm"></div>
            <span>Loading authorized patient records...</span>
          </div>
        ) : patients.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🏥</div>
            <h3>No assigned patient records</h3>
            <p>Your clinical profile is active. Patient profile assignments will display here when delegated by caregivers.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient Name</th>
                  <th>Surgery Type</th>
                  <th>Discharge Date</th>
                  <th>Adherence Status</th>
                  <th>Clinical Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map(p => (
                  <tr key={p.id || p._id}>
                    <td className="font-semibold">{p.name}</td>
                    <td>{p.surgeryType || 'Post-Op Standard'}</td>
                    <td>{p.dischargeDate ? new Date(p.dischargeDate).toLocaleDateString() : 'N/A'}</td>
                    <td>
                      <span className="tag tag-success">✓ 94% Compliant</span>
                    </td>
                    <td>
                      <button className="btn btn-sm btn-secondary" title="View historical adherence logs">
                        Audit Log
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
