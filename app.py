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
                "http://localhost:6190",
                "http://127.0.0.1:6190",
                "https://localhost:6190",
                "https://127.0.0.1:6190",
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
    "http://localhost:6190",    # Flask 기본 포트
    "http://127.0.0.1:6190",
    "https://localhost:6190",
    "https://127.0.0.1:6190",
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
    # 각 카테고리별로 order_index 순으로 정렬
    sorted_menu_data = {}
    for category, items in menu_data.items():
        sorted_items = sorted(items, key=lambda x: x.get('order_index', 0))
        sorted_menu_data[category] = sorted_items
    return jsonify(sorted_menu_data)

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
    new_id = generate_new_menu_id(menu_data)
    # 새 순서 번호 생성
    order_index = get_next_order_index(menu_data, category)
    
    menu_item = {
        'id': new_id,
        'name': data['name'],
        'price': int(data['price']),
        'temperature': data.get('temperature', ''),
        'order_index': order_index
    }
    menu_data[category].append(menu_item)
    save_menu_data(menu_data)
    return jsonify({'message': '메뉴가 추가되었습니다.', 'menu': menu_item})

@app.route('/api/menu/<category>/<int:menu_id>', methods=['PUT'])
def update_menu(menu_id, category):
    data = request.get_json() if request.is_json else request.form.to_dict()
    if not data:
        return jsonify({'error': '데이터가 없습니다.'}), 400
    menu_data = load_menu_data()
    if category not in menu_data:
        return jsonify({'error': '카테고리를 찾을 수 없습니다.'}), 404
    for item in menu_data[category]:
        if item['id'] == menu_id:
            item['name'] = data.get('name', item['name'])
            item['price'] = int(data.get('price', item['price']))
            item['temperature'] = data.get('temperature', item.get('temperature', ''))
            # order_index도 업데이트 가능
            if 'order_index' in data:
                item['order_index'] = int(data['order_index'])
            save_menu_data(menu_data)
            return jsonify({'message': '메뉴가 수정되었습니다.', 'menu': item})
    return jsonify({'error': '메뉴를 찾을 수 없습니다.'}), 404

@app.route('/api/menu/<category>/<int:menu_id>', methods=['DELETE'])
def delete_menu(menu_id, category):
    menu_data = load_menu_data()
    if category not in menu_data:
        return jsonify({'error': '카테고리를 찾을 수 없습니다.'}), 404
    for i, item in enumerate(menu_data[category]):
        if item['id'] == menu_id:
            deleted_item = menu_data[category].pop(i)
            save_menu_data(menu_data)
            return jsonify({'message': '메뉴가 삭제되었습니다.', 'menu': deleted_item})
    return jsonify({'error': '메뉴를 찾을 수 없습니다.'}), 404

@app.route('/api/categories', methods=['GET'])
def get_categories():
    menu_data = load_menu_data()
    return jsonify(list(menu_data.keys()))

@app.route('/api/categories', methods=['POST'])
def add_category():
    data = request.get_json() if request.is_json else request.form.to_dict()
    if not data or 'name' not in data:
        return jsonify({'error': '카테고리 이름이 필요합니다.'}), 400
    menu_data = load_menu_data()
    category_name = data['name']
    if category_name in menu_data:
        return jsonify({'error': '이미 존재하는 카테고리입니다.'}), 400
    menu_data[category_name] = []
    save_menu_data(menu_data)
    return jsonify({'message': '카테고리가 추가되었습니다.', 'category': category_name})

@app.route('/api/categories/<category_name>', methods=['DELETE'])
def delete_category(category_name):
    menu_data = load_menu_data()
    if category_name not in menu_data:
        return jsonify({'error': '카테고리를 찾을 수 없습니다.'}), 404
    deleted_category = menu_data.pop(category_name)
    save_menu_data(menu_data)
    return jsonify({'message': '카테고리가 삭제되었습니다.', 'category': category_name, 'deleted_items': deleted_category})

@app.route('/api/categories/<category_name>', methods=['PUT'])
def rename_category(category_name):
    data = request.get_json() if request.is_json else request.form.to_dict()
    if not data or 'new_name' not in data:
        return jsonify({'error': '새 카테고리 이름이 필요합니다.'}), 400
    menu_data = load_menu_data()
    if category_name not in menu_data:
        return jsonify({'error': '카테고리를 찾을 수 없습니다.'}), 404
    new_name = data['new_name']
    if new_name in menu_data:
        return jsonify({'error': '이미 존재하는 카테고리 이름입니다.'}), 400
    menu_data[new_name] = menu_data.pop(category_name)
    save_menu_data(menu_data)
    return jsonify({'message': '카테고리가 이름이 변경되었습니다.', 'old_name': category_name, 'new_name': new_name})

def generate_new_menu_id(menu_data):
    all_ids = []
    for items in menu_data.values():
        all_ids.extend([item['id'] for item in items])
    return max(all_ids) + 1 if all_ids else 1

def get_next_order_index(menu_data, category):
    """카테고리 내에서 다음 순서 번호를 반환"""
    if category not in menu_data or not menu_data[category]:
        return 1
    
    max_order = max([item.get('order_index', 0) for item in menu_data[category]])
    return max_order + 1

@app.route('/styles.css')
def serve_css():
    return send_from_directory('.', 'styles.css')

@app.route('/script.js')
def serve_js():
    return send_from_directory('.', 'script.js')

@app.route('/api/menu/order', methods=['PUT'])
def update_menu_order():
    """메뉴 순서를 일괄 업데이트"""
    data = request.get_json()
    if not data or 'updates' not in data:
        return jsonify({'error': '업데이트 데이터가 필요합니다.'}), 400
    
    menu_data = load_menu_data()
    updates = data['updates']
    
    for update in updates:
        menu_id = update.get('menu_id')
        category = update.get('category')
        order_index = update.get('order_index')
        
        if menu_id is not None and category and order_index is not None:
            if category in menu_data:
                for item in menu_data[category]:
                    if item['id'] == menu_id:
                        item['order_index'] = int(order_index)
                        break
    
    save_menu_data(menu_data)
    return jsonify({'message': '메뉴 순서가 업데이트되었습니다.'})

@app.route('/api/categories/order', methods=['GET', 'PUT', 'OPTIONS'])
def update_category_order():
    if request.method == 'OPTIONS':
        response = jsonify({'message': 'OK'})
        return response
    
    if request.method == 'GET':
        menu_data = load_menu_data()
        categories = list(menu_data.keys())
        return jsonify({'categories': categories})
    
    elif request.method == 'PUT':
        data = request.get_json()
        if not data or 'categories' not in data:
            return jsonify({'error': '카테고리 순서 데이터가 필요합니다.'}), 400
        
        menu_data = load_menu_data()
        new_order = data['categories']
        
        # 기존 카테고리 데이터 백업
        old_data = menu_data.copy()
        
        # 새 순서로 재구성
        new_menu_data = {}
        for category in new_order:
            if category in old_data:
                new_menu_data[category] = old_data[category]
        
        # 기존에 있던 카테고리 중 새 순서에 없는 것들도 추가
        for category, items in old_data.items():
            if category not in new_menu_data:
                new_menu_data[category] = items
        
        save_menu_data(new_menu_data)
        return jsonify({'message': '카테고리 순서가 업데이트되었습니다.', 'categories': list(new_menu_data.keys())})

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
        port = int(os.environ.get('PORT', 6190))  # 기본 포트를 6190으로 변경
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

