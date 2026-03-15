// ============================================================
// Loop Solar — MQTT Ingestion Service
// Subscribes to device telemetry/heartbeat, inserts into TimescaleDB
// ============================================================

const mqtt = require('mqtt');
const { Pool } = require('pg');
const http = require('http');

// ---- Configuration ----
const config = {
    mqtt: {
        broker: `mqtt://${process.env.MQTT_BROKER || 'localhost'}:${process.env.MQTT_PORT || 1883}`,
        username: process.env.MQTT_USER || 'ingestion',
        password: process.env.MQTT_PASSWORD || 'ingestion_secure_2026',
        topics: {
            telemetry: 'loopsolar/+/telemetry',
            heartbeat: 'loopsolar/+/heartbeat',
            status: 'loopsolar/+/status'
        }
    },
    db: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'loopsolar',
        user: process.env.DB_USER || 'loopsolar',
        password: process.env.DB_PASSWORD || 'loopsolar_secure_2026',
        max: 10,
        idleTimeoutMillis: 30000
    },
    batchSize: 100,
    batchIntervalMs: 5000
};

// ---- Database Pool ----
const pool = new Pool(config.db);
let dbReady = false;

pool.on('error', (err) => {
    console.error('[DB] Pool error:', err.message);
});

// ---- Telemetry Buffer (for batch inserts) ----
let telemetryBuffer = [];
let bufferTimer = null;

// ---- MQTT Client ----
let mqttClient = null;
let mqttConnected = false;

function connectMqtt() {
    console.log(`[MQTT] Connecting to ${config.mqtt.broker}...`);
    
    mqttClient = mqtt.connect(config.mqtt.broker, {
        username: config.mqtt.username,
        password: config.mqtt.password,
        clientId: `ingestion-${Date.now()}`,
        reconnectPeriod: 5000,
        clean: true
    });
    
    mqttClient.on('connect', () => {
        mqttConnected = true;
        console.log('[MQTT] Connected!');
        
        // Subscribe to topics
        const topics = Object.values(config.mqtt.topics);
        mqttClient.subscribe(topics, { qos: 1 }, (err) => {
            if (err) {
                console.error('[MQTT] Subscribe error:', err.message);
            } else {
                console.log(`[MQTT] Subscribed to: ${topics.join(', ')}`);
            }
        });
    });
    
    mqttClient.on('message', handleMessage);
    
    mqttClient.on('error', (err) => {
        console.error('[MQTT] Error:', err.message);
    });
    
    mqttClient.on('close', () => {
        mqttConnected = false;
        console.log('[MQTT] Disconnected');
    });
}

// ---- Message Handler ----
async function handleMessage(topic, message) {
    try {
        const payload = JSON.parse(message.toString());
        const topicParts = topic.split('/');
        const messageType = topicParts[2]; // telemetry, heartbeat, or status
        
        switch (messageType) {
            case 'telemetry':
                handleTelemetry(payload);
                break;
            case 'heartbeat':
                await handleHeartbeat(payload);
                break;
            case 'status':
                await handleStatus(payload);
                break;
            default:
                console.log(`[MSG] Unknown message type: ${messageType}`);
        }
    } catch (err) {
        console.error('[MSG] Parse error:', err.message);
    }
}

// ---- Telemetry Handler (batched) ----
function handleTelemetry(payload) {
    // Validate required fields
    if (!payload.device_id || !payload.parameters) {
        console.warn('[TEL] Invalid payload, missing device_id or parameters');
        return;
    }
    
    const entry = {
        time: payload.timestamp || new Date().toISOString(),
        device_id: payload.device_id,
        gateway_id: payload.gateway_id || 'unknown',
        plant_id: payload.plant_id || null,
        parameters: payload.parameters
    };
    
    telemetryBuffer.push(entry);
    
    // Flush if buffer is full
    if (telemetryBuffer.length >= config.batchSize) {
        flushTelemetryBuffer();
    }
}

// ---- Batch Insert ----
async function flushTelemetryBuffer() {
    if (telemetryBuffer.length === 0) return;
    
    const batch = telemetryBuffer.splice(0, config.batchSize);
    const count = batch.length;
    
    try {
        // Build batch insert query
        const values = [];
        const placeholders = [];
        let paramIdx = 1;
        
        for (const entry of batch) {
            placeholders.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, $${paramIdx+4})`);
            values.push(entry.time, entry.device_id, entry.gateway_id, entry.plant_id, JSON.stringify(entry.parameters));
            paramIdx += 5;
        }
        
        const query = `
            INSERT INTO telemetry (time, device_id, gateway_id, plant_id, parameters)
            VALUES ${placeholders.join(', ')}
        `;
        
        await pool.query(query, values);
        console.log(`[TEL] Inserted ${count} readings`);
        
        // Update device last_seen
        const deviceIds = [...new Set(batch.map(e => e.device_id))];
        for (const deviceId of deviceIds) {
            await pool.query(
                `UPDATE devices SET last_seen = NOW(), status = 'online' WHERE id = $1`,
                [deviceId]
            );
        }
        
        // Check alert rules
        for (const entry of batch) {
            await checkAlertRules(entry);
        }
        
    } catch (err) {
        console.error(`[TEL] Batch insert failed:`, err.message);
        // Re-queue failed entries
        telemetryBuffer.unshift(...batch);
    }
}

// ---- Heartbeat Handler ----
async function handleHeartbeat(payload) {
    if (!payload.gateway_id) return;
    
    try {
        await pool.query(`
            INSERT INTO gateways (id, firmware_version, last_seen, status, wifi_rssi)
            VALUES ($1, $2, NOW(), 'online', $3)
            ON CONFLICT (id) DO UPDATE SET
                firmware_version = EXCLUDED.firmware_version,
                last_seen = NOW(),
                status = 'online',
                wifi_rssi = EXCLUDED.wifi_rssi
        `, [payload.gateway_id, payload.firmware_version || 'unknown', payload.wifi_rssi || null]);
        
        console.log(`[HB] Gateway ${payload.gateway_id} heartbeat (uptime: ${payload.uptime_seconds}s, heap: ${payload.free_heap})`);
    } catch (err) {
        console.error(`[HB] Update failed:`, err.message);
    }
}

// ---- Status Handler ----
async function handleStatus(payload) {
    if (!payload.gateway_id) return;
    
    try {
        await pool.query(`
            UPDATE gateways SET status = $2, last_seen = NOW() WHERE id = $1
        `, [payload.gateway_id, payload.status || 'unknown']);
        
        console.log(`[STATUS] Gateway ${payload.gateway_id} → ${payload.status}`);
        
        // Create alert for offline gateways
        if (payload.status === 'offline') {
            await pool.query(`
                INSERT INTO alerts (device_id, gateway_id, alert_type, severity, message)
                VALUES ($1, $1, 'gateway_offline', 'critical', $2)
            `, [payload.gateway_id, `Gateway ${payload.gateway_id} went offline`]);
        }
    } catch (err) {
        console.error(`[STATUS] Update failed:`, err.message);
    }
}

// ---- Alert Rule Checker ----
async function checkAlertRules(entry) {
    try {
        const { rows: rules } = await pool.query(
            `SELECT * FROM alert_rules WHERE enabled = true AND ($1::uuid IS NULL OR plant_id IS NULL OR plant_id = $1::uuid)`,
            [entry.plant_id]
        );
        
        for (const rule of rules) {
            const paramValue = parseFloat(entry.parameters[rule.parameter]);
            if (isNaN(paramValue)) continue;
            
            let triggered = false;
            switch (rule.condition) {
                case '>':  triggered = paramValue > rule.threshold; break;
                case '<':  triggered = paramValue < rule.threshold; break;
                case '>=': triggered = paramValue >= rule.threshold; break;
                case '<=': triggered = paramValue <= rule.threshold; break;
                case '==': triggered = paramValue == rule.threshold; break;
            }
            
            if (triggered) {
                const message = (rule.message_template || `${rule.parameter} ${rule.condition} ${rule.threshold}`)
                    .replace('{value}', paramValue)
                    .replace('{threshold}', rule.threshold)
                    .replace('{device}', entry.device_id);
                
                await pool.query(`
                    INSERT INTO alerts (plant_id, device_id, gateway_id, alert_type, severity, message, value, threshold)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [entry.plant_id, entry.device_id, entry.gateway_id, 
                    `${rule.parameter}_${rule.condition}`, rule.severity,
                    message, paramValue, rule.threshold]);
                
                console.log(`[ALERT] ${rule.severity}: ${message}`);
            }
        }
    } catch (err) {
        // Don't crash on alert check failures
        if (!err.message.includes('invalid input syntax')) {
            console.error('[ALERT] Rule check error:', err.message);
        }
    }
}

// ---- Health Check Server ----
const healthServer = http.createServer((req, res) => {
    if (req.url === '/health') {
        const healthy = mqttConnected && dbReady;
        res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: healthy ? 'ok' : 'unhealthy',
            mqtt: mqttConnected ? 'connected' : 'disconnected',
            db: dbReady ? 'connected' : 'disconnected',
            buffer: telemetryBuffer.length
        }));
    } else {
        res.writeHead(404);
        res.end();
    }
});

// ---- Startup ----
async function start() {
    console.log('╔══════════════════════════════════════╗');
    console.log('║  Loop Solar — Ingestion Service      ║');
    console.log('╚══════════════════════════════════════╝');
    
    // Test DB connection
    try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        dbReady = true;
        console.log('[DB] Connected to TimescaleDB');
    } catch (err) {
        console.error('[DB] Connection failed:', err.message);
        console.log('[DB] Will retry via pool...');
    }
    
    // Connect MQTT
    connectMqtt();
    
    // Start batch flush timer
    bufferTimer = setInterval(() => flushTelemetryBuffer(), config.batchIntervalMs);
    
    // Start health server
    healthServer.listen(3002, () => {
        console.log('[HEALTH] Health check on :3002/health');
    });
}

// ---- Graceful Shutdown ----
async function shutdown(signal) {
    console.log(`\n[MAIN] ${signal} received, shutting down...`);
    
    // Flush remaining buffer
    await flushTelemetryBuffer();
    
    if (bufferTimer) clearInterval(bufferTimer);
    if (mqttClient) mqttClient.end(true);
    
    healthServer.close();
    await pool.end();
    
    console.log('[MAIN] Shutdown complete');
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch(err => {
    console.error('[MAIN] Fatal:', err);
    process.exit(1);
});
