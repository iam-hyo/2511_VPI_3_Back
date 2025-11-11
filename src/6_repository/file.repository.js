// /src/6_repository/file.repository.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from "url";

// ✅ 올바른 __dirname 계산법 (ESM 환경)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data'); // 루트의 /data 폴더

// 폴더가 없으면 생성
await fs.mkdir(DATA_DIR, { recursive: true });

/**
 * [수정] 파일명 생성 헬퍼 (KST 기준)
 * @param {string} region 
 * @param {Date} date (KST 기준 Date 객체)
 * @param {'raw' | 'analyzed'} type 
 * @returns {string} (예: 20251110_1619_KR_analyzed.json)
 */
function getFileName(region, date, type) {
  
  // KST(UTC+9) 오프셋을 적용한 새 Date 객체 생성
  // (참고: 서버가 이미 KST 환경이라면 이 과정이 필요 없을 수 있으나, 
  // new Date()는 시스템 시간에 의존하므로 명시적으로 KST를 계산하는 것이 안전합니다.)
  // (가정: 입력된 date 객체는 로컬 시간을 따름)
  
  // getFullYear 등은 로컬 시간대(KST) 기준 값을 반환합니다.
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0'); // 월 (0-11)
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  
  const timeStr = `${yyyy}${mm}${dd}_${hh}${min}`; // 예: 20251110_1619
  
  return `${timeStr}_${region}_${type}.json`;
}

/**
 * [Spec 3.0] 수집된 원본 비디오 저장
 */
export async function saveRawVideos(region, collectedAt, videos) {
  const fileName = getFileName(region, collectedAt, 'raw');
  const filePath = path.join(DATA_DIR, fileName);
  
  const data = {
    collectedAt: collectedAt.toISOString(),
    regionCode: region,
    videos: videos
  };
  
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  return fileName;
}

/**
 * [Spec 4.0] 분석 완료된 비디오 저장
 */
export async function saveAnalyzedVideos(region, collectedAt, analyzedVideos) {
  const fileName = getFileName(region, collectedAt, 'analyzed');
  const filePath = path.join(DATA_DIR, fileName);
  await fs.writeFile(filePath, JSON.stringify(analyzedVideos, null, 2));
  return fileName;
}

/**
 * [Spec 5.2] 분석 완료된 파일 읽기
 * @param {string} region - 'KR', 'US'
 * @param {string} time - '20251110_1300'
 */
export async function getAnalyzedFile(region, time) {
  const fileName = `${time}_${region}_analyzed.json`;
  const filePath = path.join(DATA_DIR, fileName);
  
  const data = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(data); // AnalyzedVideo[] 반환
}

/**
 * [Spec 5.4] 생성된 스크립트 TXT 파일로 저장
 */
/**
 * [Spec 5.4] (수정) 생성된 스크립트 TXT 파일로 저장
 * @param {string} query - 원본 키워드
 * @param {string[]} sttTexts - 전사 텍스트 배열
 * @param {string} script - 최종 생성된 스크립트
 * @param {string} [saveDir] - (신규) 저장할 고유 폴더 경로. 없으면 data/에 저장
 */
export async function saveGeneratedScript(query, sttTexts, script, saveDir) {
  const baseDir = saveDir || SCRIPT_DATA_DIR_DEFAULT; // 저장 위치 지정
  
  // 파일명 (폴더명이 고유하므로 파일명은 단순하게)
  const fileName = `_FinalScript_${query}.txt`;
  const filePath = path.join(baseDir, fileName);
  
  const content = `
[원본 키워드]
${query}

=================================
[생성된 60초 스크립트]
=================================
${script}

=================================
[참고한 원본 전사 텍스트] (파일은 폴더 내 .txt 참조)
=================================
[영상 1]
${sttTexts[0] ? sttTexts[0].slice(0, 150) + '...' : '(내용 없음)'}

[영상 2]
${sttTexts[1] ? sttTexts[1].slice(0, 150) + '...' : '(내용 없음)'}

[영상 3]
${sttTexts[2] ? sttTexts[2].slice(0, 150) + '...' : '(내용 없음)'}

[영상 4]
${sttTexts[3] ? sttTexts[3].slice(0, 150) + '...' : '(내용 없음)'}
`;
  
  await fs.writeFile(filePath, content);
  console.log(`[Repository] 최종 스크립트 저장 완료: ${filePath}`);
}

// 사용 가능한 분석 완료 파일 목록을 스캔
export async function listAnalyzedFiles() {
  const files = await fs.readdir(DATA_DIR);
  
  // "YYYYMMDD_HHMM_REGION_analyzed.json" 형식의 파일만 필터링
  const analyzedFiles = files
    .filter(file => file.endsWith('_analyzed.json'))
    .map(file => {
      const parts = file.replace('_analyzed.json', '').split('_');
      if (parts.length !== 3) return null; // (날짜, 시간, 지역)
      
      const time = `${parts[0]}_${parts[1]}`; // "YYYYMMDD_HHMM"
      const region = parts[2];
      
      // UI 드롭다운에 표시할 레이블 (예: 25.11.10 오후 4:19 (KR))
      const dateStr = `${parts[0].slice(2, 4)}.${parts[0].slice(4, 6)}.${parts[0].slice(6, 8)}`;
      const timeStr = `${parts[1].slice(0, 2)}:${parts[1].slice(2, 4)}`;
      const hour = parseInt(parts[1].slice(0, 2), 10);
      const period = hour >= 12 ? '오후' : '오전';

      return {
        id: `${time}_${region}`,
        time: time,
        region: region,
        label: `${dateStr} ${period} (${region})`, // (정렬을 위해 time을 맨 앞에 두는 것도 좋음)
      };
    })
    .filter(Boolean); // null 제거
    
  // 최신순으로 정렬 (id 기준 내림차순)
  analyzedFiles.sort((a, b) => b.id.localeCompare(a.id));
  
  return analyzedFiles;
}