// ============================================================
// Loop Solar — ESP32 Gateway Firmware
// Main Application Entry Point
// ============================================================
//
// Architecture:
//   RS485 Modbus Devices → ModbusMaster → JSON → MQTT → Cloud
//   Cloud → MQTT Config → DeviceProfileManager → Reconfigure
//
// Modules:
//   config.h          - All configurable constants
//   modbus_master.h   - Modbus RTU polling engine
//   device_profile.h  - Dynamic device templates
//   mqtt_client.h     - MQTT connection & publishing
//   data_buffer.h     - SPIFFS offline buffer
//   ota_updater.h     - HTTP firmware updates
// ============================================================

#include <Arduino.h>
#include <WiFi.h>
#include <SPIFFS.h>
#include <time.h>
#include <esp_task_wdt.h>
#include <ArduinoJson.h>

#include "config.h"
#include "modbus_master.h"
#include "device_profile.h"
#include "mqtt_client.h"
#include "data_buffer.h"
#include "ota_updater.h"

// ---- Module Instances ----
ModbusMasterController modbus;
DeviceProfileManager profileManager;
MqttClient mqtt;
DataBuffer dataBuffer;
OtaUpdater otaUpdater;

// ---- Timing ----
unsigned long lastPollTime = 0;
unsigned long lastHeartbeatTime = 0;
unsigned long bootTime = 0;

// ---- Forward Declarations ----
void connectWiFi();
void syncTime();
void pollAllDevices();
void sendHeartbeat();
void onConfigUpdate(const char* payload);
bool mqttPublishWrapper(const char* topic, const char* payload);

// ============================================================
// SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("\n╔══════════════════════════════════════╗");
    Serial.println("║   Loop Solar — ESP32 Gateway         ║");
    Serial.println("║   Firmware v" FIRMWARE_VERSION "                    ║");
    Serial.println("╚══════════════════════════════════════╝\n");
    
    // Initialize watchdog timer
    esp_task_wdt_init(WDT_TIMEOUT_SECONDS, true);
    esp_task_wdt_add(NULL);
    
    // Initialize SPIFFS
    if (!SPIFFS.begin(true)) {
        Serial.println("[MAIN] SPIFFS initialization failed!");
    }
    
    // Load device profiles from SPIFFS config
    profileManager.begin();
    
    // Initialize Modbus
    modbus.begin();
    
    // Initialize offline buffer
    dataBuffer.begin();
    
    // Connect WiFi
    connectWiFi();
    
    // Sync NTP time
    syncTime();
    
    // Initialize MQTT
    mqtt.begin(MQTT_BROKER, MQTT_PORT, MQTT_USER, MQTT_PASSWORD,
               profileManager.gatewayId, onConfigUpdate);
    
    // Initialize OTA updater
    otaUpdater.begin(OTA_SERVER_URL, FIRMWARE_VERSION, profileManager.gatewayId);
    
    bootTime = millis();
    Serial.printf("[MAIN] Setup complete. Gateway: %s, Plant: %s, Devices: %d\n",
        profileManager.gatewayId, profileManager.plantId, profileManager.deviceCount);
    Serial.println("[MAIN] Entering main loop...\n");
}

// ============================================================
// LOOP
// ============================================================
void loop() {
    // Feed watchdog
    esp_task_wdt_reset();
    
    // Maintain MQTT connection
    mqtt.loop();
    
    // Check for OTA updates
    otaUpdater.loop();
    
    unsigned long now = millis();
    
    // ---- Poll all Modbus devices ----
    if (now - lastPollTime >= profileManager.pollIntervalMs) {
        lastPollTime = now;
        pollAllDevices();
        
        // Try to flush buffer if connected
        if (mqtt.isConnected() && dataBuffer.count() > 0) {
            Serial.println("[MAIN] Flushing offline buffer...");
            dataBuffer.flush(mqttPublishWrapper, mqtt.getTelemetryTopic());
        }
    }
    
    // ---- Send heartbeat ----
    if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatTime = now;
        sendHeartbeat();
    }
    
    delay(10); // Yield to system tasks
}

// ============================================================
// WiFi Connection
// ============================================================
void connectWiFi() {
    Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    int retries = 0;
    while (WiFi.status() != WL_CONNECTED && retries < WIFI_MAX_RETRIES) {
        delay(1000);
        Serial.print(".");
        retries++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WiFi] Connected! IP: %s, RSSI: %d dBm\n", 
            WiFi.localIP().toString().c_str(), WiFi.RSSI());
    } else {
        Serial.println("\n[WiFi] Connection failed! Will retry in loop...");
    }
}

// ============================================================
// NTP Time Sync
// ============================================================
void syncTime() {
    Serial.println("[NTP] Synchronizing time...");
    configTime(NTP_GMT_OFFSET, NTP_DAYLIGHT_OFFSET, NTP_SERVER);
    
    struct tm timeinfo;
    if (getLocalTime(&timeinfo, 10000)) {
        char buf[64];
        strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
        Serial.printf("[NTP] Time synchronized: %s\n", buf);
    } else {
        Serial.println("[NTP] Time sync failed, timestamps may be inaccurate");
    }
}

// ============================================================
// Poll All Devices
// ============================================================
void pollAllDevices() {
    Serial.printf("\n[POLL] ── Polling %d device(s) ──\n", profileManager.deviceCount);
    
    for (uint8_t i = 0; i < profileManager.deviceCount; i++) {
        DeviceProfile& device = profileManager.devices[i];
        
        Serial.printf("[POLL] Device: %s (slave %d, template: %s)\n", 
            device.deviceId, device.slaveId, device.templateName);
        
        // Create JSON document for this device's parameters
        JsonDocument paramDoc;
        JsonObject params = paramDoc.to<JsonObject>();
        
        // Read all registers for this device
        bool success = modbus.readDevice(device, params);
        
        if (success) {
            if (mqtt.isConnected()) {
                // Publish directly via MQTT
                mqtt.publishTelemetry(device.deviceId, profileManager.plantId, params);
            } else {
                // Buffer for later
                Serial.println("[POLL] MQTT offline, buffering data...");
                
                JsonDocument bufDoc;
                bufDoc["gateway_id"] = profileManager.gatewayId;
                bufDoc["device_id"] = device.deviceId;
                bufDoc["plant_id"] = profileManager.plantId;
                
                // Get timestamp
                struct tm timeinfo;
                char timeBuf[30];
                if (getLocalTime(&timeinfo)) {
                    strftime(timeBuf, sizeof(timeBuf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
                } else {
                    strcpy(timeBuf, "1970-01-01T00:00:00Z");
                }
                bufDoc["timestamp"] = timeBuf;
                bufDoc["firmware_version"] = FIRMWARE_VERSION;
                bufDoc["parameters"] = params;
                
                char buffer[MQTT_BUFFER_SIZE];
                serializeJson(bufDoc, buffer, sizeof(buffer));
                dataBuffer.store(buffer);
            }
        } else {
            Serial.printf("[POLL] Failed to read device %s\n", device.deviceId);
        }
        
        // Delay between devices to prevent RS485 bus collisions
        if (i < profileManager.deviceCount - 1) {
            delay(MODBUS_INTER_DEVICE_DELAY_MS);
        }
    }
    
    Serial.println("[POLL] ── Poll cycle complete ──\n");
}

// ============================================================
// Heartbeat
// ============================================================
void sendHeartbeat() {
    if (!mqtt.isConnected()) return;
    
    uint32_t uptime = (millis() - bootTime) / 1000;
    mqtt.publishHeartbeat(uptime, ESP.getFreeHeap(), 
        profileManager.deviceCount, dataBuffer.count());
}

// ============================================================
// Config Update Handler (called when MQTT config message arrives)
// ============================================================
void onConfigUpdate(const char* payload) {
    Serial.println("[CONFIG] Received remote configuration update");
    
    if (profileManager.reloadConfig(payload)) {
        Serial.println("[CONFIG] Configuration applied successfully!");
        Serial.printf("[CONFIG] New device count: %d, poll interval: %dms\n",
            profileManager.deviceCount, profileManager.pollIntervalMs);
        
        // Re-initialize MQTT with potentially new gateway ID
        mqtt.begin(MQTT_BROKER, MQTT_PORT, MQTT_USER, MQTT_PASSWORD,
                   profileManager.gatewayId, onConfigUpdate);
    } else {
        Serial.println("[CONFIG] Failed to apply configuration update");
    }
}

// ============================================================
// MQTT Publish Wrapper (for data buffer flush)
// ============================================================
bool mqttPublishWrapper(const char* topic, const char* payload) {
    return mqtt.publishRaw(topic, payload);
}
