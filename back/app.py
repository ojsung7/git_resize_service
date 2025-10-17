import os
import subprocess
import time
import base64
from typing import Tuple, Optional, List, Dict, Any
from PIL import Image
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
from flask_cors import CORS 
from io import BytesIO

# ----------------- Flask 설정 -----------------
app = Flask(__name__)
CORS(app) 
TEMP_DIR = 'temp_gifsicle_data'
os.makedirs(TEMP_DIR, exist_ok=True) 

# Gifsicle 존재 여부 확인 (이전과 동일)
try:
    subprocess.run(['gifsicle', '--version'], check=True, capture_output=True)
    GIFSICLE_AVAILABLE = True
except (subprocess.CalledProcessError, FileNotFoundError):
    GIFSICLE_AVAILABLE = False
    print("WARNING: Gifsicle is not available. The API may not function.")

# ----------------- 최적화 함수 (이전과 동일) -----------------
# 내부 로직은 파일 처리 및 임시 파일 정리 로직이므로 변경 없이 유지합니다.

def optimize_gif_with_pillow_and_gifsicle(input_bytes: bytes, lossy_value: int, colors_value: int) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Pillow로 프레임을 줄인 후, Gifsicle로 극한 압축을 수행합니다.
    """
    
    if not GIFSICLE_AVAILABLE:
        return None, "Gifsicle command is unavailable. Please check the server environment."

    unique_id = str(time.time()).replace('.', '')
    input_filename_full = os.path.join(TEMP_DIR, f'temp_in_full_{unique_id}.gif')
    temp_filename_reduced = os.path.join(TEMP_DIR, f'temp_reduced_{unique_id}.gif')
    output_filename = os.path.join(TEMP_DIR, f'temp_out_{unique_id}.gif')
    
    optimized_bytes = None
    error_message = None

    try:
        # 1. 원본 GIF 데이터를 임시 파일에 저장
        with open(input_filename_full, 'wb') as f:
            f.write(input_bytes)
            
        # 2. Pillow를 사용하여 프레임 수를 반으로 줄임
        img = Image.open(input_filename_full)
        frames = []
        original_duration = img.info.get('duration', 100) 
        
        for i in range(img.n_frames):
            if i % 2 == 0: 
                img.seek(i)
                frames.append(img.copy())
        
        new_duration = original_duration * 2
        
        if not frames:
            raise ValueError("Could not extract valid frames from GIF.")
        
        frames[0].save(
            temp_filename_reduced,
            save_all=True,
            append_images=frames[1:] if len(frames) > 1 else [],
            duration=new_duration,
            loop=0,
            optimize=False 
        )

        # 3. Gifsicle 명령어 구성
        command = [
            'gifsicle',
            '-O3',
            f'--lossy={lossy_value}', 
            '--colors', str(colors_value), 
            temp_filename_reduced, 
            '-o',
            output_filename
        ]

        # 4. Gifsicle 실행
        subprocess.run(command, check=True, capture_output=True, text=True, timeout=90)
        
        if not os.path.exists(output_filename):
            # stdout/stderr를 자세히 보고 싶다면 result.stdout, result.stderr를 사용
            raise FileNotFoundError("Gifsicle output file was not created.")
            
        with open(output_filename, 'rb') as f:
            optimized_bytes = f.read()
            
    except subprocess.CalledProcessError as e:
        std_error = e.stderr.strip()
        error_message = f"Gifsicle execution error (Code {e.returncode}): {std_error or 'Unknown Gifsicle error'}"
    except Exception as e:
        error_message = f"Unexpected error during processing: {str(e)}"
    finally:
        # 5. 임시 파일 정리
        for filename in [input_filename_full, temp_filename_reduced, output_filename]:
            if os.path.exists(filename):
                try:
                    os.remove(filename)
                except OSError:
                    pass # 파일 삭제 실패는 무시
                    
    return optimized_bytes, error_message

# ----------------- Flask Routes (멀티 파일 처리용으로 수정) -----------------

@app.route('/api/optimize-gif', methods=['POST'])
def optimize_gif_endpoint():
    """
    멀티 파일과 최적화 설정을 받아, 각 파일의 결과를 담은 JSON 배열을 반환합니다.
    """
    # ⭐ 수정: 클라이언트가 'file' 키로 보낸 모든 파일을 리스트로 가져옵니다.
    uploaded_files = request.files.getlist('file') 
    if not uploaded_files:
        # 클라이언트가 'file' 키를 사용했음을 가정
        return jsonify({'error': 'No files found under the expected "file" key.'}), 400

    # 1. 설정값 파싱 및 검증
    try:
        lossy_val = int(request.form.get('lossy', 200)) 
        colors_val = int(request.form.get('colors', 64)) 
        
        lossy_val = max(0, min(300, lossy_val))
        colors_val = max(2, min(256, colors_val))

    except ValueError:
        return jsonify({'error': 'Invalid optimization settings value.'}), 400
    
    results: List[Dict[str, Any]] = []

    # 2. 각 파일에 대한 최적화 실행
    for file in uploaded_files:
        # 파일 데이터 읽기
        input_bytes = file.read()
        original_size = len(input_bytes)
        filename = secure_filename(file.filename)
        
        # MIME Type 검증
        if file.mimetype != 'image/gif':
             results.append({
                 'filename': filename,
                 'original_size': original_size,
                 'error': f'File is not a GIF file ({file.mimetype}).',
                 'optimized_data': None,
             })
             continue
        
        # Optimization 실행
        optimized_data, error = optimize_gif_with_pillow_and_gifsicle(
            input_bytes, 
            lossy_val, 
            colors_val
        )
        
        optimized_data_b64 = None
        optimized_size = None
        
        if optimized_data and not error:
            # ⭐ Base64 인코딩: 바이너리 데이터를 문자열로 변환하여 JSON에 포함
            optimized_data_b64 = base64.b64encode(optimized_data).decode('utf-8')
            optimized_size = len(optimized_data)

        # 결과 수집
        results.append({
            'filename': filename,
            'original_size': original_size,
            'optimized_data': optimized_data_b64,
            'optimized_size': optimized_size,
            'error': error,
        })
    
    # 3. 모든 결과를 담은 JSON 배열 반환
    return jsonify({'results': results}), 200

# ----------------- Server Run -----------------
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)