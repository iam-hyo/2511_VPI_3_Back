// /src/utils/sorting.js

/**
 * [Spec 5.2] AnalyzedVideo 배열을 정렬하는 유틸리티
 * @param {AnalyzedVideo[]} videos 
 * @param {'vpi' | 'view' | 'date'} sortBy 
 * @param {'asc' | 'desc'} order 
 */
export function sortVideos(videos, sortBy, order) {
  const multiplier = order === 'asc' ? 1 : -1;

  return videos.sort((a, b) => {
    let valA, valB;
    switch (sortBy) {
      case 'vpi':
        valA = a.trendScore_VPI;
        valB = b.trendScore_VPI;
        break;
      case 'view':
        valA = a.trendScore_View;
        valB = b.trendScore_View;
        break;
      case 'date':
        // (최신순이므로 Date 객체로 비교)
        valA = new Date(a.publishedAt);
        valB = new Date(b.publishedAt);
        break;
      default:
        return 0;
    }
    
    if (valA > valB) return 1 * multiplier;
    if (valA < valB) return -1 * multiplier;
    return 0;
  });
}