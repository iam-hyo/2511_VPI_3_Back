// /src/1_batch/_dailyVideoGenerate.steps.js
/**
 * 역할(Role):
 *  - dailyVdieoGenerate 배치 파이프라인에서 사용되는
 *    "세부 실행 단계(step)"들을 정의한 파일
 *
 *  - 각 step은 다음 원칙을 따른다:
 *    1) 단일 책임 (한 단계 = 하나의 의미 있는 작업)
 *    2) 상태(run) 기반 재실행 가능
 *    3) 이미 완료된 단계는 스킵
 *
 *  - 실제 배치 시나리오는 dailyVideoGenerate.js에서 관리하며,
 *    이 파일은 "하부 실행 로직"만 담당한다.
 */

import path from 'path';
import fs from 'fs/promises';

// ---------- Batch / Service Layer ----------
import { parseISODuration } from '../3_services/vpi.service.js';
import { collectOneRegion } from './runDailyCollection.js';
import { getRelatedVideosByKeyword } from '../3_services/related.service.js';
import { getMostTrendyVideo } from '../3_services/trend.service.js';
import { downloadVideoIfNeeded, cutLastSecondsIfNeeded, mergeTitleAndHighlightsWithFade, ensureDir, createTitleCardIfNeeded } from '../3_services/videoEdit.service.js';
import { generateVideoDetail } from '../3_services/videoMeta.service.js';
import { generateClipCaptions } from '../3_services/videoCaption.service.js';

// ---------- Repository Layer ----------
import { createRun, getRun, updateRun, markRunError, makeRunId, RUN_STATUS } from '../6_repository/run.repository.js';
import { loadProcessedVideosByFileName } from '../6_repository/file.repository.js';

const highlightSec = 10;

/**
 * KST 기준 YYYY-MM-DD 문자열 반환
 * - runId 생성 및 일일 파이프라인 기준 날짜로 사용
 */
function todayStrKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}


/**
 * 특정 runId에 대한 비디오 산출물 저장 디렉토리 경로 반환
 * @param {string} runId
 */
function dataVideoDir(runId) {
  return path.resolve(process.cwd(), 'data', 'videos', runId); // Data경로를 생성하는 안전한 방식
}


async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

/**
 * processed 파일의 실제 경로를 만들어주는 함수
 * - 주의: 너 프로젝트에서 processed 저장 폴더명이 다를 수 있음
 * - 지금은 data/processed 를 가정
 */
function processedFilePath(processedFileName) {
  return path.resolve(process.cwd(), 'data', '02_processed_data', processedFileName);
}

export async function isTodayCollectionAlreadyDone(run) {
  const processedFileName = run?.artifacts?.processedFileName;
  if (!processedFileName) return false;

  const fullPath = processedFilePath(processedFileName);
  return await fileExists(fullPath);
}


/* ============================================================
 * Step 0
 * 역할:
 *  - runDailyCollection 실행
 *  - 국가별 run 생성 및 초기 상태 설정
 *  - 수집 단계에서 오류가 발생한 run은 ERROR 처리
 */
export async function step0_collectAndInitRuns() {
  const today = todayStrKST();
  // const regions = ['KR']; // 여기서 제어 (env로 빼도 됨)
  const regions = ['KR', 'US', 'MX']; // 여기서 제어 (env로 빼도 됨)



  const runs = [];

  for (const region of regions) {
    const runId = makeRunId(today, region);

    // 1) 오늘자 run이 있는지 먼저 확인
    let run = await getRun(runId);

    // 2) run이 있고, 실제 processed 파일도 존재하면 => 수집/분석 스킵
    if (run && await isTodayCollectionAlreadyDone(run)) {
      console.log(`[step0] ✅ 이미 오늘자 수집/분석 완료됨 -> 수집 스킵 (${runId})`);
      runs.push(run);
      continue;
    }

    // 3) 여기까지 왔다는 건:
    //    - run이 없거나
    //    - run은 있는데 processed 파일이 없어서(중간 실패 등)
    //    => 수집을 다시 해야 함

    console.log(`[step0] 🚀 오늘자 수집/분석이 없어서 수집 시작 (${region})`);

    // 🔻 여기서 runDailyCollection()을 통째로 호출하면 다시 여러 국가 수집이 되므로 비추천
    // ✅ 권장: "region 1개만 수집"하는 함수로 분리해서 호출
    const r = await collectOneRegion(region);

    // run이 없다면 새로 생성
    if (!run) {
      run = await createRun({
        runId,
        date: today,
        region,
        artifacts: {
          rawFileName: r.rawFileName,
          processedFileName: r.processedFileName,
        },
        meta: {},
      });
    } else {
      // run이 있는데 수집 결과가 없었던 케이스 => artifacts만 갱신
      run = await updateRun(runId, {
        artifacts: {
          rawFileName: r.rawFileName,
          processedFileName: r.processedFileName,
        },
      });
    }

    // 수집에서 오류가 났으면 ERROR 기록하고 이 region은 스킵
    if (r.error) {
      await markRunError(runId, 'COLLECTION', r.error);
      continue;
    }

    run = await updateRun(runId, { status: RUN_STATUS.COLLECTED });
    runs.push(run);
  }

  return runs;
}

/* ============================================================
 * Step 1
 *  - 국가별 processed 데이터에서 "가장 트렌디한 영상 1개"를 선정
 *  - 조건:
 *    - 6분 이내
 *    - Music 카테고리 제외
 *    - VPI Trend → VPI → 조회수 순 tie-break
 *  - 이미 선정된 경우 스킵 가능
 */
export async function step1_selectMostTrendyVideo(run) {
  if (run.meta?.bestVideoId) {
    console.log(`[step1] skip: bestVideo already selected (${run.meta.bestVideoId})`);
    return run;
  }

  const processedFileName = run.artifacts?.processedFileName;
  if (!processedFileName) {
    throw new Error('[step1 Error] processedFileName not found in run.artifacts');
  }

  const videos = await loadProcessedVideosByFileName(processedFileName);
  const best = getMostTrendyVideo(videos);

  if (!best) {
    throw new Error('[step1 Error] No best video found (all videos filtered out)');
  }

  const next = await updateRun(run.runId, {
    status: RUN_STATUS.BEST_SELECTED,
    meta: {
      ...run.meta,
      bestVideoId: best.id,
      bestVideo: best,
      query: best.keyword?.[0] || best.title || '',
    },
  });

  console.log(`[step1] selected bestVideoId=${best.id}`);
  return next;
}


/* ============================================================
 * Step 2
 *  - bestVideo의 query(제목)를 기반으로 YouTube Search + VPI 계산을 수행
 *  - 결과는 meta.relatedVideos에 저장
 * ============================================================
 */
export async function step2_fetchRelated(run) {
  if (run.meta?.relatedVideos?.length) {
    console.log('[step2] skip: relatedVideos already exist');
    return run;
  }

  const region = run.region;
  const keyword = run.meta?.query;
  if (!keyword) {
    throw new Error('[step2] keyword가 존재하지 않습니다.');
  }

  console.log(`[step2] keyword="${keyword}" 관련 동영상 생성 중`);
  const relatedAll = await getRelatedVideosByKeyword(keyword, region, 50);

  const next = await updateRun(run.runId, {
    status: RUN_STATUS.RELATED_FETCHED,
    meta: {
      ...run.meta,
      relatedVideos: relatedAll,
    },
  });

  console.log(`[step2] related fetched: ${relatedAll.length}`);
  return next;
}


/* ============================================================
 * Step 3
 *  - VPI 상위 4개 영상 다운로드
 *  - 각 영상의 마지막 5초를 하이라이트로 추출
 *  - 다운로드 / 하이라이트 파일이 이미 존재하면 스킵
 * ============================================================
 */
export async function step3_downloadAndMakeHighlights(run) {
  if (run.artifacts?.highlightPaths?.length) {
    console.log('[step3] skip: highlightPaths가 이미 존재합니다.');
    return run;
  }

  const related = run.meta?.relatedVideos || [];
  if (!related.length) {
    throw new Error('[step3 Error] relatedVideos가 없습니다.');
  }

  // ✅ 하이라이트 선정 규칙 지정
  const maxSeconds = 80;
  const filtered = related.filter(v => {
    const sec = parseISODuration(v.contentDetails?.duration);
    return sec > 0 && sec <= maxSeconds;
  });

  if (filtered.length < 4) {
    console.log(`[step3] warning: 6분 이내 후보가 4개 미만입니다. (count=${filtered.length})`);
  }

  const top4 = filtered
    .slice()
    .sort((a, b) => (b.vpiScore || 0) - (a.vpiScore || 0))
    .slice(0, 4);

  if (top4.length === 0) {
    throw new Error('[step3 Erorr] No related videos under 6 minutes. (filtered result empty)');
  }

  const outDir = dataVideoDir(run.runId);
  await ensureDir(outDir);

  const downloadedPaths = [];
  const highlightPaths = [];

  for (const v of top4) {
    console.log(`[step3] processing videoId=${v.id}`);

    const mp4Path = await downloadVideoIfNeeded({ videoId: v.id, outDir });
    downloadedPaths.push(mp4Path);

    const highlightPath = path.join(outDir, `${v.id}_last5s.mp4`);
    await cutLastSecondsIfNeeded({ //하이라이트 추출 메소드 초안
      inputPath: mp4Path,
      outputPath: highlightPath,
      seconds: highlightSec,
    });

    highlightPaths.push(highlightPath);
  }

  return updateRun(run.runId, {
    status: RUN_STATUS.HIGHLIGHTS_MADE,
    artifacts: {
      ...run.artifacts,
      downloadedPaths,
      highlightPaths,
    },
    meta: {
      ...run.meta,
      top4VideoIds: top4.map(v => v.id),
      top4Videos: top4,
    },
  });
}


/* ============================================================
 * Step 4
 *  - 하이라이트 영상들과 제목들을 하나의 mp4로 병합
 *  - 파일명: {time}_{region}_{query}.mp4
 * ============================================================
 */
export async function step4_mergeHighlights(run) {
  if (run.artifacts?.mergedVideoPath) {
    console.log('[step4] skip: mergedVideoPath가 이미 존재합니다.');
    return run;
  }

  const highlightPaths = run.artifacts?.highlightPaths || [];
  const top4Videos = run.meta?.top4Videos || [];
  if (!highlightPaths.length) {
    throw new Error('[step4 Error] highlightPaths가 존재하지 않습니다.');
  }

  // 1) LLM으로 캡션 생성 (1~4개)
  //    - 이미 만들어 둔 경우(meta에 저장되어 있으면) 재실행 때 스킵 가능
  let captions = run.meta?.clipCaptions;
  if (!Array.isArray(captions)) {
    captions = await generateClipCaptions({ query: run.meta?.query || '', top4Videos, });

    run = await updateRun(run.runId, {
      meta: { ...run.meta, clipCaptions: captions },
    });
  } else {
    console.log('[step4] skip: captions이 이미 존재합니다.');
  }

  // 2) 타이틀 카드 생성(1.2 초)
  const durationSec = 1.2;
  const outDir = dataVideoDir(run.runId);
  await ensureDir(outDir);

  const titleCardPaths = [];
  for (let i = 0; i < captions.length; i++) {
    const titleCard = await createTitleCardIfNeeded({
      outDir,
      index: i + 1,
      caption: captions[i],
      durationSec: durationSec,
    });

    titleCardPaths.push(titleCard)
  }
  //

  const timeStr = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
  const query = (run.meta?.query || 'query')
    .replace(/[^a-zA-Z0-9ㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
    .slice(0, 20);

  const mergedVideoPath = path.join(outDir, `${timeStr}_${run.region}_${query}.mp4`);

  await mergeTitleAndHighlightsWithFade({
    titleCardPaths,
    highlightPaths,
    outputPath: mergedVideoPath,
    durationSec: durationSec,
    highlightSec: highlightSec,
    fadeSec: 0.15,
  });

  return updateRun(run.runId, {
    status: RUN_STATUS.MERGED,
    artifacts: {
      ...run.artifacts,
      mergedVideoPath,
    },
  });
}

/* ============================================================
 * Step 5
 *  - Gemini 기반으로 제목 / 설명 / 해시태그 생성
 *  - meta_{region}.txt 파일로 저장
 * ============================================================
 */
export async function step5_generateMetaTxt(run) {
  if (run.artifacts?.metaTxtPath) {
    console.log('[step5] skip: metaTxtPath already exists');
    return run;
  }

  const meta = await generateVideoDetail({
    query: run.meta?.query || '',
    videos: (run.meta?.top4Videos || []).map(v => ({
      title: v.snippet?.title || '',
      categoryId: v.snippet?.categoryId || '',
    })),
  });

  const outDir = dataVideoDir(run.runId);
  const metaTxtPath = path.join(outDir, `meta_${run.region}.txt`);

  await fs.writeFile(
    metaTxtPath,
    [
      `Title: ${meta.title}`,
      '',
      'Description:',
      meta.description,
      '',
      'Hashtags:',
      meta.hashtags.join(' '),
      '',
    ].join('\n'),
    'utf-8'
  );

  return updateRun(run.runId, {
    status: RUN_STATUS.META_DONE,
    artifacts: {
      ...run.artifacts,
      metaTxtPath,
    },
    meta: {
      ...run.meta,
      videoMeta: meta,
    },
  });
}

/* ============================================================
 * Wrapper
 *  - 하나의 run(region)을 끝까지 안전하게 처리
 *  - 중간 오류 발생 시: run 상태 ERROR 기록하고 다른 국가 run은 계속 진행
 * ============================================================
 */
export async function processOneRunSafely(run) {
  try {
    let r = run;
    r = await step1_selectMostTrendyVideo(r);
    r = await step2_fetchRelated(r);
    r = await step3_downloadAndMakeHighlights(r);
    r = await step4_mergeHighlights(r);
    r = await step5_generateMetaTxt(r);

    return updateRun(r.runId, { status: RUN_STATUS.DONE });
  } catch (e) {
    console.error(`[processOneRun] ERROR: ${run.runId} -> ${e.message}`);
    await markRunError(run.runId, 'PIPELINE', e.message);
    return null;
  }
}