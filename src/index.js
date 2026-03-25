import { Storage } from '@google-cloud/storage';
import { GoogleAuth } from 'google-auth-library';

const storage = new Storage();
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

const PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SNAPSHOT_BUCKET = process.env.SNAPSHOT_BUCKET;
const SNAPSHOT_OBJECT = process.env.SNAPSHOT_OBJECT || 'remote-config/latest-template.json';
const MAX_DIFF_LINES = Number(process.env.MAX_DIFF_LINES || 25);

function assertEnv() {
  const missing = [];
  if (!PROJECT_ID) missing.push('GCP_PROJECT_ID');
  if (!DISCORD_WEBHOOK_URL) missing.push('DISCORD_WEBHOOK_URL');
  if (!SNAPSHOT_BUCKET) missing.push('SNAPSHOT_BUCKET');
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(', ')}`);
}

async function fetchRemoteConfigTemplate() {
  const client = await auth.getClient();
  const url = `https://firebaseremoteconfig.googleapis.com/v1/projects/${PROJECT_ID}/remoteConfig`;
  const res = await client.request({ url, method: 'GET', headers: { Accept: 'application/json' } });
  return res.data;
}

async function loadPreviousSnapshot() {
  const file = storage.bucket(SNAPSHOT_BUCKET).file(SNAPSHOT_OBJECT);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buf] = await file.download();
  return JSON.parse(buf.toString('utf8'));
}

async function saveSnapshot(template) {
  const file = storage.bucket(SNAPSHOT_BUCKET).file(SNAPSHOT_OBJECT);
  await file.save(JSON.stringify(template, null, 2), {
    contentType: 'application/json; charset=utf-8',
    resumable: false,
  });
}

function summarizeParam(param = {}) {
  const defaultValue = param.defaultValue?.value ?? null;
  const conditionalValues = param.conditionalValues || {};
  return { defaultValue, conditionalValues };
}

function short(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}

function mapConditions(template) {
  const list = template?.conditions || [];
  const map = {};
  for (const c of list) {
    if (!c?.name) continue;
    map[c.name] = {
      expression: c.expression || null,
      tagColor: c.tagColor || null,
    };
  }
  return map;
}

function buildDiff(oldTemplate, newTemplate) {
  const oldParams = oldTemplate?.parameters || {};
  const newParams = newTemplate?.parameters || {};

  const keys = new Set([...Object.keys(oldParams), ...Object.keys(newParams)]);
  const added = [];
  const removed = [];
  const changed = [];

  for (const key of keys) {
    const oldP = oldParams[key];
    const newP = newParams[key];

    if (!oldP && newP) {
      added.push(`+ param ${key} = ${short(summarizeParam(newP).defaultValue)}`);
      continue;
    }
    if (oldP && !newP) {
      removed.push(`- param ${key} (was ${short(summarizeParam(oldP).defaultValue)})`);
      continue;
    }

    const a = JSON.stringify(summarizeParam(oldP));
    const b = JSON.stringify(summarizeParam(newP));
    if (a !== b) {
      const oldVal = summarizeParam(oldP).defaultValue;
      const newVal = summarizeParam(newP).defaultValue;
      changed.push(`~ param ${key}: default ${short(oldVal)} -> ${short(newVal)}`);

      const oldCv = oldP?.conditionalValues || {};
      const newCv = newP?.conditionalValues || {};
      const cvKeys = new Set([...Object.keys(oldCv), ...Object.keys(newCv)]);
      for (const ck of cvKeys) {
        const ov = oldCv?.[ck]?.value;
        const nv = newCv?.[ck]?.value;
        if (ov !== nv) {
          if (ov === undefined) {
            changed.push(`~ param ${key}: condition[${ck}] added -> ${short(nv)}`);
          } else if (nv === undefined) {
            changed.push(`~ param ${key}: condition[${ck}] removed (was ${short(ov)})`);
          } else {
            changed.push(`~ param ${key}: condition[${ck}] ${short(ov)} -> ${short(nv)}`);
          }
        }
      }
    }
  }

  // Top-level conditions diff (rule changes)
  const oldConds = mapConditions(oldTemplate);
  const newConds = mapConditions(newTemplate);
  const condNames = new Set([...Object.keys(oldConds), ...Object.keys(newConds)]);
  for (const name of condNames) {
    const oldC = oldConds[name];
    const newC = newConds[name];

    if (!oldC && newC) {
      added.push(`+ condition ${name}: ${short(newC.expression)}`);
      continue;
    }
    if (oldC && !newC) {
      removed.push(`- condition ${name} (was ${short(oldC.expression)})`);
      continue;
    }

    if (JSON.stringify(oldC) !== JSON.stringify(newC)) {
      changed.push(
        `~ condition ${name}: expr ${short(oldC.expression)} -> ${short(newC.expression)}`,
      );
    }
  }

  return { added, removed, changed };
}

function chunkLines(lines, max = MAX_DIFF_LINES) {
  if (lines.length <= max) return lines;
  return [...lines.slice(0, max), `... (${lines.length - max} more)`];
}

async function postDiscord({ actor, version, diff }) {
  const lines = [...diff.added, ...diff.changed, ...diff.removed];

  console.log('[RC-NOTIFIER] Preparing Discord payload');
  console.log(`[RC-NOTIFIER] Actor: ${actor || 'scheduler'} | Version: ${version || 'unknown'}`);
  if (lines.length) {
    console.log('[RC-NOTIFIER] Diff lines:');
    for (const line of lines) console.log(`  ${line}`);
  } else {
    console.log('[RC-NOTIFIER] No parameter-level diff detected.');
  }

  const body = {
    username: 'Firebase RC Notifier',
    embeds: [
      {
        title: 'Firebase Remote Config updated',
        color: 0x5865f2,
        fields: [
          { name: 'Project', value: PROJECT_ID, inline: true },
          { name: 'Version', value: version ? String(version) : 'unknown', inline: true },
          { name: 'Updated by', value: actor || 'scheduler', inline: false },
          {
            name: 'Diff',
            value: lines.length ? `\`\`\`\n${chunkLines(lines).join('\n')}\n\`\`\`` : 'No parameter-level diff detected.',
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord webhook failed: ${res.status} ${text}`);
  }
}

async function runCheck(actor = 'scheduler') {
  assertEnv();
  console.log('[RC-NOTIFIER] Scheduled check started');

  const [oldTemplate, newTemplate] = await Promise.all([
    loadPreviousSnapshot(),
    fetchRemoteConfigTemplate(),
  ]);

  if (!oldTemplate) {
    console.log('[RC-NOTIFIER] No previous snapshot found. Creating initial snapshot.');
    await saveSnapshot(newTemplate);
    await postDiscord({
      actor,
      version: newTemplate?.version?.versionNumber,
      diff: { added: ['Initial snapshot created.'], changed: [], removed: [] },
    });
    return { status: 'initialized' };
  }

  const diff = buildDiff(oldTemplate, newTemplate);
  const hasChanges = diff.added.length || diff.changed.length || diff.removed.length;
  console.log(`[RC-NOTIFIER] Diff summary: +${diff.added.length} ~${diff.changed.length} -${diff.removed.length}`);

  if (hasChanges) {
    await postDiscord({
      actor,
      version: newTemplate?.version?.versionNumber,
      diff,
    });
  } else {
    console.log('[RC-NOTIFIER] No changes to notify Discord.');
  }

  await saveSnapshot(newTemplate);
  console.log('[RC-NOTIFIER] Snapshot saved.');

  return { status: hasChanges ? 'changed' : 'no-change' };
}

export async function onRemoteConfigScheduler(req, res) {
  try {
    const actor = req?.headers?.['x-cloudscheduler'] ? 'cloud-scheduler' : 'manual-http';
    const result = await runCheck(actor);
    res.status(200).json(result);
  } catch (error) {
    console.error('[RC-NOTIFIER] Scheduler execution failed', error);
    res.status(500).json({ error: error.message });
  }
}
