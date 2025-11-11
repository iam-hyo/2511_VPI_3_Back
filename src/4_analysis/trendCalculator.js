// /src/4_analysis/trendCalculator.js

/**
 * 두 벡터 간의 코사인 유사도를 계산합니다.
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length === 0 || vecA.length !== vecB.length) return 0;
  let dotProduct = 0.0;
  let magA = 0.0;
  let magB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}

/**
 * 0-100 사이로 점수를 정규화(Min-Max Scaling)합니다.
 */
function normalizeScores(videos, scoreField) {
  const scores = videos.map(v => v[scoreField]);
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  if (max === min) {
    videos.forEach(v => { v[scoreField] = 100; });
    return;
  }
  videos.forEach(v => {
    v[scoreField] = ((v[scoreField] - min) / (max - min)) * 100;
  });
}

/**
 * [Spec 4.4] 50개 비디오 리스트의 트렌드 점수를 계산합니다.
 * (이 함수는 'AnalyzedVideo[]' 객체 배열을 직접 수정(Mutate)합니다.)
 * @param {AnalyzedVideo[]} videos 
 */
export function calculateTrendScores(videos) {
  const videoMap = new Map(videos.map(v => [v.videoId, v]));

  videos.forEach(videoA => {
    let rawScoreView = videoA.viewCount || 0;
    let rawScoreVPI = videoA.vpiScore || 0;

    videos.forEach(videoI => {
      if (videoA.videoId === videoI.videoId) return;

      const sim = cosineSimilarity(
        videoA.keywordEmbedding,
        videoI.keywordEmbedding
      );
      
      rawScoreView += sim * (videoI.viewCount || 0);
      rawScoreVPI += sim * (videoI.vpiScore || 0);
    });

    // videoA 객체에 직접 할당
    videoA.trendScore_View = rawScoreView;
    videoA.trendScore_VPI = rawScoreVPI;
  });

  normalizeScores(videos, 'trendScore_View');
  normalizeScores(videos, 'trendScore_VPI');
}