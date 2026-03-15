// ============================================================
// Loop Solar — App Shell with Router and Sidebar
// ============================================================

import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Zap, BarChart3, Bell, Settings, Server, FileCode, Sun } from 'lucide-react';

import PlantOverview from './pages/PlantOverview';
import PlantDetail from './pages/PlantDetail';
import DeviceDetail from './pages/DeviceDetail';
import AlertsPage from './pages/AlertsPage';
import DeviceManagement from './pages/DeviceManagement';
import TemplatesPage from './pages/TemplatesPage';
import SettingsPage from './pages/SettingsPage';

function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">
                        <Sun size={22} />
                    </div>
                    <span className="sidebar-logo-text">Loop Solar</span>
                </div>
            </div>
            
            <nav className="sidebar-nav">
                <div className="nav-section-label">Monitoring</div>
                <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
                    <LayoutDashboard size={20} />
                    <span>Plant Overview</span>
                </NavLink>
                <NavLink to="/alerts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <Bell size={20} />
                    <span>Alerts</span>
                </NavLink>
                
                <div className="nav-section-label" style={{ marginTop: '16px' }}>Administration</div>
                <NavLink to="/admin/devices" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <Server size={20} />
                    <span>Device Management</span>
                </NavLink>
                <NavLink to="/admin/templates" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <FileCode size={20} />
                    <span>Templates</span>
                </NavLink>
                <NavLink to="/admin/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <Settings size={20} />
                    <span>Settings</span>
                </NavLink>
            </nav>
            
            <div style={{ padding: '16px', borderTop: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Loop Solar v1.0.0
                </div>
                <a href="https://loopsolar.com" target="_blank" rel="noreferrer"
                   style={{ fontSize: '0.75rem', color: 'var(--color-accent)' }}>
                    loopsolar.com
                </a>
            </div>
        </aside>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <div className="app-layout">
                <Sidebar />
                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<PlantOverview />} />
                        <Route path="/plant/:id" element={<PlantDetail />} />
                        <Route path="/device/:id" element={<DeviceDetail />} />
                        <Route path="/alerts" element={<AlertsPage />} />
                        <Route path="/admin/devices" element={<DeviceManagement />} />
                        <Route path="/admin/templates" element={<TemplatesPage />} />
                        <Route path="/admin/settings" element={<SettingsPage />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}
