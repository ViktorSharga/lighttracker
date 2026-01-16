/**
 * EcoFlow RIVER 3 Grid Status Integration
 *
 * Connects to EcoFlow MQTT broker to detect real-time grid power status.
 * Uses protobuf messages with XOR encryption from the device.
 *
 * RIVER 3 message types (cmdFunc:cmdId):
 * - 254:21 DisplayPropertyUpload: Contains plug_in_info_ac_in_flag (reliable AC status)
 * - 254:22 RuntimePropertyUpload: Contains diagnostic data
 * - 32:50  BMSHeartBeatReport: Battery status
 * - 1:1    HeartbeatPack: Basic heartbeat (unreliable for AC status)
 *
 * To get DisplayPropertyUpload, we must REQUEST it by publishing:
 * - Topic: /app/{userId}/{deviceSN}/thing/property/get
 * - Payload: protobuf with cmdFunc=20, cmdId=1 (latestQuotas request)
 *
 * Primary AC detection field (in DisplayPropertyUpload):
 * - plug_in_info_ac_in_flag (field 61): 0 = disconnected, 1 = connected
 *
 * See: https://github.com/foxthefox/ioBroker.ecoflow-mqtt
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
let onGridOfflineCallback = null; // Callback for when grid goes offline
let pollInterval = null; // Periodic polling interval

// Debug logging - tracks seen cmdFunc/cmdId combinations
const seenMessageTypes = new Set();
let lastDebugDump = 0;

// Message type constants (from ioBroker.ecoflow-mqtt ef_river3_data.js)
const MSG_TYPES = {
  DISPLAY_PROPERTY_UPLOAD: { cmdFunc: 254, cmdId: 21 },
  RUNTIME_PROPERTY_UPLOAD: { cmdFunc: 254, cmdId: 22 },
  BMS_HEARTBEAT_REPORT: { cmdFunc: 32, cmdId: 50 },
  HEARTBEAT_PACK: { cmdFunc: 1, cmdId: 1 },
  LATEST_QUOTAS_REQUEST: { cmdFunc: 20, cmdId: 1 }
};

// DisplayPropertyUpload field numbers (from protobuf schema)
const DISPLAY_FIELDS = {
  PLUG_IN_INFO_AC_IN_FLAG: 61,      // 0=disconnected, 1=connected (MOST RELIABLE)
  PLUG_IN_INFO_AC_CHARGER_FLAG: 202, // 0=not charging, 1=charging
  POW_GET_AC_IN: 54,                 // AC input power (float)
  FLOW_INFO_AC_IN: 47,               // AC input switch (0=off, 2=on)
  BMS_BATT_SOC: 242,                 // Battery SOC (float)
};

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
 * @param {Function} onGridOnline - Callback when grid power is restored
 * @param {Function} onGridOffline - Callback when grid power is lost
 */
async function initEcoFlow(getLatestSchedules, onGridOnline, onGridOffline) {
  // Store the schedule getter for use in updateGridStatus
  getLatestSchedulesFn = getLatestSchedules || null;
  onGridOnlineCallback = onGridOnline || null;
  onGridOfflineCallback = onGridOffline || null;

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
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
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

    // Topic structure based on ioBroker.ecoflow-mqtt:
    // - /app/{userId}/{deviceSN}/thing/property/get - publish requests here
    // - /app/{userId}/{deviceSN}/thing/property/get_reply - receive responses here
    // - /app/{userId}/{deviceSN}/thing/property/set - publish commands here
    // - /app/{userId}/{deviceSN}/thing/property/set_reply - receive command acks
    // Note: Wildcards may not be allowed on EcoFlow's MQTT broker

    const topics = [
      // Thing property topics (for latestQuotas responses)
      `/app/${userId}/${ECOFLOW_DEVICE_SN}/thing/property/get_reply`,
      `/app/${userId}/${ECOFLOW_DEVICE_SN}/thing/property/set_reply`,
      // Legacy topic (receives HeartbeatPack)
      `/app/device/property/${ECOFLOW_DEVICE_SN}`,
    ];

    if (DEBUG_ECOFLOW) {
      console.log(`[EcoFlow DEBUG] UserId: ${userId}`);
      console.log(`[EcoFlow DEBUG] Subscribing to topics: ${topics.join(', ')}`);
    }

    mqttClient.subscribe(topics, (err, granted) => {
      if (err) {
        console.error('[EcoFlow] Failed to subscribe to device topics:', err.message);
        // Try to subscribe to just the legacy topic as fallback
        mqttClient.subscribe(`/app/device/property/${ECOFLOW_DEVICE_SN}`, (fallbackErr) => {
          if (fallbackErr) {
            console.error('[EcoFlow] Fallback subscription also failed');
          } else {
            console.log('[EcoFlow] Fallback: subscribed to legacy topic only');
            requestDeviceStatus();
          }
        });
      } else {
        console.log(`[EcoFlow] Subscribed to device ${maskSN(ECOFLOW_DEVICE_SN)}`);
        if (DEBUG_ECOFLOW && granted) {
          console.log(`[EcoFlow DEBUG] Granted subscriptions:`, granted.map(g => `${g.topic} (qos=${g.qos})`).join(', '));
        }

        // Request device status immediately
        requestDeviceStatus();

        // Periodic polling every 5 minutes (get_reply is rate-limited by EcoFlow)
        // Real-time detection uses HeartbeatPack f1.f1 field
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(() => {
          if (isConnected) {
            requestDeviceStatus();
          }
        }, 5 * 60 * 1000);
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

/**
 * Request current device status by sending latestQuotas request
 *
 * For RIVER 3, we need to send a protobuf message with cmdFunc=20, cmdId=1
 * This triggers the device to respond with DisplayPropertyUpload (cmdFunc=254, cmdId=21)
 */
function requestDeviceStatus() {
  const topic = `/app/${userId}/${ECOFLOW_DEVICE_SN}/thing/property/get`;

  // Try JSON format first (works for some devices/firmware versions)
  const jsonPayload = JSON.stringify({
    from: 'ios',
    operateType: 'latestQuotas',
    id: Date.now().toString(),
    lang: 'en-us',
    params: {},
    version: '1.0'
  });

  // Also create protobuf request (required for RIVER 3)
  // Format: HeaderMessage containing a Header with cmdFunc=20, cmdId=1
  const protoPayload = createLatestQuotasRequest();

  // Send JSON request
  mqttClient.publish(topic, jsonPayload, (err) => {
    if (err) {
      console.error('[EcoFlow] Failed to send JSON latestQuotas request');
    } else if (DEBUG_ECOFLOW) {
      console.log('[EcoFlow DEBUG] Sent JSON latestQuotas request');
    }
  });

  // Send protobuf request
  if (protoPayload) {
    mqttClient.publish(topic, protoPayload, (err) => {
      if (err) {
        console.error('[EcoFlow] Failed to send protobuf latestQuotas request');
      } else {
        console.log('[EcoFlow] Requested device status (protobuf)');
      }
    });
  }
}

/**
 * Create a protobuf latestQuotas request message
 *
 * Based on ioBroker.ecoflow-mqtt ef_river3_data.js:
 * latestQuotas: { msg: { cmdFunc: 20, cmdId: 1, dataLen: 0 } }
 *
 * The message structure is:
 * HeaderMessage {
 *   Header header = 1 {
 *     bytes pdata = 1;      // empty for request
 *     int32 src = 2;        // source (32 = app)
 *     int32 dest = 3;       // destination (2 = device)
 *     int32 cmdFunc = 4;    // 20 for latestQuotas
 *     int32 cmdId = 5;      // 1
 *     int32 needAck = 11;   // 1
 *     int32 seq = 14;       // sequence number
 *   }
 * }
 */
function createLatestQuotasRequest() {
  try {
    const seq = Math.floor(Date.now() / 1000) % 0xFFFFFFFF;

    // Build header fields manually using protobuf encoding
    // Field format: (fieldNumber << 3) | wireType
    // wireType 0 = varint, wireType 2 = length-delimited

    const headerFields = [];

    // pdata (field 1, wireType 2 = length-delimited) - empty bytes
    headerFields.push(0x0a, 0x00); // field 1, length 0

    // src (field 2, wireType 0 = varint) = 32 (app)
    headerFields.push(0x10, 0x20); // field 2, value 32

    // dest (field 3, wireType 0 = varint) = 2 (device)
    headerFields.push(0x18, 0x02); // field 3, value 2

    // cmdFunc (field 4, wireType 0 = varint) = 20
    headerFields.push(0x20, 0x14); // field 4, value 20

    // cmdId (field 5, wireType 0 = varint) = 1
    headerFields.push(0x28, 0x01); // field 5, value 1

    // needAck (field 11, wireType 0 = varint) = 1
    headerFields.push(0x58, 0x01); // field 11, value 1

    // seq (field 14, wireType 0 = varint)
    const seqBytes = encodeVarint(seq);
    headerFields.push(0x70, ...seqBytes); // field 14

    const headerBuffer = Buffer.from(headerFields);

    // Wrap in HeaderMessage (field 1, length-delimited)
    const msgFields = [0x0a, headerBuffer.length, ...headerBuffer];

    return Buffer.from(msgFields);
  } catch (err) {
    console.error('[EcoFlow] Failed to create latestQuotas request:', err.message);
    return null;
  }
}

/**
 * Encode a number as a protobuf varint
 */
function encodeVarint(value) {
  const bytes = [];
  while (value > 127) {
    bytes.push((value & 0x7F) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7F);
  return bytes;
}

// ============================================================================
// Message Processing
// ============================================================================

/**
 * Handle incoming MQTT message
 */
function handleMessage(topic, payload) {
  try {
    if (DEBUG_ECOFLOW) {
      console.log(`[EcoFlow DEBUG] Message on topic: ${topic} (${payload.length} bytes)`);
      // Show first bytes for debugging format detection
      if (topic.includes('get_reply') || topic.includes('set_reply')) {
        const firstBytes = payload.slice(0, 20);
        console.log(`[EcoFlow DEBUG] First 20 bytes: ${firstBytes.toString('hex')}`);
        console.log(`[EcoFlow DEBUG] As string: ${payload.toString().substring(0, 100)}`);
      }
    }

    // Try JSON first (older protocol or latestQuotas response)
    const raw = payload.toString();
    if (raw.startsWith('{')) {
      const data = JSON.parse(raw);

      if (DEBUG_ECOFLOW) {
        console.log('[EcoFlow DEBUG] JSON message received on', topic);
        if (data.params) {
          const keys = Object.keys(data.params);
          console.log(`[EcoFlow DEBUG] JSON params (${keys.length} keys):`, keys.slice(0, 20).join(', ') + (keys.length > 20 ? '...' : ''));

          // Check for AC-related fields
          const acFields = keys.filter(k => /ac|plug|pow|flow/i.test(k));
          if (acFields.length > 0) {
            console.log('[EcoFlow DEBUG] AC-related fields found:', acFields.join(', '));
            for (const key of acFields.slice(0, 10)) {
              console.log(`[EcoFlow DEBUG]   ${key}: ${data.params[key]}`);
            }
          }
        } else {
          console.log('[EcoFlow DEBUG] JSON keys:', Object.keys(data).join(', '));
        }
      }

      // Check for latestQuotas response with AC power info
      if (data.params) {
        // PRIORITY 1: plugInInfoAcInFlag (MOST RELIABLE)
        if (data.params.plugInInfoAcInFlag !== undefined) {
          updateGridStatus(data.params.plugInInfoAcInFlag === 1 ? 'online' : 'offline', `json.plugInInfoAcInFlag=${data.params.plugInInfoAcInFlag}`);
          return;
        }

        // PRIORITY 2: AC input voltage (> 100V = online)
        if (data.params.plugInInfoAcInVol !== undefined && data.params.plugInInfoAcInVol > 100) {
          updateGridStatus('online', `json.plugInInfoAcInVol=${data.params.plugInInfoAcInVol}V`);
          return;
        }

        // PRIORITY 3: AC input power (> 0 = online)
        if (data.params.powGetAcIn !== undefined && data.params.powGetAcIn > 0) {
          updateGridStatus('online', `json.powGetAcIn=${data.params.powGetAcIn}W`);
          return;
        }

        // PRIORITY 4: flowInfoAcIn (0=off, 2=on)
        if (data.params.flowInfoAcIn !== undefined) {
          updateGridStatus(data.params.flowInfoAcIn === 2 ? 'online' : 'offline', `json.flowInfoAcIn=${data.params.flowInfoAcIn}`);
          return;
        }

        // Legacy fallbacks
        if (data.params.acInputPower !== undefined) {
          updateGridStatus(data.params.acInputPower > 0 ? 'online' : 'offline', `json.acInputPower=${data.params.acInputPower}`);
          return;
        }
        if (data.params.acInputFrequency !== undefined) {
          updateGridStatus(data.params.acInputFrequency > 0 ? 'online' : 'offline', `json.acInputFrequency=${data.params.acInputFrequency}`);
          return;
        }
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

    // Check if this is a get_reply message (different format - direct protobuf, not HeaderMessage)
    if (topic.includes('get_reply')) {
      try {
        processGetReply(binaryPayload);
        return;
      } catch (err) {
        if (DEBUG_ECOFLOW) {
          console.log('[EcoFlow DEBUG] get_reply decode error:', err.message);
        }
      }
    }

    // Decode as protobuf HeaderMessage (for legacy topic)
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
 * Process a get_reply message (response to latestQuotas request)
 *
 * The get_reply format is different from HeartbeatPack:
 * - No HeaderMessage wrapper
 * - Direct nested protobuf containing device quota data
 * - Field structure: outer message -> inner pdata -> DisplayPropertyUpload fields
 */
function processGetReply(payload) {
  const reader = protobuf.Reader.create(payload);
  const data = decodeProtobufFlat(reader, payload.length);

  if (DEBUG_ECOFLOW) {
    const keys = Object.keys(data);
    console.log(`[EcoFlow DEBUG] get_reply raw decoded (${keys.length} fields):`);
    // Show all raw fields
    for (const key of keys.slice(0, 10)) {
      const val = data[key];
      if (Buffer.isBuffer(val)) {
        console.log(`[EcoFlow DEBUG]   ${key}: <Buffer ${val.length} bytes, first: ${val.slice(0, 20).toString('hex')}>`);
      } else if (typeof val === 'object') {
        console.log(`[EcoFlow DEBUG]   ${key}: <Object with ${Object.keys(val).length} keys>`);
      } else {
        console.log(`[EcoFlow DEBUG]   ${key}: ${val}`);
      }
    }
  }

  // The data should contain DisplayPropertyUpload fields directly or nested
  const allFields = flattenNumericFields(data);

  if (DEBUG_ECOFLOW) {
    const flatKeys = Object.keys(allFields);
    console.log(`[EcoFlow DEBUG] get_reply flattened (${flatKeys.length} fields):`);
    // Show first 30 flattened fields
    for (const key of flatKeys.slice(0, 30)) {
      console.log(`[EcoFlow DEBUG]   ${key}: ${allFields[key]}`);
    }
    // Look for AC-related field numbers
    const acFieldKeys = flatKeys.filter(k => {
      const fieldNum = k.match(/f(\d+)/)?.[1];
      return fieldNum && [47, 54, 61, 202].includes(parseInt(fieldNum));
    });
    if (acFieldKeys.length > 0) {
      console.log('[EcoFlow DEBUG] Potential AC fields found:', acFieldKeys.join(', '));
      for (const key of acFieldKeys) {
        console.log(`[EcoFlow DEBUG]   >>> ${key}: ${allFields[key]}`);
      }
    }
  }

  // PRIORITY 1: Check flow_info_ac_in (field 47) - most reliable for RIVER 3
  // Values: 0=off, 2=on (AC input switch status)
  const flowAcIn = findField(allFields, DISPLAY_FIELDS.FLOW_INFO_AC_IN);
  if (flowAcIn !== null && (flowAcIn === 0 || flowAcIn === 2)) {
    updateGridStatus(flowAcIn === 2 ? 'online' : 'offline', `get_reply.flow_info_ac_in=${flowAcIn}`);
    return;
  }

  // PRIORITY 2: Check pow_get_ac_in (field 54) - AC input power
  // If power > 0, AC is connected
  const acPower = findField(allFields, DISPLAY_FIELDS.POW_GET_AC_IN);
  if (acPower !== null && typeof acPower === 'number') {
    // Use threshold of 1W to avoid noise
    updateGridStatus(acPower > 1 ? 'online' : 'offline', `get_reply.pow_get_ac_in=${acPower.toFixed(1)}W`);
    return;
  }

  // PRIORITY 3: Check charger flag (field 202)
  const chargerFlag = findField(allFields, DISPLAY_FIELDS.PLUG_IN_INFO_AC_CHARGER_FLAG);
  if (chargerFlag !== null && (chargerFlag === 0 || chargerFlag === 1)) {
    updateGridStatus(chargerFlag === 1 ? 'online' : 'offline', `get_reply.plug_in_info_ac_charger_flag=${chargerFlag}`);
    return;
  }

  // PRIORITY 4: plug_in_info_ac_in_flag (field 61) - UNRELIABLE for RIVER 3
  // This field shows 0 even when AC is connected, so only use as last resort
  // and prefer "online" if other evidence exists
  const acInFlag = findField(allFields, DISPLAY_FIELDS.PLUG_IN_INFO_AC_IN_FLAG);
  if (acInFlag !== null && (acInFlag === 0 || acInFlag === 1)) {
    updateGridStatus(acInFlag === 1 ? 'online' : 'offline', `get_reply.plug_in_info_ac_in_flag=${acInFlag}`);
    return;
  }

  if (DEBUG_ECOFLOW) {
    console.log('[EcoFlow DEBUG] get_reply processed but no AC status fields found');
    console.log('[EcoFlow DEBUG] All field keys:', Object.keys(allFields).slice(0, 50).join(', '));
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
 * Message type identification (cmdFunc:cmdId):
 * - 254:21 = DisplayPropertyUpload (BEST - contains plug_in_info_ac_in_flag)
 * - 254:22 = RuntimePropertyUpload (diagnostic data)
 * - 32:50  = BMSHeartBeatReport (battery data)
 * - 1:1    = HeartbeatPack (unreliable for AC status)
 *
 * RIVER 3 field reference (from ioBroker.ecoflow-mqtt):
 * - plug_in_info_ac_in_flag (field 61): 0=disconnected, 1=connected - MOST RELIABLE
 * - pow_get_ac_in (field 54): AC input power (float)
 * - flow_info_ac_in (field 47): AC input switch (0=off, 2=on)
 * - plug_in_info_ac_charger_flag (field 202): Charger status
 */
function extractGridStatus(data, header) {
  const allFields = flattenNumericFields(data);
  const msgKey = `${header.cmdFunc}:${header.cmdId}`;

  // Debug: Log new message types we haven't seen before
  if (!seenMessageTypes.has(msgKey)) {
    seenMessageTypes.add(msgKey);

    // Identify message type
    let msgType = 'Unknown';
    if (header.cmdFunc === MSG_TYPES.DISPLAY_PROPERTY_UPLOAD.cmdFunc &&
        header.cmdId === MSG_TYPES.DISPLAY_PROPERTY_UPLOAD.cmdId) {
      msgType = 'DisplayPropertyUpload';
    } else if (header.cmdFunc === MSG_TYPES.RUNTIME_PROPERTY_UPLOAD.cmdFunc &&
               header.cmdId === MSG_TYPES.RUNTIME_PROPERTY_UPLOAD.cmdId) {
      msgType = 'RuntimePropertyUpload';
    } else if (header.cmdFunc === MSG_TYPES.BMS_HEARTBEAT_REPORT.cmdFunc &&
               header.cmdId === MSG_TYPES.BMS_HEARTBEAT_REPORT.cmdId) {
      msgType = 'BMSHeartBeatReport';
    } else if (header.cmdFunc === MSG_TYPES.HEARTBEAT_PACK.cmdFunc &&
               header.cmdId === MSG_TYPES.HEARTBEAT_PACK.cmdId) {
      msgType = 'HeartbeatPack';
    }

    console.log(`[EcoFlow] New message type: ${msgType} (cmdFunc=${header.cmdFunc}, cmdId=${header.cmdId})`);

    if (DEBUG_ECOFLOW) {
      console.log(`[EcoFlow DEBUG] Fields in ${msgType}:`, JSON.stringify(allFields, null, 2));
    }
  }

  // Periodic debug dump of all fields (every 5 minutes if DEBUG enabled)
  if (DEBUG_ECOFLOW && Date.now() - lastDebugDump > 300000) {
    lastDebugDump = Date.now();
    console.log(`[EcoFlow DEBUG] Message ${msgKey} fields:`, Object.keys(allFields).join(', '));
  }

  // ============================================================================
  // PRIORITY 1: DisplayPropertyUpload (cmdFunc=254, cmdId=21)
  // This is the BEST source for AC input status
  // ============================================================================
  if (header.cmdFunc === MSG_TYPES.DISPLAY_PROPERTY_UPLOAD.cmdFunc &&
      header.cmdId === MSG_TYPES.DISPLAY_PROPERTY_UPLOAD.cmdId) {

    // Field 61: plug_in_info_ac_in_flag (0=disconnected, 1=connected)
    const acInFlag = findField(allFields, DISPLAY_FIELDS.PLUG_IN_INFO_AC_IN_FLAG);
    if (acInFlag !== null && (acInFlag === 0 || acInFlag === 1)) {
      updateGridStatus(acInFlag === 1 ? 'online' : 'offline', `DisplayPropertyUpload.plug_in_info_ac_in_flag=${acInFlag}`);
      return;
    }

    // Field 54: pow_get_ac_in (AC input power)
    const acPower = findField(allFields, DISPLAY_FIELDS.POW_GET_AC_IN);
    if (acPower !== null && typeof acPower === 'number') {
      updateGridStatus(acPower > 0 ? 'online' : 'offline', `DisplayPropertyUpload.pow_get_ac_in=${acPower}W`);
      return;
    }

    // Field 47: flow_info_ac_in (0=off, 2=on)
    const flowAcIn = findField(allFields, DISPLAY_FIELDS.FLOW_INFO_AC_IN);
    if (flowAcIn !== null && (flowAcIn === 0 || flowAcIn === 2)) {
      updateGridStatus(flowAcIn === 2 ? 'online' : 'offline', `DisplayPropertyUpload.flow_info_ac_in=${flowAcIn}`);
      return;
    }

    // Field 202: plug_in_info_ac_charger_flag
    const chargerFlag = findField(allFields, DISPLAY_FIELDS.PLUG_IN_INFO_AC_CHARGER_FLAG);
    if (chargerFlag !== null && (chargerFlag === 0 || chargerFlag === 1)) {
      updateGridStatus(chargerFlag === 1 ? 'online' : 'offline', `DisplayPropertyUpload.plug_in_info_ac_charger_flag=${chargerFlag}`);
      return;
    }

    if (DEBUG_ECOFLOW) {
      console.log('[EcoFlow DEBUG] DisplayPropertyUpload received but no AC fields found');
    }
  }

  // ============================================================================
  // PRIORITY 2: Generic search for plug_in_info_ac_in_flag in any message
  // ============================================================================

  // Search for field 61 (plug_in_info_ac_in_flag) at any nesting level
  const acFlagCandidates = [
    `f${DISPLAY_FIELDS.PLUG_IN_INFO_AC_IN_FLAG}`,  // f61
    'f1.f61', 'f2.f61', 'f3.f61', 'f7.f61',        // nested
  ];

  for (const key of acFlagCandidates) {
    const value = allFields[key];
    if (typeof value === 'number' && (value === 0 || value === 1)) {
      updateGridStatus(value === 1 ? 'online' : 'offline', `plug_in_info_ac_in_flag(${key})=${value}`);
      return;
    }
  }

  // Search all fields for any ending in .f61
  const f61Key = Object.keys(allFields).find(k => k === 'f61' || k.endsWith('.f61'));
  if (f61Key && typeof allFields[f61Key] === 'number') {
    const value = allFields[f61Key];
    if (value === 0 || value === 1) {
      updateGridStatus(value === 1 ? 'online' : 'offline', `plug_in_info_ac_in_flag(${f61Key})=${value}`);
      return;
    }
  }

  // ============================================================================
  // PRIORITY 3: Check AC input power/voltage fields
  // ============================================================================

  // pow_get_ac_in (field 54)
  const acPowerCandidates = [`f${DISPLAY_FIELDS.POW_GET_AC_IN}`, 'f1.f54', 'f7.f54'];
  for (const key of acPowerCandidates) {
    const value = allFields[key];
    if (typeof value === 'number' && value > 0) {
      updateGridStatus('online', `pow_get_ac_in(${key})=${value}W`);
      return;
    }
  }

  // flow_info_ac_in (field 47)
  const flowAcCandidates = [`f${DISPLAY_FIELDS.FLOW_INFO_AC_IN}`, 'f1.f47', 'f7.f47'];
  for (const key of flowAcCandidates) {
    const value = allFields[key];
    if (typeof value === 'number' && (value === 0 || value === 2)) {
      updateGridStatus(value === 2 ? 'online' : 'offline', `flow_info_ac_in(${key})=${value}`);
      return;
    }
  }

  // ============================================================================
  // HeartbeatPack - Use f1.f1=2 to confirm online, but f1.f1=1 is ambiguous
  // f1.f1: 1 = battery mode (not charging), 2 = AC charging
  // PROBLEM: f1.f1=1 when battery is full even if AC is connected
  // SOLUTION: f1.f1=2 reliably indicates AC charging (grid online)
  //           f1.f1=1 could mean offline OR full battery - don't change status
  // ============================================================================
  if (header.cmdFunc === MSG_TYPES.HEARTBEAT_PACK.cmdFunc &&
      header.cmdId === MSG_TYPES.HEARTBEAT_PACK.cmdId) {
    const powerSource = allFields['f1.f1'];
    const acState = allFields['f2.f4'];
    const batterySoc = allFields['f1.f9'];

    if (DEBUG_ECOFLOW) {
      console.log(`[EcoFlow DEBUG] HeartbeatPack: f1.f1=${powerSource}, f2.f4=${acState}, battery=${batterySoc}%`);
    }

    // f1.f1=2 means actively charging from AC - definitely online
    if (powerSource === 2) {
      updateGridStatus('online', `heartbeat.power_source=2 (AC charging)`);
      return;
    }

    // f1.f1=1 is ambiguous - could be offline OR battery full with AC connected
    // Only mark offline if battery is significantly draining (< 95%)
    // This avoids false offline when battery is full and AC is connected
    if (powerSource === 1 && batterySoc < 95) {
      updateGridStatus('offline', `heartbeat.power_source=1, battery=${batterySoc}%`);
      return;
    }
  }

  // Update timestamp even without status change
  lastUpdate = new Date().toISOString();
}

/**
 * Find a field by its protobuf field number at any nesting level
 */
function findField(allFields, fieldNumber) {
  // Direct field
  const directKey = `f${fieldNumber}`;
  if (allFields[directKey] !== undefined) {
    return allFields[directKey];
  }

  // Nested in pdata (field 1)
  const pdataKey = `f1.f${fieldNumber}`;
  if (allFields[pdataKey] !== undefined) {
    return allFields[pdataKey];
  }

  // Search all keys for this field number
  for (const key of Object.keys(allFields)) {
    if (key === directKey || key.endsWith(`.f${fieldNumber}`)) {
      return allFields[key];
    }
  }

  return null;
}

/**
 * Update grid status and log if changed
 * Records status changes to history with schedule reference
 * Triggers callbacks on status transitions
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

    // Trigger callback when power comes back online (from offline state)
    if (newStatus === 'online' && previousStatus === 'offline' && onGridOnlineCallback) {
      try {
        onGridOnlineCallback();
      } catch (err) {
        console.error('[EcoFlow] Error in onGridOnline callback:', err.message);
      }
    }

    // Trigger callback when power goes offline
    // NOTE: Now using reliable plug_in_info_ac_in_flag from DisplayPropertyUpload (Jan 16, 2026)
    if (newStatus === 'offline' && previousStatus !== 'offline' && onGridOfflineCallback) {
      try {
        onGridOfflineCallback();
      } catch (err) {
        console.error('[EcoFlow] Error in onGridOffline callback:', err.message);
      }
    }
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
