// /src/3_services/vpi.service.js
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const VPI_API_URL = process.env.VPI_API_URL;

if (!VPI_API_URL) {
  throw new Error("환경 변수(.env)에 'VPI_API_URL'이 설정되지 않았습니다.");
}

// [신규] YouTube Category ID to VPI 'category_group' 매핑
// VPI API가 요구하는 스펙에 맞춘 카테고리 그룹입니다.
// (이 매핑은 VPI API의 요구사항에 따라 달라질 수 있습니다!)
const YOUTUBE_CATEGORY_MAP = {
  1: 'Entertainment',  // Film & Animation
  2: 'Entertainment',  // Autos & Vehicles
  10: 'Music',         // Music
  15: 'Entertainment',  // Pets & Animals
  17: 'Sports',         // Sports
  18: 'Entertainment',  // Short Movies
  19: 'Entertainment',  // Travel & Events
  20: 'Gaming',         // Gaming
  21: 'Entertainment',  // Videoblogging
  22: 'People & Blogs', // People & Blogs
  23: 'Entertainment',  // Comedy
  24: 'Entertainment',  // Entertainment
  25: 'News',           // News & Politics
  26: 'Howto & Style',  // Howto & Style
  27: 'Education',      // Education
  28: 'Science & Tech', // Science & Technology
  29: 'Giving',         // Nonprofits & Activism
  30: 'Entertainment',  // Movies
  'default': 'Other'   // 그 외
};

/*
* 입력 데이터 평탄화 @v : 비디오 json 객체
*/
function normalizeToVPIBase(v) {
  const id = v?.id ?? v?.videoId;
  const title = v?.snippet?.title ?? v?.title ?? '';
  const publishedAt = v?.snippet?.publishedAt ?? v?.publishedAt ?? '';
  const channelId = v?.snippet?.channelId ?? v?.channelId ?? '';
  const thumbnails = v?.snippet?.thumbnails ?? v?.thumbnails;

  const viewCount = v?.statistics?.viewCount ?? v?.viewCount;
  const likeCount = v?.statistics?.likeCount ?? v?.likeCount;
  const duration = v?.contentDetails?.duration ?? v?.duration;
  const subscriberCount = v.subscriberCount
  // const categoryId = v.categoryId 배치에는 문제 없었음.
  const categoryId = v.snippet?.categoryId //배치에는 문제 없었음.

  if (!id || !title || !publishedAt || !channelId) return null;

  return {
    id,
    subscriberCount,
    categoryId,
    snippet: { title, publishedAt, channelId, thumbnails },
    statistics: { viewCount, likeCount },
    contentDetails: { duration },
  };
}


/**
 * ISO 8601 Duration (예: PT4M13S)을 초(seconds)로 변환합니다.
 * @param {string} duration - ISO 8601 형식의 기간 문자열
 * @returns {number} 총 초(seconds)
 */
function parseISODuration(duration) {
  if (typeof duration !== 'string') return 0;
  
  const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) return 0;
  
  const hours = parseInt(matches[1] || 0);
  const minutes = parseInt(matches[2] || 0);
  const seconds = parseInt(matches[3] || 0);
  
  return (hours * 3600) + (minutes * 60) + seconds;
}


/**
 * [수정] VPI API가 요구하는 (요청 스키마) 형식으로 데이터를 정제합니다.
 */
function formatVideoForVPI(video) {
  const v = video;
  const toNum = (val) => (val == null || val === '' ? undefined : Number(val));

  // --- [신규] 엄격한 데이터 검증 (Fail Fast) ---
  if (!v.snippet) {
    throw new Error(`[VPI Validation Error] Video ID ${v.id}에서 'snippet' 객체가 누락되었습니다.`);
  }
  if (!v.contentDetails) {
    throw new Error(`[VPI Validation Error] Video ID ${v.id}에서 'contentDetails' 객체가 누락되었습니다.`);
  }
  if (!v.statistics) {
    throw new Error(`[VPI Validation Error] Video ID ${v.id}에서 'statistics' 객체가 누락되었습니다.`);
  }
  if (!v.subscriberCount) {
    // subscriberCount는 0일 수 없으므로(1로 보정), undefined/null만 체크
    throw new Error(`[VPI Validation Error] Video ID ${v.id}에서 'subscriberCount' 값이 누락되었습니다.`);
  }
  if (!v.snippet.publishedAt) {
    throw new Error(`[VPI Validation Error] Video ID ${v.id}에서 'snippet.publishedAt' (게시 시간)이 누락되었습니다.`);
  }

  // --- VPI API가 요구하는 3개 신규 필드 계산 ---
  const durationSec = parseISODuration(v.contentDetails?.duration);
  const uploadDate = new Date(v.snippet.publishedAt);
  const hoursSinceUpload = (new Date().getTime() - uploadDate.getTime()) / (1000 * 60 * 60);
  const categoryIdNum = toNum(v.categoryId);
  const categoryGroup = YOUTUBE_CATEGORY_MAP[categoryIdNum] || YOUTUBE_CATEGORY_MAP['default'];
  // ---

  const obj = {
    id: v.videoId || v.id,
    actual_views: toNum(v.statistics.viewCount),
    subscriber_count: toNum(v.subscriberCount),
    upload_date: v.publishedAt, // 스키마가 string을 요구
    like_count: toNum(v.statistics.likeCount),
    duration_sec: durationSec,
    category_id: categoryIdNum,
    upload_date: v.snippet.publishedAt,
    
    is_short: durationSec <= 140, // 140초 이하를 쇼츠로 간주
    hours_since_upload: Math.round(hoursSinceUpload),
    category_group: categoryGroup
  };
  
  // VPI API가 null이나 undefined 값을 싫어할 수 있으므로, 해당 키를 제거
  return obj
}

/**
 * [Spec 4.1] 여러 비디오의 VPI 점수를 일괄 요청
 */
export async function fetchVPIs(videos) {
  let payload;

  const normalized_v = videos.map(normalizeToVPIBase)
  // console.log("===========fetchVPIS==============")
  // console.log(videos)
  // console.log(normalized_v)

try {
  payload = normalized_v.map(formatVideoForVPI);
} catch (validationError) {
  console.error('[VPI] PI 페이로드 생성 중 치명적 오류:', validationError.message);
  throw validationError;
}

  // (디버깅) VPI로 전송되는 페이로드 샘플을 콘솔에 1개만 출력
  if (payload.length > 0) {
    console.log('[VPI Service] VPI API로 전송하는 페이로드 샘플:', JSON.stringify(payload[0]));
  }

  const res = await fetch(`${VPI_API_URL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`VPI API 오류 (${res.status}): ${text.slice(0, 160)}`);
  }
  
  // VPI API는 { "id": "string", "vpi": 0, "pred": 0 } 배열을 반환
  const data = await res.json(); 
  
  // VPI 응답(배열)을 쉽게 찾을 수 있도록 Map으로 변환
  const vpiMap = new Map();
  if (Array.isArray(data)) {
    data.forEach(item => {
      vpiMap.set(item.id, {
        vpiScore: item.vpi || 0,
        predViews: item.pred || 0 // 예측 조회수 (필요시 사용)
      });
    });
  }
  return vpiMap; // Map 객체 반환
}