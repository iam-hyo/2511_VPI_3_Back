# main.py
import os
from dotenv import load_dotenv
from util import get_popular_videos, save_videos_to_csv
import datetime

def main():
    # 1. .env 파일에서 환경 변수 로드
    load_dotenv()
    API_KEY = os.getenv('API_KEY_JDU')

    if not API_KEY:
        print("오류: .env 파일에 YOUTUBE_API_KEY가 설정되지 않았습니다.")
        return

    # 2. 파라미터 설정 (조절하기 용이하도록 변수화)
    TARGET_REGION = "KR"  # 국가 코드 (한국)
    VIDEO_COUNT = 50      # 가져올 비디오 수
    SAVE_DRI = ".\Result"

    # 3. API 호출
    print(f"'{TARGET_REGION}' 지역의 인기 동영상 {VIDEO_COUNT}개를 가져옵니다...")
    videos = get_popular_videos(
        api_key=API_KEY,
        region_code=TARGET_REGION,
        max_results=VIDEO_COUNT
    )

    # 4. CSV로 저장
    current_time_str = datetime.datetime.now().strftime("%m%d_%H%M")
    filename = f"popular_{TARGET_REGION}_{current_time_str}.csv"
    save_filepath = os.path.join(SAVE_DRI, filename)
    
    if videos:
        save_videos_to_csv(videos, save_filepath)

if __name__ == "__main__":
    main()