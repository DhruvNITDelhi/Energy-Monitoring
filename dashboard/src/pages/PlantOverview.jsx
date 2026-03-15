// ============================================================
// Loop Solar — Plant Overview Page
// Grid of all plants with gateway counts and live power
// ============================================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Server, Cpu, AlertTriangle, Zap, Battery, Activity } from 'lucide-react';
import { getPlants, getGateways, getAlerts, getLatestTelemetry, getStatus } from '../services/api';
import { connectSocket } from '../services/socket';

export default function PlantOverview() {
    const [plants, setPlants] = useState([]);
    const [gateways, setGateways] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [telemetry, setTelemetry] = useState([]);
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        loadData();
        const socket = connectSocket();
        
        socket.on('telemetry:live', (data) => {
            setTelemetry(prev => {
                const idx = prev.findIndex(t => t.device_id === data.device_id);
                if (idx >= 0) {
                    const updated = [...prev];
                    updated[idx] = { ...updated[idx], parameters: data.parameters, time: data.timestamp };
                    return updated;
                }
                return [...prev, { device_id: data.device_id, parameters: data.parameters, time: data.timestamp, plant_id: data.plant_id }];
            });
        });

        socket.on('alert:new', (alert) => {
            setAlerts(prev => [alert, ...prev].slice(0, 20));
        });

        const interval = setInterval(loadData, 30000);
        return () => {
            clearInterval(interval);
            socket.off('telemetry:live');
            socket.off('alert:new');
        };
    }, []);

    async function loadData() {
        try {
            const [plantsData, gatewaysData, alertsData, telemetryData, statusData] = await Promise.all([
                getPlants().catch(() => []),
                getGateways().catch(() => []),
                getAlerts({ acknowledged: 'false', limit: 20 }).catch(() => []),
                getLatestTelemetry().catch(() => []),
                getStatus().catch(() => null)
            ]);
            setPlants(plantsData);
            setGateways(gatewaysData);
            setAlerts(alertsData);
            setTelemetry(telemetryData);
            setStatus(statusData);
        } catch (err) {
            console.error('Load error:', err);
        } finally {
            setLoading(false);
        }
    }

    const onlineGateways = gateways.filter(g => g.status === 'online').length;
    const totalPower = telemetry.reduce((sum, t) => {
        const p = parseFloat(t.parameters?.power_total) || 0;
        return sum + p;
    }, 0);
    const unackAlerts = alerts.filter(a => !a.acknowledged).length;

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
            </div>
        );
    }

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1>🌞 Plant Overview</h1>
                <p>Monitor all solar plants in real-time</p>
            </div>

            {/* Stats Summary */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon orange"><Sun size={22} /></div>
                    <div className="stat-value">{plants.length}</div>
                    <div className="stat-label">Solar Plants</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon green"><Server size={22} /></div>
                    <div className="stat-value">{onlineGateways}<span className="stat-unit">/ {gateways.length}</span></div>
                    <div className="stat-label">Gateways Online</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon blue"><Zap size={22} /></div>
                    <div className="stat-value">{totalPower.toFixed(1)}<span className="stat-unit">kW</span></div>
                    <div className="stat-label">Total Power</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon red"><AlertTriangle size={22} /></div>
                    <div className="stat-value">{unackAlerts}</div>
                    <div className="stat-label">Active Alerts</div>
                </div>
            </div>

            {/* Plant Cards */}
            <div className="card-header">
                <h2 className="card-title">Plants</h2>
            </div>
            
            {plants.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <Sun size={48} />
                        <p>No plants configured yet</p>
                        <p style={{ fontSize: '0.8rem' }}>Add a plant from Device Management</p>
                    </div>
                </div>
            ) : (
                <div className="stats-grid">
                    {plants.map(plant => {
                        const plantTelemetry = telemetry.filter(t => t.plant_id === plant.id);
                        const plantPower = plantTelemetry.reduce((sum, t) => sum + (parseFloat(t.parameters?.power_total) || 0), 0);
                        const plantGateways = gateways.filter(g => g.plant_id === plant.id);
                        const onlineCount = plantGateways.filter(g => g.status === 'online').length;
                        
                        return (
                            <div key={plant.id} className="card" 
                                 style={{ cursor: 'pointer' }}
                                 onClick={() => navigate(`/plant/${plant.id}`)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{plant.name}</h3>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{plant.location}</p>
                                    </div>
                                    <span className={`badge ${onlineCount > 0 ? 'online' : 'offline'}`}>
                                        <span className="badge-dot"></span>
                                        {onlineCount > 0 ? 'Online' : 'Offline'}
                                    </span>
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Power</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{plantPower.toFixed(1)} <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>kW</span></div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Capacity</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{plant.capacity_kw || 0} <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>kW</span></div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Gateways</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{onlineCount}/{plantGateways.length}</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Recent Alerts */}
            {alerts.length > 0 && (
                <div className="card" style={{ marginTop: '24px' }}>
                    <div className="card-header">
                        <h3 className="card-title">⚠️ Recent Alerts</h3>
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/alerts')}>View All</button>
                    </div>
                    {alerts.slice(0, 5).map(alert => (
                        <div key={alert.id} className="alert-item">
                            <div className={`alert-icon badge ${alert.severity}`} style={{ padding: '8px' }}>
                                <AlertTriangle size={16} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{alert.message}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                    {alert.device_id} • {new Date(alert.created_at).toLocaleString()}
                                </div>
                            </div>
                            <span className={`badge ${alert.severity}`}>{alert.severity}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* System Status Bar */}
            {status && (
                <div style={{ marginTop: '24px', padding: '12px 16px', background: 'var(--color-bg-input)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    <Activity size={14} />
                    <span>API: <span style={{ color: 'var(--color-success)' }}>●</span> OK</span>
                    <span>MQTT: <span style={{ color: status.mqtt ? 'var(--color-success)' : 'var(--color-danger)' }}>●</span> {status.mqtt ? 'Connected' : 'Disconnected'}</span>
                    <span>Server Time: {new Date(status.time).toLocaleTimeString()}</span>
                </div>
            )}
        </div>
    );
}
