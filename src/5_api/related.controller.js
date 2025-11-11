// /src/5_api/related.controller.js
import { fetchSearchList, fetchVideoDetails } from '../3_services/youtube.service.js';
import { fetchVPIs } from '../3_services/vpi.service.js';
// [신규] 구독자 수 조회를 위해 임포트
import { fetchChannelSubscriberCounts } from '../3_services/youtube.service.js'; 

/**
 * [Spec 5.3] (로직 전면 수정) POST /api/related-videos
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleGetRelated(req, res) {
  try {
    const { keyword } = req.body;
    if (!keyword) {
      return res.status(400).json({ error: 'keyword가 필요합니다.' });
    }

    // 1. YouTube 검색 API 호출 (50개 videoId 획득)
    const searchResults = await fetchSearchList(keyword);
    const videoIds = searchResults.map(item => item.id.videoId);
    if (videoIds.length === 0) {
      return res.status(200).json([]); // 검색 결과 없으면 빈 배열 반환
    }

    // 2. [신규] Video Details API 호출 (통계, 영상 길이 등 획득)
    const videoDetails = await fetchVideoDetails(videoIds);

    // 3. [신규] 구독자 수 조회 (VPI 필수)
    const uniqueChannelIds = [...new Set(videoDetails.map(v => v.snippet.channelId))];
    const subscriberMap = await fetchChannelSubscriberCounts(uniqueChannelIds);

    // 4. [신규] VPI가 요구하는 형식으로 데이터 가공 (구독자 수 주입)
    const videosForVPI = videoDetails.map(v => ({
      ...v, // (v.id, v.snippet, v.statistics, v.contentDetails)
      // v.subscriberCount 필드 추가 (0 방지)
      subscriberCount: (subscriberMap.get(v.snippet.channelId) || 1),
    }));

    // 5. VPI 예측 API 호출
    const vpiResultsMap = await fetchVPIs(videosForVPI);

    // 6. VPI 점수를 원본 상세 정보에 병합
    const combinedResults = videoDetails.map(video => {
      const vpiData = vpiResultsMap.get(video.id);
      return {
        id: video.id, // (참고: searchResults가 아닌 videoDetails 기준)
        snippet: video.snippet,
        statistics: video.statistics,
        contentDetails: video.contentDetails,
        vpiScore: vpiData?.vpiScore || 0
      };
    });

    // 7. VPI 점수 상위 4개 정렬 및 반환
    const top4 = combinedResults
      .sort((a, b) => b.vpiScore - a.vpiScore)
      .slice(0, 4);

    res.status(200).json(top4);

  } catch (err) {
    console.error(`[handleGetRelated Error] ${err.message}`);
    res.status(500).json({ error: '관련 비디오 생성 중 서버 오류 발생' });
  }
}