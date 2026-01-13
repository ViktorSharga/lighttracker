/**
 * EcoFlow RIVER 3 Grid Status Integration
 *
 * Minimal integration to detect grid power status (online/offline).
 * Only extracts plugInInfoAcInFlag field, ignores all other device data.
 */

const mqtt = require('mqtt');
const protobuf = require('protobufjs');

// State
let mqttClient = null;
let gridStatus = 'unknown';
let lastUpdate = null;
let isConnected = false;
let userId = null;

// Environment variables
const ECOFLOW_EMAIL = process.env.ECOFLOW_EMAIL;
const ECOFLOW_PASSWORD = process.env.ECOFLOW_PASSWORD;
const ECOFLOW_DEVICE_SN = process.env.ECOFLOW_DEVICE_SN;
const ECOFLOW_API_HOST = process.env.ECOFLOW_API_HOST || 'api.ecoflow.com';

/**
 * Mask serial number for logging (security)
 */
function maskSN(sn) {
  if (!sn || sn.length < 6) return '***';
  return sn.substring(0, 2) + '***' + sn.substring(sn.length - 3);
}

/**
 * Get current grid status
 */
function getGridStatus() {
  return {
    status: gridStatus,
    lastUpdate: lastUpdate,
    connected: isConnected
  };
}

/**
 * Authenticate with EcoFlow API and get MQTT credentials
 */
async function getEcoFlowCredentials() {
  const loginUrl = `https://${ECOFLOW_API_HOST}/auth/login`;
  const certUrl = `https://${ECOFLOW_API_HOST}/iot-auth/app/certification`;

  console.log(`[EcoFlow] Authenticating via ${ECOFLOW_API_HOST}...`);

  // Step 1: Login to get bearer token
  const loginBody = {
    os: 'linux',
    scene: 'IOT_APP',
    appVersion: '1.0.0',
    osVersion: 'NodeJS',
    password: Buffer.from(ECOFLOW_PASSWORD).toString('base64'),
    oauth: { bundleId: 'com.ef.EcoFlow' },
    email: ECOFLOW_EMAIL,
    userType: 'ECOFLOW'
  };

  const loginResponse = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(loginBody)
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

/**
 * Handle incoming MQTT message - ONLY extract grid status
 */
function handleMessage(topic, payload) {
  try {
    // Try JSON first
    const raw = payload.toString();
    if (raw.startsWith('{')) {
      const data = JSON.parse(raw);
      processData(data);
      return;
    }

    // Decode protobuf message
    const reader = protobuf.Reader.create(payload);
    const decoded = decodeProtobuf(reader, payload.length);
    processData(decoded);
  } catch (err) {
    // Silently ignore decode errors (common with binary messages)
  }
}

/**
 * Manually decode protobuf wire format
 */
function decodeProtobuf(reader, len) {
  const result = {};
  const end = reader.pos + len;

  while (reader.pos < end) {
    const tag = reader.uint32();
    const fieldNum = tag >>> 3;
    const wireType = tag & 7;

    switch (wireType) {
      case 0: // Varint
        result[`f${fieldNum}`] = reader.uint64().toNumber();
        break;
      case 1: // 64-bit
        result[`f${fieldNum}`] = reader.double();
        break;
      case 2: // Length-delimited (string, bytes, or embedded message)
        const bytes = reader.bytes();
        // Try to decode as nested message
        try {
          const nested = decodeProtobuf(protobuf.Reader.create(bytes), bytes.length);
          result[`f${fieldNum}`] = nested;
        } catch {
          // Try as string
          const str = bytes.toString('utf8');
          if (str.match(/^[\x20-\x7E]*$/)) {
            result[`f${fieldNum}`] = str;
          } else {
            result[`f${fieldNum}`] = bytes.toString('hex');
          }
        }
        break;
      case 5: // 32-bit
        result[`f${fieldNum}`] = reader.float();
        break;
      default:
        reader.skipType(wireType);
    }
  }

  return result;
}

/**
 * Process decoded data and extract grid status
 */
function processData(data) {
  if (!data) return;

  // Search for AC-related fields in decoded protobuf
  // f1.f11 and f1.f4 are indicators in RIVER 3 messages
  const allFields = collectAllFields(data);

  const f11 = allFields['f1.f11'];
  const f4 = allFields['f1.f4'];
  const f61 = findField(data, ['f61', 'f202', 'f47']);

  // Use first available indicator
  const acIndicator = f61 ?? f11 ?? f4;

  if (acIndicator !== undefined) {
    const newStatus = acIndicator === 1 || acIndicator > 0 ? 'online' : 'offline';

    if (newStatus !== gridStatus) {
      console.log(`[EcoFlow] Grid status changed: ${newStatus}`);
      gridStatus = newStatus;
    }

    lastUpdate = new Date().toISOString();
  }
}

/**
 * Recursively search for a field in nested object
 */
function findField(obj, fieldNames, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return undefined;

  for (const name of fieldNames) {
    if (obj[name] !== undefined) {
      return obj[name];
    }
  }

  // Search in nested objects/arrays
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'object') {
      const found = findField(val, fieldNames, depth + 1);
      if (found !== undefined) return found;
    }
  }

  return undefined;
}

/**
 * Collect all fields from nested object with flattened paths
 */
function collectAllFields(obj, prefix = '', result = {}, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return result;

  for (const [key, val] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'object' && val !== null) {
      collectAllFields(val, path, result, depth + 1);
    } else {
      result[path] = val;
    }
  }

  return result;
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

/**
 * Connect to EcoFlow MQTT broker
 */
async function connectMQTT(credentials) {
  const brokerUrl = `${credentials.protocol}://${credentials.url}:${credentials.port}`;

  // EcoFlow requires clientId in format: ANDROID_{uuid}_{userId}
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
    console.log(`[EcoFlow] Connected to MQTT broker`);
    isConnected = true;

    // Subscribe to device status topic
    const topic = `/app/device/property/${ECOFLOW_DEVICE_SN}`;
    mqttClient.subscribe(topic, (err) => {
      if (err) {
        console.error('[EcoFlow] Failed to subscribe to topic');
      } else {
        console.log(`[EcoFlow] Subscribed to device ${maskSN(ECOFLOW_DEVICE_SN)}`);

        // Send a get command to request current status
        const getTopic = `/app/${userId}/${ECOFLOW_DEVICE_SN}/thing/property/get`;
        const getPayload = JSON.stringify({
          from: 'ios',
          operateType: 'latestQuotas',
          id: Date.now().toString(),
          lang: 'en-us',
          params: {},
          version: '1.0'
        });
        mqttClient.publish(getTopic, getPayload, (pubErr) => {
          if (pubErr) {
            console.error('[EcoFlow] Failed to request device status');
          } else {
            console.log('[EcoFlow] Requested device status');
          }
        });
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
 * Initialize EcoFlow integration
 */
async function initEcoFlow() {
  // Check for required credentials
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

module.exports = {
  initEcoFlow,
  getGridStatus,
  closeEcoFlow
};
