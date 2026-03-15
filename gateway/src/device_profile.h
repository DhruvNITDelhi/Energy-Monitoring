#pragma once

#include <ArduinoJson.h>
#include <SPIFFS.h>
#include "config.h"

// ============================================================
// Device Profile Manager — Dynamic Modbus register maps
// ============================================================

// Built-in Secure Elite 440 energy meter register map
static RegisterEntry secureElite440Registers[] = {
    // Voltage (V) — Phase R, Y, B
    {3027, FLOAT32, "voltage_r",      1.0, 2},
    {3029, FLOAT32, "voltage_y",      1.0, 2},
    {3031, FLOAT32, "voltage_b",      1.0, 2},
    // Current (A) — Phase R, Y, B
    {3009, FLOAT32, "current_r",      1.0, 2},
    {3011, FLOAT32, "current_y",      1.0, 2},
    {3013, FLOAT32, "current_b",      1.0, 2},
    // Power (kW)
    {3053, FLOAT32, "power_total",    1.0, 2},
    {3059, FLOAT32, "reactive_power", 1.0, 2},
    {3065, FLOAT32, "apparent_power", 1.0, 2},
    // Power Factor
    {3083, FLOAT32, "pf_total",       1.0, 2},
    // Frequency (Hz)
    {3109, FLOAT32, "frequency",      1.0, 2},
    // Energy (kWh)
    {3203, FLOAT32, "energy_import",  1.0, 2},
    {3207, FLOAT32, "energy_export",  1.0, 2},
    // THD
    {3421, FLOAT32, "thd_voltage_r",  1.0, 2},
    {3423, FLOAT32, "thd_voltage_y",  1.0, 2},
    {3425, FLOAT32, "thd_voltage_b",  1.0, 2},
};

// Built-in generic solar inverter register map
static RegisterEntry genericInverterRegisters[] = {
    {0,   UINT16,  "status_code",     1.0,  1},
    {1,   FLOAT32, "dc_voltage",      0.1,  2},
    {3,   FLOAT32, "dc_current",      0.01, 2},
    {5,   FLOAT32, "dc_power",        1.0,  2},
    {7,   FLOAT32, "ac_voltage",      0.1,  2},
    {9,   FLOAT32, "ac_current",      0.01, 2},
    {11,  FLOAT32, "ac_power",        1.0,  2},
    {13,  FLOAT32, "ac_frequency",    0.01, 2},
    {15,  FLOAT32, "energy_today",    0.01, 2},
    {17,  FLOAT32, "energy_total",    0.1,  2},
    {19,  FLOAT32, "temperature",     0.1,  2},
};

// Built-in weather station register map
static RegisterEntry weatherStationRegisters[] = {
    {0,   FLOAT32, "irradiance",      1.0, 2},  // W/m²
    {2,   FLOAT32, "ambient_temp",    0.1, 2},  // °C
    {4,   FLOAT32, "module_temp",     0.1, 2},  // °C
    {6,   FLOAT32, "wind_speed",      0.1, 2},  // m/s
    {8,   FLOAT32, "humidity",        0.1, 2},  // %
};


class DeviceProfileManager {
public:
    DeviceProfile devices[MAX_DEVICES];
    uint8_t deviceCount = 0;
    uint32_t pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
    char gatewayId[32];
    char plantId[64];
    
    void begin() {
        strncpy(gatewayId, GATEWAY_ID, sizeof(gatewayId));
        strncpy(plantId, PLANT_ID, sizeof(plantId));
        
        if (!SPIFFS.begin(true)) {
            Serial.println("[Profile] SPIFFS mount failed, using built-in defaults");
            loadDefaults();
            return;
        }
        
        if (SPIFFS.exists("/config.json")) {
            Serial.println("[Profile] Loading config from SPIFFS...");
            if (!loadFromSPIFFS()) {
                Serial.println("[Profile] Config parse failed, using defaults");
                loadDefaults();
            }
        } else {
            Serial.println("[Profile] No config file found, using defaults");
            loadDefaults();
        }
        
        Serial.printf("[Profile] Loaded %d device(s), poll interval: %dms\n", 
            deviceCount, pollIntervalMs);
    }
    
    // Re-load config (called when new config received via MQTT)
    bool reloadConfig(const char* jsonStr) {
        // Save to SPIFFS first
        File f = SPIFFS.open("/config.json", "w");
        if (f) {
            f.print(jsonStr);
            f.close();
        }
        
        // Parse and apply
        return parseConfig(jsonStr);
    }

private:
    // Dynamic register storage for custom templates
    RegisterEntry _dynamicRegisters[MAX_DEVICES][30]; // max 30 registers per device
    
    void loadDefaults() {
        deviceCount = 1;
        
        // Default: one Secure Elite 440 meter at slave ID 1
        strncpy(devices[0].deviceId, "EM-001", sizeof(devices[0].deviceId));
        strncpy(devices[0].deviceType, "energy_meter", sizeof(devices[0].deviceType));
        strncpy(devices[0].templateName, "secure_elite_440", sizeof(devices[0].templateName));
        devices[0].slaveId = 1;
        devices[0].registers = secureElite440Registers;
        devices[0].registerCount = sizeof(secureElite440Registers) / sizeof(RegisterEntry);
    }
    
    bool loadFromSPIFFS() {
        File f = SPIFFS.open("/config.json", "r");
        if (!f) return false;
        
        String content = f.readString();
        f.close();
        
        return parseConfig(content.c_str());
    }
    
    bool parseConfig(const char* jsonStr) {
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, jsonStr);
        if (err) {
            Serial.printf("[Profile] JSON parse error: %s\n", err.c_str());
            return false;
        }
        
        // Gateway settings
        if (doc.containsKey("gateway_id")) {
            strncpy(gatewayId, doc["gateway_id"].as<const char*>(), sizeof(gatewayId));
        }
        if (doc.containsKey("plant_id")) {
            strncpy(plantId, doc["plant_id"].as<const char*>(), sizeof(plantId));
        }
        if (doc.containsKey("poll_interval_ms")) {
            pollIntervalMs = doc["poll_interval_ms"].as<uint32_t>();
        }
        
        // Parse device list
        JsonArray devArr = doc["devices"].as<JsonArray>();
        deviceCount = 0;
        
        for (JsonObject devObj : devArr) {
            if (deviceCount >= MAX_DEVICES) break;
            
            DeviceProfile& dev = devices[deviceCount];
            strncpy(dev.deviceId, devObj["device_id"] | "unknown", sizeof(dev.deviceId));
            strncpy(dev.deviceType, devObj["device_type"] | "unknown", sizeof(dev.deviceType));
            strncpy(dev.templateName, devObj["template"] | "custom", sizeof(dev.templateName));
            dev.slaveId = devObj["slave_id"] | 1;
            
            // Use built-in template or custom registers
            const char* tmpl = dev.templateName;
            if (strcmp(tmpl, "secure_elite_440") == 0) {
                dev.registers = secureElite440Registers;
                dev.registerCount = sizeof(secureElite440Registers) / sizeof(RegisterEntry);
            } else if (strcmp(tmpl, "generic_inverter") == 0) {
                dev.registers = genericInverterRegisters;
                dev.registerCount = sizeof(genericInverterRegisters) / sizeof(RegisterEntry);
            } else if (strcmp(tmpl, "weather_station") == 0) {
                dev.registers = weatherStationRegisters;
                dev.registerCount = sizeof(weatherStationRegisters) / sizeof(RegisterEntry);
            } else {
                // Parse custom register map from JSON
                dev.registerCount = 0;
                dev.registers = _dynamicRegisters[deviceCount];
                
                JsonArray regs = devObj["registers"].as<JsonArray>();
                for (JsonObject regObj : regs) {
                    if (dev.registerCount >= 30) break;
                    RegisterEntry& r = _dynamicRegisters[deviceCount][dev.registerCount];
                    r.address = regObj["address"] | 0;
                    r.dataType = (ModbusDataType)(regObj["data_type"].as<int>());
                    
                    // Store param name — use static buffer (simplified)
                    static char paramNames[MAX_DEVICES][30][32];
                    strncpy(paramNames[deviceCount][dev.registerCount], 
                            regObj["param_name"] | "unknown", 32);
                    r.paramName = paramNames[deviceCount][dev.registerCount];
                    
                    r.scaleFactor = regObj["scale_factor"] | 1.0f;
                    r.registerCount = regObj["register_count"] | 2;
                    dev.registerCount++;
                }
            }
            
            deviceCount++;
        }
        
        return deviceCount > 0;
    }
};
