# Ubuntu 20.04 LTS (Focal Fossa) 기반 이미지를 사용합니다.
# Python 3.8이 기본으로 포함되어 있어 안정적입니다.
FROM ubuntu:20.04

# 환경 변수: apt-get이 대화식으로 실행되지 않도록 설정
ENV DEBIAN_FRONTEND=noninteractive

# -------------------- 시스템 환경 및 종속성 설치 --------------------

# 1. apt-get 업데이트 및 필수 패키지 설치
#    - python3.8, python3.8-dev: Python 3.8 및 개발 헤더
#    - gcc: Pillow 설치를 위한 C 컴파일러
#    - gifsicle: GIF 최적화 도구
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3.8 \
        python3.8-dev \
        python3-pip \
        gcc \
        gifsicle \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# [사용자 요청] 'python3.8' 명령어를 'python'으로 사용할 수 있도록 심볼릭 링크 설정
# Ubuntu는 python3로 기본 설정되어 있으므로, /usr/local/bin에 python -> python3.8 링크를 만듭니다.
RUN ln -s /usr/bin/python3.8 /usr/local/bin/python
RUN ln -s /usr/bin/pip3 /usr/local/bin/pip

# -------------------- 애플리케이션 설정 --------------------

# 작업 디렉토리를 /usr/src/app으로 설정합니다.
WORKDIR /usr/src/app

# Python 의존성 파일(requirements.txt)과 메인 애플리케이션 파일(app.py)을 컨테이너에 복사합니다.
COPY requirements.txt ./
COPY app.py ./

# Python 패키지 설치 (Flask, Pillow 등)
RUN pip install --no-cache-dir -r requirements.txt

# Flask 애플리케이션이 실행되는 5000번 포트를 외부에 공개합니다.
EXPOSE 5000

# 컨테이너 시작 시 실행될 명령어 정의
CMD ["python", "app.py"]
