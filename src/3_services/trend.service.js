// /src/3_services/trend.service.js

/**
 * [Trend Service]
 * 수집 및 분석된 영상 목록 중에서 '가장 트렌디한(활용 가치가 높은)' 영상 하나를 선정하는 로직입니다.
 * * - 역할: 필터링(길이, 카테고리) 및 정렬(VPI Trend 점수 등)을 통해 베스트 영상 추출
 * - 주요 기준: 6분 이하(기본값), 음악 카테고리 제외, 트렌드 점수(VPI Trend) 우선 정렬
 * - 사용처: 베스트 영상 선정 단계 (BEST_SELECTED)
 */

/**
 * [핵심 기능] 베스트 트렌드 영상 선정
 * * - 수집된 영상 리스트에서 2차 가공(쇼츠 제작 등)에 가장 적합한 1개의 영상을 뽑습니다.
 * 정렬 우선순위 (Sorting):
 * - 1순위: vpiTrendScore (급상승 트렌드 점수) -> 최근 반응이 얼마나 뜨거운가
 * - 2순위: vpiScore (기본 성과 점수) -> 구독자 대비 조회수가 얼마나 잘 나왔나
 * - 3순위: viewCount (절대 조회수) -> 기본 체급이 높은가
 *
 * @param {Array<any>} videos - 분석이 완료된 영상 목록 (VPI 점수 포함)
 * @returns {Object|null} - 선정된 최적의 영상 객체 1개 (조건에 맞는 게 없으면 null)
 */
export function getMostTrendyVideo(videos) {
  const safe = Array.isArray(videos) ? videos : [];
  if (safe.length === 0) return null;

  const sorted = safe.slice().sort((a, b) => {
    const at = Number(a.vpiTrendScore ?? 0);
    const bt = Number(b.vpiTrendScore ?? 0);
    if (bt !== at) return bt - at;

    const av = Number(a.vpiScore ?? 0);
    const bv = Number(b.vpiScore ?? 0);
    if (bv !== av) return bv - av;

    const aview = Number(a.statistics?.viewCount ?? 0);
    const bview = Number(b.statistics?.viewCount ?? 0);
    return bview - aview;
  });

  return sorted[0];
}