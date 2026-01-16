/**
 * Test script for EcoFlow Developer REST API
 *
 * Verifies API access and discovers available quota fields for RIVER 3.
 *
 * Usage:
 *   docker compose exec lighttracker node scripts/test-ecoflow-api.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load .env.local if exists
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

loadEnv();

// Configuration
const ACCESS_KEY = process.env.AccessKey;
const SECRET_KEY = process.env.SecretKey;
const DEVICE_SN = process.env.ECOFLOW_DEVICE_SN;
// Try both API hosts - api.ecoflow.com (global) or api-e.ecoflow.com (Europe)
const API_HOST = process.env.ECOFLOW_API_HOST || 'api.ecoflow.com';

/**
 * Flatten nested object for signature
 * Example: {params: {quotas: ['a','b']}} -> params.quotas[0]=a&params.quotas[1]=b
 */
function flattenForSign(obj, prefix = '') {
  const result = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          result.push(...flattenForSign(item, `${fullKey}[${i}]`));
        } else {
          result.push([`${fullKey}[${i}]`, item]);
        }
      });
    } else if (typeof value === 'object' && value !== null) {
      result.push(...flattenForSign(value, fullKey));
    } else {
      result.push([fullKey, value]);
    }
  }
  return result;
}

/**
 * Generate HMAC-SHA256 signature for EcoFlow API
 *
 * Format: [sorted_query_params&]accessKey=X&nonce=Y&timestamp=Z
 * - Query params come FIRST (sorted alphabetically)
 * - Then accessKey, nonce, timestamp (in that order)
 */
function generateSign(params, accessKey, secretKey, nonce, timestamp) {
  // Flatten nested objects and sort alphabetically
  const flatParams = flattenForSign(params);
  flatParams.sort((a, b) => a[0].localeCompare(b[0]));
  const paramStr = flatParams.map(([k, v]) => `${k}=${v}`).join('&');

  // Build sign string: [params&]accessKey=X&nonce=Y&timestamp=Z
  const authStr = `accessKey=${accessKey}&nonce=${nonce}&timestamp=${timestamp}`;
  const signStr = paramStr ? `${paramStr}&${authStr}` : authStr;

  console.log(`[DEBUG] Sign string: ${signStr}`);

  // HMAC-SHA256
  const sign = crypto.createHmac('sha256', secretKey)
    .update(signStr)
    .digest('hex');

  console.log(`[DEBUG] Generated sign: ${sign}`);

  return sign;
}

/**
 * Make authenticated GET API request
 */
async function apiRequest(endpoint, params = {}) {
  const nonce = Math.floor(100000 + Math.random() * 900000).toString();
  const timestamp = Date.now().toString();
  const sign = generateSign(params, ACCESS_KEY, SECRET_KEY, nonce, timestamp);

  // Build URL with query params
  const url = new URL(`https://${API_HOST}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  console.log(`\n[API] GET ${endpoint}`);
  console.log(`[API] Params: ${JSON.stringify(params)}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'accessKey': ACCESS_KEY,
      'nonce': nonce,
      'timestamp': timestamp,
      'sign': sign,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();

  if (response.ok && (data.code === '0' || data.code === 0)) {
    console.log(`[API] Success (${response.status})`);
    return data;
  } else {
    console.log(`[API] Error: ${response.status} - ${data.message || JSON.stringify(data)}`);
    return data;
  }
}

/**
 * Make authenticated POST API request
 */
async function apiPostRequest(endpoint, params = {}) {
  const nonce = Math.floor(100000 + Math.random() * 900000).toString();
  const timestamp = Date.now().toString();
  const sign = generateSign(params, ACCESS_KEY, SECRET_KEY, nonce, timestamp);

  const url = `https://${API_HOST}${endpoint}`;

  console.log(`\n[API] POST ${endpoint}`);
  console.log(`[API] Body: ${JSON.stringify(params)}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'accessKey': ACCESS_KEY,
      'nonce': nonce,
      'timestamp': timestamp,
      'sign': sign,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });

  const data = await response.json();

  if (response.ok && (data.code === '0' || data.code === 0)) {
    console.log(`[API] Success (${response.status})`);
    return data;
  } else {
    console.log(`[API] Error: ${response.status} - ${data.message || JSON.stringify(data)}`);
    return data;
  }
}

/**
 * Make authenticated GET API request WITHOUT including params in signature
 * (params still go in URL, but signature only uses accessKey/nonce/timestamp)
 */
async function apiRequestNoSignParams(endpoint, params = {}) {
  const nonce = Math.floor(100000 + Math.random() * 900000).toString();
  const timestamp = Date.now().toString();
  // Sign WITHOUT params
  const sign = generateSign({}, ACCESS_KEY, SECRET_KEY, nonce, timestamp);

  // Build URL with query params
  const url = new URL(`https://${API_HOST}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  console.log(`\n[API] GET ${endpoint} (no-sign-params mode)`);
  console.log(`[API] URL Params: ${JSON.stringify(params)}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'accessKey': ACCESS_KEY,
      'nonce': nonce,
      'timestamp': timestamp,
      'sign': sign,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();

  if (response.ok && (data.code === '0' || data.code === 0)) {
    console.log(`[API] Success (${response.status})`);
    return data;
  } else {
    console.log(`[API] Error: ${response.status} - ${data.message || JSON.stringify(data)}`);
    return data;
  }
}

/**
 * Recursively find all leaf values in an object
 */
function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

/**
 * Main test function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('EcoFlow Developer REST API Test');
  console.log('='.repeat(60));

  // Check credentials
  if (!ACCESS_KEY || !SECRET_KEY) {
    console.error('\n[ERROR] Missing AccessKey or SecretKey in .env.local');
    console.error('Add these lines to .env.local:');
    console.error('  AccessKey=your_access_key');
    console.error('  SecretKey=your_secret_key');
    process.exit(1);
  }

  console.log(`\n[Config] API Host: ${API_HOST}`);
  console.log(`[Config] AccessKey: ${ACCESS_KEY.substring(0, 4)}***`);
  console.log(`[Config] SecretKey: ${SECRET_KEY.substring(0, 4)}***`);
  console.log(`[Config] Device SN: ${DEVICE_SN || 'not set'}`);

  // Test 1: Get device list
  console.log('\n' + '-'.repeat(60));
  console.log('TEST 1: Get Device List');
  console.log('-'.repeat(60));

  const listResult = await apiRequest('/iot-open/sign/device/list');

  if (listResult.data) {
    console.log(`\n[Result] Found ${listResult.data.length || 0} device(s):`);
    if (Array.isArray(listResult.data)) {
      for (const device of listResult.data) {
        console.log(`  - SN: ${device.sn}`);
        console.log(`    Name: ${device.deviceName || 'N/A'}`);
        console.log(`    Online: ${device.online === 1 ? 'Yes' : 'No'}`);
        console.log(`    Product: ${device.productName || 'N/A'}`);
      }
    } else {
      console.log(JSON.stringify(listResult.data, null, 2));
    }
  }

  // Test 2: Get device quota (try multiple endpoint variations)
  if (DEVICE_SN) {
    console.log('\n' + '-'.repeat(60));
    console.log('TEST 2: Get Device Quota (POST)');
    console.log('-'.repeat(60));

    // Try POST to /quota endpoint
    let quotaResult = await apiPostRequest('/iot-open/sign/device/quota', { sn: DEVICE_SN });

    // If that fails, try /quota/all
    if (!quotaResult.data || quotaResult.message) {
      console.log('\n[Retry] Trying /quota/all endpoint...');
      quotaResult = await apiPostRequest('/iot-open/sign/device/quota/all', { sn: DEVICE_SN });
    }

    // If still fails, try GET with params
    if (!quotaResult.data || quotaResult.message) {
      console.log('\n[Retry] Trying GET with query params...');
      quotaResult = await apiRequest('/iot-open/sign/device/quota/all', { sn: DEVICE_SN });
    }

    // Try GET without params in signature (just in URL)
    if (!quotaResult.data || quotaResult.message) {
      console.log('\n[Retry] Trying GET /quota/all with params only in URL (not in sign)...');
      quotaResult = await apiRequestNoSignParams('/iot-open/sign/device/quota/all', { sn: DEVICE_SN });
    }

    // Try /quota endpoint with no sign params
    if (!quotaResult.data || quotaResult.message) {
      console.log('\n[Retry] Trying GET /quota with params only in URL (not in sign)...');
      quotaResult = await apiRequestNoSignParams('/iot-open/sign/device/quota', { sn: DEVICE_SN });
    }

    // Try older API path
    if (!quotaResult.data || quotaResult.message) {
      console.log('\n[Retry] Trying older API path...');
      quotaResult = await apiRequestNoSignParams('/iot-service/open/api/device/queryDeviceQuota', { sn: DEVICE_SN });
    }

    // Try POST with specific quota fields (RIVER 2 Pro style)
    if (!quotaResult.data || quotaResult.message) {
      console.log('\n[Retry] Trying POST /quota with RIVER 2 Pro quotas...');
      quotaResult = await apiPostRequest('/iot-open/sign/device/quota', {
        sn: DEVICE_SN,
        params: {
          quotas: [
            'inv.inputWatts',
            'inv.acInVol',
            'pd.wattsInSum',
            'bms_emsStatus.chgState',
            'bms_bmsStatus.soc'
          ]
        }
      });
    }

    // Try with RIVER 3 style field names
    if (!quotaResult.data || quotaResult.message) {
      console.log('\n[Retry] Trying POST /quota with RIVER 3 style quotas...');
      quotaResult = await apiPostRequest('/iot-open/sign/device/quota', {
        sn: DEVICE_SN,
        params: {
          quotas: [
            'plugInInfoAcInFlag',
            'plugInInfoAcInVol',
            'powGetAcIn',
            'bmsBattSoc',
            'powInSumW'
          ]
        }
      });
    }

    if (quotaResult.data) {
      console.log('\n[Result] Device Quota:');

      // Flatten and display all fields
      const flat = flattenObject(quotaResult.data);
      const sortedKeys = Object.keys(flat).sort();

      console.log(`\n[Fields] Found ${sortedKeys.length} fields:`);
      for (const key of sortedKeys) {
        const value = flat[key];
        console.log(`  ${key}: ${JSON.stringify(value)}`);
      }

      // Highlight AC input related fields
      console.log('\n[AC Input Fields] Looking for AC/input/plug related:');
      const acFields = sortedKeys.filter(k =>
        /ac|input|plug|grid|charge|volt|watt/i.test(k)
      );
      if (acFields.length > 0) {
        for (const key of acFields) {
          console.log(`  >>> ${key}: ${JSON.stringify(flat[key])}`);
        }
      } else {
        console.log('  (none found)');
      }
    }

  } else {
    console.log('\n[SKIP] Device quota test - no ECOFLOW_DEVICE_SN set');
  }

  console.log('\n' + '='.repeat(60));
  console.log('Test Complete');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('\n[FATAL ERROR]', err.message);
  process.exit(1);
});
