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

**What Still Works:**
- ✅ Early power return notifications (triggered on `offline → online` transition)
- ✅ Grid status history recording
- ✅ UI status indicator (though may be stale)

**What's Disabled:**
- ❌ Early offline notifications
- ❌ Emergency offline notifications

---

## Field Reference

### HeartbeatPack (cmdFunc=1, cmdId=1)

| Field | Observed Values | Suspected Purpose | Reliable? |
|-------|-----------------|-------------------|-----------|
| f1.f1 | 0, 1, 2 | Power source (1=battery, 2=AC) | Transitions only |
| f1.f4 | ~22000 | Possibly AC voltage (mV) | Unknown |
| f1.f5 | ~18000-30000 | Possibly AC power (mW) | Unknown |
| f1.f9 | 0-100 | Battery percentage | Yes |
| f1.f15 | 0-100 (float) | Battery level (precise) | Yes |
| f2.f4 | 0, 2 | Inverter/flow state | NO - false positives |

### JSON Fields (RIVER 2, may differ for RIVER 3)

| Field | Purpose |
|-------|---------|
| inv.inputWatts | AC input power (W) |
| inv.acInVol | AC input voltage (mV) |
| inv.outputWatts | AC output power (W) |
| bms_emsStatus.chgState | Charging state |
| pd.wattsInSum | Total input power |

---

## Next Steps

1. **Apply for EcoFlow Developer API** - Official REST API with documented endpoints
   - URL: https://developer.ecoflow.com/
   - Provides `acInputConnected` status reliably

2. **Alternative Detection Methods:**
   - Monitor `inv.inputWatts` > 0 from JSON messages (if available)
   - Use `f1.f4`/`f1.f5` thresholds (AC voltage/power)
   - Poll device status on startup via REST API

3. **Community Resources:**
   - Watch [hassio-ecoflow-cloud](https://github.com/tolwi/hassio-ecoflow-cloud) for RIVER 3 support
   - Check EcoFlow Discord/forums for protocol documentation

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
| `79cd893` | **Disable offline notifications** - f2.f4 unreliable |
