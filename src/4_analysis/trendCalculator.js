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
  const scores = videos.map(v => v[scoreField]); //map() 배열의 각 원소를 변환해서 새로운 배열을 만드는 함수
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

function debugLargestRawTrendCluster(videos, epsilon = 1e-3) {
  // 1) rawTrendScore_VPI 있는 애들만 추려서 [value, video] 배열로 만든다.

  videos.forEach(v => {
    if (!('_rawTrendVPI' in v)) {
      console.log("⚠ _rawTrendVPI 없음:", v.videoId);
    }
  });

  const items = videos
    .filter(v => typeof v._rawTrendVPI === 'number')
    .map(v => ({ value: v._rawTrendVPI, video: v }));

  if (items.length === 0) {
    console.log('[Debug] _rawTrendVPI 설정된 비디오가 없습니다.');
    return;
  }

  // 2) 값 기준 정렬
  items.sort((a, b) => a.value - b.value);

  // 3) 인접한 값들끼리 epsilon 이하 차이면 같은 클러스터로 묶기
  let bestCluster = [items[0]];
  let currentCluster = [items[0]];

  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const curr = items[i];

    if (Math.abs(curr.value - prev.value) <= epsilon) {
      currentCluster.push(curr);
    } else {
      if (currentCluster.length > bestCluster.length) {
        bestCluster = currentCluster;
      }
      currentCluster = [curr];
    }
  }
  // 마지막 클러스터 체크
  if (currentCluster.length > bestCluster.length) {
    bestCluster = currentCluster;
  }

  if (bestCluster.length <= 1) {
    console.log('[Debug] epsilon 이내에 묶이는 클러스터(사이즈>=2)가 없습니다.');
    return;
  }

  const repValue = bestCluster[0].value;
  console.log(
    `\n[Debug] 가장 큰 rawTrendVPI 클러스터: value ≈ ${repValue} (size=${bestCluster.length}, epsilon=${epsilon})`
  );

  const clusterVideos = bestCluster.map(item => item.video);

  // 4) 클러스터 내 비디오 정보 출력
  clusterVideos.forEach(v => {
    console.log(
      '-',
      v.videoId,
      'vpi=', v.vpiScore,
      'rawTrendVPI=', v._rawTrendVPI,
      'kw=', JSON.stringify(v.keyword),
      'embHead=', Array.isArray(v.keywordEmbedding)
      ? v.keywordEmbedding.slice(0, 5)
      : []
    );
  });

  // 5) 클러스터 내 pairwise cosine similarity 출력
  console.log('\n[Debug] Pairwise Cosine Similarity in this cluster:');
  for (let i = 0; i < clusterVideos.length; i++) {
    for (let j = i + 1; j < clusterVideos.length; j++) {
      const a = clusterVideos[i];
      const b = clusterVideos[j];
      const sim = cosineSimilarity(a.keywordEmbedding, b.keywordEmbedding);
      // 유사도 디버깅
      // console.log(`sim(${a.videoId}, ${b.videoId}) = ${sim}`);
      // console.log('sameRef?', a.keywordEmbedding === b.keywordEmbedding);
    }
  }
}


/**
 * [Spec 4.4] 50개 비디오 리스트의 트렌드 점수를 계산합니다.
 * (이 함수는 'AnalyzedVideo[]' 객체 배열을 직접 수정(Mutate)합니다.)
 * @param {AnalyzedVideo[]} videos 
 */
export function calculateTrendScores(videos) {

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
    videoA._rawTrendVPI = rawScoreVPI
    videoA.trendScore_View = rawScoreView;
    videoA.trendScore_VPI = rawScoreVPI;
  });

  // // 2. 정규화 직전 분포 확인
  // console.table(
  //   videos
  //     .map(v => ({
  //       id: v.videoId,
  //       title: v.title.slice(0, 30),
  //       vpi: v.vpiScore,
  //       rawTrendVPI: v._rawTrendVPI,
  //       kwDim: v.keywordEmbedding ? v.keywordEmbedding.length : 0,
  //     }))
  //     .sort((a, b) => a.rawTrendVPI - b.rawTrendVPI) // 작은 순으로 정렬
  // );

  const withEmbedding = videos.filter(v => v.keywordEmbedding && v.keywordEmbedding.length > 0);
  const withoutEmbedding = videos.filter(v => !v.keywordEmbedding || v.keywordEmbedding.length === 0);

  // 키워드 있는 녀석들 스코어 정규화
  if (withEmbedding.length > 0) {
    normalizeScores(withEmbedding, 'trendScore_View');
    normalizeScores(withEmbedding, 'trendScore_VPI');
  }

  // 키워드 없는 녀석들 스코어 = 0
  if (withoutEmbedding.length > 0) {
    withoutEmbedding.forEach(v => { v.trendScore_View = 0; v.trendScore_VPI = 0; });
  }

  debugLargestRawTrendCluster(videos, 1e-3);


  console.table(
    videos
      .map(v => ({
        id: v.videoId,
        title: v.title.slice(0, 30),
        vpi: v.vpiScore,
        rawTrendVPI: v._rawTrendVPI,
        trendScore_VPI: v.trendScore_VPI.toFixed(2),
      }))
      .sort((a, b) => a.trendScore_VPI - b.trendScore_VPI)
  );

  //디버깅용 임시 추가
  const groups = new Map();
  videos.forEach(v => {
    const key = v.trendScore_VPI.toFixed(6); // 소수점 6자리 기준 그룹핑
    const arr = groups.get(key) || [];
    arr.push(v);
    groups.set(key, arr);
  });

  // rawTrendVPI가 같은 애들만 출력
  for (const [key, list] of groups.entries()) {
    if (list.length > 1) {
      console.log(`=== rawTrendVPI ≈ ${key} 인 영상들 (${list.length}개) ===`);
      list.forEach(v => {
        console.log(`- ${v.videoId}, vpi=${v.vpiScore}, keyword=${JSON.stringify(v.keyword)}`);
      });
    }
  }
}