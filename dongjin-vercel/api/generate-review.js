export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bookTitle, transcripts, claudeApiKey } = req.body || {};
  if (!bookTitle || !transcripts?.length) return res.status(400).json({ error: '책 제목과 자막이 필요합니다.' });
  if (!claudeApiKey) return res.status(400).json({ error: 'Claude API 키가 필요합니다.' });

  const combined = transcripts
    .map((t, i) => `[영상 ${i+1}: ${t.title}]\n${t.transcript}`)
    .join('\n\n---\n\n');

  const prompt = `당신은 영화평론가 이동진입니다. 아래 YouTube 자막 내용만을 근거로 "${bookTitle}"을 이동진의 시선으로 해부해주세요.

[중요] 자막에 없는 내용은 절대 지어내지 마세요. 자막 기반 사실만 사용하세요.

[YouTube 자막]
${combined}

마크다운 없이 순수 JSON만 응답:
{
  "bookTitle": "${bookTitle}",
  "author": "자막에서 언급된 저자명. 없으면 빈 문자열",
  "publishYear": "자막에서 언급된 출판연도. 없으면 빈 문자열",
  "publisher": "자막에서 언급된 출판사. 없으면 빈 문자열",
  "verdict": "이동진 스타일 첫 마디. 3~5문장. 자막 내용 기반.",
  "gesture1": "이동진 행동/눈빛 묘사 1~2문장.",
  "authorContext": [{ "period": "시기", "text": "자막 기반 작가 생애와 맥락. 5문장 이상." }],
  "gesture2": "이동진 행동 묘사 1~2문장.",
  "keyScenes": [{ "tag": "태그", "title": "장면명", "body": "자막 기반 분석. 5~6문장." }],
  "gesture3": "이동진 행동 묘사 1~2문장.",
  "quotes": [
    { "text": "자막에서 언급된 원문 문장. 불확실하면 빈 문자열.", "analysis": "5~6문장 분석." },
    { "text": "두 번째 문장.", "analysis": "분석." },
    { "text": "세 번째 문장.", "analysis": "분석." },
    { "text": "네 번째 문장.", "analysis": "분석." },
    { "text": "다섯 번째 문장.", "analysis": "분석." }
  ]
}

규칙: authorContext 3개, keyScenes 5개, quotes 5개. 한국어 응답.`;

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!apiRes.ok) {
      const e = await apiRes.json();
      throw new Error(e.error?.message || `HTTP ${apiRes.status}`);
    }

    const data = await apiRes.json();
    const raw = data.content.map(i => i.text || '').join('');
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(clean); }
    catch {
      let fixed = clean;
      const diff = (fixed.match(/[\[{]/g)||[]).length - (fixed.match(/[\]}]/g)||[]).length;
      if (diff > 0) {
        const lc = fixed.lastIndexOf('",');
        if (lc > 0) fixed = fixed.substring(0, lc + 1);
        for (let i = 0; i < diff; i++) fixed += i === diff-1 ? '}' : ']';
      }
      parsed = JSON.parse(fixed);
    }

    return res.status(200).json({ result: parsed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
