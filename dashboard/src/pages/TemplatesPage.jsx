// ============================================================
// Loop Solar — Templates Page  
// Create/edit device register map templates
// ============================================================

import React, { useState, useEffect } from 'react';
import { FileCode, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { getTemplates, createTemplate } from '../services/api';

const DATA_TYPES = [
    { value: 0, label: 'INT16' },
    { value: 1, label: 'INT32' },
    { value: 2, label: 'FLOAT32 (CDAB)' },
    { value: 3, label: 'FLOAT32 (ABCD)' },
    { value: 4, label: 'INT64' },
    { value: 5, label: 'UINT16' },
    { value: 6, label: 'UINT32' },
];

export default function TemplatesPage() {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [newTemplate, setNewTemplate] = useState({
        name: '', device_type: 'energy_meter', description: '',
        register_map: [{ address: 0, data_type: 2, param_name: '', scale_factor: 1.0, register_count: 2, unit: '' }]
    });

    useEffect(() => { loadTemplates(); }, []);

    async function loadTemplates() {
        try {
            const data = await getTemplates();
            setTemplates(data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }

    function addRegister() {
        setNewTemplate(prev => ({
            ...prev,
            register_map: [...prev.register_map, { address: 0, data_type: 2, param_name: '', scale_factor: 1.0, register_count: 2, unit: '' }]
        }));
    }

    function updateRegister(idx, field, value) {
        setNewTemplate(prev => {
            const map = [...prev.register_map];
            map[idx] = { ...map[idx], [field]: value };
            return { ...prev, register_map: map };
        });
    }

    function removeRegister(idx) {
        setNewTemplate(prev => ({
            ...prev,
            register_map: prev.register_map.filter((_, i) => i !== idx)
        }));
    }

    async function handleCreate(e) {
        e.preventDefault();
        try {
            await createTemplate(newTemplate);
            setShowCreate(false);
            setNewTemplate({
                name: '', device_type: 'energy_meter', description: '',
                register_map: [{ address: 0, data_type: 2, param_name: '', scale_factor: 1.0, register_count: 2, unit: '' }]
            });
            loadTemplates();
        } catch (err) { alert('Error: ' + err.message); }
    }

    if (loading) return <div className="loading-container"><div className="loading-spinner"></div></div>;

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1>📋 Device Templates</h1>
                <p>Modbus register map templates for different device types</p>
            </div>

            <div style={{ marginBottom: 16 }}>
                <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
                    <Plus size={16} /> Create Template
                </button>
            </div>

            {/* Create Template Form */}
            {showCreate && (
                <div className="card" style={{ marginBottom: 24 }}>
                    <h3 className="card-title" style={{ marginBottom: 16 }}>New Template</h3>
                    <form onSubmit={handleCreate}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginBottom: 16 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Template Name</label>
                                <input className="form-input" placeholder="e.g. my_meter" value={newTemplate.name}
                                    onChange={e => setNewTemplate({ ...newTemplate, name: e.target.value })} required />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Device Type</label>
                                <select className="form-select" value={newTemplate.device_type}
                                    onChange={e => setNewTemplate({ ...newTemplate, device_type: e.target.value })}>
                                    <option value="energy_meter">Energy Meter</option>
                                    <option value="inverter">Inverter</option>
                                    <option value="weather">Weather Station</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Description</label>
                                <input className="form-input" placeholder="Description" value={newTemplate.description}
                                    onChange={e => setNewTemplate({ ...newTemplate, description: e.target.value })} />
                            </div>
                        </div>

                        <h4 style={{ fontSize: '0.9rem', marginBottom: 8 }}>Register Map</h4>
                        <div className="table-container" style={{ marginBottom: 16 }}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Address</th>
                                        <th>Data Type</th>
                                        <th>Parameter Name</th>
                                        <th>Scale Factor</th>
                                        <th>Registers</th>
                                        <th>Unit</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {newTemplate.register_map.map((reg, idx) => (
                                        <tr key={idx}>
                                            <td><input className="form-input" type="number" value={reg.address} onChange={e => updateRegister(idx, 'address', parseInt(e.target.value))} style={{ width: 80 }} /></td>
                                            <td><select className="form-select" value={reg.data_type} onChange={e => updateRegister(idx, 'data_type', parseInt(e.target.value))} style={{ width: 150 }}>
                                                {DATA_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                                            </select></td>
                                            <td><input className="form-input" value={reg.param_name} onChange={e => updateRegister(idx, 'param_name', e.target.value)} placeholder="e.g. voltage_r" /></td>
                                            <td><input className="form-input" type="number" step="0.01" value={reg.scale_factor} onChange={e => updateRegister(idx, 'scale_factor', parseFloat(e.target.value))} style={{ width: 80 }} /></td>
                                            <td><input className="form-input" type="number" min="1" max="4" value={reg.register_count} onChange={e => updateRegister(idx, 'register_count', parseInt(e.target.value))} style={{ width: 60 }} /></td>
                                            <td><input className="form-input" value={reg.unit} onChange={e => updateRegister(idx, 'unit', e.target.value)} placeholder="V" style={{ width: 60 }} /></td>
                                            <td><button type="button" className="btn btn-danger btn-sm" onClick={() => removeRegister(idx)}>×</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={addRegister}><Plus size={14} /> Add Register</button>
                            <div style={{ flex: 1 }} />
                            <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary">Create Template</button>
                        </div>
                    </form>
                </div>
            )}

            {/* Template List */}
            {templates.map(tmpl => (
                <div key={tmpl.id} className="card" style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                         onClick={() => setExpanded(expanded === tmpl.id ? null : tmpl.id)}>
                        <div>
                            <span style={{ fontWeight: 700, fontSize: '1rem' }}>{tmpl.name}</span>
                            <span className="badge info" style={{ marginLeft: 8 }}>{tmpl.device_type}</span>
                            {tmpl.description && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>{tmpl.description}</p>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{tmpl.register_map?.length || 0} registers</span>
                            {expanded === tmpl.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                    </div>
                    {expanded === tmpl.id && (
                        <div style={{ marginTop: 16 }}>
                            <div className="table-container">
                                <table>
                                    <thead>
                                        <tr><th>Address</th><th>Data Type</th><th>Parameter</th><th>Scale</th><th>Regs</th><th>Unit</th></tr>
                                    </thead>
                                    <tbody>
                                        {(tmpl.register_map || []).map((reg, idx) => (
                                            <tr key={idx}>
                                                <td style={{ fontFamily: 'monospace' }}>{reg.address}</td>
                                                <td>{DATA_TYPES.find(d => d.value === reg.data_type)?.label || reg.data_type}</td>
                                                <td style={{ fontWeight: 600 }}>{reg.param_name}</td>
                                                <td>{reg.scale_factor}</td>
                                                <td>{reg.register_count}</td>
                                                <td>{reg.unit}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            ))}

            {templates.length === 0 && !showCreate && (
                <div className="card"><div className="empty-state"><FileCode size={48} /><p>No templates yet</p></div></div>
            )}
        </div>
    );
}
