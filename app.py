from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
import os
import json
from werkzeug.utils import secure_filename
from PIL import Image
import io
import uuid
import base64
import sqlite3
from datetime import datetime
import shutil
import requests
import time
from urllib.parse import urlparse
import threading

app = Flask(__name__, static_folder='static', static_url_path='/static')

# CORS 설정
CORS(app, 
    resources={
        r"/*": {
            "origins": [
                "http://localhost:7210",
                "http://127.0.0.1:7210",
                "https://localhost:7210",
                "https://127.0.0.1:7210",
                "https://bariosk.onrender.com",
                "https://www.bariosk.com",
                "http://bariosk.onrender.com",
                "http://www.bariosk.com"
            ],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": [
                "Content-Type",
                "Authorization",
                "X-Requested-With",
                "Accept",
                "Origin",
                "Access-Control-Request-Method",
                "Access-Control-Request-Headers",
                "Cache-Control",
                "cache-control",
                "Pragma",
                "If-Modified-Since",
                "If-None-Match",
                "Referer",
                "Sec-Fetch-Dest",
                "Sec-Fetch-Mode",
                "Sec-Fetch-Site"
            ],
            "expose_headers": [
                "Content-Type",
                "X-CSRFToken",
                "Cache-Control",
                "cache-control",
                "Expires",
                "Last-Modified",
                "ETag"
            ],
            "supports_credentials": True,
            "max_age": 3600
        }
    }
)

# 허용된 출처 목록 업데이트
ALLOWED_ORIGINS = [
    # 일반적인 개발 포트
    "http://localhost:7210",    # Flask 기본 포트
    "http://127.0.0.1:7210",
    "https://localhost:7210",
    "https://127.0.0.1:7210",
    "https://bariosk.onrender.com",
    "https://www.bariosk.com",
    "http://bariosk.onrender.com",
    "http://www.bariosk.com"
]

# 모든 응답에 CORS 헤더 추가
@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    print(f"\n=== CORS 헤더 처리 시작 ===")
    print(f"요청 URL: {request.url}")
    print(f"요청 메서드: {request.method}")
    print(f"요청 Origin: {origin}")
    print(f"요청 헤더: {dict(request.headers)}")
    
    if origin in ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
    else:
        # 개발 환경에서는 모든 로컬호스트 요청 허용
        if origin and ('localhost' in origin or '127.0.0.1' in origin):
            response.headers['Access-Control-Allow-Origin'] = origin
        else:
            response.headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGINS[0]
    
    response.headers.update({
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '3600',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Vary': 'Origin'  # 캐시 키에 Origin 포함
    })
    
    print(f"응답 헤더: {dict(response.headers)}")
    print("=== CORS 헤더 처리 완료 ===\n")
    
    return response

# 설정
UPLOAD_FOLDER = os.path.join('static', 'images')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

MENU_FILE = 'menu_data.json'

# 파일 기반 메뉴 데이터 로딩/저장 함수
menu_lock = threading.Lock()
def load_menu_data():
    with menu_lock:
        if not os.path.exists(MENU_FILE):
            return {}
        with open(MENU_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)

def save_menu_data(data):
    with menu_lock:
        with open(MENU_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

# 허용된 파일 확장자
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'avif'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_image(file):
    try:
        # 파일 데이터를 메모리에 로드
        file_data = file.read()
        if not file_data:
            raise ValueError("파일 데이터가 비어있습니다.")
        
        # 이미지 데이터를 PIL Image로 변환
        try:
            img = Image.open(io.BytesIO(file_data))
            print(f"이미지 포맷: {img.format}, 크기: {img.size}")
        except Exception as e:
            print(f"이미지 변환 실패: {str(e)}")
            raise ValueError("이미지 파일을 처리할 수 없습니다.")
        
        # RGB 모드로 변환
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # 이미지 크기 조정 (최대 800x800)
        max_size = (800, 800)
        img.thumbnail(max_size, Image.LANCZOS)
        
        # 이미지를 JPEG로 변환
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True, progressive=True)
        image_data = output.getvalue()
        
        # 고유한 파일명 생성
        unique_filename = f"{uuid.uuid4()}.jpg"
        
        return unique_filename
        
    except Exception as e:
        print(f"이미지 저장 실패: {str(e)}")
        return "static/images/logo.png"

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

    
@app.route('/api/menu', methods=['GET'])
def get_menu():
    menu_data = load_menu_data()
    return jsonify(menu_data)

@app.route('/api/menu', methods=['POST'])
def add_menu():
    data = request.get_json() if request.is_json else request.form.to_dict()
    if not data or 'category' not in data or 'name' not in data or 'price' not in data:
        return jsonify({'error': '필수 정보가 누락되었습니다.'}), 400
    menu_data = load_menu_data()
    category = data['category']
    if category not in menu_data:
        menu_data[category] = []
    # 새 id 생성
    new_id = max([item['id'] for items in menu_data.values() for item in items] or [0]) + 1
    menu_item = {
        'id': new_id,
        'name': data['name'],
        'price': data['price'],
        'image': data.get('image', 'logo.png'),
        'temperature': data.get('temperature', ''),
        'order_index': len(menu_data[category])
    }
    menu_data[category].append(menu_item)
    save_menu_data(menu_data)
    return jsonify({'message': '메뉴가 추가되었습니다.', 'menu': menu_item})

@app.route('/api/menu/<category>/<int:menu_id>', methods=['PUT'])
def update_menu(menu_id, category):
    data = request.get_json() if request.is_json else request.form.to_dict()
    menu_data = load_menu_data()
    if category not in menu_data:
        return jsonify({'error': '카테고리를 찾을 수 없습니다.'}), 404
    for item in menu_data[category]:
        if item['id'] == menu_id:
            for key in ['name', 'price', 'image', 'temperature']:
                if key in data:
                    item[key] = data[key]
            if 'image' not in data:
                item['image'] = 'logo.png'
            save_menu_data(menu_data)
            return jsonify({'message': '메뉴가 수정되었습니다.', 'menu': item})
    return jsonify({'error': '메뉴를 찾을 수 없습니다.'}), 404

@app.route('/api/menu/<category>/<int:menu_id>', methods=['DELETE'])
def delete_menu(menu_id, category):
    menu_data = load_menu_data()
    if category not in menu_data:
        return jsonify({'error': '카테고리를 찾을 수 없습니다.'}), 404
    new_items = [item for item in menu_data[category] if item['id'] != menu_id]
    if len(new_items) == len(menu_data[category]):
        return jsonify({'error': '메뉴를 찾을 수 없습니다.'}), 404
    menu_data[category] = new_items
    save_menu_data(menu_data)
    return jsonify({'message': '메뉴가 삭제되었습니다.'})

def create_default_image(filename, text=""):
    try:
        print(f"기본 이미지 생성 시작: {filename}")
        # 300x300 크기의 회색 배경 이미지 생성
        img = Image.new('RGB', (300, 300), color='#EEEEEE')
        
        # 텍스트 추가 (있는 경우)
        if text:
            from PIL import ImageDraw, ImageFont
            draw = ImageDraw.Draw(img)
            # 기본 폰트 사용
            try:
                font_size = 40
                font = ImageFont.truetype("Arial", font_size)
            except:
                font = ImageFont.load_default()
            
            # 텍스트 크기 측정
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            
            # 텍스트를 이미지 중앙에 배치
            x = (300 - text_width) / 2
            y = (300 - text_height) / 2
            draw.text((x, y), text, font=font, fill='#666666')
        
        # 이미지를 JPEG로 변환
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True)
        image_data = output.getvalue()
        
        
        return filename
        
    except Exception as e:
        print(f"이미지 저장 실패: {str(e)}")
        return "static/images/logo.png"

@app.route('/api/images/<filename>', methods=['GET', 'OPTIONS'])
def serve_image(filename):
    print(f"\n=== 이미지 요청 시작: {filename} ===")
    print(f"요청 메서드: {request.method}")
    print(f"요청 URL: {request.url}")
    print(f"요청 Origin: {request.headers.get('Origin')}")
    print(f"요청 헤더: {dict(request.headers)}")
    
    # OPTIONS 요청 처리
    if request.method == 'OPTIONS':
        print("OPTIONS 요청 처리")
        response = app.make_default_options_response()
        
        # CORS 헤더 추가
        origin = request.headers.get('Origin')
        print(f"OPTIONS 요청의 Origin: {origin}")
        
        # 허용된 출처인지 확인
        if origin in ALLOWED_ORIGINS:
            print(f"허용된 Origin: {origin}")
            response.headers['Access-Control-Allow-Origin'] = origin
        else:
            print(f"허용되지 않은 Origin: {origin}")
            print(f"허용된 Origin 목록: {ALLOWED_ORIGINS}")
            response.headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGINS[0]
            
        response.headers.update({
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Max-Age': '3600',
            'Access-Control-Expose-Headers': 'Content-Type, X-CSRFToken',
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Timing-Allow-Origin': '*'
        })
        
        print(f"OPTIONS 응답 헤더: {dict(response.headers)}")
        print("=== OPTIONS 요청 처리 완료 ===\n")
        return response
        


def create_and_serve_default_image(filename):
    """기본 이미지를 생성하고 서빙하는 함수"""
    try:
        print(f"\n=== 기본 이미지 생성 시작: {filename} ===")
        # 기본 이미지 생성 (회색 배경의 200x200 이미지)
        img = Image.new('RGB', (200, 200), color='#CCCCCC')
        
        # 텍스트 추가
        try:
            from PIL import ImageDraw, ImageFont
            draw = ImageDraw.Draw(img)
            
            # 기본 폰트 사용
            try:
                font_size = 20
                font = ImageFont.truetype("Arial", font_size)
            except:
                print("Arial 폰트 로드 실패, 기본 폰트 사용")
                font = ImageFont.load_default()
            
            # 파일명을 텍스트로 추가
            text = filename.split('.')[0]  # 확장자 제거
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            
            # 텍스트를 이미지 중앙에 배치
            x = (200 - text_width) / 2
            y = (200 - text_height) / 2
            draw.text((x, y), text, font=font, fill='#666666')
            print("텍스트 추가 완료")
            
        except Exception as text_error:
            print(f"텍스트 추가 실패: {str(text_error)}")
        
        # 이미지를 JPEG로 변환
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True)
        image_data = output.getvalue()
        print(f"이미지 변환 완료: {len(image_data)} bytes")
        
            
    except Exception as e:
        print(f"기본 이미지 생성 실패: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        return jsonify({'error': '이미지를 생성할 수 없습니다.'}), 500
    finally:
        print(f"=== 기본 이미지 생성 종료: {filename} ===\n")

@app.route('/api/categories', methods=['GET'])
def get_categories():
    menu_data = load_menu_data()
    return jsonify(list(menu_data.keys()))

@app.route('/api/categories', methods=['POST'])
def add_category():
    data = request.get_json()
    name = data.get('name')
    if not name:
        return jsonify({'error': '카테고리 이름이 필요합니다.'}), 400
    menu_data = load_menu_data()
    if name in menu_data:
        return jsonify({'error': '이미 존재하는 카테고리입니다.'}), 400
    menu_data[name] = []
    save_menu_data(menu_data)
    return jsonify({'message': f'카테고리 {name} 추가됨'})

@app.route('/api/categories/<category_name>', methods=['DELETE'])
def delete_category(category_name):
    menu_data = load_menu_data()
    if category_name not in menu_data:
        return jsonify({'error': '카테고리가 존재하지 않습니다.'}), 404
    del menu_data[category_name]
    save_menu_data(menu_data)
    return jsonify({'message': f'카테고리 {category_name} 삭제됨'})

@app.route('/api/categories/<category_name>', methods=['PUT'])
def rename_category(category_name):
    data = request.get_json()
    new_name = data.get('name')
    menu_data = load_menu_data()
    if category_name not in menu_data:
        return jsonify({'error': '카테고리가 존재하지 않습니다.'}), 404
    if new_name in menu_data:
        return jsonify({'error': '이미 존재하는 카테고리 이름입니다.'}), 400
    menu_data[new_name] = menu_data.pop(category_name)
    save_menu_data(menu_data)
    return jsonify({'message': f'카테고리 이름이 {category_name}에서 {new_name}으로 변경됨'})

# 새로운 메뉴 ID 생성
def generate_new_menu_id(menu_data):
    max_id = 0
    for category in menu_data.values():
        for item in category:
            if item['id'] > max_id:
                max_id = item['id']
    return max_id + 1

@app.route('/styles.css')
def serve_css():
    return send_from_directory('.', 'styles.css')

@app.route('/script.js')
def serve_js():
    return send_from_directory('.', 'script.js')

@app.route('/api/menu', methods=['PUT'])
def update_menu_order():
    try:
        new_menu_data = request.get_json()
        if not new_menu_data:
            return jsonify({'error': '메뉴 데이터가 필요합니다.'}), 400
        
        print("=== 메뉴 순서 업데이트 시작 ===")
        print(f"받은 메뉴 데이터: {new_menu_data}")
        
        # 기존 메뉴 데이터 로드
        menu_data = load_menu_data()
        print(f"기존 메뉴 데이터: {menu_data}")
        
        # 새로운 메뉴 데이터로 업데이트
        updated_menu_data = {}
        
        # 각 카테고리의 메뉴에 order_index 추가
        for category, items in new_menu_data.items():
            updated_menu_data[category] = []
            for index, item in enumerate(items):
                try:
                    item_id = int(item['id'])  # ID를 정수로 변환
                    
                    # 기존 메뉴 데이터에서 해당 항목 찾기
                    existing_item = None
                    if category in menu_data:
                        for existing in menu_data[category]:
                            if existing['id'] == item_id:
                                existing_item = existing
                                break
                    
                    if existing_item:
                        # 기존 항목의 데이터를 유지하면서 order_index만 업데이트
                        item_with_order = existing_item.copy()
                        item_with_order['order_index'] = index
                        updated_menu_data[category].append(item_with_order)
                    else:
                        # 새로운 항목인 경우 필수 필드 확인
                        required_fields = ['name', 'price', 'image']
                        if all(field in item for field in required_fields):
                            item_with_order = {
                                'id': item_id,
                                'name': item['name'],
                                'price': item['price'],
                                'image': item.get('image', 'static/images/logo.png'),
                                'temperature': item.get('temperature', ''),
                                'order_index': index
                            }
                            updated_menu_data[category].append(item_with_order)
                        else:
                            print(f"필수 필드가 누락된 항목 무시: {item}")
                except (KeyError, ValueError) as e:
                    print(f"항목 처리 중 오류 발생: {str(e)}, 항목: {item}")
                    continue
        
        print(f"순서가 추가된 메뉴 데이터: {updated_menu_data}")
        
        # 변경사항 저장
        try:
            save_menu_data(updated_menu_data)
            print("메뉴 데이터 저장 완료")
            
            
            # 응답 준비 - CORS 헤더는 after_request에서 추가됨
            response = jsonify({'message': '카테고리 순서가 업데이트되었습니다.', 'categories': list(updated_menu_data.keys())})
            
            # 캐시 관련 헤더만 추가
            response.headers.add('Cache-Control', 'no-cache, no-store, must-revalidate')
            response.headers.add('Pragma', 'no-cache')
            response.headers.add('Expires', '0')
            
            return response, 200
            
        except Exception as e:
            print(f"메뉴 데이터 저장 중 오류: {str(e)}")
            return jsonify({'error': '메뉴 순서 저장에 실패했습니다.'}), 500
        
    except Exception as e:
        print(f"메뉴 순서 업데이트 중 오류 발생: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

def create_default_logo():
    try:
        print("기본 로고 이미지 생성 시작")
        # 기본 이미지 생성 (회색 배경의 200x200 이미지)
        img = Image.new('RGB', (200, 200), color='#CCCCCC')
        
        # 이미지를 JPEG로 변환
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True, progressive=True)
        image_data = output.getvalue()
        
        
    except Exception as e:
        print(f"기본 로고 이미지 생성 실패: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        raise

@app.route('/api/upload-image', methods=['POST'])
def upload_image():
    try:
        if 'image' not in request.files:
            return jsonify({'error': '이미지 파일이 없습니다.'}), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': '선택된 파일이 없습니다.'}), 400
        
        if file and allowed_file(file.filename):
            filename = save_image(file)
            return jsonify({'filename': filename}), 200
        
        return jsonify({'error': '허용되지 않는 파일 형식입니다.'}), 400
        
    except Exception as e:
        print(f"이미지 업로드 중 오류 발생: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/categories/order', methods=['GET', 'PUT', 'OPTIONS'])
def update_category_order():
    try:
        print("=== 카테고리 순서 처리 시작 ===")
        print(f"요청 메서드: {request.method}")
        print(f"요청 헤더: {dict(request.headers)}")
        
        # OPTIONS 요청 처리
        if request.method == 'OPTIONS':
            response = app.make_default_options_response()
            
            # CORS 헤더 설정
            origin = request.headers.get('Origin')
            if origin in ALLOWED_ORIGINS:
                response.headers['Access-Control-Allow-Origin'] = origin
            else:
                response.headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGINS[0]
                
            response.headers.update({
                'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Cache-Control, cache-control, Pragma',
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Max-Age': '3600',
                'Access-Control-Expose-Headers': 'Content-Type, X-CSRFToken, Cache-Control, cache-control, Expires, Last-Modified, ETag'
            })
            
            print(f"OPTIONS 응답 헤더: {dict(response.headers)}")
            return response
            
        
        # PUT 요청 처리
        data = request.get_json()
        print(f"받은 데이터: {data}")
        
        if not data or 'categories' not in data:
            return jsonify({'error': '카테고리 목록이 필요합니다.'}), 400
            
        categories = data['categories']
        print(f"받은 카테고리 순서: {categories}")
        
        # 동기화 소스 확인 (무한 루프 방지)
        sync_source = data.get('sync_source', None)
        is_sync_request = sync_source is not None
        
        
            
        # CORS 헤더 추가
        response = jsonify({'message': '카테고리 순서가 업데이트되었습니다.', 'categories': categories})
            
        # 캐시 관련 헤더만 추가
        response.headers.add('Cache-Control', 'no-cache, no-store, must-revalidate')
        response.headers.add('Pragma', 'no-cache')
        response.headers.add('Expires', '0')
            
        return response, 200
            
    except Exception as e:
        print(f"카테고리 순서 처리 중 오류 발생: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@app.route('/api/add-logo', methods=['POST'])
def add_logo():
    try:
        print("로고 이미지 추가 시작")
        if 'image' not in request.files:
            return jsonify({'error': '이미지 파일이 필요합니다.'}), 400

        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': '선택된 파일이 없습니다.'}), 400

        if file and allowed_file(file.filename):
            save_path = os.path.join(app.config['UPLOAD_FOLDER'], 'logo.png')
            file.save(save_path)
            return jsonify({'message': '로고가 성공적으로 추가되었습니다.'}), 200

        return jsonify({'error': '허용되지 않는 파일 형식입니다.'}), 400
    except Exception as e:
        print(f"로고 추가 중 오류 발생: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/upload.html')
def serve_upload_page():
    return send_from_directory('.', 'upload.html')

# 서버 실행
if __name__ == '__main__':
    try:
        print("=== 서버 시작 준비 중... ===")
        
        # 현재 작업 디렉토리 출력
        print(f"현재 작업 디렉토리: {os.getcwd()}")
        
        # 디렉토리 생성
        try:
            if not os.path.exists(UPLOAD_FOLDER):
                os.makedirs(UPLOAD_FOLDER)
                print(f"업로드 디렉토리 생성: {UPLOAD_FOLDER}")
            else:
                print(f"업로드 디렉토리 이미 존재: {UPLOAD_FOLDER}")
        except Exception as e:
            print(f"업로드 디렉토리 생성 실패: {str(e)}")
            raise
        
        
        # 서버 실행
        port = int(os.environ.get('PORT', 7210))  # 기본 포트를 7210으로 변경
        print(f"=== 서버 시작: 포트 {port} ===")
        
        # 캐시 관련 설정
        app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0  # 정적 파일의 캐시 비활성화
        
        # 디버그 모드로 실행
        app.run(debug=True, host='0.0.0.0', port=port)
    except Exception as e:
        print(f"=== 서버 시작 실패 ===")
        print(f"오류 메시지: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        raise

