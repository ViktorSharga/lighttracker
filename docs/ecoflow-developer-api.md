# EcoFlow Developer REST API Investigation

## Overview

This document summarizes the investigation of the EcoFlow Developer REST API for accessing RIVER 3 device data. The goal was to find a reliable alternative to MQTT for detecting AC grid status.

## API Access

**Status: Partially Working**

| Feature | Status | Notes |
|---------|--------|-------|
| Authentication | ✅ Works | HMAC-SHA256 with AccessKey/SecretKey |
| Device List | ✅ Works | RIVER 3 visible, online status available |
| Device Quota | ❌ Blocked | "current device is not allowed to get device info" |

## Credentials

Obtained from [EcoFlow Developer Portal](https://developer.ecoflow.com/):

```
AccessKey: dMmK***  (stored in .env.local)
SecretKey: 5TeQ***  (stored in .env.local)
```

## API Details

### Authentication

The API uses HMAC-SHA256 signature authentication:

```javascript
// Sign string format (no query params):
signStr = `accessKey=${accessKey}&nonce=${nonce}&timestamp=${timestamp}`

// Sign string format (with query params):
signStr = `param1=val1&param2=val2&accessKey=${accessKey}&nonce=${nonce}&timestamp=${timestamp}`

// Generate signature
sign = HMAC-SHA256(signStr, secretKey).toHex()
```

**Required Headers:**
- `accessKey`: Your access key
- `nonce`: Random 6-digit number
- `timestamp`: Milliseconds since epoch
- `sign`: HMAC-SHA256 signature

### Endpoints Tested

| Endpoint | Method | Result |
|----------|--------|--------|
| `/iot-open/sign/device/list` | GET | ✅ Success |
| `/iot-open/sign/device/quota` | GET/POST | ❌ 405 / "params empty" |
| `/iot-open/sign/device/quota/all` | GET | ❌ "device not allowed" |

### Device List Response

```json
{
  "code": "0",
  "data": [{
    "sn": "R655ZEB4XGCD0793",
    "deviceName": "RIVER 3-0793",
    "online": 1
  }]
}
```

## RIVER 3 Support Status

**REST API: Intentionally Blocked** by EcoFlow as of July 2025.

The RIVER 3 appears in the device list but returns "current device is not allowed to get device info" when querying quota data via REST API.

### Why It's Blocked

According to [GitHub issues](https://github.com/tolwi/hassio-ecoflow-cloud/issues/540):

> "Due to previous instances of unauthorized access to product categories still under development, EcoFlow has closed unofficial access points."

**Timeline:**
- July 31, 2025: EcoFlow blocked REST API access for newer devices
- Affected: RIVER 3, DELTA 3, Stream devices, and others
- This is a **permanent server-side restriction**, not a bug

### Tested Quota Fields

Both naming conventions were tested and both fail with "device not allowed":

| Style | Fields Tested | Result |
|-------|---------------|--------|
| RIVER 2 Pro | `inv.inputWatts`, `inv.acInVol`, `pd.wattsInSum`, `bms_emsStatus.chgState` | ❌ Blocked |
| RIVER 3 | `plugInInfoAcInFlag`, `plugInInfoAcInVol`, `powGetAcIn`, `bmsBattSoc` | ❌ Blocked |

### Working Alternative

**MQTT still works!** The [ioBroker MQTT integration](https://github.com/foxthefox/ioBroker.ecoflow-mqtt) continues to function for RIVER 3 devices. This is the only reliable method for accessing device data.

## RIVER 3 Field Reference

Based on [ioBroker.ecoflow-mqtt documentation](https://github.com/foxthefox/ioBroker.ecoflow-mqtt/blob/main/doc/devices/river3plus.md):

### AC Input Detection Fields (DisplayPropertyUpload)

| Field | Description | Values |
|-------|-------------|--------|
| `plugInInfoAcInFlag` | **AC port connection status** | 0=disconnected, 1=connected |
| `plugInInfoAcInVol` | AC input voltage | 0-250 V |
| `plugInInfoAcInAmp` | AC input current | 0-30 A |
| `plugInInfoAcInFeq` | AC input frequency | 0-61 Hz |
| `flowInfoAcIn` | AC input switch status | 0=off, 2=on |
| `plugInInfoAcChargerFlag` | AC charger status | 0=not charging, 1=charging |
| `powGetAcIn` | Real-time AC input power | 0-8000 W |

### Power Summary Fields

| Field | Description | Range |
|-------|-------------|-------|
| `powInSumW` | Total input power | 0-800 W |
| `powOutSumW` | Total output power | 0-1000 W |
| `bmsBattSoc` | Battery SOC | 0-100% |
| `bmsChgDsgState` | Charge/discharge state | 0=none, 1=discharging, 2=charging |

### Key Insight

The **`plugInInfoAcInFlag`** field is the reliable AC grid status indicator:
- `1` = AC connected (grid online)
- `0` = AC disconnected (grid offline)

This field is available in `DisplayPropertyUpload` MQTT messages, NOT via REST API quota.

### Current Implementation Status (Updated Jan 16, 2026)

**✅ WORKING SOLUTION FOUND!**

The `src/ecoflow.js` code now successfully retrieves `plugInInfoAcInFlag` by implementing the ioBroker approach:

1. **Subscribe to `get_reply` topic**: `/app/{userId}/{sn}/thing/property/get_reply`
2. **Send `latestQuotas` request**: Publish to `/app/{userId}/{sn}/thing/property/get` with cmdFunc=20, cmdId=1
3. **Decode DisplayPropertyUpload response**: Extract `plug_in_info_ac_in_flag` (field 61)

**Implementation details:**
- Topic subscriptions: `get_reply`, `set_reply`, and legacy `/app/device/property/{sn}`
- Request format: Protobuf HeaderMessage with cmdFunc=20, cmdId=1
- Response format: DisplayPropertyUpload (cmdFunc=254, cmdId=21) - direct protobuf, no HeaderMessage wrapper
- Grid status: `plug_in_info_ac_in_flag=0` (offline), `=1` (online)

**Example log output:**
```
[EcoFlow DEBUG] Message on topic: .../get_reply (1449 bytes)
[EcoFlow DEBUG] get_reply decoded (1 fields)
[EcoFlow] Grid status changed: offline (get_reply.plug_in_info_ac_in_flag=0)
[GridStorage] Recorded: offline at 2026-01-16T15:56:56.108Z
```

### HeartbeatPack Fields (cmdFunc=1, cmdId=1)

Still received on legacy topic for debugging:
```
f1.f1: 1        (power source: 1=battery, 2=AC)
f1.f4: 0        (possibly AC voltage when connected)
f1.f5: 0        (possibly AC power when connected)
f1.f9: 100      (battery SOC %)
f1.f15: 99.66   (battery SOC float)
f2.f4: 1        (inverter state - UNRELIABLE, not used)
f2.f5: 259      (unknown)
```

## Test Script

Location: `scripts/test-ecoflow-api.js`

```bash
# Run via Docker
docker compose exec -e AccessKey=XXX -e SecretKey=XXX \
  -e ECOFLOW_DEVICE_SN=R655ZEB4XGCD0793 \
  -e ECOFLOW_API_HOST=api.ecoflow.com \
  lighttracker node scripts/test-ecoflow-api.js
```

## Comparison: REST API vs MQTT

| Feature | REST API | MQTT (current) |
|---------|----------|----------------|
| Authentication | AccessKey/SecretKey | Email/Password |
| RIVER 3 Support | ❌ Quota blocked | ✅ **Working** |
| Grid Status | N/A | ✅ `plug_in_info_ac_in_flag` |
| Polling | On-demand | Request + Push |
| Reliability | N/A | Connection drops (auto-reconnect) |

## Solution Summary

The working approach (from ioBroker.ecoflow-mqtt):
1. Subscribe to `/app/{userId}/{sn}/thing/property/get_reply`
2. Publish `latestQuotas` request to `/app/{userId}/{sn}/thing/property/get`
3. Receive DisplayPropertyUpload with `plug_in_info_ac_in_flag`

REST API quota endpoint is intentionally blocked for RIVER 3 - use MQTT instead.

## Resources

- [EcoFlow Developer Portal](https://developer.ecoflow.com/)
- [API Examples (GitHub)](https://github.com/Mark-Hicks/ecoflow-api-examples)
- [hassio-ecoflow-cloud](https://github.com/tolwi/hassio-ecoflow-cloud)
- [ioBroker.ecoflow-mqtt](https://github.com/foxthefox/ioBroker.ecoflow-mqtt)

## Timeline

| Date | Event |
|------|-------|
| Jan 14, 2026 | MQTT integration completed (see ecoflow-investigation.md) |
| Jan 16, 2026 | Developer API access granted |
| Jan 16, 2026 | REST API tested - RIVER 3 quota blocked |
| Jan 16, 2026 | **✅ Working solution**: ioBroker approach implemented - `latestQuotas` request to get `plug_in_info_ac_in_flag` |
