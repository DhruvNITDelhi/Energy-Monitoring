#pragma once

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "config.h"

// ============================================================
// MQTT Client — Connection, publishing, and config subscription
// ============================================================

class MqttClient {
public:
    typedef void (*ConfigCallback)(const char* payload);
    
    void begin(const char* broker, int port, const char* user, const char* pass,
               const char* gatewayId, ConfigCallback onConfig = nullptr) {
        strncpy(_broker, broker, sizeof(_broker));
        _port = port;
        strncpy(_user, user, sizeof(_user));
        strncpy(_pass, pass, sizeof(_pass));
        strncpy(_gatewayId, gatewayId, sizeof(_gatewayId));
        _onConfig = onConfig;
        _reconnectDelay = MQTT_RECONNECT_MIN_MS;
        
        // Build topic strings
        snprintf(_topicTelemetry, sizeof(_topicTelemetry), "loopsolar/%s/telemetry", gatewayId);
        snprintf(_topicHeartbeat, sizeof(_topicHeartbeat), "loopsolar/%s/heartbeat", gatewayId);
        snprintf(_topicConfig, sizeof(_topicConfig), "loopsolar/%s/config", gatewayId);
        snprintf(_topicStatus, sizeof(_topicStatus), "loopsolar/%s/status", gatewayId);
        snprintf(_clientId, sizeof(_clientId), "loopsolar-%s", gatewayId);
        
        _wifiClient.setTimeout(10);
        _mqttClient.setClient(_wifiClient);
        _mqttClient.setServer(_broker, _port);
        _mqttClient.setBufferSize(MQTT_BUFFER_SIZE);
        _mqttClient.setKeepAlive(MQTT_KEEPALIVE);
        
        // Set up message callback for config subscription
        _mqttClient.setCallback([this](char* topic, byte* payload, unsigned int length) {
            _handleMessage(topic, payload, length);
        });
        
        Serial.printf("[MQTT] Configured for %s:%d\n", _broker, _port);
    }
    
    bool isConnected() {
        return _mqttClient.connected();
    }
    
    void loop() {
        if (!_mqttClient.connected()) {
            _reconnect();
        }
        _mqttClient.loop();
    }
    
    // Publish telemetry data for a device
    bool publishTelemetry(const char* deviceId, const char* plantId, 
                          JsonObject& parameters) {
        JsonDocument doc;
        doc["gateway_id"] = _gatewayId;
        doc["device_id"] = deviceId;
        doc["plant_id"] = plantId;
        doc["timestamp"] = _getISOTimestamp();
        doc["firmware_version"] = FIRMWARE_VERSION;
        
        JsonObject params = doc["parameters"].to<JsonObject>();
        for (JsonPair kv : parameters) {
            params[kv.key()] = kv.value();
        }
        
        char buffer[MQTT_BUFFER_SIZE];
        size_t len = serializeJson(doc, buffer, sizeof(buffer));
        
        bool ok = _mqttClient.publish(_topicTelemetry, buffer, len);
        if (ok) {
            Serial.printf("[MQTT] Published telemetry for %s (%d bytes)\n", deviceId, len);
        } else {
            Serial.printf("[MQTT] Publish failed for %s\n", deviceId);
        }
        return ok;
    }
    
    // Publish pre-built JSON string (used for flushing buffer)
    bool publishRaw(const char* topic, const char* payload) {
        return _mqttClient.publish(topic, payload);
    }
    
    // Publish heartbeat
    bool publishHeartbeat(uint32_t uptimeSeconds, uint32_t freeHeap, 
                          uint8_t deviceCount, uint32_t bufferCount) {
        JsonDocument doc;
        doc["gateway_id"] = _gatewayId;
        doc["timestamp"] = _getISOTimestamp();
        doc["firmware_version"] = FIRMWARE_VERSION;
        doc["uptime_seconds"] = uptimeSeconds;
        doc["free_heap"] = freeHeap;
        doc["device_count"] = deviceCount;
        doc["buffered_readings"] = bufferCount;
        doc["wifi_rssi"] = WiFi.RSSI();
        
        char buffer[512];
        size_t len = serializeJson(doc, buffer, sizeof(buffer));
        return _mqttClient.publish(_topicHeartbeat, buffer, len);
    }
    
    const char* getTelemetryTopic() { return _topicTelemetry; }
    
private:
    WiFiClient _wifiClient;
    PubSubClient _mqttClient;
    
    char _broker[128];
    int _port;
    char _user[64];
    char _pass[64];
    char _gatewayId[32];
    char _clientId[64];
    
    char _topicTelemetry[128];
    char _topicHeartbeat[128];
    char _topicConfig[128];
    char _topicStatus[128];
    
    ConfigCallback _onConfig;
    
    unsigned long _lastReconnectAttempt = 0;
    unsigned long _reconnectDelay;
    
    void _reconnect() {
        unsigned long now = millis();
        if (now - _lastReconnectAttempt < _reconnectDelay) return;
        _lastReconnectAttempt = now;
        
        Serial.printf("[MQTT] Connecting to %s:%d as %s...\n", _broker, _port, _clientId);
        
        // Connect with LWT (Last Will and Testament)
        char willPayload[128];
        snprintf(willPayload, sizeof(willPayload), 
            "{\"gateway_id\":\"%s\",\"status\":\"offline\"}", _gatewayId);
        
        bool connected = _mqttClient.connect(
            _clientId, _user, _pass,
            _topicStatus, 1, true, willPayload
        );
        
        if (connected) {
            Serial.println("[MQTT] Connected!");
            _reconnectDelay = MQTT_RECONNECT_MIN_MS; // Reset backoff
            
            // Publish online status
            char onlinePayload[128];
            snprintf(onlinePayload, sizeof(onlinePayload),
                "{\"gateway_id\":\"%s\",\"status\":\"online\"}", _gatewayId);
            _mqttClient.publish(_topicStatus, onlinePayload, true);
            
            // Subscribe to config channel
            _mqttClient.subscribe(_topicConfig);
            Serial.printf("[MQTT] Subscribed to %s\n", _topicConfig);
        } else {
            Serial.printf("[MQTT] Connection failed, rc=%d. Retry in %lums\n", 
                _mqttClient.state(), _reconnectDelay);
            // Exponential backoff
            _reconnectDelay = min(_reconnectDelay * 2, (unsigned long)MQTT_RECONNECT_MAX_MS);
        }
    }
    
    void _handleMessage(char* topic, byte* payload, unsigned int length) {
        if (strcmp(topic, _topicConfig) == 0 && _onConfig) {
            char* buf = new char[length + 1];
            memcpy(buf, payload, length);
            buf[length] = '\0';
            Serial.printf("[MQTT] Received config update (%d bytes)\n", length);
            _onConfig(buf);
            delete[] buf;
        }
    }
    
    String _getISOTimestamp() {
        struct tm timeinfo;
        if (!getLocalTime(&timeinfo)) {
            return String("1970-01-01T00:00:00Z");
        }
        char buf[30];
        strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
        return String(buf);
    }
};
