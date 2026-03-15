// ============================================================
// Loop Solar — API Service Layer
// ============================================================

const API_BASE = import.meta.env.VITE_API_URL || '';

async function fetchJSON(url, options = {}) {
    const res = await fetch(`${API_BASE}${url}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
}

// Plants
export const getPlants = () => fetchJSON('/api/plants');
export const getPlant = (id) => fetchJSON(`/api/plants/${id}`);
export const createPlant = (data) => fetchJSON('/api/plants', { method: 'POST', body: JSON.stringify(data) });
export const getPlantEnergy = (id, period = 'day') => fetchJSON(`/api/plants/${id}/energy?period=${period}`);

// Gateways
export const getGateways = () => fetchJSON('/api/gateways');
export const getGateway = (id) => fetchJSON(`/api/gateways/${id}`);
export const createGateway = (data) => fetchJSON('/api/gateways', { method: 'POST', body: JSON.stringify(data) });
export const pushGatewayConfig = (id, config) => fetchJSON(`/api/gateways/${id}/config`, { method: 'PUT', body: JSON.stringify(config) });

// Devices
export const getDevices = (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return fetchJSON(`/api/devices${params ? '?' + params : ''}`);
};
export const createDevice = (data) => fetchJSON('/api/devices', { method: 'POST', body: JSON.stringify(data) });
export const getDeviceReadings = (id) => fetchJSON(`/api/devices/${id}/readings`);
export const getDeviceHistory = (id, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetchJSON(`/api/devices/${id}/history${qs ? '?' + qs : ''}`);
};

// Telemetry
export const getLatestTelemetry = (plantId) => fetchJSON(`/api/telemetry/latest${plantId ? '?plant_id=' + plantId : ''}`);

// Alerts
export const getAlerts = (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    return fetchJSON(`/api/alerts${params ? '?' + params : ''}`);
};
export const acknowledgeAlert = (id) => fetchJSON(`/api/alerts/${id}/acknowledge`, { method: 'PUT' });

// Alert Rules
export const getAlertRules = () => fetchJSON('/api/alert-rules');
export const createAlertRule = (data) => fetchJSON('/api/alert-rules', { method: 'POST', body: JSON.stringify(data) });
export const deleteAlertRule = (id) => fetchJSON(`/api/alert-rules/${id}`, { method: 'DELETE' });

// Templates
export const getTemplates = () => fetchJSON('/api/templates');
export const createTemplate = (data) => fetchJSON('/api/templates', { method: 'POST', body: JSON.stringify(data) });

// Status
export const getStatus = () => fetchJSON('/api/status');
