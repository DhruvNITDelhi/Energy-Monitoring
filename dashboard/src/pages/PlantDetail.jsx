// ============================================================
// Loop Solar — Plant Detail Page
// Live data cards, device list, power chart for a single plant
// ============================================================

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Zap, Thermometer, Gauge, Activity, Cable } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { getPlant, getLatestTelemetry, getPlantEnergy, getDevices } from '../services/api';
import { connectSocket } from '../services/socket';

const PARAM_CONFIG = {
    voltage_r: { label: 'Voltage R', unit: 'V', color: '#FF6B00' },
    voltage_y: { label: 'Voltage Y', unit: 'V', color: '#FFA500' },
    voltage_b: { label: 'Voltage B', unit: 'V', color: '#3b82f6' },
    current_r: { label: 'Current R', unit: 'A', color: '#10b981' },
    current_y: { label: 'Current Y', unit: 'A', color: '#f59e0b' },
    current_b: { label: 'Current B', unit: 'A', color: '#8b5cf6' },
    power_total: { label: 'Total Power', unit: 'kW', color: '#FF6B00' },
    reactive_power: { label: 'Reactive Power', unit: 'kVAR', color: '#06b6d4' },
    apparent_power: { label: 'Apparent Power', unit: 'kVA', color: '#f43f5e' },
    pf_total: { label: 'Power Factor', unit: '', color: '#10b981' },
    frequency: { label: 'Frequency', unit: 'Hz', color: '#8b5cf6' },
    energy_import: { label: 'Energy Import', unit: 'kWh', color: '#FF6B00' },
    energy_export: { label: 'Energy Export', unit: 'kWh', color: '#10b981' },
    dc_voltage: { label: 'DC Voltage', unit: 'V', color: '#f59e0b' },
    dc_power: { label: 'DC Power', unit: 'W', color: '#FF6B00' },
    ac_power: { label: 'AC Power', unit: 'W', color: '#3b82f6' },
    temperature: { label: 'Temperature', unit: '°C', color: '#ef4444' },
    irradiance: { label: 'Irradiance', unit: 'W/m²', color: '#f59e0b' },
};

export default function PlantDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [plant, setPlant] = useState(null);
    const [telemetry, setTelemetry] = useState([]);
    const [energyHistory, setEnergyHistory] = useState([]);
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
        const socket = connectSocket();
        
        socket.on('telemetry:live', (data) => {
            if (data.plant_id === id) {
                setTelemetry(prev => {
                    const idx = prev.findIndex(t => t.device_id === data.device_id);
                    if (idx >= 0) {
                        const updated = [...prev];
                        updated[idx] = { ...updated[idx], parameters: data.parameters, time: data.timestamp };
                        return updated;
                    }
                    return [...prev, data];
                });
            }
        });

        const interval = setInterval(loadData, 30000);
        return () => {
            clearInterval(interval);
            socket.off('telemetry:live');
        };
    }, [id]);

    async function loadData() {
        try {
            const [plantData, telemetryData, energyData, devicesData] = await Promise.all([
                getPlant(id).catch(() => null),
                getLatestTelemetry(id).catch(() => []),
                getPlantEnergy(id, 'day').catch(() => []),
                getDevices({ plant_id: id }).catch(() => [])
            ]);
            if (plantData) setPlant(plantData);
            setTelemetry(telemetryData);
            setEnergyHistory(energyData);
            setDevices(devicesData);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    if (loading) return <div className="loading-container"><div className="loading-spinner"></div></div>;
    if (!plant) return <div className="empty-state"><p>Plant not found</p></div>;

    const totalPower = telemetry.reduce((sum, t) => sum + (parseFloat(t.parameters?.power_total) || 0), 0);

    return (
        <div className="animate-in">
            <div className="page-header">
                <button onClick={() => navigate('/')} className="btn btn-secondary btn-sm" style={{ marginBottom: 12 }}>
                    <ArrowLeft size={16} /> Back
                </button>
                <h1>{plant.name}</h1>
                <p>{plant.location} • {plant.capacity_kw} kWp capacity</p>
            </div>

            {/* Live Power Stats */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon orange"><Zap size={22} /></div>
                    <div className="stat-value">{totalPower.toFixed(1)}<span className="stat-unit">kW</span></div>
                    <div className="stat-label">Total Power Now</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon green"><Activity size={22} /></div>
                    <div className="stat-value">{telemetry.length}</div>
                    <div className="stat-label">Active Devices</div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon blue"><Cable size={22} /></div>
                    <div className="stat-value">{plant.gateways?.length || 0}</div>
                    <div className="stat-label">Gateways</div>
                </div>
            </div>

            {/* Power Chart */}
            {energyHistory.length > 0 && (
                <div className="chart-card" style={{ marginBottom: 24 }}>
                    <h3 className="card-title" style={{ marginBottom: 16 }}>Power Generation (24h)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={energyHistory}>
                            <defs>
                                <linearGradient id="powerGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#FF6B00" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#FF6B00" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="time" stroke="#64748b" fontSize={11}
                                tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
                            <YAxis stroke="#64748b" fontSize={11} />
                            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                                labelStyle={{ color: '#94a3b8' }} />
                            <Area type="monotone" dataKey="avg_power" stroke="#FF6B00" fill="url(#powerGrad)" strokeWidth={2} name="Avg Power (kW)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Device Readings */}
            <h3 className="card-title" style={{ marginBottom: 16 }}>Device Readings</h3>
            {telemetry.map(t => (
                <div key={t.device_id} className="card" style={{ marginBottom: 16, cursor: 'pointer' }}
                     onClick={() => navigate(`/device/${t.device_id}`)}>
                    <div className="card-header">
                        <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>
                            {t.device_id}
                            <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                {new Date(t.time).toLocaleTimeString()}
                            </span>
                        </h4>
                        <span className="badge online"><span className="badge-dot"></span> Live</span>
                    </div>
                    <div className="params-grid">
                        {Object.entries(t.parameters || {}).map(([key, value]) => {
                            const cfg = PARAM_CONFIG[key] || { label: key, unit: '', color: '#94a3b8' };
                            return (
                                <div key={key} className="param-item">
                                    <div className="param-name">{cfg.label}</div>
                                    <div className="param-value">
                                        {parseFloat(value).toFixed(2)}
                                        <span className="param-unit">{cfg.unit}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {telemetry.length === 0 && (
                <div className="card">
                    <div className="empty-state">
                        <Zap size={48} />
                        <p>No live data from this plant</p>
                        <p style={{ fontSize: '0.8rem' }}>Ensure gateways are online and devices are connected</p>
                    </div>
                </div>
            )}
        </div>
    );
}
