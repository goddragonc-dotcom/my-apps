export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { videoId } = req.body || {};
  if (!videoId) return res.status(400).json({ error: 'videoId가 필요합니다.' });

  try {
    const transcript = await fetchTranscript(videoId);
    return res.status(200).json({ transcript, videoId });
  } catch (err) {
    // 자막 실패 시 빈 문자열 반환 (에러로 처리 안 함)
    return res.status(200).json({ transcript: '', videoId, error: err.message });
  }
}

async function fetchTranscript(videoId) {
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
    }
  });
  const html = await pageRes.text();

  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  if (!apiKeyMatch) throw new Error('Innertube 키를 찾을 수 없습니다.');

  const playerRes = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKeyMatch[1]}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId,
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '17.31.35',
          androidSdkVersion: 30,
          hl: 'ko', gl: 'KR'
        }
      }
    })
  });
  const playerData = await playerRes.json();

  const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks?.length) throw new Error('자막 없음');

  const track = tracks.find(t => t.languageCode === 'ko') || tracks[0];
  const captionRes = await fetch(track.baseUrl.replace(/&fmt=\w+$/, ''));
  const xml = await captionRes.text();

  const texts = [];
  const regex = /<text[^>]*>([^<]+)<\/text>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const t = match[1]
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\n/g,' ').trim();
    if (t) texts.push(t);
  }

  if (!texts.length) throw new Error('자막 내용 없음');
  const full = texts.join(' ');
  return full.length > 8000 ? full.slice(0, 8000) + '...' : full;
}
