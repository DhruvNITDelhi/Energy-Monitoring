// ============================================================
// Loop Solar — Device Management Page
// Add gateways, devices, assign plant IDs, configure Modbus
// ============================================================

import React, { useState, useEffect } from 'react';
import { Plus, Server, Cpu, Send, RefreshCw } from 'lucide-react';
import { getPlants, getGateways, getDevices, getTemplates, createGateway, createDevice, pushGatewayConfig } from '../services/api';

export default function DeviceManagement() {
    const [plants, setPlants] = useState([]);
    const [gateways, setGateways] = useState([]);
    const [devices, setDevices] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddGateway, setShowAddGateway] = useState(false);
    const [showAddDevice, setShowAddDevice] = useState(false);
    const [newGateway, setNewGateway] = useState({ id: '', plant_id: '' });
    const [newDevice, setNewDevice] = useState({ id: '', gateway_id: '', device_type: 'energy_meter', template_name: '', slave_id: 1, name: '' });

    useEffect(() => { loadAll(); }, []);

    async function loadAll() {
        try {
            const [p, g, d, t] = await Promise.all([
                getPlants().catch(() => []),
                getGateways().catch(() => []),
                getDevices().catch(() => []),
                getTemplates().catch(() => [])
            ]);
            setPlants(p); setGateways(g); setDevices(d); setTemplates(t);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }

    async function handleAddGateway(e) {
        e.preventDefault();
        try {
            await createGateway(newGateway);
            setNewGateway({ id: '', plant_id: '' });
            setShowAddGateway(false);
            loadAll();
        } catch (err) { alert('Error: ' + err.message); }
    }

    async function handleAddDevice(e) {
        e.preventDefault();
        try {
            await createDevice(newDevice);
            setNewDevice({ id: '', gateway_id: '', device_type: 'energy_meter', template_name: '', slave_id: 1, name: '' });
            setShowAddDevice(false);
            loadAll();
        } catch (err) { alert('Error: ' + err.message); }
    }

    async function handlePushConfig(gatewayId) {
        const gwDevices = devices.filter(d => d.gateway_id === gatewayId);
        const config = {
            gateway_id: gatewayId,
            plant_id: gateways.find(g => g.id === gatewayId)?.plant_id || '',
            poll_interval_ms: 10000,
            devices: gwDevices.map(d => ({
                device_id: d.id,
                device_type: d.device_type,
                template: d.template_name,
                slave_id: d.slave_id
            }))
        };
        try {
            await pushGatewayConfig(gatewayId, config);
            alert('Config pushed to ' + gatewayId);
        } catch (err) { alert('Error: ' + err.message); }
    }

    if (loading) return <div className="loading-container"><div className="loading-spinner"></div></div>;

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1>🖥️ Device Management</h1>
                <p>Manage gateways, devices, and configurations</p>
            </div>

            {/* Gateways Section */}
            <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                    <h3 className="card-title"><Server size={18} style={{ marginRight: 8 }} />Gateways</h3>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddGateway(!showAddGateway)}>
                        <Plus size={16} /> Add Gateway
                    </button>
                </div>

                {showAddGateway && (
                    <form onSubmit={handleAddGateway} style={{ marginBottom: 16, padding: 16, background: 'var(--color-bg-input)', borderRadius: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Gateway ID</label>
                                <input className="form-input" placeholder="e.g. GW-001" value={newGateway.id}
                                    onChange={e => setNewGateway({ ...newGateway, id: e.target.value })} required />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Plant</label>
                                <select className="form-select" value={newGateway.plant_id}
                                    onChange={e => setNewGateway({ ...newGateway, plant_id: e.target.value })}>
                                    <option value="">-- Select Plant --</option>
                                    {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ height: 38 }}>Add</button>
                        </div>
                    </form>
                )}

                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Gateway ID</th>
                                <th>Plant</th>
                                <th>Status</th>
                                <th>Firmware</th>
                                <th>Last Seen</th>
                                <th>Devices</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {gateways.map(gw => (
                                <tr key={gw.id}>
                                    <td style={{ fontWeight: 600 }}>{gw.id}</td>
                                    <td>{gw.plant_name || '—'}</td>
                                    <td><span className={`badge ${gw.status}`}><span className="badge-dot"></span>{gw.status}</span></td>
                                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{gw.firmware_version || '—'}</td>
                                    <td>{gw.last_seen ? new Date(gw.last_seen).toLocaleString() : '—'}</td>
                                    <td>{gw.device_count || 0}</td>
                                    <td>
                                        <button className="btn btn-secondary btn-sm" onClick={() => handlePushConfig(gw.id)}>
                                            <Send size={12} /> Push Config
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {gateways.length === 0 && (
                                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 32 }}>No gateways registered</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Devices Section */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title"><Cpu size={18} style={{ marginRight: 8 }} />Devices</h3>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddDevice(!showAddDevice)}>
                        <Plus size={16} /> Add Device
                    </button>
                </div>

                {showAddDevice && (
                    <form onSubmit={handleAddDevice} style={{ marginBottom: 16, padding: 16, background: 'var(--color-bg-input)', borderRadius: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Device ID</label>
                                <input className="form-input" placeholder="e.g. EM-001" value={newDevice.id}
                                    onChange={e => setNewDevice({ ...newDevice, id: e.target.value })} required />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Gateway</label>
                                <select className="form-select" value={newDevice.gateway_id}
                                    onChange={e => setNewDevice({ ...newDevice, gateway_id: e.target.value })} required>
                                    <option value="">-- Select --</option>
                                    {gateways.map(g => <option key={g.id} value={g.id}>{g.id}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Name</label>
                                <input className="form-input" placeholder="e.g. Main Meter" value={newDevice.name}
                                    onChange={e => setNewDevice({ ...newDevice, name: e.target.value })} />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, marginTop: 12, alignItems: 'end' }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Type</label>
                                <select className="form-select" value={newDevice.device_type}
                                    onChange={e => setNewDevice({ ...newDevice, device_type: e.target.value })}>
                                    <option value="energy_meter">Energy Meter</option>
                                    <option value="inverter">Inverter</option>
                                    <option value="weather">Weather Station</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Template</label>
                                <select className="form-select" value={newDevice.template_name}
                                    onChange={e => setNewDevice({ ...newDevice, template_name: e.target.value })}>
                                    <option value="">-- Select --</option>
                                    {templates.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Slave ID</label>
                                <input className="form-input" type="number" min="1" max="247" value={newDevice.slave_id}
                                    onChange={e => setNewDevice({ ...newDevice, slave_id: parseInt(e.target.value) })} />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ height: 38 }}>Add</button>
                        </div>
                    </form>
                )}

                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Device ID</th>
                                <th>Name</th>
                                <th>Gateway</th>
                                <th>Type</th>
                                <th>Template</th>
                                <th>Slave ID</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {devices.map(d => (
                                <tr key={d.id}>
                                    <td style={{ fontWeight: 600 }}>{d.id}</td>
                                    <td>{d.name || '—'}</td>
                                    <td>{d.gateway_id}</td>
                                    <td><span className={`badge info`}>{d.device_type}</span></td>
                                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.template_name || '—'}</td>
                                    <td>{d.slave_id}</td>
                                    <td><span className={`badge ${d.status || 'offline'}`}><span className="badge-dot"></span>{d.status || 'offline'}</span></td>
                                </tr>
                            ))}
                            {devices.length === 0 && (
                                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 32 }}>No devices registered</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
