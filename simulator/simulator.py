#!/usr/bin/env python3
"""
Loop Solar — Modbus RTU Simulator
Simulates a Secure Elite 440 energy meter and generic solar inverter
for development and testing without physical hardware.

Usage:
    python simulator.py                    # TCP mode (default port 5020)
    python simulator.py --port 5020        # Custom TCP port
    python simulator.py --serial COM3      # Serial mode (for USB-RS485)
"""

import struct
import math
import time
import random
import argparse
import threading
from datetime import datetime

from pymodbus.server import StartTcpServer
from pymodbus.datastore import ModbusSlaveContext, ModbusServerContext
from pymodbus.datastore.store import ModbusSequentialDataBlock

# ============================================================
# Simulated register values
# ============================================================

def float_to_cdab_registers(value):
    """Convert float to two 16-bit registers in CDAB byte order"""
    packed = struct.pack('>f', value)  # Big-endian float
    high = struct.unpack('>H', packed[0:2])[0]
    low = struct.unpack('>H', packed[2:4])[0]
    return [low, high]  # CDAB: swap word order

def build_meter_registers():
    """Build Secure Elite 440 register block with realistic values"""
    # Create a large register block (addresses 0-4000)
    registers = [0] * 4000
    
    # Time of day affects solar generation
    hour = datetime.now().hour
    solar_factor = max(0, math.sin((hour - 6) * math.pi / 12)) if 6 <= hour <= 18 else 0
    noise = lambda: random.uniform(-0.5, 0.5)
    
    # Current (addresses 3009-3014) — Float32 CDAB
    base_current = 5.0 * solar_factor + noise()
    for i, offset in enumerate([3009, 3011, 3013]):
        val = max(0, base_current + noise())
        regs = float_to_cdab_registers(val)
        registers[offset] = regs[0]
        registers[offset + 1] = regs[1]
    
    # Voltage (addresses 3027-3032) — Float32 CDAB
    for i, offset in enumerate([3027, 3029, 3031]):
        phase_offset = i * 0.5
        val = 230.0 + phase_offset + noise()
        regs = float_to_cdab_registers(val)
        registers[offset] = regs[0]
        registers[offset + 1] = regs[1]
    
    # Power (address 3053) — Float32 CDAB
    total_power = 3 * 230.0 * base_current * 0.001  # kW (approx)
    regs = float_to_cdab_registers(max(0, total_power + noise() * 0.1))
    registers[3053] = regs[0]
    registers[3054] = regs[1]
    
    # Reactive Power (address 3059)
    reactive = total_power * 0.1 + noise() * 0.05
    regs = float_to_cdab_registers(reactive)
    registers[3059] = regs[0]
    registers[3060] = regs[1]
    
    # Apparent Power (address 3065)
    apparent = math.sqrt(total_power**2 + reactive**2)
    regs = float_to_cdab_registers(apparent)
    registers[3065] = regs[0]
    registers[3066] = regs[1]
    
    # Power Factor (address 3083)
    pf = total_power / apparent if apparent > 0 else 1.0
    regs = float_to_cdab_registers(min(1.0, max(0, pf)))
    registers[3083] = regs[0]
    registers[3084] = regs[1]
    
    # Frequency (address 3109)
    freq = 50.0 + noise() * 0.05
    regs = float_to_cdab_registers(freq)
    registers[3109] = regs[0]
    registers[3110] = regs[1]
    
    # Energy Import (address 3203) — increases over time
    energy_import = 12345.67 + time.time() % 100 * 0.001
    regs = float_to_cdab_registers(energy_import)
    registers[3203] = regs[0]
    registers[3204] = regs[1]
    
    # Energy Export (address 3207)
    energy_export = 234.56
    regs = float_to_cdab_registers(energy_export)
    registers[3207] = regs[0]
    registers[3208] = regs[1]
    
    # THD Voltage (addresses 3421-3426)
    for offset in [3421, 3423, 3425]:
        thd = random.uniform(1.0, 5.0)
        regs = float_to_cdab_registers(thd)
        registers[offset] = regs[0]
        registers[offset + 1] = regs[1]
    
    return registers


def build_inverter_registers():
    """Build generic inverter register block"""
    registers = [0] * 100
    
    hour = datetime.now().hour
    solar_factor = max(0, math.sin((hour - 6) * math.pi / 12)) if 6 <= hour <= 18 else 0
    noise = lambda: random.uniform(-0.5, 0.5)
    
    # Status code (address 0) — 1=running, 0=standby
    registers[0] = 1 if solar_factor > 0.1 else 0
    
    # DC Voltage (address 1-2)
    dc_v = 380.0 * solar_factor + noise() * 5 if solar_factor > 0 else 0
    regs = float_to_cdab_registers(dc_v * 10)  # scale 0.1
    registers[1] = regs[0]; registers[2] = regs[1]
    
    # DC Current (address 3-4)
    dc_i = 8.5 * solar_factor + noise() * 0.3 if solar_factor > 0 else 0
    regs = float_to_cdab_registers(dc_i * 100)  # scale 0.01
    registers[3] = regs[0]; registers[4] = regs[1]
    
    # DC Power (address 5-6)
    regs = float_to_cdab_registers(dc_v * dc_i)
    registers[5] = regs[0]; registers[6] = regs[1]
    
    # AC Voltage (address 7-8)
    regs = float_to_cdab_registers(230.5 * 10)
    registers[7] = regs[0]; registers[8] = regs[1]
    
    # AC Current (address 9-10)
    ac_i = dc_v * dc_i / 230.5 * 0.97 if dc_v > 0 else 0  # efficiency ~97%
    regs = float_to_cdab_registers(ac_i * 100)
    registers[9] = regs[0]; registers[10] = regs[1]
    
    # AC Power (address 11-12)
    regs = float_to_cdab_registers(230.5 * ac_i)
    registers[11] = regs[0]; registers[12] = regs[1]
    
    # AC Frequency (address 13-14)
    regs = float_to_cdab_registers(50.0 * 100)
    registers[13] = regs[0]; registers[14] = regs[1]
    
    # Energy Today (address 15-16)
    regs = float_to_cdab_registers(23.45 * 100)
    registers[15] = regs[0]; registers[16] = regs[1]
    
    # Energy Total (address 17-18)
    regs = float_to_cdab_registers(45678.9 * 10)
    registers[17] = regs[0]; registers[18] = regs[1]
    
    # Temperature (address 19-20)
    temp = 35.0 + solar_factor * 15 + noise()
    regs = float_to_cdab_registers(temp * 10)
    registers[19] = regs[0]; registers[20] = regs[1]
    
    return registers


class UpdatingDataBlock(ModbusSequentialDataBlock):
    """Data block that refreshes values on each read"""
    def __init__(self, update_fn, address=0, count=4000):
        values = [0] * count
        super().__init__(address, values)
        self._update_fn = update_fn
    
    def getValues(self, address, count=1):
        # Refresh registers before reading
        new_values = self._update_fn()
        for i, v in enumerate(new_values):
            if i < len(self.values):
                self.values[i] = v
        return super().getValues(address, count)


def run_updater(meter_block, inverter_blocks):
    """Periodically update register values"""
    while True:
        time.sleep(2)  # Update every 2 seconds


def main():
    parser = argparse.ArgumentParser(description='Loop Solar Modbus Simulator')
    parser.add_argument('--port', type=int, default=5020, help='TCP port (default: 5020)')
    parser.add_argument('--serial', type=str, default=None, help='Serial port for RTU mode')
    parser.add_argument('--inverters', type=int, default=3, help='Number of inverters to simulate')
    args = parser.parse_args()
    
    print("╔══════════════════════════════════════╗")
    print("║  Loop Solar — Modbus Simulator       ║")
    print("╚══════════════════════════════════════╝")
    
    # Create slave contexts
    slaves = {}
    
    # Slave 1: Secure Elite 440 energy meter
    meter_block = UpdatingDataBlock(build_meter_registers, address=0, count=4000)
    slaves[1] = ModbusSlaveContext(
        di=ModbusSequentialDataBlock(0, [0]*100),
        co=ModbusSequentialDataBlock(0, [0]*100),
        hr=meter_block,
        ir=ModbusSequentialDataBlock(0, [0]*100),
    )
    print(f"  → Slave 1: Secure Elite 440 Energy Meter")
    
    # Slaves 2-N: Solar inverters
    inverter_blocks = []
    for i in range(args.inverters):
        slave_id = i + 2
        inv_block = UpdatingDataBlock(build_inverter_registers, address=0, count=100)
        inverter_blocks.append(inv_block)
        slaves[slave_id] = ModbusSlaveContext(
            di=ModbusSequentialDataBlock(0, [0]*100),
            co=ModbusSequentialDataBlock(0, [0]*100),
            hr=inv_block,
            ir=ModbusSequentialDataBlock(0, [0]*100),
        )
        print(f"  → Slave {slave_id}: Solar Inverter #{i+1}")
    
    context = ModbusServerContext(slaves=slaves, single=False)
    
    # Start updater thread
    updater = threading.Thread(target=run_updater, args=(meter_block, inverter_blocks), daemon=True)
    updater.start()
    
    print(f"\n  Listening on TCP port {args.port}...")
    print(f"  Connect your ESP32 or test with: pymodbus.console tcp --port {args.port}\n")
    
    StartTcpServer(context=context, address=("0.0.0.0", args.port))


if __name__ == "__main__":
    main()
