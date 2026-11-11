const CLARITY_EXPORT_URL = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';

export interface ClarityMetricBlock {
  metricName: string;
  information: Record<string, unknown>[];
}

// Data Export API: 10 requests/project/day, numOfDays 1–3, one call returns every metric per dimension.
export async function fetchClarityLiveInsights(
  token: string,
  numOfDays: 1 | 2 | 3,
  fetchImpl: typeof fetch = fetch
): Promise<ClarityMetricBlock[]> {
  const params = new URLSearchParams({ numOfDays: String(numOfDays), dimension1: 'URL' });
  const res = await fetchImpl(`${CLARITY_EXPORT_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const reason = res.status === 429 ? 'daily export quota exceeded' : await res.text();
    throw new Error(`Clarity Data Export API ${res.status}: ${reason}`);
  }
  const body = await res.json();
  if (!Array.isArray(body)) {
    throw new Error('Clarity Data Export API returned a non-array body');
  }
  return body as ClarityMetricBlock[];
}
