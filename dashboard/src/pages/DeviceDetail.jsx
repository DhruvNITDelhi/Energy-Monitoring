// ============================================================
// Loop Solar — Device Detail Page
// Full parameter table + historical graphs for one device
// ============================================================

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getDeviceReadings, getDeviceHistory } from '../services/api';
import { connectSocket } from '../services/socket';

const COLORS = ['#FF6B00', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];
const INTERVALS = [
    { label: '1 Hour', value: '1 hour', bucket: '1 minute' },
    { label: '6 Hours', value: '6 hours', bucket: '5 minutes' },
    { label: '24 Hours', value: '24 hours', bucket: '15 minutes' },
    { label: '7 Days', value: '7 days', bucket: '1 hour' },
    { label: '30 Days', value: '30 days', bucket: '6 hours' },
];

export default function DeviceDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [readings, setReadings] = useState(null);
    const [history, setHistory] = useState([]);
    const [selectedParam, setSelectedParam] = useState('power_total');
    const [timeRange, setTimeRange] = useState(2);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
        const socket = connectSocket();
        
        socket.on('telemetry:live', (data) => {
            if (data.device_id === id) {
                setReadings({ time: data.timestamp, parameters: data.parameters });
            }
        });

        return () => { socket.off('telemetry:live'); };
    }, [id]);

    useEffect(() => {
        loadHistory();
    }, [id, selectedParam, timeRange]);

    async function loadData() {
        try {
            const data = await getDeviceReadings(id);
            setReadings(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function loadHistory() {
        try {
            const range = INTERVALS[timeRange];
            const start = new Date(Date.now() - parseDuration(range.value)).toISOString();
            const data = await getDeviceHistory(id, {
                start,
                end: new Date().toISOString(),
                interval: range.bucket,
                param: selectedParam
            });
            setHistory(data);
        } catch (err) {
            console.error(err);
        }
    }

    function parseDuration(str) {
        const match = str.match(/(\d+)\s*(minute|hour|day|week|month)/);
        if (!match) return 86400000;
        const n = parseInt(match[1]);
        const unit = match[2];
        const ms = { minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000 };
        return n * (ms[unit] || 86400000);
    }

    if (loading) return <div className="loading-container"><div className="loading-spinner"></div></div>;

    const params = readings?.parameters || {};
    const paramKeys = Object.keys(params);

    return (
        <div className="animate-in">
            <div className="page-header">
                <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm" style={{ marginBottom: 12 }}>
                    <ArrowLeft size={16} /> Back
                </button>
                <h1>Device: {id}</h1>
                <p>Last reading: {readings?.time ? new Date(readings.time).toLocaleString() : 'N/A'}</p>
            </div>

            {/* Live Parameters */}
            <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                    <h3 className="card-title">Live Parameters</h3>
                    {readings && <span className="badge online"><span className="badge-dot"></span> Live</span>}
                </div>
                <div className="params-grid">
                    {paramKeys.map(key => (
                        <div key={key} className={`param-item ${selectedParam === key ? 'active' : ''}`}
                             style={{ cursor: 'pointer', borderColor: selectedParam === key ? 'var(--color-accent)' : undefined }}
                             onClick={() => setSelectedParam(key)}>
                            <div className="param-name">{key.replace(/_/g, ' ')}</div>
                            <div className="param-value">{parseFloat(params[key]).toFixed(2)}</div>
                        </div>
                    ))}
                </div>
                {paramKeys.length === 0 && (
                    <div className="empty-state">
                        <p>No readings available</p>
                    </div>
                )}
            </div>

            {/* Historical Chart */}
            <div className="chart-card">
                <div className="card-header">
                    <h3 className="card-title">
                        <Clock size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                        Historical: {selectedParam.replace(/_/g, ' ')}
                    </h3>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {INTERVALS.map((interval, idx) => (
                            <button key={idx}
                                className={`btn btn-sm ${idx === timeRange ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setTimeRange(idx)}>
                                {interval.label}
                            </button>
                        ))}
                    </div>
                </div>

                {history.length > 0 ? (
                    <ResponsiveContainer width="100%" height={400}>
                        <LineChart data={history}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="time" stroke="#64748b" fontSize={11}
                                tickFormatter={(t) => {
                                    const d = new Date(t);
                                    return timeRange > 2 
                                        ? d.toLocaleDateString([], { month: 'short', day: 'numeric' })
                                        : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                }} />
                            <YAxis stroke="#64748b" fontSize={11} />
                            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                                labelStyle={{ color: '#94a3b8' }}
                                labelFormatter={(t) => new Date(t).toLocaleString()} />
                            <Legend />
                            <Line type="monotone" dataKey="avg_value" stroke="#FF6B00" strokeWidth={2} dot={false} name="Average" />
                            <Line type="monotone" dataKey="max_value" stroke="#ef4444" strokeWidth={1} dot={false} name="Max" strokeDasharray="4 4" />
                            <Line type="monotone" dataKey="min_value" stroke="#3b82f6" strokeWidth={1} dot={false} name="Min" strokeDasharray="4 4" />
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="empty-state" style={{ height: 300 }}>
                        <p>No historical data for this period</p>
                    </div>
                )}
            </div>
        </div>
    );
}
