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


// async function dailyVideoGenerate() {
//     console.log('🚀 dailyVideoGenerate start');
//     const collectResults = await runDailyCollection(); // 1,2,3 번 로직 할당, 결과파일 저장 data/`${timeStr}_${region}_${type}.json`;
    
//     //국가별 루프 시작 for....
//     for (const result of collectResults) {
//         const { region, rawFileName, processedFileName, error } = result;
//         //함수 GetMostTrendyVideo() -> 생성된 파일에서 VPI Score Top1 반환, Tie발생시 VPI스코어 높은 Vid, 재타이시 조회수 순, 제약: 길이 6분 이내./ 4.1, 4.2, 4.3 할당
//         //함수 DownloadVideo() -> 앞서 선정된 4개의 영상을 다운로드 4.4
//         //함수 mergeHighlight() -> 하이라이트를 탐지해서 하나의 비디오로 병합. 현재는 마지막 5초를 하이라이트로 간주. 4.5
//         //함수 generateVideoDetail() -> generateContent()함수 활용. 4.6
//     }
//     //종료
// }


// dailyVideoGenerate()