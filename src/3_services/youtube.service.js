// /src/3_services/youtube.service.js
// (YouTube API 연동 책임)
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.API_KEY_JDU;
const BASE_URL = 'https://www.googleapis.com/youtube/v3';

/**
 * [Spec 3.0] 인기 동영상 50개 수집
 * @param {string} regionCode - 국가 코드 (예: KR, US)
 * @param {number} maxResults - 가져올 개수
 * @returns {Promise<Array<Object>>} 비디오 리소스 배열
 */
export async function fetchPopularVideos(regionCode, maxResults = 50) {
  const url = `${BASE_URL}/videos?part=snippet,statistics,contentDetails&chart=mostPopular&regionCode=${regionCode}&maxResults=${maxResults}&key=${API_KEY}`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube API 오류: ${res.statusText}`);
  const data = await res.json();

  return data.items || [];
}

/**
 * [Spec 5.3] 키워드로 5일 이내 영상 50개 검색
 * @param {string} keyword - 검색어
 * @returns {Promise<Array<Object>>} 검색 결과 비디오 리소스 배열
 */
export async function fetchSearchList(keyword) {
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const url = `${BASE_URL}/search?part=snippet&q=${encodeURIComponent(keyword)}&maxResults=50&order=date&publishedAfter=${fiveDaysAgo}&type=video&key=${API_KEY}`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Youtube API 오류: ${res.statusText}`);
  const data = await res.json();
  // (참고: Search API 결과는 Video API 결과와 스키마가 약간 다름)
  return data.items || [];
}

/**
 * [신규] 여러 채널 ID의 구독자 수를 일괄 조회합니다.
 * @param {string[]} channelIds - 조회할 채널 ID 배열 (고유값)
 * @returns {Promise<Map<string, number>>} 채널 ID를 키로, 구독자 수를 값으로 하는 Map
 */
export async function fetchChannelSubscriberCounts(channelIds) {
  const uniqueIds = [...new Set(channelIds)];
  
  // [디버그 1] 우리가 몇 개의 ID를 요청하는지 확인
  console.log(`[YouTube Service] ${uniqueIds.length}개 고유 채널의 구독자 수 조회 중...`);
  if (uniqueIds.length === 0) {
    return new Map(); // 조회할 ID가 없으면 빈 맵 반환
  }

  const idString = uniqueIds.slice(0, 50).join(','); // API는 최대 50개만 처리 가능
  
  const url = `${BASE_URL}/channels?part=statistics&id=${idString}&key=${API_KEY}`;

  const res = await fetch(url);

  // [디버그 2] API가 200 OK가 아닌 응답(403, 400 등)을 줬는지 확인
  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`[YouTube Service] Channels API 오류 발생! (Status: ${res.status})`);
    console.error(`[YouTube Service] Error Body: ${errorBody.slice(0, 300)}`);
    // 오류가 나도 빈 맵을 반환하여 VPI 오류를 막되, 원인은 기록
    return new Map(); 
  }
  
  const data = await res.json();
  
  // [디버그 3] API가 200 OK를 줬지만, 'items'가 비어있는지 확인
  if (!data.items || data.items.length === 0) {
    console.warn(`[YouTube Service] Channels API가 200 OK를 반환했지만, items 배열이 비어있습니다.`);
    return new Map();
  }

  // [디버그 4] 성공 로그
  console.log(`[YouTube Service] Channels API가 ${data.items.length}개의 채널 정보를 반환했습니다.`);

  const resultMap = new Map();
  (data.items || []).forEach(channel => {
    // [디버그 5] 구독자 수가 비공개(undefined)인지 확인
    if (channel.statistics?.subscriberCount === undefined) {
      console.warn(`[YouTube Service] 채널 ${channel.id}의 구독자 수가 비공개(undefined)입니다.`);
    }

    // [수정] 비공개(undefined) 또는 실제 0명일 경우, 1로 처리 (VPI 오류 방지용)
    const count = Number(channel.statistics?.subscriberCount || 1);
    resultMap.set(channel.id, (count === 0 ? 1 : count)); // 0도 1로 변경
  });
  
  return resultMap;
}

/**
 * [신규] 여러 비디오 ID의 상세 정보를 일괄 조회합니다.
 * (검색 API가 반환하지 않는 statistics, contentDetails를 가져오기 위함)
 * @param {string[]} videoIds - 조회할 비디오 ID 배열 (최대 50개)
 * @returns {Promise<Array<Object>>} YouTube 비디오 리소스 객체 배열
 */
export async function fetchVideoDetails(videoIds) {
  if (videoIds.length === 0) return [];
  
  const idString = videoIds.join(',');
  
  // [핵심] 'part'에 VPI 계산에 필요한 모든 것을 포함
  const url = `${BASE_URL}/videos?part=snippet,statistics,contentDetails&id=${idString}&key=${API_KEY}`;
  
  const res = await fetch(url);
  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`[YouTube Service] Video Details API 오류: ${res.statusText}`, errorBody);
    throw new Error(`YouTube Video Details API 오류: ${res.statusText}`);
  }
  
  const data = await res.json();
  return data.items || [];
}