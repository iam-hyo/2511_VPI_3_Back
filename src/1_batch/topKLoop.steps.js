// /src/1_batch/topKLoop.steps.js

/*
- parentRun에서 TopK 비디오를 선정하고 childRun을 확보한다.
- childRunId를 입력으로 stepA~D(=기존 step2~5)를 실행하는 래퍼를 제공한다.
- 기존 step2~5는 run 기반 스킵/로깅이 이미 구현돼 있으므로 그대로 재사용한다.
*/

import { getRun, updateRun } from '../6_repository/run.repository.js';
import { getVideoId } from '../utils/videoKey.js'
import { generateClipCaptionsForTopK } from '../3_services/videoCaption.service.js'; // 아래에 신규 작성
import {
  selectTopKVideos,
  ensureChildRuns,
  step2_fetchRelated,
  step3_downloadAndMakeHighlights,
  step4_mergeHighlights,
  step5_generateMetaTxt,
} from './_dailyVideoGenerate.steps.js';


/**
 * parent run meta에 clipCaptionsMap이 없으면 TopK 전체에 대해 1회 생성해 저장한다.
 *
 * @param {string} parentRunId - 부모 runId
 * @param {string} query - 기준 query
 * @param {Array<object>} topKVideos - bestVideo 배열 (각 요소는 videoId 포함)
 * @returns {Promise<object>} 업데이트된 parent run
 */
export async function ensureClipCaptionsMapOnParent(parentRunId, query, topKVideos) {
  const parent = await getRun(parentRunId);
  if (!parent) throw new Error(`[ensureClipCaptionsMapOnParent] parent not found: ${parentRunId}`);

  const existing = parent.meta?.clipCaptionsMap;
  if (existing && Object.keys(existing).length > 0) {
    return parent;
  }

  const clipCaptionsMap = await generateClipCaptionsForTopK({ query, topKVideos });

  return updateRun(parentRunId, {
    meta: {
      ...parent.meta,
      clipCaptionsMap,
      clipCaptionsGeneratedAt: new Date().toISOString(),
    },
  });
}

/**
 * child run에 clipCaptions를 주입한다.
 * - parent의 clipCaptionsMap[bestVideoId] 값을 child.meta.clipCaptions로 복사 저장한다.
 *
 * @param {string} childRunId - 자식 runId
 * @returns {Promise<object>} 업데이트된 child run
 */
export async function injectClipCaptionsToChild(childRunId) {
  const child = await getRun(childRunId);
  if (!child) throw new Error(`[injectClipCaptionsToChild] child not found: ${childRunId}`);

  if (Array.isArray(child.meta?.clipCaptions)) {
    return child; // 이미 있으면 스킵
  }

  const parentRunId = child.meta?.parentRunId;
  if (!parentRunId) throw new Error(`[injectClipCaptionsToChild] parentRunId missing on child meta: ${childRunId}`);

  const parent = await getRun(parentRunId);
  if (!parent) throw new Error(`[injectClipCaptionsToChild] parent not found: ${parentRunId}`);

  const bestVideoId = String(child.meta?.bestVideoId || '').trim();
  const captions = parent.meta?.clipCaptionsMap?.[bestVideoId];

  // fallback: 캡션이 없으면 더미 생성(파이프라인 중단 방지)
  const safe = Array.isArray(captions) && captions.length > 0 ? captions : ['Clip 1', 'Clip 2', 'Clip 3', 'Clip 4'];

  return updateRun(childRunId, {
    meta: {
      ...child.meta,
      clipCaptions: safe,
    },
  });
}


/**
 * parentRun에서 TopK를 선정하고 childRun들을 생성/갱신한다.
 * - 내부적으로 기존 selectTopKVideos/ensureChildRuns를 재사용한다. :contentReference[oaicite:5]{index=5}
 *
 * @param {object} parentRun - 부모 run 객체
 * @param {number} topK - TopK 개수
 * @returns {Promise<string[]>} childRunId 배열(없으면 [])
 */
export async function step1_selectTopKVideos(parentRun, topK = 3) {
  const topKVideos = await selectTopKVideos(parentRun, topK);
  if (!topKVideos.length) return [];

  const { childRunIds } = await ensureChildRuns(parentRun, topKVideos);
  return childRunIds || [];
}

/**
 * childRunId로 run을 로드한다(없으면 에러).
 *
 * @param {string} childRunId - 자식 runId
 * @returns {Promise<object>} childRun 객체
 */
async function requireChildRun(childRunId) {
  const run = await getRun(childRunId);
  if (!run) throw new Error(`[topKLoop] child run not found: ${childRunId}`);
  return run;
}

/**
 * StepA: 관련 영상 검색/계산을 수행한다(step2 래핑).
 *
 * @param {string} childRunId - 자식 runId
 * @returns {Promise<object>} 갱신된 run
 */
export async function stepA_fetchRelated(childRunId) {
  const run = await requireChildRun(childRunId);
  return step2_fetchRelated(run); // step2는 relatedVideos 있으면 스킵 :contentReference[oaicite:6]{index=6}
}

/**
 * StepB: 상위 4개 다운로드 + 하이라이트 생성(step3 래핑).
 *
 * @param {string} childRunId - 자식 runId
 * @returns {Promise<object>} 갱신된 run
 */
export async function stepB_downloadAndMakeHighlights(childRunId) {
  const run = await requireChildRun(childRunId);
  return step3_downloadAndMakeHighlights(run);
}

/**
 * StepC: 하이라이트 병합(step4 래핑).
 *
 * @param {string} childRunId - 자식 runId
 * @returns {Promise<object>} 갱신된 run
 */
export async function stepC_mergeHighlights(childRunId) {
  const run = await requireChildRun(childRunId);
  return step4_mergeHighlights(run);
}

/**
 * StepD: 메타 텍스트 생성(step5 래핑).
 *
 * @param {string} childRunId - 자식 runId
 * @returns {Promise<object>} 갱신된 run
 */
export async function stepD_generateMetaTxt(childRunId) {
  const run = await requireChildRun(childRunId);
  return step5_generateMetaTxt(run);
}
