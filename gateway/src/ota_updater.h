#pragma once

#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include "config.h"

// ============================================================
// OTA Updater — HTTP-based firmware update with dual partitions
// ============================================================

class OtaUpdater {
public:
    void begin(const char* serverUrl, const char* currentVersion, const char* gatewayId) {
        strncpy(_serverUrl, serverUrl, sizeof(_serverUrl));
        strncpy(_currentVersion, currentVersion, sizeof(_currentVersion));
        strncpy(_gatewayId, gatewayId, sizeof(_gatewayId));
        _lastCheck = 0;
        
        Serial.printf("[OTA] Initialized, current version: %s\n", _currentVersion);
    }
    
    // Call in loop() — checks periodically and updates if available
    void loop() {
        unsigned long now = millis();
        if (now - _lastCheck < OTA_CHECK_INTERVAL_MS) return;
        _lastCheck = now;
        
        checkAndUpdate();
    }
    
    // Force an immediate check
    void checkAndUpdate() {
        Serial.println("[OTA] Checking for firmware updates...");
        
        HTTPClient http;
        char url[256];
        snprintf(url, sizeof(url), "%s/check?gateway_id=%s&version=%s", 
            _serverUrl, _gatewayId, _currentVersion);
        
        http.begin(url);
        http.setTimeout(10000);
        int httpCode = http.GET();
        
        if (httpCode != 200) {
            Serial.printf("[OTA] Check failed, HTTP %d\n", httpCode);
            http.end();
            return;
        }
        
        String response = http.getString();
        http.end();
        
        // Parse response
        JsonDocument doc;
        if (deserializeJson(doc, response)) {
            Serial.println("[OTA] Failed to parse check response");
            return;
        }
        
        bool updateAvailable = doc["update_available"] | false;
        if (!updateAvailable) {
            Serial.println("[OTA] Firmware is up to date");
            return;
        }
        
        const char* newVersion = doc["version"] | "unknown";
        const char* firmwareUrl = doc["url"] | "";
        int firmwareSize = doc["size"] | 0;
        
        Serial.printf("[OTA] Update available: %s -> %s (%d bytes)\n", 
            _currentVersion, newVersion, firmwareSize);
        
        // Download and apply firmware
        _performUpdate(firmwareUrl, firmwareSize);
    }

private:
    char _serverUrl[256];
    char _currentVersion[32];
    char _gatewayId[32];
    unsigned long _lastCheck;
    
    void _performUpdate(const char* firmwareUrl, int expectedSize) {
        Serial.printf("[OTA] Downloading firmware from %s\n", firmwareUrl);
        
        HTTPClient http;
        http.begin(firmwareUrl);
        http.setTimeout(60000); // 60s timeout for download
        int httpCode = http.GET();
        
        if (httpCode != 200) {
            Serial.printf("[OTA] Download failed, HTTP %d\n", httpCode);
            http.end();
            return;
        }
        
        int contentLength = http.getSize();
        if (contentLength <= 0) {
            Serial.println("[OTA] Invalid content length");
            http.end();
            return;
        }
        
        // Begin OTA update
        if (!Update.begin(contentLength)) {
            Serial.printf("[OTA] Not enough space for update: %d bytes\n", contentLength);
            http.end();
            return;
        }
        
        Serial.println("[OTA] Starting firmware write...");
        
        WiFiClient* stream = http.getStreamPtr();
        uint8_t buf[1024];
        int written = 0;
        int lastProgress = 0;
        
        while (http.connected() && written < contentLength) {
            size_t available = stream->available();
            if (available) {
                int readBytes = stream->readBytes(buf, min(available, sizeof(buf)));
                Update.write(buf, readBytes);
                written += readBytes;
                
                // Progress logging every 10%
                int progress = (written * 100) / contentLength;
                if (progress - lastProgress >= 10) {
                    Serial.printf("[OTA] Progress: %d%%\n", progress);
                    lastProgress = progress;
                }
            }
            delay(1);
        }
        
        http.end();
        
        if (Update.end()) {
            if (Update.isFinished()) {
                Serial.println("[OTA] Update successful! Rebooting...");
                delay(1000);
                ESP.restart();
            } else {
                Serial.println("[OTA] Update not finished, something went wrong");
            }
        } else {
            Serial.printf("[OTA] Update failed: %s\n", Update.errorString());
        }
    }
};
