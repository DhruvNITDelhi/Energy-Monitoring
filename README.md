# Loop Solar — Solar Monitoring Platform

A scalable industrial IoT platform for monitoring solar plants. Collects data from RS485 Modbus devices (energy meters, inverters, weather stations) via ESP32 gateways, stores it in the cloud, and displays it on a real-time dashboard.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────────────┐     ┌─────────────┐
│  Field Devices  │────▶│  ESP32 Gateway   │────▶│     Cloud Backend       │────▶│  Dashboard  │
│  (RS485 Modbus) │     │  (Modbus Master) │MQTT │  (EMQX + TimescaleDB)   │ WS  │  (React)    │
└─────────────────┘     └──────────────────┘     └──────────────────────────┘     └─────────────┘
```

## Project Structure

| Directory | Description |
|-----------|-------------|
| `gateway/` | ESP32 firmware (PlatformIO) — Modbus RTU master, MQTT publisher |
| `cloud/` | Docker Compose backend — EMQX, TimescaleDB, ingestion, API, nginx |
| `dashboard/` | React + Vite frontend — real-time monitoring dashboard |
| `simulator/` | Python Modbus simulator for development |

## Quick Start

### 1. Cloud Backend
```bash
cd cloud
cp .env.example .env
# Edit .env with your credentials
docker compose up -d
```

### 2. Dashboard (Development)
```bash
cd dashboard
npm install
npm run dev
```

### 3. ESP32 Gateway
```bash
cd gateway
# Edit src/config.h with your WiFi/MQTT settings
# Flash via PlatformIO
pio run --target upload
```

### 4. Simulator (for testing without hardware)
```bash
cd simulator
pip install -r requirements.txt
python simulator.py
```

## Configuration

The platform uses a template-based device configuration system. Device templates define Modbus register maps, allowing the same gateway firmware to support any RS485 device. Templates are managed through the dashboard and pushed to gateways via MQTT.

## Deployment

- **Backend**: AWS EC2 with Docker Compose
- **Frontend**: Vercel (or self-hosted via nginx)
- **Gateway**: PlatformIO OTA or USB flash

## License

Proprietary — Loop Solar © 2026
