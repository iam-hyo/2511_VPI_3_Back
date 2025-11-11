// /src/5_api/trends.controller.js
import { getAnalyzedFile } from '../6_repository/file.repository.js';
import { sortVideos } from '../utils/sorting.js';

/**
 * [Spec 5.2] GET /api/trends
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleGetTrends(req, res) {
  try {
    const { time, region, sortBy = 'vpi', order = 'desc' } = req.query;
    if (!time || !region) {
      return res.status(400).json({ error: 'time과 region 쿼리 파라미터는 필수입니다.' });
    }

    // 2. 데이터 로드 (Repository 호출)
    const analyzedVideos = await getAnalyzedFile(region, time);

    // 3. 데이터 처리 (Sorting)
    const sortedVideos = sortVideos(analyzedVideos, sortBy, order);

    // 4. 응답
    res.status(200).json(sortedVideos);

  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: '해당 조건의 데이터를 찾을 수 없습니다.' });
    }
    console.error(`[handleGetTrends Error] ${err.message}`);
    res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
  }
}