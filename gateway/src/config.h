#pragma once

// ============================================================
// Loop Solar — ESP32 Gateway Configuration
// ============================================================

// ---- WiFi ----
#define WIFI_SSID           "Dhruv's Galaxy"
#define WIFI_PASSWORD       "87654321"
#define WIFI_CONNECT_TIMEOUT_MS  15000
#define WIFI_MAX_RETRIES    10

// ---- MQTT Broker ----
#define MQTT_BROKER         "65.0.220.190"
#define MQTT_PORT           1883
#define MQTT_USER           "device"
#define MQTT_PASSWORD       "device_password"
#define MQTT_KEEPALIVE      60
#define MQTT_BUFFER_SIZE    2048
#define MQTT_RECONNECT_MIN_MS   1000
#define MQTT_RECONNECT_MAX_MS   60000

// ---- Gateway Identity ----
#define GATEWAY_ID          "GW-001"
#define PLANT_ID            "plant-001"
#define FIRMWARE_VERSION    "1.0.0"

// ---- MQTT Topics ----
#define MQTT_TOPIC_TELEMETRY   "loopsolar/" GATEWAY_ID "/telemetry"
#define MQTT_TOPIC_HEARTBEAT   "loopsolar/" GATEWAY_ID "/heartbeat"
#define MQTT_TOPIC_CONFIG      "loopsolar/" GATEWAY_ID "/config"
#define MQTT_TOPIC_STATUS      "loopsolar/" GATEWAY_ID "/status"

// ---- RS485 / Modbus ----
#define RS485_RX_PIN        16
#define RS485_TX_PIN        17
#define RS485_DE_RE_PIN     4       // Driver Enable / Receiver Enable
#define MODBUS_BAUD_RATE    9600
#define MODBUS_SERIAL_CONFIG SERIAL_8N1
#define MODBUS_TIMEOUT_MS   2000
#define MODBUS_RETRY_COUNT  3
#define MODBUS_INTER_DEVICE_DELAY_MS  100
#define MODBUS_INTER_REGISTER_DELAY_MS 50
#define MAX_DEVICES         20

// ---- Polling ----
#define DEFAULT_POLL_INTERVAL_MS  10000   // 10 seconds
#define HEARTBEAT_INTERVAL_MS     30000   // 30 seconds

// ---- Offline Buffer (SPIFFS) ----
#define BUFFER_FILE_PATH    "/buffer.json"
#define MAX_BUFFER_ENTRIES  1000
#define BUFFER_FLUSH_BATCH  50

// ---- OTA Updates ----
#define OTA_CHECK_INTERVAL_MS     3600000  // 1 hour
#define OTA_SERVER_URL      "http://65.0.220.190:3001/api/ota"
#define OTA_PORT            3232
#define OTA_PASSWORD        "loopsolar_ota_2026"

// ---- NTP ----
#define NTP_SERVER          "pool.ntp.org"
#define NTP_GMT_OFFSET      19800    // IST = UTC+5:30 = 19800 seconds
#define NTP_DAYLIGHT_OFFSET 0

// ---- Watchdog ----
#define WDT_TIMEOUT_SECONDS  30

// ---- Data Types for Modbus Registers ----
enum ModbusDataType {
    INT16     = 0,
    INT32     = 1,
    FLOAT32   = 2,    // IEEE 754 float (CDAB byte order)
    FLOAT32_ABCD = 3, // IEEE 754 float (ABCD byte order)
    INT64     = 4,
    UINT16    = 5,
    UINT32    = 6
};

// ---- Register Map Entry ----
struct RegisterEntry {
    uint16_t address;
    ModbusDataType dataType;
    const char* paramName;
    float scaleFactor;
    uint8_t registerCount;  // number of 16-bit registers (1, 2, or 4)
};

// ---- Device Profile ----
struct DeviceProfile {
    char deviceId[32];
    char deviceType[32];
    char templateName[64];
    uint8_t slaveId;
    RegisterEntry* registers;
    uint8_t registerCount;
};
