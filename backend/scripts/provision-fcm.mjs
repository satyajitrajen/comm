/**
 * One-shot: create/download a Firebase Admin service account for FCM.
 * Writes backend/.secrets/firebase-admin.json (gitignored). Never prints the private key.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const toolsRoot = path.join(
  process.env.APPDATA,
  'npm/node_modules/firebase-tools/lib',
);
const auth = require(path.join(toolsRoot, 'auth.js'));
const apiv2 = require(path.join(toolsRoot, 'apiv2.js'));

const PROJECT = 'communication-5f5bd';
const ACCOUNT_ID = 'teamtime-fcm';
const EMAIL = `${ACCOUNT_ID}@${PROJECT}.iam.gserviceaccount.com`;
const ROLE = 'roles/firebasecloudmessaging.admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(__dirname, '../.secrets/firebase-admin.json');

async function token() {
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error('firebase login required');
  }
  auth.setRefreshToken(account.tokens.refresh_token);
  return apiv2.getAccessToken();
}

async function gfetch(url, { method = 'GET', body } = {}) {
  const access = await token();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${access}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error?.message || json?.error || text || res.statusText;
    const err = new Error(`${method} ${url} -> ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function enableApis() {
  const apis = [
    'iam.googleapis.com',
    'cloudresourcemanager.googleapis.com',
    'fcm.googleapis.com',
    'firebase.googleapis.com',
  ];
  for (const api of apis) {
    try {
      await gfetch(
        `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services/${api}:enable`,
        { method: 'POST', body: {} },
      );
      console.log(`[fcm] enabled ${api}`);
    } catch (e) {
      if (e.status === 403 || e.status === 400) {
        console.log(`[fcm] skip enable ${api}: ${e.message}`);
      } else {
        throw e;
      }
    }
  }
}

async function ensureServiceAccount() {
  try {
    const existing = await gfetch(
      `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${EMAIL}`,
    );
    console.log(`[fcm] using existing ${existing.email}`);
    return existing.email;
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  const created = await gfetch(
    `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts`,
    {
      method: 'POST',
      body: {
        accountId: ACCOUNT_ID,
        serviceAccount: {
          displayName: 'TeamTime FCM',
          description: 'NestJS Firebase Admin for Android FCM',
        },
      },
    },
  );
  console.log(`[fcm] created ${created.email}`);
  return created.email;
}

async function grantRole(email) {
  const policy = await gfetch(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`,
    { method: 'POST', body: { options: { requestedPolicyVersion: 3 } } },
  );
  const member = `serviceAccount:${email}`;
  policy.bindings = policy.bindings || [];
  let binding = policy.bindings.find((b) => b.role === ROLE);
  if (!binding) {
    binding = { role: ROLE, members: [] };
    policy.bindings.push(binding);
  }
  if (!binding.members.includes(member)) {
    binding.members.push(member);
    await gfetch(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:setIamPolicy`,
      { method: 'POST', body: { policy } },
    );
    console.log(`[fcm] granted ${ROLE} to ${email}`);
  } else {
    console.log(`[fcm] ${email} already has ${ROLE}`);
  }
}

async function writeKey(email) {
  const key = await gfetch(
    `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${email}/keys`,
    {
      method: 'POST',
      body: {
        privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE',
        keyAlgorithm: 'KEY_ALG_RSA_2048',
      },
    },
  );
  if (!key.privateKeyData) {
    throw new Error('IAM did not return privateKeyData');
  }
  const json = Buffer.from(key.privateKeyData, 'base64').toString('utf8');
  JSON.parse(json);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, json, { mode: 0o600 });
  console.log(`[fcm] wrote service account file (gitignored)`);
}

async function main() {
  await enableApis();
  const email = await ensureServiceAccount();
  await grantRole(email);
  await writeKey(email);
}

main().catch((err) => {
  console.error('[fcm] failed:', err.message);
  process.exit(1);
});
