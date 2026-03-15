#pragma once

#include <SPIFFS.h>
#include <ArduinoJson.h>
#include "config.h"

// ============================================================
// Data Buffer — SPIFFS-based offline storage with circular buffer
// ============================================================

class DataBuffer {
public:
    void begin() {
        if (!SPIFFS.begin(true)) {
            Serial.println("[Buffer] SPIFFS mount failed!");
            return;
        }
        
        // Count existing buffered entries
        _count = _countEntries();
        Serial.printf("[Buffer] Initialized, %d entries in buffer\n", _count);
    }
    
    // Store a reading when MQTT is unavailable
    bool store(const char* jsonPayload) {
        if (_count >= MAX_BUFFER_ENTRIES) {
            Serial.println("[Buffer] Buffer full, dropping oldest entry");
            _removeOldest();
        }
        
        // Use incrementing filename
        char filename[32];
        snprintf(filename, sizeof(filename), "/buf_%08lu.json", _writeIndex++);
        
        File f = SPIFFS.open(filename, "w");
        if (!f) {
            Serial.println("[Buffer] Failed to open file for writing");
            return false;
        }
        
        f.print(jsonPayload);
        f.close();
        _count++;
        
        Serial.printf("[Buffer] Stored entry %s (%d total)\n", filename, _count);
        return true;
    }
    
    // Flush buffered data through a publish function
    // Returns number of successfully flushed entries
    typedef bool (*PublishFunc)(const char* topic, const char* payload);
    
    uint32_t flush(PublishFunc publishFn, const char* topic) {
        if (_count == 0) return 0;
        
        Serial.printf("[Buffer] Flushing %d buffered entries...\n", _count);
        
        File root = SPIFFS.open("/");
        File file = root.openNextFile();
        uint32_t flushed = 0;
        
        while (file && flushed < BUFFER_FLUSH_BATCH) {
            String name = String(file.name());
            if (name.startsWith("/buf_") || name.startsWith("buf_")) {
                String content = file.readString();
                file.close();
                
                if (publishFn(topic, content.c_str())) {
                    // Successfully published, remove file
                    String fullPath = name.startsWith("/") ? name : "/" + name;
                    SPIFFS.remove(fullPath);
                    flushed++;
                    _count--;
                } else {
                    // Publish failed, stop flushing
                    Serial.println("[Buffer] Publish failed during flush, stopping");
                    break;
                }
                
                delay(50); // Small delay between publishes
            } else {
                file.close();
            }
            
            file = root.openNextFile();
        }
        
        Serial.printf("[Buffer] Flushed %d entries, %d remaining\n", flushed, _count);
        return flushed;
    }
    
    uint32_t count() { return _count; }
    
    // Clear all buffered data
    void clear() {
        File root = SPIFFS.open("/");
        File file = root.openNextFile();
        
        while (file) {
            String name = String(file.name());
            file.close();
            if (name.startsWith("/buf_") || name.startsWith("buf_")) {
                String fullPath = name.startsWith("/") ? name : "/" + name;
                SPIFFS.remove(fullPath);
            }
            file = root.openNextFile();
        }
        
        _count = 0;
        _writeIndex = 0;
        Serial.println("[Buffer] Cleared all entries");
    }

private:
    uint32_t _count = 0;
    uint32_t _writeIndex = 0;
    
    uint32_t _countEntries() {
        uint32_t count = 0;
        File root = SPIFFS.open("/");
        File file = root.openNextFile();
        
        while (file) {
            String name = String(file.name());
            if (name.startsWith("/buf_") || name.startsWith("buf_")) {
                count++;
                // Track highest index for write continuation
                String numStr = name.substring(name.indexOf('_') + 1, name.indexOf('.'));
                uint32_t idx = numStr.toInt();
                if (idx >= _writeIndex) _writeIndex = idx + 1;
            }
            file.close();
            file = root.openNextFile();
        }
        
        return count;
    }
    
    void _removeOldest() {
        String oldestName = "";
        uint32_t oldestIdx = UINT32_MAX;
        
        File root = SPIFFS.open("/");
        File file = root.openNextFile();
        
        while (file) {
            String name = String(file.name());
            file.close();
            if (name.startsWith("/buf_") || name.startsWith("buf_")) {
                String numStr = name.substring(name.indexOf('_') + 1, name.indexOf('.'));
                uint32_t idx = numStr.toInt();
                if (idx < oldestIdx) {
                    oldestIdx = idx;
                    oldestName = name.startsWith("/") ? name : "/" + name;
                }
            }
            file = root.openNextFile();
        }
        
        if (oldestName.length() > 0) {
            SPIFFS.remove(oldestName);
            _count--;
        }
    }
};
