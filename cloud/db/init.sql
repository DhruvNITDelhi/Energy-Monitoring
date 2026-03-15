-- ============================================================
-- Loop Solar — TimescaleDB Schema
-- Runs on first container start via docker-entrypoint-initdb.d
-- ============================================================

-- Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================================
-- PLANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS plants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    capacity_kw DECIMAL(10,2),
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- GATEWAYS
-- ============================================================
CREATE TABLE IF NOT EXISTS gateways (
    id VARCHAR(64) PRIMARY KEY,
    plant_id UUID REFERENCES plants(id) ON DELETE SET NULL,
    firmware_version VARCHAR(32),
    last_seen TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'offline',
    ip_address VARCHAR(45),
    wifi_rssi INTEGER,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DEVICES
-- ============================================================
CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    gateway_id VARCHAR(64) REFERENCES gateways(id) ON DELETE CASCADE,
    device_type VARCHAR(50) NOT NULL,
    template_name VARCHAR(100),
    slave_id INTEGER NOT NULL,
    name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'offline',
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TELEMETRY (Hypertable)
-- ============================================================
CREATE TABLE IF NOT EXISTS telemetry (
    time TIMESTAMPTZ NOT NULL,
    device_id VARCHAR(64) NOT NULL,
    gateway_id VARCHAR(64) NOT NULL,
    plant_id UUID,
    parameters JSONB NOT NULL
);

SELECT create_hypertable('telemetry', 'time', if_not_exists => TRUE);

-- Index for device-specific queries
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time 
    ON telemetry (device_id, time DESC);

-- Index for plant-wide queries
CREATE INDEX IF NOT EXISTS idx_telemetry_plant_time 
    ON telemetry (plant_id, time DESC);

-- ============================================================
-- ALERTS
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    plant_id UUID REFERENCES plants(id) ON DELETE CASCADE,
    device_id VARCHAR(64),
    gateway_id VARCHAR(64),
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'warning',
    message TEXT NOT NULL,
    value DECIMAL(15,4),
    threshold DECIMAL(15,4),
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_plant 
    ON alerts (plant_id, created_at DESC);

-- ============================================================
-- ALERT RULES
-- ============================================================
CREATE TABLE IF NOT EXISTS alert_rules (
    id SERIAL PRIMARY KEY,
    plant_id UUID REFERENCES plants(id) ON DELETE CASCADE,
    device_type VARCHAR(50),
    parameter VARCHAR(100) NOT NULL,
    condition VARCHAR(10) NOT NULL,
    threshold DECIMAL(15,4) NOT NULL,
    severity VARCHAR(20) DEFAULT 'warning',
    message_template TEXT,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DEVICE TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS device_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    device_type VARCHAR(50) NOT NULL,
    description TEXT,
    register_map JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CONTINUOUS AGGREGATES
-- ============================================================

-- Hourly aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_hourly
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', time) AS bucket,
    device_id,
    plant_id,
    AVG((parameters->>'power_total')::numeric) AS avg_power,
    MAX((parameters->>'power_total')::numeric) AS max_power,
    MIN((parameters->>'power_total')::numeric) AS min_power,
    AVG((parameters->>'voltage_r')::numeric) AS avg_voltage_r,
    AVG((parameters->>'voltage_y')::numeric) AS avg_voltage_y,
    AVG((parameters->>'voltage_b')::numeric) AS avg_voltage_b,
    AVG((parameters->>'current_r')::numeric) AS avg_current_r,
    AVG((parameters->>'pf_total')::numeric) AS avg_pf,
    AVG((parameters->>'frequency')::numeric) AS avg_frequency,
    MAX((parameters->>'energy_import')::numeric) AS max_energy_import
FROM telemetry
GROUP BY bucket, device_id, plant_id
WITH NO DATA;

-- Daily aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_daily
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 day', time) AS bucket,
    device_id,
    plant_id,
    AVG((parameters->>'power_total')::numeric) AS avg_power,
    MAX((parameters->>'power_total')::numeric) AS max_power,
    MAX((parameters->>'energy_import')::numeric) AS max_energy_import,
    MIN((parameters->>'energy_import')::numeric) AS min_energy_import
FROM telemetry
GROUP BY bucket, device_id, plant_id
WITH NO DATA;

-- ============================================================
-- COMPRESSION & RETENTION POLICIES
-- ============================================================
SELECT add_compression_policy('telemetry', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('telemetry', INTERVAL '365 days', if_not_exists => TRUE);

-- Refresh continuous aggregates
SELECT add_continuous_aggregate_policy('telemetry_hourly',
    start_offset => INTERVAL '3 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('telemetry_daily',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day',
    if_not_exists => TRUE);

-- ============================================================
-- SEED: Built-in device templates
-- ============================================================
INSERT INTO device_templates (name, device_type, description, register_map) VALUES
(
    'secure_elite_440',
    'energy_meter',
    'Secure Elite 440 Three-Phase Energy Meter',
    '[
        {"address": 3027, "data_type": 2, "param_name": "voltage_r", "scale_factor": 1.0, "register_count": 2, "unit": "V"},
        {"address": 3029, "data_type": 2, "param_name": "voltage_y", "scale_factor": 1.0, "register_count": 2, "unit": "V"},
        {"address": 3031, "data_type": 2, "param_name": "voltage_b", "scale_factor": 1.0, "register_count": 2, "unit": "V"},
        {"address": 3009, "data_type": 2, "param_name": "current_r", "scale_factor": 1.0, "register_count": 2, "unit": "A"},
        {"address": 3011, "data_type": 2, "param_name": "current_y", "scale_factor": 1.0, "register_count": 2, "unit": "A"},
        {"address": 3013, "data_type": 2, "param_name": "current_b", "scale_factor": 1.0, "register_count": 2, "unit": "A"},
        {"address": 3053, "data_type": 2, "param_name": "power_total", "scale_factor": 1.0, "register_count": 2, "unit": "kW"},
        {"address": 3059, "data_type": 2, "param_name": "reactive_power", "scale_factor": 1.0, "register_count": 2, "unit": "kVAR"},
        {"address": 3065, "data_type": 2, "param_name": "apparent_power", "scale_factor": 1.0, "register_count": 2, "unit": "kVA"},
        {"address": 3083, "data_type": 2, "param_name": "pf_total", "scale_factor": 1.0, "register_count": 2, "unit": ""},
        {"address": 3109, "data_type": 2, "param_name": "frequency", "scale_factor": 1.0, "register_count": 2, "unit": "Hz"},
        {"address": 3203, "data_type": 2, "param_name": "energy_import", "scale_factor": 1.0, "register_count": 2, "unit": "kWh"},
        {"address": 3207, "data_type": 2, "param_name": "energy_export", "scale_factor": 1.0, "register_count": 2, "unit": "kWh"},
        {"address": 3421, "data_type": 2, "param_name": "thd_voltage_r", "scale_factor": 1.0, "register_count": 2, "unit": "%"},
        {"address": 3423, "data_type": 2, "param_name": "thd_voltage_y", "scale_factor": 1.0, "register_count": 2, "unit": "%"},
        {"address": 3425, "data_type": 2, "param_name": "thd_voltage_b", "scale_factor": 1.0, "register_count": 2, "unit": "%"}
    ]'::jsonb
),
(
    'generic_inverter',
    'inverter',
    'Generic Solar Inverter (Modbus RTU)',
    '[
        {"address": 0, "data_type": 5, "param_name": "status_code", "scale_factor": 1.0, "register_count": 1, "unit": ""},
        {"address": 1, "data_type": 2, "param_name": "dc_voltage", "scale_factor": 0.1, "register_count": 2, "unit": "V"},
        {"address": 3, "data_type": 2, "param_name": "dc_current", "scale_factor": 0.01, "register_count": 2, "unit": "A"},
        {"address": 5, "data_type": 2, "param_name": "dc_power", "scale_factor": 1.0, "register_count": 2, "unit": "W"},
        {"address": 7, "data_type": 2, "param_name": "ac_voltage", "scale_factor": 0.1, "register_count": 2, "unit": "V"},
        {"address": 9, "data_type": 2, "param_name": "ac_current", "scale_factor": 0.01, "register_count": 2, "unit": "A"},
        {"address": 11, "data_type": 2, "param_name": "ac_power", "scale_factor": 1.0, "register_count": 2, "unit": "W"},
        {"address": 13, "data_type": 2, "param_name": "ac_frequency", "scale_factor": 0.01, "register_count": 2, "unit": "Hz"},
        {"address": 15, "data_type": 2, "param_name": "energy_today", "scale_factor": 0.01, "register_count": 2, "unit": "kWh"},
        {"address": 17, "data_type": 2, "param_name": "energy_total", "scale_factor": 0.1, "register_count": 2, "unit": "kWh"},
        {"address": 19, "data_type": 2, "param_name": "temperature", "scale_factor": 0.1, "register_count": 2, "unit": "°C"}
    ]'::jsonb
),
(
    'weather_station',
    'weather',
    'Solar Weather Station (Irradiance, Temperature, Wind)',
    '[
        {"address": 0, "data_type": 2, "param_name": "irradiance", "scale_factor": 1.0, "register_count": 2, "unit": "W/m²"},
        {"address": 2, "data_type": 2, "param_name": "ambient_temp", "scale_factor": 0.1, "register_count": 2, "unit": "°C"},
        {"address": 4, "data_type": 2, "param_name": "module_temp", "scale_factor": 0.1, "register_count": 2, "unit": "°C"},
        {"address": 6, "data_type": 2, "param_name": "wind_speed", "scale_factor": 0.1, "register_count": 2, "unit": "m/s"},
        {"address": 8, "data_type": 2, "param_name": "humidity", "scale_factor": 0.1, "register_count": 2, "unit": "%"}
    ]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- SEED: Default plant (for testing)
-- ============================================================
INSERT INTO plants (id, name, location, capacity_kw) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Demo Solar Plant', 'Mumbai, India', 100.0)
ON CONFLICT (id) DO NOTHING;
