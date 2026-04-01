export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title } = req.body || {};
  if (!title) return res.status(400).json({ error: '책 제목이 필요합니다.' });

  const YT_KEY = process.env.YOUTUBE_API_KEY;
  if (!YT_KEY) return res.status(500).json({ error: 'YouTube API 키가 설정되지 않았습니다.' });

  try {
    const query = encodeURIComponent(`"${title}" 리뷰 OR 독서 OR 북튜브 OR 해설 OR 추천`);
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&videoDuration=medium&relevanceLanguage=ko&publishedAfter=2015-01-01T00:00:00Z&maxResults=10&order=relevance&key=${YT_KEY}`;

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    if (searchData.error) throw new Error(searchData.error.message);

    const videoIds = (searchData.items || []).map(i => i.id.videoId).join(',');
    if (!videoIds) return res.status(200).json({ videos: [] });

    const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds}&key=${YT_KEY}`;
    const detailRes = await fetch(detailUrl);
    const detailData = await detailRes.json();

    const videos = (detailData.items || []).map(v => {
      const sec = parseDuration(v.contentDetails?.duration || '');
      const views = parseInt(v.statistics?.viewCount || '0');
      const hasCaption = v.contentDetails?.caption === 'true';
      const longEnough = sec >= 240;
      const enoughViews = views >= 1000;

      let skipReason = '';
      if (!longEnough) skipReason = `${Math.floor(sec/60)}분 미만 제외`;
      else if (!enoughViews) skipReason = '조회수 부족';
      else if (!hasCaption) skipReason = '자막 없음';

      return {
        videoId: v.id,
        title: v.snippet?.title || '',
        channel: v.snippet?.channelTitle || '',
        thumbnail: v.snippet?.thumbnails?.medium?.url || '',
        duration: formatDuration(sec),
        viewsStr: formatViews(views),
        hasCaption,
        used: longEnough && enoughViews && hasCaption,
        skipReason,
      };
    });

    return res.status(200).json({ videos });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1]||0)*3600) + (parseInt(m[2]||0)*60) + parseInt(m[3]||0);
}
function formatDuration(sec) {
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}
function formatViews(n) {
  if (n >= 10000) return `${(n/10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n/1000).toFixed(1)}천`;
  return `${n}`;
}
