# Python 3.11이 기본으로 포함된 슬림 이미지를 사용하여 경량화합니다.
FROM python:3.11-slim

# 작업 디렉토리를 /app으로 설정합니다.
WORKDIR /app

# -------------------- 시스템 환경 및 종속성 설치 --------------------

# Pillow 및 GIF 최적화 도구 설치를 위한 시스템 종속성 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    gifsicle \
    && rm -rf /var/lib/apt/lists/*

# -------------------- 애플리케이션 설정 --------------------

# Python 의존성 파일(requirements.txt)을 컨테이너에 복사합니다.
COPY requirements.txt ./

# Python 패키지 설치 (Flask, Pillow 등)
RUN pip install --no-cache-dir -r requirements.txt

# 나머지 애플리케이션 파일을 컨테이너에 복사합니다.
COPY . .

# Flask 애플리케이션이 실행되는 5000번 포트를 외부에 공개합니다.
EXPOSE 5000

# gunicorn으로 실행. FLASK app 모듈이 app:app 라고 가정
CMD ["sh", "-c", "gunicorn -b 0.0.0.0:${PORT:-5000} app:app"]
