// ============================================================
// Loop Solar — API Service
// REST API + Socket.io WebSocket for real-time dashboard
// ============================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server: SocketServer } = require('socket.io');
const { Pool } = require('pg');
const mqtt = require('mqtt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const httpServer = createServer(app);

// ---- Configuration ----
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const FIRMWARE_DIR = process.env.OTA_FIRMWARE_DIR || path.join(__dirname, '..', 'firmware');

// ---- Middleware ----
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: CORS_ORIGIN.split(','), credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60000, max: 200 }));

// ---- Database Pool ----
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'loopsolar',
    user: process.env.DB_USER || 'loopsolar',
    password: process.env.DB_PASSWORD || 'loopsolar_secure_2026',
    max: 20
});

// ---- Socket.io ----
const io = new SocketServer(httpServer, {
    cors: { origin: CORS_ORIGIN.split(','), methods: ['GET', 'POST'] }
});

// ---- MQTT Client (for config push & live relay) ----
let mqttClient;
function connectMqtt() {
    const broker = `mqtt://${process.env.MQTT_BROKER || 'localhost'}:${process.env.MQTT_PORT || 1883}`;
    mqttClient = mqtt.connect(broker, {
        username: process.env.MQTT_USER || 'ingestion',
        password: process.env.MQTT_PASSWORD || 'ingestion_secure_2026',
        clientId: `api-${Date.now()}`,
        reconnectPeriod: 5000
    });
    
    mqttClient.on('connect', () => {
        console.log('[MQTT] Connected');
        mqttClient.subscribe('loopsolar/+/telemetry');
        mqttClient.subscribe('loopsolar/+/status');
    });
    
    // Relay telemetry to WebSocket clients
    mqttClient.on('message', (topic, message) => {
        try {
            const data = JSON.parse(message.toString());
            const type = topic.split('/')[2];
            
            if (type === 'telemetry') {
                io.emit('telemetry:live', data);
            } else if (type === 'status') {
                io.emit('device:status', data);
            }
        } catch (e) { /* ignore parse errors */ }
    });
}

// ---- File Upload (for OTA firmware) ----
if (!fs.existsSync(FIRMWARE_DIR)) {
    fs.mkdirSync(FIRMWARE_DIR, { recursive: true });
}
const upload = multer({ dest: FIRMWARE_DIR, limits: { fileSize: 2 * 1024 * 1024 } });

// ============================================================
// ROUTES — Status
// ============================================================
app.get('/api/status', async (req, res) => {
    try {
        const dbResult = await pool.query('SELECT NOW() as time');
        res.json({
            status: 'ok',
            service: 'Loop Solar API',
            version: '1.0.0',
            time: dbResult.rows[0].time,
            mqtt: mqttClient?.connected || false
        });
    } catch (err) {
        res.status(503).json({ status: 'error', message: err.message });
    }
});

// ============================================================
// ROUTES — Plants
// ============================================================
app.get('/api/plants', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT p.*, 
                COUNT(DISTINCT g.id) as gateway_count,
                COUNT(DISTINCT d.id) as device_count
            FROM plants p
            LEFT JOIN gateways g ON g.plant_id = p.id
            LEFT JOIN devices d ON d.gateway_id = g.id
            GROUP BY p.id
            ORDER BY p.name
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/plants', async (req, res) => {
    try {
        const { name, location, capacity_kw, latitude, longitude } = req.body;
        const { rows } = await pool.query(
            `INSERT INTO plants (name, location, capacity_kw, latitude, longitude) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, location, capacity_kw, latitude, longitude]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/plants/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT p.*,
                (SELECT json_agg(g.*) FROM gateways g WHERE g.plant_id = p.id) as gateways,
                (SELECT json_agg(d.*) FROM devices d 
                 JOIN gateways g ON d.gateway_id = g.id 
                 WHERE g.plant_id = p.id) as devices
            FROM plants p WHERE p.id = $1
        `, [req.params.id]);
        
        if (rows.length === 0) return res.status(404).json({ error: 'Plant not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ROUTES — Gateways
// ============================================================
app.get('/api/gateways', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT g.*, p.name as plant_name,
                COUNT(d.id) as device_count
            FROM gateways g
            LEFT JOIN plants p ON g.plant_id = p.id
            LEFT JOIN devices d ON d.gateway_id = g.id
            GROUP BY g.id, p.name
            ORDER BY g.id
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/gateways', async (req, res) => {
    try {
        const { id, plant_id } = req.body;
        const { rows } = await pool.query(
            `INSERT INTO gateways (id, plant_id) VALUES ($1, $2) RETURNING *`,
            [id, plant_id]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/gateways/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT g.*, p.name as plant_name FROM gateways g 
             LEFT JOIN plants p ON g.plant_id = p.id WHERE g.id = $1`,
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Gateway not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Push config to gateway via MQTT
app.put('/api/gateways/:id/config', async (req, res) => {
    try {
        const gatewayId = req.params.id;
        const config = req.body;
        
        // Save to database
        await pool.query(
            `UPDATE gateways SET config = $2, updated_at = NOW() WHERE id = $1`,
            [gatewayId, JSON.stringify(config)]
        );
        
        // Push to gateway via MQTT
        if (mqttClient?.connected) {
            mqttClient.publish(`loopsolar/${gatewayId}/config`, JSON.stringify(config), { qos: 1 });
            res.json({ success: true, message: 'Config pushed to gateway' });
        } else {
            res.json({ success: true, message: 'Config saved, will push when gateway connects' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ROUTES — Devices
// ============================================================
app.get('/api/devices', async (req, res) => {
    try {
        const { gateway_id, plant_id, device_type } = req.query;
        let query = `SELECT d.*, g.plant_id FROM devices d LEFT JOIN gateways g ON d.gateway_id = g.id WHERE 1=1`;
        const params = [];
        
        if (gateway_id) { params.push(gateway_id); query += ` AND d.gateway_id = $${params.length}`; }
        if (plant_id) { params.push(plant_id); query += ` AND g.plant_id = $${params.length}`; }
        if (device_type) { params.push(device_type); query += ` AND d.device_type = $${params.length}`; }
        
        query += ' ORDER BY d.id';
        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/devices', async (req, res) => {
    try {
        const { id, gateway_id, device_type, template_name, slave_id, name } = req.body;
        const { rows } = await pool.query(
            `INSERT INTO devices (id, gateway_id, device_type, template_name, slave_id, name)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [id, gateway_id, device_type, template_name, slave_id, name]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ROUTES — Telemetry
// ============================================================

// Latest readings for a specific device
app.get('/api/devices/:id/readings', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT time, parameters FROM telemetry
            WHERE device_id = $1
            ORDER BY time DESC LIMIT 1
        `, [req.params.id]);
        
        res.json(rows[0] || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Historical data with time bucketing
app.get('/api/devices/:id/history', async (req, res) => {
    try {
        const { start, end, interval, param } = req.query;
        const bucket = interval || '5 minutes';
        const startTime = start || new Date(Date.now() - 24*60*60*1000).toISOString();
        const endTime = end || new Date().toISOString();
        const parameter = param || 'power_total';
        
        const { rows } = await pool.query(`
            SELECT 
                time_bucket($1::interval, time) AS time,
                AVG((parameters->>$4)::numeric) AS avg_value,
                MAX((parameters->>$4)::numeric) AS max_value,
                MIN((parameters->>$4)::numeric) AS min_value
            FROM telemetry
            WHERE device_id = $2 AND time >= $3::timestamptz AND time <= $5::timestamptz
            GROUP BY time_bucket($1::interval, time)
            ORDER BY time
        `, [bucket, req.params.id, startTime, parameter, endTime]);
        
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Latest readings for all devices in a plant
app.get('/api/telemetry/latest', async (req, res) => {
    try {
        const { plant_id } = req.query;
        
        const { rows } = await pool.query(`
            SELECT DISTINCT ON (device_id)
                device_id, gateway_id, plant_id, time, parameters
            FROM telemetry
            ${plant_id ? 'WHERE plant_id = $1' : ''}
            ORDER BY device_id, time DESC
        `, plant_id ? [plant_id] : []);
        
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Energy summary for a plant
app.get('/api/plants/:id/energy', async (req, res) => {
    try {
        const { period } = req.query; // 'day', 'week', 'month'
        let interval = '1 day';
        let lookback = '24 hours';
        
        if (period === 'week') { interval = '1 day'; lookback = '7 days'; }
        else if (period === 'month') { interval = '1 day'; lookback = '30 days'; }
        
        const { rows } = await pool.query(`
            SELECT 
                time_bucket($1::interval, time) AS time,
                SUM((parameters->>'power_total')::numeric) AS total_power,
                AVG((parameters->>'power_total')::numeric) AS avg_power
            FROM telemetry
            WHERE plant_id = $2 AND time >= NOW() - $3::interval
            GROUP BY time_bucket($1::interval, time)
            ORDER BY time
        `, [interval, req.params.id, lookback]);
        
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ROUTES — Alerts
// ============================================================
app.get('/api/alerts', async (req, res) => {
    try {
        const { plant_id, severity, acknowledged, limit: lim } = req.query;
        let query = 'SELECT * FROM alerts WHERE 1=1';
        const params = [];
        
        if (plant_id) { params.push(plant_id); query += ` AND plant_id = $${params.length}`; }
        if (severity) { params.push(severity); query += ` AND severity = $${params.length}`; }
        if (acknowledged !== undefined) { params.push(acknowledged === 'true'); query += ` AND acknowledged = $${params.length}`; }
        
        query += ' ORDER BY created_at DESC';
        params.push(parseInt(lim) || 100);
        query += ` LIMIT $${params.length}`;
        
        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/alerts/:id/acknowledge', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `UPDATE alerts SET acknowledged = true, acknowledged_at = NOW() WHERE id = $1 RETURNING *`,
            [req.params.id]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ROUTES — Alert Rules
// ============================================================
app.get('/api/alert-rules', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM alert_rules ORDER BY id');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/alert-rules', async (req, res) => {
    try {
        const { plant_id, device_type, parameter, condition, threshold, severity, message_template } = req.body;
        const { rows } = await pool.query(
            `INSERT INTO alert_rules (plant_id, device_type, parameter, condition, threshold, severity, message_template)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [plant_id, device_type, parameter, condition, threshold, severity, message_template]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/alert-rules/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM alert_rules WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ROUTES — Device Templates
// ============================================================
app.get('/api/templates', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM device_templates ORDER BY name');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/templates', async (req, res) => {
    try {
        const { name, device_type, description, register_map } = req.body;
        const { rows } = await pool.query(
            `INSERT INTO device_templates (name, device_type, description, register_map)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [name, device_type, description, JSON.stringify(register_map)]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/templates/:id', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM device_templates WHERE id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Template not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ROUTES — OTA Firmware Updates
// ============================================================

// Check for updates
app.get('/api/ota/check', async (req, res) => {
    try {
        const { gateway_id, version } = req.query;
        
        // Look for firmware files in firmware directory
        const files = fs.readdirSync(FIRMWARE_DIR)
            .filter(f => f.endsWith('.bin'))
            .sort()
            .reverse();
        
        if (files.length === 0) {
            return res.json({ update_available: false });
        }
        
        const latestFile = files[0];
        // Extract version from filename: firmware_v1.0.1.bin
        const match = latestFile.match(/firmware_v?([\d.]+)\.bin/);
        const latestVersion = match ? match[1] : '0.0.0';
        
        if (latestVersion === version) {
            return res.json({ update_available: false });
        }
        
        const stats = fs.statSync(path.join(FIRMWARE_DIR, latestFile));
        
        res.json({
            update_available: true,
            version: latestVersion,
            url: `${req.protocol}://${req.get('host')}/api/ota/firmware/${latestFile}`,
            size: stats.size
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Serve firmware binary
app.get('/api/ota/firmware/:filename', (req, res) => {
    const filePath = path.join(FIRMWARE_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Firmware not found' });
    }
    res.download(filePath);
});

// Upload new firmware
app.post('/api/ota/upload', upload.single('firmware'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        
        const version = req.body.version || '1.0.0';
        const newName = `firmware_v${version}.bin`;
        const newPath = path.join(FIRMWARE_DIR, newName);
        
        fs.renameSync(req.file.path, newPath);
        
        res.json({ 
            success: true, 
            filename: newName,
            size: req.file.size,
            version 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// Socket.io Connection Handler
// ============================================================
io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);
    
    socket.on('join:plant', (plantId) => {
        socket.join(`plant:${plantId}`);
        console.log(`[WS] ${socket.id} joined plant:${plantId}`);
    });
    
    socket.on('disconnect', () => {
        console.log(`[WS] Client disconnected: ${socket.id}`);
    });
});

// ============================================================
// Startup
// ============================================================
async function start() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║  Loop Solar — API Service            ║');
    console.log('╚══════════════════════════════════════╝');
    
    // Test DB connection
    try {
        const client = await pool.connect();
        const { rows } = await client.query('SELECT NOW() as time');
        client.release();
        console.log(`[DB] Connected, server time: ${rows[0].time}`);
    } catch (err) {
        console.error('[DB] Connection failed:', err.message);
    }
    
    // Connect MQTT 
    connectMqtt();
    
    // Start HTTP server
    httpServer.listen(PORT, () => {
        console.log(`[API] Listening on :${PORT}`);
        console.log(`[API] CORS origin: ${CORS_ORIGIN}`);
    });
}

start().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
});
