// /src/utils/videoKey.js
// 비디오 객체의 식별자(videoId)를 안정적으로 추출한다.


/**
 * 비디오 객체에서 videoId를 추출한다.
 *
 * @param {object} v - 비디오 객체
 * @returns {string} videoId(없으면 빈 문자열)
 */
export function getVideoId(v) {
  return String(v?.videoId || v?.id || '').trim();
}
