/**
 * EcoFlow RIVER 3 Grid Status Integration
 *
 * Connects to EcoFlow MQTT broker to detect real-time grid power status.
 * Uses protobuf messages with XOR encryption from the device.
 *
 * RELIABLE detection (HeartbeatPack cmdFunc=1, cmdId=1):
 * - f1.f1 = 2: AC charging mode → Grid ONLINE (reliable)
 * - f1.f1 = 1: Battery mode → Could be offline OR full battery (ambiguous)
 *
 * IMPORTANT: Only f1.f1=2 transition is used for online detection.
 * Offline detection is DISABLED due to unreliable indicators.
 *
 * Previous attempts that proved UNRELIABLE for RIVER 3:
 * - DisplayPropertyUpload fields (61, 47, 54, 202) - false positives
 * - f2.f4 from HeartbeatPack - triggers on inverter state changes
 * - latestQuotas requests - responses also unreliable
 *
 * See docs/ecoflow-investigation.md for full investigation history.
 */

const mqtt = require('mqtt');
const protobuf = require('protobufjs');
const { addGridStatusRecord } = require('./grid-storage');

// State
let mqttClient = null;
let gridStatus = 'unknown';
let lastUpdate = null;
let isConnected = false;
let userId = null;
let getLatestSchedulesFn = null; // Function to get current schedule for history recording
let onGridOnlineCallback = null; // Callback for when grid comes back online
// Note: onGridOfflineCallback removed - offline detection disabled due to unreliable indicators

// Environment variables
const ECOFLOW_EMAIL = process.env.ECOFLOW_EMAIL;
const ECOFLOW_PASSWORD = process.env.ECOFLOW_PASSWORD;
const ECOFLOW_DEVICE_SN = process.env.ECOFLOW_DEVICE_SN;
const ECOFLOW_API_HOST = process.env.ECOFLOW_API_HOST || 'api.ecoflow.com';
const ECOFLOW_GROUP = process.env.ECOFLOW_GROUP;
const DEBUG_ECOFLOW = process.env.DEBUG_ECOFLOW === 'true';

/**
 * Get current grid status
 */
function getGridStatus() {
  return {
    status: gridStatus,
    lastUpdate: lastUpdate,
    connected: isConnected,
    ecoflowGroup: ECOFLOW_GROUP || null
  };
}

/**
 * Initialize EcoFlow integration
 * @param {Function} getLatestSchedules - Function to get current schedule for history recording
 * @param {Function} onGridOnline - Callback when grid power is restored (f1.f1=2 detected)
 * @param {Function} _onGridOffline - UNUSED - Offline detection disabled due to unreliable indicators
 */
async function initEcoFlow(getLatestSchedules, onGridOnline, _onGridOffline) {
  // Store the schedule getter for use in updateGridStatus
  getLatestSchedulesFn = getLatestSchedules || null;
  onGridOnlineCallback = onGridOnline || null;
  // Note: onGridOffline callback intentionally ignored - offline detection disabled

  if (!ECOFLOW_EMAIL || !ECOFLOW_PASSWORD || !ECOFLOW_DEVICE_SN) {
    console.log('[EcoFlow] Integration disabled (missing credentials)');
    return false;
  }

  console.log(`[EcoFlow] Initializing for device ${maskSN(ECOFLOW_DEVICE_SN)}...`);

  try {
    const credentials = await getEcoFlowCredentials();
    await connectMQTT(credentials);
    return true;
  } catch (err) {
    console.error('[EcoFlow] Initialization failed:', err.message);
    return false;
  }
}

/**
 * Cleanup on shutdown
 */
function closeEcoFlow() {
  if (mqttClient) {
    console.log('[EcoFlow] Closing connection...');
    mqttClient.end();
    mqttClient = null;
  }
}

// ============================================================================
// Authentication
// ============================================================================

/**
 * Authenticate with EcoFlow API and get MQTT credentials
 */
async function getEcoFlowCredentials() {
  const loginUrl = `https://${ECOFLOW_API_HOST}/auth/login`;
  const certUrl = `https://${ECOFLOW_API_HOST}/iot-auth/app/certification`;

  console.log(`[EcoFlow] Authenticating via ${ECOFLOW_API_HOST}...`);

  // Step 1: Login to get bearer token
  const loginResponse = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      os: 'linux',
      scene: 'IOT_APP',
      appVersion: '1.0.0',
      osVersion: 'NodeJS',
      password: Buffer.from(ECOFLOW_PASSWORD).toString('base64'),
      oauth: { bundleId: 'com.ef.EcoFlow' },
      email: ECOFLOW_EMAIL,
      userType: 'ECOFLOW'
    })
  });

  if (!loginResponse.ok) {
    throw new Error(`Login failed: ${loginResponse.status}`);
  }

  const loginData = await loginResponse.json();

  if (loginData.code !== '0' && loginData.code !== 0) {
    throw new Error(`Login error: ${loginData.message || 'Unknown error'}`);
  }

  const token = loginData.data?.token;
  userId = loginData.data?.user?.userId;

  if (!token) {
    throw new Error('No token received from login');
  }

  console.log('[EcoFlow] Login successful, fetching MQTT credentials...');

  // Step 2: Get MQTT certification
  const certResponse = await fetch(certUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

  if (!certResponse.ok) {
    throw new Error(`Certification failed: ${certResponse.status}`);
  }

  const certData = await certResponse.json();

  if (certData.code !== '0' && certData.code !== 0) {
    throw new Error(`Certification error: ${certData.message || 'Unknown error'}`);
  }

  const mqttUrl = certData.data?.url;
  const mqttPort = certData.data?.port || 8883;
  console.log(`[EcoFlow] MQTT broker: ${mqttUrl}:${mqttPort}`);

  return {
    protocol: certData.data?.protocol || 'mqtts',
    url: mqttUrl,
    port: mqttPort,
    username: certData.data?.certificateAccount,
    password: certData.data?.certificatePassword
  };
}

// ============================================================================
// MQTT Connection
// ============================================================================

/**
 * Connect to EcoFlow MQTT broker
 */
async function connectMQTT(credentials) {
  const brokerUrl = `${credentials.protocol}://${credentials.url}:${credentials.port}`;
  const clientId = `ANDROID_${generateUUID()}_${userId}`;

  console.log('[EcoFlow] Connecting to MQTT broker...');

  mqttClient = mqtt.connect(brokerUrl, {
    username: credentials.username,
    password: credentials.password,
    clientId: clientId,
    connectTimeout: 30000,
    reconnectPeriod: 5000,
    clean: true
  });

  mqttClient.on('connect', () => {
    console.log('[EcoFlow] Connected to MQTT broker');
    isConnected = true;

    // Subscribe to legacy topic only - receives HeartbeatPack messages
    // This is the only reliable source for AC status detection (f1.f1=2)
    const topic = `/app/device/property/${ECOFLOW_DEVICE_SN}`;

    if (DEBUG_ECOFLOW) {
      console.log(`[EcoFlow DEBUG] UserId: ${userId}`);
      console.log(`[EcoFlow DEBUG] Subscribing to topic: ${topic}`);
    }

    mqttClient.subscribe(topic, (err) => {
      if (err) {
        console.error('[EcoFlow] Failed to subscribe:', err.message);
      } else {
        console.log(`[EcoFlow] Subscribed to device ${maskSN(ECOFLOW_DEVICE_SN)}`);
        console.log('[EcoFlow] Waiting for HeartbeatPack messages (f1.f1=2 = online)');
      }
    });
  });

  mqttClient.on('message', handleMessage);

  mqttClient.on('error', (err) => {
    console.error('[EcoFlow] MQTT error:', err.message);
    isConnected = false;
  });

  mqttClient.on('close', () => {
    console.log('[EcoFlow] MQTT connection closed');
    isConnected = false;
    gridStatus = 'unknown';
  });

  mqttClient.on('reconnect', () => {
    console.log('[EcoFlow] Attempting to reconnect...');
  });
}

// ============================================================================
// Message Processing
// ============================================================================

/**
 * Handle incoming MQTT message
 * Only processes protobuf HeaderMessage from legacy topic
 */
function handleMessage(topic, payload) {
  try {
    if (DEBUG_ECOFLOW) {
      console.log(`[EcoFlow DEBUG] Message on topic: ${topic} (${payload.length} bytes)`);
    }

    // Skip JSON messages - they don't contain reliable AC status for RIVER 3
    const raw = payload.toString();
    if (raw.startsWith('{')) {
      if (DEBUG_ECOFLOW) {
        console.log('[EcoFlow DEBUG] Skipping JSON message (unreliable for RIVER 3)');
      }
      return;
    }

    // Try base64 decode (some payloads are base64 encoded)
    let binaryPayload = payload;
    const payloadStr = payload.toString();
    if (/^[A-Za-z0-9+/=]+$/.test(payloadStr) && payloadStr.length > 20) {
      try {
        binaryPayload = Buffer.from(payloadStr, 'base64');
      } catch {
        // Not base64, use raw
      }
    }

    // Decode as protobuf HeaderMessage
    const reader = protobuf.Reader.create(binaryPayload);
    const headerMsg = decodeHeaderMessage(reader, binaryPayload.length);

    for (const header of headerMsg.headers) {
      processHeader(header);
    }
  } catch {
    // Ignore parsing errors for unknown message formats
  }
}

/**
 * Process a header entry - XOR decrypt and decode inner payload
 */
function processHeader(header) {
  if (!header.pdata || header.pdata.length === 0) return;

  // XOR decrypt the payload
  const pdata = xorDecrypt(header.pdata);

  // Decode inner protobuf and extract grid status
  try {
    const reader = protobuf.Reader.create(pdata);
    const data = decodeProtobufFlat(reader, pdata.length);
    extractGridStatus(data, header);
  } catch {
    // Ignore decode errors
  }
}

/**
 * Extract grid status from decoded protobuf data
 *
 * RELIABLE detection (HeartbeatPack cmdFunc=1, cmdId=1):
 * - f1.f1 = 2: AC charging mode → Grid ONLINE (reliable)
 * - f1.f1 = 1: Battery mode → IGNORED (could be offline OR full battery)
 *
 * All other message types and fields are ignored as they proved unreliable.
 */
function extractGridStatus(data, header) {
  // Only process HeartbeatPack messages (cmdFunc=1, cmdId=1)
  if (header.cmdFunc !== 1 || header.cmdId !== 1) {
    return;
  }

  const allFields = flattenNumericFields(data);
  const powerSource = allFields['f1.f1'];
  const batterySoc = allFields['f1.f9'];

  if (DEBUG_ECOFLOW) {
    console.log(`[EcoFlow DEBUG] HeartbeatPack: f1.f1=${powerSource}, battery=${batterySoc}%`);
  }

  // f1.f1=2 means actively charging from AC - definitely online
  // This is the ONLY reliable indicator for grid online status
  if (powerSource === 2) {
    updateGridStatus('online', `heartbeat.f1.f1=2 (AC charging)`);
    return;
  }

  // f1.f1=1 is AMBIGUOUS - could mean:
  // - Grid offline (battery discharging)
  // - Grid online but battery full (not charging)
  // - Grid online but charging paused
  //
  // IMPORTANT: We do NOT change status to offline based on f1.f1=1
  // Offline detection is disabled due to unreliable indicators.

  // Update timestamp for health monitoring
  lastUpdate = new Date().toISOString();
}

/**
 * Update grid status and log if changed
 * Records status changes to history with schedule reference
 * Triggers online callback when transitioning from offline to online (f1.f1=2)
 *
 * NOTE: Offline detection disabled - no reliable indicator found for RIVER 3
 */
function updateGridStatus(newStatus, source) {
  const previousStatus = gridStatus;

  if (newStatus !== previousStatus) {
    console.log(`[EcoFlow] Grid status changed: ${newStatus} (${source})`);

    // Get current schedule reference for history recording
    let scheduleRef = null;
    if (getLatestSchedulesFn) {
      try {
        const { current, dateKey } = getLatestSchedulesFn();
        if (current && dateKey) {
          scheduleRef = {
            dateKey: dateKey,
            fetchedAt: current.fetchedAt
          };
        }
      } catch {
        // Ignore errors getting schedule
      }
    }

    // Record the status change to history
    addGridStatusRecord(newStatus, scheduleRef);

    gridStatus = newStatus;

    // Trigger callback when power comes back online (from offline or unknown state)
    // This is the ONLY transition we detect reliably (f1.f1=2)
    // Include 'unknown' because after restart we don't know if power was off
    if (newStatus === 'online' && (previousStatus === 'offline' || previousStatus === 'unknown') && onGridOnlineCallback) {
      try {
        onGridOnlineCallback();
      } catch (err) {
        console.error('[EcoFlow] Error in onGridOnline callback:', err.message);
      }
    }

    // NOTE: Offline callback intentionally removed
    // No reliable offline indicator found for RIVER 3 (Jan 17, 2026)
  }
  lastUpdate = new Date().toISOString();
}

// ============================================================================
// Protobuf Decoding
// ============================================================================

/**
 * XOR decrypt payload - auto-detect key based on expected protobuf structure
 */
function xorDecrypt(pdata) {
  const firstByte = pdata[0];

  // Valid protobuf starts with 0x0a (field 1, length-delimited) or 0x08 (field 1, varint)
  // Find XOR key that produces valid protobuf start
  const possibleKeys = [
    firstByte ^ 0x0a,
    firstByte ^ 0x08,
    0x00
  ];

  for (const key of possibleKeys) {
    if ((pdata[0] ^ key) === 0x0a || (pdata[0] ^ key) === 0x08) {
      if (key === 0) return pdata;

      const decrypted = Buffer.alloc(pdata.length);
      for (let i = 0; i < pdata.length; i++) {
        decrypted[i] = pdata[i] ^ key;
      }
      return decrypted;
    }
  }

  return pdata;
}

/**
 * Decode EcoFlow HeaderMessage structure
 */
function decodeHeaderMessage(reader, len) {
  const result = { headers: [] };
  const end = reader.pos + len;

  while (reader.pos < end) {
    const tag = reader.uint32();
    const fieldNum = tag >>> 3;
    const wireType = tag & 7;

    if (fieldNum === 1 && wireType === 2) {
      const headerBytes = reader.bytes();
      const headerReader = protobuf.Reader.create(headerBytes);
      result.headers.push(decodeHeader(headerReader, headerBytes.length));
    } else {
      reader.skipType(wireType);
    }
  }

  return result;
}

/**
 * Decode individual header entry
 */
function decodeHeader(reader, len) {
  const header = {};
  const end = reader.pos + len;

  while (reader.pos < end) {
    const tag = reader.uint32();
    const fieldNum = tag >>> 3;
    const wireType = tag & 7;

    switch (fieldNum) {
      case 1: header.pdata = reader.bytes(); break;
      case 2: header.src = reader.uint32(); break;
      case 3: header.dest = reader.uint32(); break;
      case 4: header.cmdFunc = reader.uint32(); break;
      case 5: header.cmdId = reader.uint32(); break;
      case 7: header.encType = reader.uint32(); break;
      case 8: header.seq = reader.uint32(); break;
      default: reader.skipType(wireType);
    }
  }

  return header;
}

/**
 * Decode protobuf recursively to flat field map
 */
function decodeProtobufFlat(reader, len, depth = 0) {
  const result = {};
  const end = reader.pos + len;

  while (reader.pos < end) {
    try {
      const tag = reader.uint32();
      const fieldNum = tag >>> 3;
      const wireType = tag & 7;

      if (fieldNum > 10000) break; // Sanity check

      switch (wireType) {
        case 0: // Varint
          result[`f${fieldNum}`] = reader.uint64().toNumber();
          break;
        case 1: // 64-bit fixed
          result[`f${fieldNum}`] = reader.double();
          break;
        case 2: // Length-delimited
          const bytes = reader.bytes();
          if (depth < 5 && bytes.length > 2) {
            try {
              const nestedReader = protobuf.Reader.create(bytes);
              const nested = decodeProtobufFlat(nestedReader, bytes.length, depth + 1);
              result[`f${fieldNum}`] = Object.keys(nested).length > 0 ? nested : bytes.toString('hex');
            } catch {
              result[`f${fieldNum}`] = bytes.toString('hex');
            }
          } else {
            result[`f${fieldNum}`] = bytes.toString('hex');
          }
          break;
        case 5: // 32-bit fixed
          result[`f${fieldNum}`] = reader.float();
          break;
        default:
          reader.skipType(wireType);
      }
    } catch {
      break;
    }
  }

  return result;
}

/**
 * Flatten nested object to find all numeric values at any depth
 */
function flattenNumericFields(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'number') {
      result[fullKey] = value;
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenNumericFields(value, fullKey));
    }
  }
  return result;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Mask serial number for logging (security)
 */
function maskSN(sn) {
  if (!sn || sn.length < 6) return '***';
  return sn.substring(0, 2) + '***' + sn.substring(sn.length - 3);
}

/**
 * Generate UUID for MQTT client ID
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

module.exports = {
  initEcoFlow,
  getGridStatus,
  closeEcoFlow
};
