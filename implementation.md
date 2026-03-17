# Loop Solar — Complete Deployment Guide

Step-by-step instructions to deploy the entire Loop Solar monitoring platform from scratch. Follow in order.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [AWS EC2 Setup](#2-aws-ec2-setup)
3. [Server Configuration](#3-server-configuration)
4. [Deploy Cloud Backend](#4-deploy-cloud-backend)
5. [Configure EMQX MQTT](#5-configure-emqx-mqtt)
6. [Verify Cloud Services](#6-verify-cloud-services)
7. [Deploy Dashboard to Vercel](#7-deploy-dashboard-to-vercel)
8. [Flash ESP32 Gateway](#8-flash-esp32-gateway)
9. [Register Devices in Dashboard](#9-register-devices-in-dashboard)
10. [End-to-End Test](#10-end-to-end-test)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

**On your local Windows PC, install these tools:**

### 1.1 Install Node.js (for dashboard)
- Download from https://nodejs.org/ (LTS version)
- Verify:
```
node --version
npm --version
```

### 1.2 Install Git
- Download from https://git-scm.com/download/win
- Verify:
```
git --version
```

### 1.3 Install PlatformIO (for ESP32 firmware)
- Install VS Code: https://code.visualstudio.com/
- Inside VS Code, go to Extensions → Search "PlatformIO IDE" → Install
- Restart VS Code after installation

### 1.4 Install PuTTY or use PowerShell SSH
- PuTTY: https://www.putty.org/ (optional, PowerShell has SSH built-in)

### 1.5 Hardware Required
- ESP32 DevKit board
- MAX485 or similar RS485-to-TTL converter
- USB cable (micro-USB or USB-C depending on your ESP32)
- RS485 device (Secure Elite 440 meter or other Modbus device)
- Two-core wire for RS485 bus (A and B lines)

---

## 2. AWS EC2 Setup

### 2.1 Launch EC2 Instance

1. Log in to AWS Console: https://console.aws.amazon.com/
2. Go to **EC2** → **Launch Instance**
3. Configure:
   - **Name**: `loopsolar-server`
   - **AMI**: Ubuntu Server 22.04 LTS (Free tier eligible)
   - **Instance type**: `t2.micro` (Free tier — 1 vCPU, 1 GB RAM)
   - **Key pair**: Create a new key pair → Name it `loopsolar-key` → Download the `.pem` file → **Save it safely** (you cannot download it again)
   - **Network settings**: Click "Edit"
     - Allow SSH traffic (port 22) ✅
     - Allow HTTP traffic (port 80) ✅
     - Allow HTTPS traffic (port 443) ✅
   - **Storage**: 30 GB gp3 (Free tier allows up to 30 GB)
4. Click **Launch Instance**

### 2.2 Configure Security Group — Open Required Ports

1. Go to **EC2** → **Security Groups**
2. Find the security group attached to your instance
3. Click **Edit inbound rules** → Add these rules:

| Type | Port Range | Source | Purpose |
|------|-----------|--------|---------|
| SSH | 22 | My IP | SSH access |
| HTTP | 80 | Anywhere (0.0.0.0/0) | Nginx |
| HTTPS | 443 | Anywhere (0.0.0.0/0) | Nginx SSL |
| Custom TCP | 1883 | Anywhere (0.0.0.0/0) | MQTT (ESP32 devices) |
| Custom TCP | 3001 | Anywhere (0.0.0.0/0) | API direct access |
| Custom TCP | 8083 | Anywhere (0.0.0.0/0) | MQTT WebSocket |
| Custom TCP | 18083 | My IP | EMQX Dashboard (admin only) |

4. Click **Save rules**

### 2.3 Allocate Elastic IP (Static IP)

1. Go to **EC2** → **Elastic IPs** → **Allocate Elastic IP address**
2. Click **Allocate**
3. Select the new IP → **Actions** → **Associate Elastic IP address**
4. Select your `loopsolar-server` instance → **Associate**
5. Note your Elastic IP: `65.0.220.190` (your IP)

---

## 3. Server Configuration

### 3.1 SSH into the Server

Open PowerShell (or PuTTY) on your Windows PC:

```powershell
# Navigate to where your .pem key is saved
cd C:\Users\Lenovo\Downloads

# Set permissions (PowerShell)
icacls loopsolar-key.pem /inheritance:r /grant:r "%USERNAME%:R"

# Connect via SSH
ssh -i energy-monitor-key.pem ubuntu@65.0.220.190
```

> If using PuTTY, convert .pem to .ppk using PuTTYgen first.

### 3.2 Update the Server

```bash
sudo apt update && sudo apt upgrade -y
```

### 3.3 Add Swap Space (Critical for t2.micro)

The t2.micro has only 1 GB RAM. EMQX + TimescaleDB need more. We add 2 GB swap:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make swap permanent (persists after reboot)
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify swap is active
free -h
```

You should see `Swap: 2.0G` in the output.

### 3.4 Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Add your user to docker group (so you don't need sudo)
sudo usermod -aG docker ubuntu

# Log out and back in for group change to take effect
exit
```

SSH back in:
```powershell
ssh -i energy-monitor-key.pem ubuntu@65.0.220.190
```

Verify Docker:
```bash
docker --version
docker compose version
```

### 3.5 Install Docker Compose Plugin (if not included)

```bash
sudo apt install docker-compose-plugin -y
```

---

## 4. Deploy Cloud Backend

### 4.1 Upload Project Files to Server

**Option A — Using SCP (from your Windows PowerShell):**

```powershell
# From your local PC, upload the cloud directory
scp -i C:\Users\Lenovo\Downloads\loopsolar-key.pem -r "C:\Users\Lenovo\OneDrive\Desktop\New folder3\cloud" ubuntu@65.0.220.190:/home/ubuntu/loopsolar/
```

**Option B — Using Git (recommended):**

If your project is in a Git repository:
```bash
# On the server
cd /home/ubuntu
git clone https://github.com/YOUR_USERNAME/loop-solar.git loopsolar
cd loopsolar
```

**Option C — Using FileZilla (GUI):**
1. Download FileZilla: https://filezilla-project.org/
2. Go to **Edit** → **Settings** → **SFTP** → Add your `.pem` key file
3. Connect to `sftp://ubuntu@65.0.220.190`
4. Upload the `cloud/` folder to `/home/ubuntu/loopsolar/`

### 4.2 Create Environment File

```bash
cd /home/ubuntu/Energy-Monitoring/cloud

# Copy the example env file
cp .env.example .env

# Edit with your real passwords
nano .env
```

Set these values in the `.env` file:

```env
# Database
DB_NAME=loopsolar
DB_USER=loopsolar
DB_PASSWORD=YourStrongDBPassword123!

# MQTT credentials
MQTT_INGESTION_USER=ingestion
MQTT_INGESTION_PASS=YourIngestionPassword456!
MQTT_DEVICE_USER=device
MQTT_DEVICE_PASS=YourDevicePassword789!

# API
JWT_SECRET=YourJWTSecretAtLeast32CharsLong!!

# Frontend URL (update after Vercel deployment)
CORS_ORIGIN=http://65.0.220.190,http://localhost:5173

# Environment
NODE_ENV=production
```

Save and exit: `Ctrl+X`, then `Y`, then `Enter`.

### 4.3 Build and Start All Services

```bash
cd /home/ubuntu/Energy-Monitoring/cloud

# Build the Docker images
docker compose build

# Start all services in background
docker compose up -d
```

This will start 5 containers:
- `loopsolar-emqx` — MQTT broker
- `loopsolar-tsdb` — TimescaleDB (PostgreSQL + time series)
- `loopsolar-ingestion` — MQTT → Database ingestion
- `loopsolar-api` — REST API + WebSocket
- `loopsolar-nginx` — Reverse proxy

### 4.4 Check All Containers Are Running

```bash
docker compose ps
```

Expected output — all should show `Up` and `healthy`:

```
NAME                    STATUS                  PORTS
loopsolar-api           Up (healthy)            0.0.0.0:3001->3001/tcp
loopsolar-emqx          Up (healthy)            0.0.0.0:1883->1883/tcp, ...
loopsolar-ingestion     Up (healthy)
loopsolar-nginx         Up                      0.0.0.0:80->80/tcp
loopsolar-tsdb          Up (healthy)            0.0.0.0:5432->5432/tcp
```

### 4.5 Check Logs If Something Fails

```bash
# View all logs
docker compose logs

# View logs for a specific service
docker compose logs api
docker compose logs ingestion
docker compose logs timescaledb
docker compose logs emqx

# Follow logs in real-time
docker compose logs -f api
```

### 4.6 Common Fixes

**If TimescaleDB won't start:**
```bash
# Check disk space
df -h
# Clear old Docker data
docker system prune -f
```

**If ingestion fails to connect:**
```bash
# Wait for TimescaleDB to be fully ready, then restart
docker compose restart ingestion
```

**If EMQX uses too much memory:**
```bash
# Check memory
free -h
# If swap is not active, re-run the swap setup from step 3.3
```

---

## 5. Configure EMQX MQTT

### 5.1 Access EMQX Dashboard

Open your browser and go to:

```
http://65.0.220.190:18083
```

Login credentials (from emqx.conf):
- **Username**: `dhruv`
- **Password**: `dhruv1234`

### 5.2 Create MQTT Users

1. In EMQX Dashboard, go to **Access Control** → **Authentication**
2. If no authenticator exists, click **Create** → **Built-in Database** → **Username** → **Create**
3. Go to **Access Control** → **Authentication** → Click the authenticator → **Users** tab
4. Click **Add** and create these users:

| Username | Password | Purpose |
|----------|----------|---------|
| `device` | `YourDevicePassword789!` | ESP32 gateways |
| `ingestion` | `YourIngestionPassword456!` | Ingestion service |

> ⚠️ **Important**: The passwords here MUST match what you set in the `.env` file and in the ESP32 `config.h`.

### 5.3 Test MQTT Connection

From the server:
```bash
# Install mosquitto client for testing
sudo apt install mosquitto-clients -y

# Test publishing
mosquitto_pub -h localhost -p 1883 -u "device" -P "YourDevicePassword789!" -t "test/hello" -m "Hello Loop Solar"

# Test subscribing (in another terminal)
mosquitto_sub -h localhost -p 1883 -u "ingestion" -P "YourIngestionPassword456!" -t "test/#"
```

If the subscriber receives the message, MQTT is working correctly.

---

## 6. Verify Cloud Services

### 6.1 Test API

From your browser or from the server:

```bash
curl http://65.0.220.190:3001/api/status
```

Expected response:
```json
{
  "status": "ok",
  "service": "Loop Solar API",
  "version": "1.0.0",
  "time": "2026-03-17T...",
  "mqtt": true
}
```

### 6.2 Test via Nginx

```bash
curl http://65.0.220.190/api/status
```

Should return the same response (routed through Nginx).

### 6.3 Check Database

```bash
docker exec -it loopsolar-tsdb psql -U loopsolar -d loopsolar -c "\dt"
```

Expected — you should see these tables:
```
 alerts
 alert_rules
 device_templates
 devices
 gateways
 plants
 telemetry
```

### 6.4 Verify Templates Were Seeded

```bash
docker exec -it loopsolar-tsdb psql -U loopsolar -d loopsolar -c "SELECT name, device_type FROM device_templates;"
```

Expected:
```
        name        | device_type
--------------------+-------------
 secure_elite_440   | energy_meter
 generic_inverter   | inverter
 weather_station    | weather
```

---

## 7. Deploy Dashboard to Vercel

### 7.1 Install Vercel CLI

On your local Windows PC:
```powershell
npm install -g vercel
```

### 7.2 Configure API URL

Create a `.env.production` file in the dashboard directory:

```powershell
cd "C:\Users\Lenovo\OneDrive\Desktop\New folder3\dashboard"
```

Create file `dashboard/.env.production`:
```env
VITE_API_URL=http://65.0.220.190
VITE_SOCKET_URL=http://65.0.220.190
```

### 7.3 Build the Dashboard

```powershell
cd "C:\Users\Lenovo\OneDrive\Desktop\New folder3\dashboard"
npm install
npm run build
```

### 7.4 Deploy to Vercel

```powershell
cd "C:\Users\Lenovo\OneDrive\Desktop\New folder3\dashboard"
vercel login
vercel --prod
```

When prompted:
- **Set up and deploy?** Yes
- **Which scope?** Select your account
- **Link to existing project?** No
- **Project name?** `loopsolar-dashboard`
- **Directory with code?** `./`
- **Override settings?** No

After deployment, Vercel will give you a URL like: `https://loopsolar-dashboard.vercel.app`

### 7.5 Update CORS in Backend

SSH back into your server and update the `.env`:

```bash
ssh -i loopsolar-key.pem ubuntu@65.0.220.190
cd /home/ubuntu/loopsolar/cloud
nano .env
```

Update the `CORS_ORIGIN` line:
```env
CORS_ORIGIN=https://loopsolar-dashboard.vercel.app,http://65.0.220.190,http://localhost:5173
```

Restart the API:
```bash
docker compose restart api
```

### 7.6 Access Dashboard

Open your browser:
```
https://loopsolar-dashboard.vercel.app
```

You should see the Loop Solar dashboard with the dark theme and solar-orange accents.

---

## 8. Flash ESP32 Gateway

### 8.1 Hardware Wiring

Connect the ESP32 to the MAX485 module:

| ESP32 Pin | MAX485 Pin | Description |
|-----------|-----------|-------------|
| GPIO 16 | RO | RS485 Receive Data |
| GPIO 17 | DI | RS485 Transmit Data |
| GPIO 4 | DE + RE (tied together) | Direction Control |
| 3.3V | VCC | Power |
| GND | GND | Ground |

Connect the MAX485 to your RS485 device:

| MAX485 Pin | RS485 Bus |
|-----------|-----------|
| A | A (Data+) |
| B | B (Data-) |

> ⚠️ Make sure A goes to A and B goes to B. Swapping them will cause communication failure.

### 8.2 Update ESP32 Configuration

Open `gateway/src/config.h` in VS Code and verify these settings:

```cpp
// WiFi — already updated by you
#define WIFI_SSID           "Dhruv's Galaxy"
#define WIFI_PASSWORD       "87654321"

// MQTT — already updated by you
#define MQTT_BROKER         "65.0.220.190"
#define MQTT_PORT           1883
#define MQTT_USER           "device"
#define MQTT_PASSWORD       "YourDevicePassword789!"  // ← Update this to match EMQX user

// Gateway Identity
#define GATEWAY_ID          "GW-001"
#define PLANT_ID            "00000000-0000-0000-0000-000000000001"  // ← Demo plant UUID from init.sql
```

> ⚠️ **Critical**: `MQTT_PASSWORD` must match the password you created for the `device` user in EMQX (Step 5.2).

### 8.3 Update Device Configuration

Edit `gateway/data/config.json` to match your RS485 setup:

```json
{
    "gateway_id": "GW-001",
    "plant_id": "00000000-0000-0000-0000-000000000001",
    "poll_interval_ms": 10000,
    "devices": [
        {
            "device_id": "EM-001",
            "device_type": "energy_meter",
            "template": "secure_elite_440",
            "slave_id": 1
        }
    ]
}
```

- Change `slave_id` to match your meter's Modbus address (usually 1 by default)
- Add more devices if you have inverters connected

### 8.4 Flash the Firmware

1. Connect ESP32 to your PC via USB cable
2. Open VS Code → Open the `gateway/` folder
3. PlatformIO should detect the project automatically
4. Click the **PlatformIO** icon in the sidebar → Select your COM port:
   - Go to **Project Tasks** → **esp32** → **General** → **Upload**
   - Or press `Ctrl+Alt+U`
   
Alternatively, from the command line:
```powershell
cd "C:\Users\Lenovo\OneDrive\Desktop\New folder3\gateway"
# If PlatformIO CLI is in PATH:
pio run --target upload
```

### 8.5 Upload SPIFFS Data (config.json)

This uploads the `data/config.json` to the ESP32's SPIFFS filesystem:

In PlatformIO sidebar:
- **Project Tasks** → **esp32** → **Platform** → **Upload Filesystem Image**

Or via command line:
```powershell
pio run --target uploadfs
```

### 8.6 Monitor Serial Output

Open Serial Monitor to verify the ESP32 boots correctly:

In PlatformIO sidebar:
- **Project Tasks** → **esp32** → **General** → **Monitor**

Or via command line:
```powershell
pio device monitor --baud 115200
```

Expected output:
```
╔══════════════════════════════════════╗
║   Loop Solar — ESP32 Gateway         ║
║   Firmware v1.0.0                    ║
╚══════════════════════════════════════╝

[Profile] Loading config from SPIFFS...
[Profile] Loaded 1 device(s), poll interval: 10000ms
[Modbus] Master initialized on Serial2
[Buffer] Initialized, 0 entries in buffer
[WiFi] Connecting to Dhruv's Galaxy.......
[WiFi] Connected! IP: 192.168.x.x, RSSI: -45 dBm
[NTP] Time synchronized: 2026-03-17 23:15:00
[MQTT] Configured for 65.0.220.190:1883
[MQTT] Connecting to 65.0.220.190:1883 as loopsolar-GW-001...
[MQTT] Connected!
[MQTT] Subscribed to loopsolar/GW-001/config
[MAIN] Setup complete. Gateway: GW-001, Plant: 00000000-..., Devices: 1
[MAIN] Entering main loop...

[POLL] ── Polling 1 device(s) ──
[POLL] Device: EM-001 (slave 1, template: secure_elite_440)
[MQTT] Published telemetry for EM-001 (423 bytes)
[POLL] ── Poll cycle complete ──
```

If you see `[MQTT] Connected!` and `Published telemetry`, your gateway is working!

---

## 9. Register Devices in Dashboard

### 9.1 Open Dashboard

Go to your dashboard URL (Vercel or direct):
```
https://loopsolar-dashboard.vercel.app
```

### 9.2 Add a Plant (if not using demo plant)

1. Go to **Settings** (⚙️ in sidebar)
2. Click **Add Plant**
3. Fill in:
   - Name: `My Solar Plant`
   - Location: `Your City, India`
   - Capacity: `100` (kW)
4. Click **Add**

### 9.3 Register Gateway

1. Go to **Device Management** (🖥️ in sidebar)
2. Click **Add Gateway**
3. Fill in:
   - Gateway ID: `GW-001` (must match config.h)
   - Plant: Select your plant
4. Click **Add**

### 9.4 Register Device

1. Still on Device Management, click **Add Device**
2. Fill in:
   - Device ID: `EM-001` (must match config.json)
   - Gateway: `GW-001`
   - Name: `Main Energy Meter`
   - Type: `Energy Meter`
   - Template: `secure_elite_440`
   - Slave ID: `1`
3. Click **Add**

### 9.5 Push Config (Optional)

If you change the device list from the dashboard, click **Push Config** on the gateway row. This sends the updated configuration to the ESP32 via MQTT — no reflashing needed!

---

## 10. End-to-End Test

### 10.1 Verify Data Flow

After the ESP32 is running and connected:

1. **Check MQTT**: On the server, subscribe to see live messages:
   ```bash
   mosquitto_sub -h localhost -p 1883 -u "ingestion" -P "YourIngestionPassword456!" -t "loopsolar/#" -v
   ```
   You should see telemetry JSON every 10 seconds.

2. **Check Database**: Verify data is being stored:
   ```bash
   docker exec -it loopsolar-tsdb psql -U loopsolar -d loopsolar \
     -c "SELECT time, device_id, parameters FROM telemetry ORDER BY time DESC LIMIT 3;"
   ```

3. **Check API**: Get latest readings:
   ```bash
   curl http://65.0.220.190/api/telemetry/latest
   ```

4. **Check Dashboard**: Open the dashboard — you should see:
   - Plant Overview: plant card with live power data
   - Click into the plant: per-device parameter grids updating in real-time
   - Click a device: historical charts

### 10.2 Test Alert Rules

1. Go to **Settings** → **Alert Rules** → **Add Rule**
2. Create a test rule:
   - Parameter: `voltage_r`
   - Condition: `>`
   - Threshold: `250`
   - Severity: `warning`
3. If voltage exceeds 250V, an alert will appear on the **Alerts** page

---

## 11. Troubleshooting

### ESP32 won't connect to WiFi
- Check SSID and password in `config.h` (case-sensitive)
- Ensure ESP32 is within WiFi range
- The ESP32 only supports **2.4 GHz WiFi** (not 5 GHz)

### ESP32 connects to WiFi but MQTT fails
- Check that port 1883 is open in AWS Security Group
- Verify MQTT_BROKER IP is correct in `config.h`
- Verify MQTT username/password matches EMQX user
- Test from your PC: `mosquitto_pub -h 65.0.220.190 -p 1883 -u device -P "password" -t test -m hello`

### Modbus reads fail (all zeros)
- Check RS485 wiring: A→A, B→B, GND→GND
- Verify slave ID matches the meter's configured address
- Ensure baud rate matches (default: 9600, 8N1)
- Check MAX485 module is properly powered (3.3V)
- Add a 120Ω termination resistor between A and B at both ends of the bus

### Dashboard shows no data
- Check that API is reachable: `curl http://65.0.220.190/api/status`
- Check CORS_ORIGIN in `.env` includes your dashboard URL
- Check browser console (F12) for errors
- Restart API: `docker compose restart api`

### Services crash / out of memory
```bash
# Check memory
free -h

# If swap is not active
sudo swapon /swapfile

# Increase swap to 4GB if needed
sudo swapoff /swapfile
sudo fallocate -l 4G /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Restart all services
docker compose restart
```

### View service logs
```bash
# All services
docker compose logs --tail 50

# Specific service
docker compose logs --tail 50 api
docker compose logs --tail 50 ingestion
docker compose logs --tail 50 emqx
docker compose logs --tail 50 timescaledb
```

### Restart everything
```bash
cd /home/ubuntu/loopsolar/cloud
docker compose down
docker compose up -d
```

### Complete reset (delete all data)
```bash
cd /home/ubuntu/loopsolar/cloud
docker compose down -v    # -v removes volumes (DATABASE DATA WILL BE LOST)
docker compose up -d
```

---

## Quick Reference

| Service | URL | Purpose |
|---------|-----|---------|
| API | `http://65.0.220.190:3001/api/status` | REST API |
| Nginx | `http://65.0.220.190/api/status` | Reverse proxy |
| EMQX Dashboard | `http://65.0.220.190:18083` | MQTT admin |
| MQTT Broker | `65.0.220.190:1883` | Device connections |
| Dashboard | `https://your-app.vercel.app` | Monitoring UI |

| Credentials | Username | Password |
|-------------|----------|----------|
| EMQX Admin | `admin` | `loopsolar_admin_2026` |
| MQTT Device | `device` | *(set in Step 5.2)* |
| MQTT Ingestion | `ingestion` | *(set in Step 5.2)* |
| Database | `loopsolar` | *(set in .env)* |
