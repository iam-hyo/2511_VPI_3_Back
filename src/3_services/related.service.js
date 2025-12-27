// /src/3_services/related.service.js

/**
 * [Related Video Service]
 * 키워드를 기반으로 유튜브 영상을 검색하고, 자체 성과 지표(VPI)까지 분석하여 반환하는 핵심 로직입니다.
 * * - 역할: 단순 검색 결과를 넘어, '구독자 대비 조회수 성과(VPI)'가 포함된 고도화된 데이터 생성
 * - 의존성: youtube.service (API 호출), vpi.service (점수 계산)
 * - 사용처: API 서버(Controller) 또는 자동화 스크립트(Batch)에서 공통으로 사용
 */

import { fetchSearchList, fetchVideoDetails, fetchChannelSubscriberCounts } from './youtube.service.js';
import { fetchVPIs } from './vpi.service.js';

/**
 * [핵심 기능] 키워드 검색 및 VPI 분석 통합 파이프라인
 * * 1. 키워드로 영상 리스트 검색 (Search)
 * 2. 각 영상의 상세 통계(조회수 등) 조회 (Video Details)
 * 3. 각 채널의 구독자 수 조회 (Channel Stats)
 * 4. VPI(성과 지표) 계산 (VPI Calculation)
 * 5. 모든 정보를 병합하여 반환
 * * @param {string} keyword - 검색할 키워드
 * @param {number} maxResults - 가져올 최대 영상 개수 (기본 50)
 * @returns {Promise<Array>} - 상세 정보와 VPI 점수가 포함된 영상 객체 배열
 */

export async function getRelatedVideosByKeyword(keyword, region, maxResults = 50) {
  // 0. 예외 처리: 키워드가 없으면 빈 배열 반환
  if (!keyword) return [];

  // 1. [검색] 유튜브 Search API 호출
  // - 결과: 영상 ID와 기본적인 정보(제목, 썸네일 등)만 있음
  const searchResults = await fetchSearchList(keyword, maxResults, region);
  const videoIds = searchResults.map(item => item.id.videoId).filter(Boolean);
  
  // 검색 결과가 없으면 바로 종료
  if (videoIds.length === 0) return [];

  // 2. [상세 조회] Video API 호출
  // - 목적: 조회수(viewCount), 게시일(publishedAt) 등 통계 데이터 확보
  const videoDetails = await fetchVideoDetails(videoIds);

  // 3. [구독자 조회] Channel API 호출
  // - 목적: VPI 계산의 분모(구독자 수)를 알기 위해 채널 ID 추출 및 중복 제거
  const uniqueChannelIds = [...new Set(videoDetails.map(v => v.snippet.channelId))];
  const subscriberMap = await fetchChannelSubscriberCounts(uniqueChannelIds);

  // 4. [데이터 전처리] VPI 계산을 위한 중간 객체 생성
  // - 영상 정보에 구독자 수를 매핑 (구독자 정보가 없으면 0으로 나누기 방지를 위해 999,999로 설정)
  const videosForVPI = videoDetails.map(v => ({
    ...v,
    subscriberCount: (subscriberMap.get(v.snippet.channelId) || 999999),
  }));

  // 5. [점수 계산] VPI Service 호출
  // - 각 영상의 조회수와 구독자 수를 기반으로 성과 점수(VPI) 산출
  const vpiResultsMap = await fetchVPIs(videosForVPI);

  // 6. [최종 병합] 원본 데이터 + VPI 점수 합치기
  // - API 응답이나 DB 저장에 적합한 깔끔한 형태로 가공
  const combinedResults = videoDetails.map(video => {
    const vpiData = vpiResultsMap.get(video.id);
    return {
      id: video.id,
      snippet: video.snippet,          // 제목, 설명, 채널명 등
      statistics: video.statistics,    // 조회수, 좋아요 수 등
      contentDetails: video.contentDetails, // 영상 길이 등
      vpiScore: vpiData?.vpiScore || 0,     // 계산된 VPI 점수 (없으면 0)
    };
  });

  return combinedResults;
}