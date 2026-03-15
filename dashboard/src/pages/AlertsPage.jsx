// ============================================================
// Loop Solar — Alerts Page
// List all alerts with filters, acknowledge action
// ============================================================

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Check, Filter, Bell } from 'lucide-react';
import { getAlerts, acknowledgeAlert } from '../services/api';
import { connectSocket } from '../services/socket';

export default function AlertsPage() {
    const [alerts, setAlerts] = useState([]);
    const [filter, setFilter] = useState('all'); // all, unack, critical, warning
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAlerts();
        const socket = connectSocket();
        socket.on('alert:new', (alert) => {
            setAlerts(prev => [alert, ...prev]);
        });
        return () => { socket.off('alert:new'); };
    }, []);

    async function loadAlerts() {
        try {
            const params = {};
            if (filter === 'unack') params.acknowledged = 'false';
            if (['critical', 'warning'].includes(filter)) params.severity = filter;
            const data = await getAlerts(params);
            setAlerts(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadAlerts(); }, [filter]);

    async function handleAcknowledge(id) {
        try {
            await acknowledgeAlert(id);
            setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true, acknowledged_at: new Date() } : a));
        } catch (err) {
            console.error(err);
        }
    }

    const filteredAlerts = alerts;

    if (loading) return <div className="loading-container"><div className="loading-spinner"></div></div>;

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1>🔔 Alerts</h1>
                <p>Monitor system alerts and notifications</p>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                {['all', 'unack', 'critical', 'warning'].map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                        className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}>
                        {f === 'all' ? 'All' : f === 'unack' ? 'Unacknowledged' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            {/* Alert List */}
            <div className="card">
                {filteredAlerts.length === 0 ? (
                    <div className="empty-state">
                        <Bell size={48} />
                        <p>No alerts to show</p>
                    </div>
                ) : (
                    filteredAlerts.map(alert => (
                        <div key={alert.id} className="alert-item"
                             style={{ opacity: alert.acknowledged ? 0.5 : 1 }}>
                            <div className={`alert-icon badge ${alert.severity}`} style={{ padding: 8 }}>
                                <AlertTriangle size={16} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{alert.message}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                                    Device: {alert.device_id || 'N/A'} • 
                                    {alert.value !== null && ` Value: ${alert.value}`}
                                    {alert.threshold !== null && ` / Threshold: ${alert.threshold}`}
                                    {' • '}{new Date(alert.created_at).toLocaleString()}
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className={`badge ${alert.severity}`}>{alert.severity}</span>
                                {!alert.acknowledged && (
                                    <button className="btn btn-sm btn-secondary" onClick={() => handleAcknowledge(alert.id)}>
                                        <Check size={14} /> Ack
                                    </button>
                                )}
                                {alert.acknowledged && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--color-success)' }}>✓ Acknowledged</span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
