// ============================================================
// Loop Solar — Settings Page
// Alert rules management & system configuration
// ============================================================

import React, { useState, useEffect } from 'react';
import { Settings, Plus, Trash2, Shield, Bell } from 'lucide-react';
import { getAlertRules, createAlertRule, deleteAlertRule, getPlants, createPlant } from '../services/api';

export default function SettingsPage() {
    const [rules, setRules] = useState([]);
    const [plants, setPlants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddRule, setShowAddRule] = useState(false);
    const [showAddPlant, setShowAddPlant] = useState(false);
    const [newRule, setNewRule] = useState({ plant_id: '', parameter: 'power_total', condition: '>', threshold: 0, severity: 'warning', message_template: '' });
    const [newPlant, setNewPlant] = useState({ name: '', location: '', capacity_kw: '' });

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        try {
            const [r, p] = await Promise.all([
                getAlertRules().catch(() => []),
                getPlants().catch(() => [])
            ]);
            setRules(r); setPlants(p);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }

    async function handleAddRule(e) {
        e.preventDefault();
        try {
            await createAlertRule(newRule);
            setShowAddRule(false);
            setNewRule({ plant_id: '', parameter: 'power_total', condition: '>', threshold: 0, severity: 'warning', message_template: '' });
            loadData();
        } catch (err) { alert('Error: ' + err.message); }
    }

    async function handleDeleteRule(id) {
        if (!confirm('Delete this alert rule?')) return;
        try {
            await deleteAlertRule(id);
            loadData();
        } catch (err) { alert('Error: ' + err.message); }
    }

    async function handleAddPlant(e) {
        e.preventDefault();
        try {
            await createPlant(newPlant);
            setShowAddPlant(false);
            setNewPlant({ name: '', location: '', capacity_kw: '' });
            loadData();
        } catch (err) { alert('Error: ' + err.message); }
    }

    if (loading) return <div className="loading-container"><div className="loading-spinner"></div></div>;

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1>⚙️ Settings</h1>
                <p>System configuration, alert rules, and plant management</p>
            </div>

            {/* Plants */}
            <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                    <h3 className="card-title">🌞 Plants</h3>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddPlant(!showAddPlant)}>
                        <Plus size={16} /> Add Plant
                    </button>
                </div>

                {showAddPlant && (
                    <form onSubmit={handleAddPlant} style={{ marginBottom: 16, padding: 16, background: 'var(--color-bg-input)', borderRadius: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Plant Name</label>
                                <input className="form-input" placeholder="e.g. Mumbai Plant" value={newPlant.name}
                                    onChange={e => setNewPlant({ ...newPlant, name: e.target.value })} required />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Location</label>
                                <input className="form-input" placeholder="e.g. Mumbai, India" value={newPlant.location}
                                    onChange={e => setNewPlant({ ...newPlant, location: e.target.value })} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Capacity (kWp)</label>
                                <input className="form-input" type="number" step="0.1" placeholder="100" value={newPlant.capacity_kw}
                                    onChange={e => setNewPlant({ ...newPlant, capacity_kw: e.target.value })} />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ height: 38 }}>Add</button>
                        </div>
                    </form>
                )}

                <div className="table-container">
                    <table>
                        <thead>
                            <tr><th>Name</th><th>Location</th><th>Capacity</th><th>Gateways</th><th>Created</th></tr>
                        </thead>
                        <tbody>
                            {plants.map(p => (
                                <tr key={p.id}>
                                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                                    <td>{p.location || '—'}</td>
                                    <td>{p.capacity_kw ? `${p.capacity_kw} kWp` : '—'}</td>
                                    <td>{p.gateway_count || 0}</td>
                                    <td>{new Date(p.created_at).toLocaleDateString()}</td>
                                </tr>
                            ))}
                            {plants.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)' }}>No plants configured</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Alert Rules */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title"><Bell size={18} style={{ marginRight: 8 }} />Alert Rules</h3>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAddRule(!showAddRule)}>
                        <Plus size={16} /> Add Rule
                    </button>
                </div>

                {showAddRule && (
                    <form onSubmit={handleAddRule} style={{ marginBottom: 16, padding: 16, background: 'var(--color-bg-input)', borderRadius: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 100px 100px', gap: 12, alignItems: 'end' }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Parameter</label>
                                <input className="form-input" placeholder="e.g. voltage_r" value={newRule.parameter}
                                    onChange={e => setNewRule({ ...newRule, parameter: e.target.value })} required />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Message (opt)</label>
                                <input className="form-input" placeholder="Alert message" value={newRule.message_template}
                                    onChange={e => setNewRule({ ...newRule, message_template: e.target.value })} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Cond.</label>
                                <select className="form-select" value={newRule.condition}
                                    onChange={e => setNewRule({ ...newRule, condition: e.target.value })}>
                                    <option value=">">{'>'}</option>
                                    <option value="<">{'<'}</option>
                                    <option value=">=">{'>='}</option>
                                    <option value="<=">{'<='}</option>
                                    <option value="==">{'=='}</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Threshold</label>
                                <input className="form-input" type="number" step="0.01" value={newRule.threshold}
                                    onChange={e => setNewRule({ ...newRule, threshold: parseFloat(e.target.value) })} required />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Severity</label>
                                <select className="form-select" value={newRule.severity}
                                    onChange={e => setNewRule({ ...newRule, severity: e.target.value })}>
                                    <option value="warning">Warning</option>
                                    <option value="critical">Critical</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setShowAddRule(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary">Create Rule</button>
                        </div>
                    </form>
                )}

                <div className="table-container">
                    <table>
                        <thead>
                            <tr><th>Parameter</th><th>Condition</th><th>Threshold</th><th>Severity</th><th>Status</th><th></th></tr>
                        </thead>
                        <tbody>
                            {rules.map(rule => (
                                <tr key={rule.id}>
                                    <td style={{ fontWeight: 600 }}>{rule.parameter}</td>
                                    <td style={{ fontFamily: 'monospace' }}>{rule.condition}</td>
                                    <td>{rule.threshold}</td>
                                    <td><span className={`badge ${rule.severity}`}>{rule.severity}</span></td>
                                    <td><span className={`badge ${rule.enabled ? 'online' : 'offline'}`}>{rule.enabled ? 'Active' : 'Disabled'}</span></td>
                                    <td>
                                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteRule(rule.id)}>
                                            <Trash2 size={12} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {rules.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)' }}>No alert rules configured</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
