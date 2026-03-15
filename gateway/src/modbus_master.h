#pragma once

#include <ModbusMaster.h>
#include <HardwareSerial.h>
#include <ArduinoJson.h>
#include "config.h"

// ============================================================
// Modbus RTU Master — Multi-device polling over RS485
// ============================================================

class ModbusMasterController {
public:
    void begin() {
        // Configure RS485 direction pin
        pinMode(RS485_DE_RE_PIN, OUTPUT);
        digitalWrite(RS485_DE_RE_PIN, LOW); // Receive mode
        
        // Initialize Serial2 for RS485
        Serial2.begin(MODBUS_BAUD_RATE, MODBUS_SERIAL_CONFIG, RS485_RX_PIN, RS485_TX_PIN);
        
        // Set callbacks for RS485 direction control
        _node.preTransmission([]() {
            digitalWrite(RS485_DE_RE_PIN, HIGH); // Transmit mode
            delayMicroseconds(50);
        });
        _node.postTransmission([]() {
            delayMicroseconds(50);
            digitalWrite(RS485_DE_RE_PIN, LOW);  // Receive mode
        });
        
        Serial.println("[Modbus] Master initialized on Serial2");
    }
    
    // Read all registers for a given device profile and populate a JSON object
    bool readDevice(DeviceProfile& profile, JsonObject& params) {
        _node.begin(profile.slaveId, Serial2);
        
        bool anySuccess = false;
        
        for (uint8_t i = 0; i < profile.registerCount; i++) {
            RegisterEntry& reg = profile.registers[i];
            float value = 0;
            bool success = false;
            
            // Retry logic
            for (uint8_t retry = 0; retry < MODBUS_RETRY_COUNT; retry++) {
                success = readRegister(reg, value);
                if (success) break;
                delay(100);
            }
            
            if (success) {
                // Apply scale factor
                value *= reg.scaleFactor;
                params[reg.paramName] = serialized(String(value, 2));
                anySuccess = true;
            } else {
                Serial.printf("[Modbus] Failed to read %s (addr=%d) from slave %d\n", 
                    reg.paramName, reg.address, profile.slaveId);
            }
            
            delay(MODBUS_INTER_REGISTER_DELAY_MS);
        }
        
        return anySuccess;
    }

private:
    ModbusMaster _node;
    
    bool readRegister(RegisterEntry& reg, float& outValue) {
        uint8_t result;
        
        switch (reg.dataType) {
            case UINT16:
            case INT16: {
                result = _node.readHoldingRegisters(reg.address, 1);
                if (result == _node.ku8MBSuccess) {
                    if (reg.dataType == INT16) {
                        outValue = (float)(int16_t)_node.getResponseBuffer(0);
                    } else {
                        outValue = (float)_node.getResponseBuffer(0);
                    }
                    return true;
                }
                break;
            }
            
            case UINT32:
            case INT32: {
                result = _node.readHoldingRegisters(reg.address, 2);
                if (result == _node.ku8MBSuccess) {
                    uint32_t raw = ((uint32_t)_node.getResponseBuffer(0) << 16) | 
                                    _node.getResponseBuffer(1);
                    if (reg.dataType == INT32) {
                        outValue = (float)(int32_t)raw;
                    } else {
                        outValue = (float)raw;
                    }
                    return true;
                }
                break;
            }
            
            case FLOAT32: {
                // CDAB byte order (common in energy meters)
                result = _node.readHoldingRegisters(reg.address, 2);
                if (result == _node.ku8MBSuccess) {
                    // CDAB: low word first, then high word
                    uint16_t low = _node.getResponseBuffer(0);
                    uint16_t high = _node.getResponseBuffer(1);
                    uint32_t raw = ((uint32_t)high << 16) | low;
                    memcpy(&outValue, &raw, sizeof(float));
                    return true;
                }
                break;
            }
            
            case FLOAT32_ABCD: {
                // ABCD byte order (standard)
                result = _node.readHoldingRegisters(reg.address, 2);
                if (result == _node.ku8MBSuccess) {
                    uint16_t high = _node.getResponseBuffer(0);
                    uint16_t low = _node.getResponseBuffer(1);
                    uint32_t raw = ((uint32_t)high << 16) | low;
                    memcpy(&outValue, &raw, sizeof(float));
                    return true;
                }
                break;
            }
            
            case INT64: {
                result = _node.readHoldingRegisters(reg.address, 4);
                if (result == _node.ku8MBSuccess) {
                    uint64_t raw = ((uint64_t)_node.getResponseBuffer(0) << 48) |
                                   ((uint64_t)_node.getResponseBuffer(1) << 32) |
                                   ((uint64_t)_node.getResponseBuffer(2) << 16) |
                                   _node.getResponseBuffer(3);
                    outValue = (float)(int64_t)raw;
                    return true;
                }
                break;
            }
        }
        
        return false;
    }
};
