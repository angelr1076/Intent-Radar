const QB_REALM = process.env.QB_REALM;
const QB_USER_TOKEN = process.env.QB_USER_TOKEN;
const TABLE_ID = 'bvn3rebnv';

const QB_API = 'https://api.quickbase.com/v1/records';

async function qbRequest(body) {
  const res = await fetch(QB_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'QB-Realm-Hostname': QB_REALM,
      Authorization: `QB-USER-TOKEN ${QB_USER_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Quickbase error ${res.status}: ${text}`);
  }

  return res.json();
}

export default async function upsertLead(record) {
  const body = {
    to: TABLE_ID,
    mergeFieldId: 6,
    data: [
      {
        6: { value: record.url },
        7: { value: record.title },
        8: { value: record.body },
        9: { value: record.source },
        10: { value: record.subreddit },
        11: { value: record.author || '' },
        12: { value: record.intentScore?.score ?? null },
        13: { value: record.aiQualified ? true : false },
        14: { value: record.aiReason || '' },
        15: {
          value: Array.isArray(record.verticals)
            ? record.verticals.map((v) => v.name).join(', ')
            : '',
        },
        16: { value: new Date().toISOString() },
        20: { value: record.demandScore?.score ?? null },
        21: { value: record.aiUsefulness ?? null },
        22: { value: record.aiSignalType || '' },
        23: { value: record.aiWillingnessToPay || '' },
        24: { value: record.aiPersona || '' },
      },
    ],
  };

  return qbRequest(body);
}
