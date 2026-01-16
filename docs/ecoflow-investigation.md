# EcoFlow RIVER 3 Protocol Investigation

## Overview

This document tracks our attempts to detect AC grid status from the EcoFlow RIVER 3 power station via MQTT messaging. The goal was to send Telegram notifications when power goes offline (early/emergency) and comes back online (early return).

## Timeline

### Phase 1: Initial Integration (Jan 13, 2026)

**Goal:** Connect to EcoFlow MQTT broker and detect grid status changes.

**Approach:**
- Reverse-engineered EcoFlow mobile app authentication flow
- Connected to `mqtt-e.ecoflow.com:8883` using credentials from `/iot-auth/app/certification`
- Subscribed to `/app/device/property/{deviceSN}` for device updates

**Protocol Discovery:**
- RIVER 3 uses protobuf messages with XOR encryption (not plain JSON)
- Messages wrapped in `HeaderMessage` structure with fields: `pdata`, `encType`, `seq`, `cmdFunc`, `cmdId`
- Inner payload XOR-encrypted (key auto-detected from first byte)

**Initial Field Mapping:**
```
HeartbeatPack (cmdFunc=1, cmdId=1):
- f1.f1: Power source indicator
  - 1 = battery/standby
  - 2 = AC charging
```

**Result:** Successfully detected power source transitions (1↔2).

---

### Phase 2: Telegram Notifications

**Implemented:**
1. **Early Power Return** - When power returns during scheduled outage
   - Calculates minutes early
   - Sends: "🎉 Світло повернулося раніше! На X хв раніше"

2. **Early Offline** - When power goes offline within 30 min before schedule
   - Sends: "⚠️ Світло вимкнули раніше"

3. **Emergency Offline** - When power goes offline outside schedule
   - Sends: "🚨 Позапланове відключення!"

**Issue Found:** Timezone bug - server runs in UTC, notifications showed wrong time.

**Fix:** Used `Europe/Kyiv` timezone for all time calculations:
```javascript
const kyivTime = now.toLocaleString('en-GB', {
  timeZone: 'Europe/Kyiv',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});
```

---

### Phase 3: Stale Status Problem

**Issue:** After server restart, grid status shows "unknown" until next power toggle.

**Investigation:** The `f1.f1` field only reports on **transitions**, not continuous state.

**Attempted Fix:** Look for alternative fields in HeartbeatPack.

**Debug Logging Added:**
```javascript
// Log all fields when power source changes
console.log('[EcoFlow] Changed fields:', changes.join(', '));
```

**Fields Discovered During Power Toggle:**
```
OFFLINE → ONLINE transition:
- f1.f1: 0 → 2     (power source)
- f1.f4: 21910 → 22530 (possibly voltage)
- f1.f5: 18324 → 30302 (possibly power in mW)
- f1.f12: 5079 → 1
- f2.f4: 0 → 2     (appeared to mirror power source!)
```

**Hypothesis:** `f2.f4` might be a continuous AC state indicator present in every heartbeat.

**Implementation:** Changed primary detection to use `f2.f4`:
```javascript
// Primary: f2.f4 - continuous AC state indicator (0=offline, 2=online)
const acState = allFields['f2.f4'];
if (typeof acState === 'number') {
  updateGridStatus(acState === 2 ? 'online' : 'offline', `acState(f2.f4)=${acState}`);
  return;
}
```

---

### Phase 4: False Positives (FAILURE)

**Problem:** Received emergency offline notification at 22:29 when there was NO actual grid change.

**User Report:**
> "there were no changes on grid looks like param we found is irrelevant it might be inverter switch or flow indicator but definitely not ac charger status"

**Analysis:**
- `f2.f4` changes when the **inverter output** is toggled, not when AC input connects/disconnects
- The field is related to internal power flow management, not external grid status
- False positives occur when device switches between charging modes or inverter states

**Home Assistant Integration Research:**

Checked GitHub repositories:
- [tolwi/hassio-ecoflow-cloud](https://github.com/tolwi/hassio-ecoflow-cloud) - No RIVER 3 support
- [TarasKhust/ecoflow-api-mqtt](https://github.com/TarasKhust/ecoflow-api-mqtt) - Uses official Developer API

**RIVER 2 Field Mappings (from HA integration):**
```python
# JSON field names (not protobuf numbers)
"inv.inputWatts"        # AC input power
"inv.acInVol"           # AC input voltage
"bms_emsStatus.chgState" # Charging state
```

**Key Insight:** RIVER 3 uses newer protobuf protocol that differs from RIVER 2's JSON-based messaging. The correct fields for AC input detection are not yet documented.

---

### Phase 5: Current State

**Decision:** Disabled offline notifications due to unreliable detection.

```javascript
// NOTE: Offline notifications disabled - f2.f4 field unreliable for RIVER 3
// The field triggers on inverter state changes, not actual grid status
// TODO: Re-enable when EcoFlow Developer API provides reliable AC input status
```

---

### Phase 6: ioBroker Approach (Jan 16, 2026) - FAILED

**Attempted:** Implemented the ioBroker approach - request `latestQuotas` to get DisplayPropertyUpload.

**Implementation:**
1. Subscribe to `/app/{userId}/{sn}/thing/property/get_reply`
2. Publish `latestQuotas` request to `/app/{userId}/{sn}/thing/property/get`
3. Receive DisplayPropertyUpload with `plug_in_info_ac_in_flag` (field 61)

**Result:** Still produced false positives. At 01:34 received "early power return" notification when grid was still offline.

---

### Phase 7: Rollback to Simple Detection (Jan 17, 2026)

**Problem:** DisplayPropertyUpload fields (61, 47, 54, 202) all proved unreliable for RIVER 3 - producing false positive "online" readings when grid was actually offline.

**Decision:** Roll back to the simplest, most reliable approach:
- **Only use HeartbeatPack f1.f1=2** for online detection (AC charging mode)
- **Disable ALL offline detection** - no reliable indicator found
- Remove all complex DisplayPropertyUpload logic, latestQuotas polling, and multi-field priority system

**Current Status:**
- ✅ Early power return notifications (online transition via f1.f1=2)
- ❌ Offline notifications DISABLED - no reliable indicator
- ✅ Grid status history recording (online transitions only)
- ⚠️ Status shows "unknown" after restart until f1.f1=2 is received

**Code simplified:** Removed ~500 lines of complex detection logic.

---

## Field Reference

### HeartbeatPack (cmdFunc=1, cmdId=1) - **ONLY RELIABLE SOURCE**

| Field | Observed Values | Purpose | Reliable? |
|-------|-----------------|---------|-----------|
| f1.f1 | 0, 1, 2 | Power source (1=battery, 2=AC) | ✅ f1.f1=2 ONLY |
| f1.f9 | 0-100 | Battery percentage | ✅ Yes |
| f1.f15 | 0-100 (float) | Battery level (precise) | ✅ Yes |
| f2.f4 | 0, 1, 2 | Inverter/flow state | ❌ NO - false positives |

**Important:** f1.f1=1 is AMBIGUOUS - could mean:
- Grid offline (battery discharging)
- Grid online but battery full (not charging)
- Grid online but charging paused

### DisplayPropertyUpload (cmdFunc=254, cmdId=21) - **UNRELIABLE FOR RIVER 3**

| Field # | Name | Values | Reliable? |
|---------|------|--------|-----------|
| 61 | plug_in_info_ac_in_flag | 0=offline, 1=online | ❌ False positives |
| 202 | plug_in_info_ac_charger_flag | 0=not charging, 1=charging | ❌ False positives |
| 54 | pow_get_ac_in | AC input power (W) | ❌ False positives |
| 47 | flow_info_ac_in | AC input flow | ❌ False positives |

---

## Current Solution (Jan 17, 2026)

**Simple HeartbeatPack detection only:**
1. Subscribe to `/app/device/property/{deviceSN}` (legacy topic)
2. Receive HeartbeatPack messages (cmdFunc=1, cmdId=1)
3. Check f1.f1 field: **only f1.f1=2 reliably indicates grid online**
4. Trigger "early power return" notification when transitioning from offline/unknown to online

**Limitations:**
- Cannot detect offline transitions reliably
- Status remains "unknown" until f1.f1=2 is received
- No immediate status on startup

**Why this is the best we can do:**
The RIVER 3 protocol differs significantly from older EcoFlow devices. No field reliably indicates AC disconnection. The f1.f1=2 (AC charging) is the only proven indicator, and it only works when the battery is actively charging.

---

## Commits

| Commit | Description |
|--------|-------------|
| `19a2e3f` | Add backup, system, grid-export endpoints |
| `127bdb8` | Fix timezone bug (Europe/Kyiv) |
| `711e1f1` | Document EcoFlow limitations |
| `142e3e0` | Use f2.f4 as primary indicator (later found unreliable) |
| `57117f2` | Add early/emergency offline notifications |
| `f10a9d2` | Fix offline notification to trigger from unknown state |
| `79cd893` | Disable offline notifications - f2.f4 unreliable |
| Jan 16, 2026 | ioBroker approach with latestQuotas (later found unreliable) |
| Jan 17, 2026 | **Rollback** - Simple f1.f1=2 detection only, offline disabled |
