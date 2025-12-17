// /src/1_batch/dailyVideoGenerate.js

/*
1. 영상 50개 수집, json 저장      -> runDailyCollection()
2. VPI Score계산                 -> runDailyCollection()
3. VPI Trend Score 계산           -> runDailyCollection()
4. 국가별 루프
    1) 국가별 상위 1개 항목 결정        -> GetMostTrendyVideo()
    2) 해당 영상 Keyword로 Youtube Search API 전송  -> handleGetRelated()
    3) 50개 결과 대상 VPI 계산
    4) VPI 상위 4개 다운로드
    5) 각 영상의 마지막 5초 병합하여 ${TimeStr}_${region}_${query}.mp4로 저장
    6) 병합 이전 영상들 query, 제목, Category를 참조하여 New Video 제목, 설명(해시태그 포함)행성
5. 종료 및 로깅
*/ 
import { step0_collectAndInitRuns, processOneRunSafely } from './_dailyVideoGenerate.steps.js';


export async function dailyVideoGenerate() {
  console.log('🚀 dailyVideoGenerate start');

  // 1) 수집 + run init
  const runs = await step0_collectAndInitRuns();

  // 2) 국가별 루프
  for (const run of runs) {
    await processOneRunSafely(run);
  }

  console.log('✅ dailyVideoGenerate finished');
}


// 실행부
dailyVideoGenerate()
  .then(() => {
    console.log("✅ 배치 작업이 성공적으로 끝났습니다.");
    process.exit(0);
  })
  .catch((e) => {
    console.error("❌ 배치 작업 중 에러 발생:", e);
    process.exit(1);
  });

