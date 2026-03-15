export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const target = 'https://api.elections.kalshi.com/trade-api/v2/markets';
  const params = new URLSearchParams(req.query).toString();
  const url = params ? `${target}?${params}` : target;

  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
