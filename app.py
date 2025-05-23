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

app = Flask(__name__, static_folder='static', static_url_path='/static')

# CORS 설정
CORS(app, 
    resources={
        r"/*": {
            "origins": ["http://localhost:5173", "http://localhost:3000", "https://bariosk.onrender.com", "https://www.bariosk.com"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
            "expose_headers": ["Content-Type", "X-CSRFToken"],
            "max_age": 3600
        }
    }
)

# 모든 응답에 CORS 헤더 추가
@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    if origin:
        response.headers['Access-Control-Allow-Origin'] = origin
    else:
        response.headers['Access-Control-Allow-Origin'] = '*'
    
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin'
    response.headers['Access-Control-Expose-Headers'] = 'Content-Type, X-CSRFToken'
    response.headers['Access-Control-Max-Age'] = '3600'
    
    # 캐시 방지 헤더 추가
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    
    # 보안 헤더 추가
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'no-referrer'
    
    return response

# 설정
UPLOAD_FOLDER = os.path.join('static', 'images')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# 데이터베이스 파일 경로 설정
if os.environ.get('RENDER'):
    try:
        # Render 환경 - 영구 디스크 스토리지 사용
        RENDER_DISK_PATH = os.environ.get('RENDER_DISK_PATH', '/data')
        print(f"Render 디스크 경로: {RENDER_DISK_PATH}")
        
        # 디렉토리 생성 시도
        try:
            if not os.path.exists(RENDER_DISK_PATH):
                os.makedirs(RENDER_DISK_PATH)
                print(f"Render 디스크 디렉토리 생성 성공: {RENDER_DISK_PATH}")
        except Exception as e:
            print(f"Render 디스크 디렉토리 생성 실패: {str(e)}")
            # 대체 경로 사용
            RENDER_DISK_PATH = '/tmp'
            if not os.path.exists(RENDER_DISK_PATH):
                os.makedirs(RENDER_DISK_PATH)
            print(f"대체 디스크 경로 사용: {RENDER_DISK_PATH}")
        
        # 데이터베이스 폴더 생성
        DB_FOLDER = os.path.join(RENDER_DISK_PATH, 'db')
        if not os.path.exists(DB_FOLDER):
            os.makedirs(DB_FOLDER)
            print(f"데이터베이스 폴더 생성: {DB_FOLDER}")
        
        DATABASE = os.path.join(DB_FOLDER, 'menu.db')
        print(f"Render 환경 감지됨. 데이터베이스 경로: {DATABASE}")
        print(f"Render 디스크 경로 존재 여부: {os.path.exists(RENDER_DISK_PATH)}")
        print(f"데이터베이스 파일 경로 존재 여부: {os.path.exists(DATABASE)}")
        
        # 디렉토리 권한 확인 및 설정
        try:
            if os.path.exists(DB_FOLDER):
                os.chmod(DB_FOLDER, 0o777)  # 모든 사용자에게 쓰기 권한 부여
                print(f"데이터베이스 폴더 권한 설정: {DB_FOLDER}")
            if os.path.exists(RENDER_DISK_PATH):
                os.chmod(RENDER_DISK_PATH, 0o777)
                print(f"Render 디스크 경로 권한 설정: {RENDER_DISK_PATH}")
        except Exception as e:
            print(f"권한 설정 실패: {str(e)}")
    except Exception as e:
        print(f"Render 환경 설정 중 오류 발생: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        raise
else:
    # 로컬 환경
    data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
        print(f"로컬 데이터 디렉토리 생성: {data_dir}")
    DATABASE = os.path.join(data_dir, 'menu.db')
    print(f"로컬 환경 감지됨. 데이터베이스 경로: {DATABASE}")
    
    # Render API URL 설정
    RENDER_API_URL = "https://bariosk.onrender.com"  # Render 서버 URL
    print(f"로컬 환경 감지됨. Render API URL: {RENDER_API_URL}")

def get_db():
    try:
        # 데이터베이스 디렉토리 확인 및 생성
        db_dir = os.path.dirname(DATABASE)
        if not os.path.exists(db_dir):
            try:
                os.makedirs(db_dir)
                print(f"데이터베이스 디렉토리 생성: {db_dir}")
            except Exception as e:
                print(f"데이터베이스 디렉토리 생성 실패: {str(e)}")
                raise

        # 데이터베이스 연결 시도
        try:
            db = sqlite3.connect(DATABASE)
            db.row_factory = sqlite3.Row
            print("데이터베이스 연결 성공")
            return db
        except Exception as e:
            print(f"데이터베이스 연결 실패: {str(e)}")
            raise
        
    except Exception as e:
        print(f"데이터베이스 연결 실패: {str(e)}")
        raise

def init_db():
    try:
        # 데이터베이스 파일이 있는지 확인
        db_exists = os.path.exists(DATABASE)
        print(f"데이터베이스 파일 존재 여부: {db_exists}")
        
        # 데이터베이스 연결
        conn = get_db()
        
        # 메뉴 테이블 생성 (order_index 필드 추가)
        conn.execute('''
                CREATE TABLE IF NOT EXISTS menu (
                    id INTEGER PRIMARY KEY,
                    category TEXT NOT NULL,
                    name TEXT NOT NULL,
                    price TEXT NOT NULL,
                    image TEXT NOT NULL,
                    temperature TEXT,
                    order_index INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
        # 이미지 테이블 생성
        conn.execute('''
                CREATE TABLE IF NOT EXISTS images (
                    filename TEXT PRIMARY KEY,
                    data BLOB NOT NULL,
                    content_type TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
        # 카테고리 순서 전용 테이블 생성
        conn.execute('''
                CREATE TABLE IF NOT EXISTS category_order (
                    id INTEGER PRIMARY KEY,
                    category TEXT NOT NULL,
                    order_index INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(category)
                )
            ''')
            
        conn.commit()
        print("테이블 생성 성공")
        
        # 테이블 구조 확인 및 필요시 업데이트
        update_schema(conn)

        # 테이블에 데이터가 있는지 확인
        cursor = conn.execute('SELECT COUNT(*) FROM menu')
        count = cursor.fetchone()[0]
        print(f"현재 데이터베이스의 메뉴 수: {count}")
            
        # 데이터가 없을 때만 초기 데이터 삽입
        if count == 0:
            print("데이터베이스가 비어있어 초기 데이터를 삽입합니다.")
            initial_data = {
                "coffee": [
                    {
                        "id": 1,
                        "name": "아메리카노",
                        "price": "2000",
                        "image": "logo.png",
                        "temperature": "H",
                        "order_index": 0
                    },
                    {
                        "id": 2,
                        "name": "카페라떼",
                        "price": "2500",
                        "image": "logo.png",
                        "temperature": "H",
                        "order_index": 1
                    }
                ]
            }
                
            # 초기 데이터 저장
            for category, items in initial_data.items():
                # 카테고리 순서 저장
                try:
                    conn.execute(
                        'INSERT INTO category_order (category, order_index) VALUES (?, ?)',
                        (category, 0)
                    )
                    print(f"카테고리 '{category}' 순서 저장 완료")
                except Exception as e:
                    print(f"카테고리 순서 저장 중 오류: {str(e)}")
                    
                for item in items:
                    try:
                        conn.execute(
                            'INSERT INTO menu (id, category, name, price, image, temperature, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            (item['id'], category, item['name'], str(item['price']), item['image'], item.get('temperature', ''), item.get('order_index', 0))
                        )
                        print(f"초기 메뉴 항목 저장 성공: {item['name']}")
                    except Exception as e:
                        print(f"초기 메뉴 항목 저장 실패: {str(e)}")
                        continue
            
            conn.commit()
            print("초기 데이터 삽입 완료")
        else:
            print("기존 데이터가 있어 초기화를 건너뜁니다.")
            
        conn.close()
        print("데이터베이스 초기화 성공")
    except Exception as e:
        print(f"데이터베이스 초기화 실패: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        raise

# 데이터베이스 스키마 업데이트 함수
def update_schema(conn):
    try:
        print("=== 데이터베이스 스키마 확인 시작 ===")
        cursor = conn.cursor()
        
        # 테이블 존재 여부 확인
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='category_order'")
        if not cursor.fetchone():
            print("category_order 테이블이 존재하지 않아 생성합니다.")
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS category_order (
                    id INTEGER PRIMARY KEY,
                    category TEXT NOT NULL,
                    order_index INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(category)
                )
            ''')
            conn.commit()
            print("category_order 테이블 생성 완료")
            
            # 기존 카테고리 정보를 새 테이블에 추가
            cursor.execute("SELECT DISTINCT category FROM menu ORDER BY category")
            categories = cursor.fetchall()
            
            for idx, cat in enumerate(categories):
                category = cat['category']
                cursor.execute(
                    "INSERT INTO category_order (category, order_index) VALUES (?, ?)",
                    (category, idx)
                )
            
            conn.commit()
            print(f"{len(categories)}개 카테고리를 category_order 테이블에 추가 완료")
        
        # 현재 테이블의 칼럼 정보 가져오기
        cursor.execute("PRAGMA table_info(menu)")
        columns = cursor.fetchall()
        column_names = [col['name'] for col in columns]
        print(f"현재 테이블 칼럼: {column_names}")
        
        # order_index 칼럼이 없는 경우 추가
        if 'order_index' not in column_names:
            print("order_index 칼럼이 없어 추가합니다.")
            cursor.execute("ALTER TABLE menu ADD COLUMN order_index INTEGER DEFAULT 0")
            conn.commit()
            print("order_index 칼럼 추가 완료")
            
            # 모든 레코드의 order_index 값을 업데이트
            cursor.execute("SELECT id, category FROM menu ORDER BY id")
            items = cursor.fetchall()
            
            # 카테고리별로 정렬하여 order_index 설정
            category_indices = {}
            for item in items:
                category = item['category']
                if category not in category_indices:
                    category_indices[category] = 0
                
                cursor.execute(
                    "UPDATE menu SET order_index = ? WHERE id = ?", 
                    (category_indices[category], item['id'])
                )
                category_indices[category] += 1
            
            conn.commit()
            print("order_index 값 업데이트 완료")
        
        print("=== 데이터베이스 스키마 확인 완료 ===")
    except Exception as e:
        print(f"데이터베이스 스키마 업데이트 실패: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        raise

# 데이터베이스 초기화 및 테이블 확인
def ensure_db():
    try:
        # 데이터베이스 파일이 없으면 초기화
        if not os.path.exists(DATABASE):
            print(f"데이터베이스 파일이 존재하지 않습니다: {DATABASE}")
            init_db()
        else:
            print(f"데이터베이스 파일이 존재합니다: {DATABASE}")
            # 파일 크기 확인
            file_size = os.path.getsize(DATABASE)
            print(f"데이터베이스 파일 크기: {file_size} bytes")
            
            # 테이블 존재 여부 확인
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='menu'")
            if not cursor.fetchone():
                print("menu 테이블이 존재하지 않습니다. 초기화를 진행합니다.")
                conn.close()
                init_db()
            else:
                # 테이블은 있지만 스키마 업데이트 확인
                print("기존 데이터베이스 스키마 업데이트 확인")
                update_schema(conn)
                conn.close()
    except Exception as e:
        print(f"데이터베이스 확인 중 오류 발생: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())

# 데이터베이스 초기화
with app.app_context():
    try:
        ensure_db()
    except Exception as e:
        print(f"앱 시작 시 데이터베이스 초기화 실패: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())

def load_menu_data():
    try:
        print("=== 메뉴 데이터 로드 시작 ===")
        with get_db() as db:
            # 카테고리별로 데이터를 가져오되, order_index 순서로 정렬하고 시스템 항목 제외
            cursor = db.execute('''
                SELECT * FROM menu 
                WHERE order_index > -900 OR name != 'bariosk'
                ORDER BY category, order_index
            ''')
            menu_data = {}
            for row in cursor:
                category = row['category']
                if category not in menu_data:
                    menu_data[category] = []
                menu_data[category].append({
                    'id': row['id'],
                    'name': row['name'],
                    'price': row['price'],
                    'image': row['image'],
                    'temperature': row['temperature'],
                    'order_index': row['order_index']
                })
            
            # 빈 카테고리도 추가
            cursor = db.execute('''
                SELECT DISTINCT category FROM menu
            ''')
            for row in cursor:
                category = row['category']
                if category not in menu_data:
                    menu_data[category] = []
            
            print(f"메뉴 데이터 로드 성공: {list(menu_data.keys())}")
            print("=== 메뉴 데이터 로드 완료 ===")
            return menu_data
    except Exception as e:
        print(f"메뉴 데이터 로드 실패: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        return {}

def save_menu_data(data):
    try:
        print("=== 메뉴 데이터 저장 시작 ===")
        print(f"저장할 메뉴 데이터 카테고리: {list(data.keys())}")
        
        # 데이터 유효성 검사
        if not isinstance(data, dict):
            raise ValueError("메뉴 데이터가 올바른 형식이 아닙니다.")
        
        # Render 환경에서 권한 확인
        if os.environ.get('RENDER'):
            try:
                # 데이터베이스 디렉토리 확인
                db_dir = os.path.dirname(DATABASE)
                if not os.path.exists(db_dir):
                    print(f"데이터베이스 디렉토리 생성: {db_dir}")
                    os.makedirs(db_dir, exist_ok=True)
                    # 권한 설정
                    os.chmod(db_dir, 0o777)
                
                # 데이터베이스 파일이 이미 존재하면 권한 확인
                if os.path.exists(DATABASE):
                    try:
                        os.chmod(DATABASE, 0o666)
                        print(f"데이터베이스 파일 권한 설정: {DATABASE}")
                    except Exception as e:
                        print(f"데이터베이스 파일 권한 설정 실패: {str(e)}")
            except Exception as e:
                print(f"Render 환경 디렉토리 확인 실패: {str(e)}")
        
        # 실제 저장 시도
        try:
            with get_db() as db:
                # 트랜잭션 시작
                db.execute('BEGIN TRANSACTION')
                
                try:
                    # 시스템 항목을 제외한 데이터 백업
                    backup_data = {}
                    cursor = db.execute('SELECT * FROM menu WHERE name = "bariosk" OR order_index <= -900')
                    system_items = [dict(row) for row in cursor.fetchall()]
                    print(f"보존할 시스템 항목 수: {len(system_items)}")
                    
                    # 정규 메뉴 항목만 삭제
                    db.execute('DELETE FROM menu WHERE name != "bariosk" AND order_index > -900')
                    print("정규 메뉴 항목 삭제 완료")
                    
                    # 새 데이터 저장 (순서 유지를 위해 order_index 사용)
                    for category, items in data.items():
                        for index, item in enumerate(items):
                            try:
                                # 필수 필드 검증
                                if not all(k in item for k in ['id', 'name', 'price', 'image']):
                                    print(f"경고: 필수 필드가 누락된 메뉴 항목이 있습니다: {item}")
                                    # 누락된 필드 채우기
                                    if 'id' not in item:
                                        item['id'] = index + 1000  # 임의의 ID 생성
                                    if 'name' not in item:
                                        item['name'] = f"메뉴항목_{item['id']}"
                                    if 'price' not in item:
                                        item['price'] = "0"
                                    if 'image' not in item:
                                        item['image'] = "logo.png"
                                
                                order_index = item.get('order_index', index)
                                
                                # 시스템 항목이 아닌 경우만 저장
                                if item['name'] != "bariosk" and order_index > -900:
                                    db.execute(
                                        'INSERT INTO menu (id, category, name, price, image, temperature, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)',
                                        (item['id'], category, item['name'], str(item['price']), item['image'], item.get('temperature', ''), order_index)
                                    )
                                    print(f"메뉴 항목 저장: {category}/{item['name']}")
                            except Exception as e:
                                print(f"메뉴 항목 저장 실패: {str(e)}")
                                print(f"실패한 항목: {item}")
                                continue  # 단일 항목 실패 시 계속 진행
                    
                    # 빈 카테고리 확인 및 추가
                    for category in data.keys():
                        cursor = db.execute('SELECT COUNT(*) FROM menu WHERE category = ?', (category,))
                        if cursor.fetchone()[0] == 0:
                            # 카테고리가 없으면 시스템 항목 추가
                            db.execute(
                                'INSERT INTO menu (category, name, price, image, temperature, order_index) VALUES (?, ?, ?, ?, ?, ?)',
                                (category, "bariosk", "0", "logo.png", "", -999)
                            )
                            print(f"빈 카테고리 유지를 위한 시스템 항목 추가: {category}")
                    
                    # 커밋 전 확인
                    db.commit()
                    print("모든 메뉴 데이터 저장 완료")
                    
                    # 저장된 데이터 확인
                    cursor = db.execute('SELECT COUNT(*) FROM menu')
                    count = cursor.fetchone()[0]
                    print(f"저장된 데이터 확인: {count}개 항목")
                    
                except Exception as e:
                    print(f"데이터 저장 중 오류 발생: {str(e)}")
                    db.execute('ROLLBACK')
                    raise
        except Exception as e:
            print(f"데이터베이스 연결 또는 트랜잭션 오류: {str(e)}")
            import traceback
            print("상세 오류:")
            print(traceback.format_exc())
            
            # 실패 시 파일 직접 쓰기 시도 (비상 조치)
            if os.environ.get('RENDER'):
                try:
                    print("비상 조치: 데이터를 JSON 파일로 저장 시도")
                    backup_path = os.path.join(os.path.dirname(DATABASE), 'menu_backup.json')
                    with open(backup_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    print(f"백업 파일 저장 성공: {backup_path}")
                except Exception as backup_error:
                    print(f"백업 파일 저장 실패: {str(backup_error)}")
            raise
            
        # 저장 결과 확인
        if os.path.exists(DATABASE):
            file_size = os.path.getsize(DATABASE)
            print(f"저장 후 데이터베이스 파일 크기: {file_size} bytes")
            
        print("=== 메뉴 데이터 저장 완료 ===")
    except Exception as e:
        print(f"메뉴 데이터 저장 실패: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        raise

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
        
        # 데이터베이스에 이미지 저장
        conn = get_db()
        try:
            conn.execute(
                'INSERT OR REPLACE INTO images (filename, data, content_type) VALUES (?, ?, ?)',
                (unique_filename, image_data, 'image/jpeg')
            )
            conn.commit()
            print(f"이미지 저장 성공: {unique_filename}")
        except Exception as e:
            print(f"이미지 데이터베이스 저장 실패: {str(e)}")
            raise
        finally:
            conn.close()
        
        return unique_filename
        
    except Exception as e:
        print(f"이미지 저장 실패: {str(e)}")
        return "logo.png"

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

def get_menu_from_render():
    try:
        response = requests.get(f"{RENDER_API_URL}/api/menu")
        if response.status_code == 200:
            menu_data = response.json()
            print(f"Render 서버에서 메뉴 데이터 가져옴: {menu_data}")
            
            # 로컬 데이터베이스에 저장
            if not os.environ.get('RENDER'):
                save_menu_data(menu_data)
                print("로컬 데이터베이스에 메뉴 데이터 저장 완료")
            
            return menu_data
        else:
            print(f"Render 서버에서 메뉴 데이터를 가져오는데 실패했습니다: {response.status_code}")
            return {}
    except Exception as e:
        print(f"Render 서버 연결 실패: {str(e)}")
        return {}
    
@app.route('/api/images-list')
def images_list():
    try:
        print("이미지 목록 조회 시작")
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT filename FROM images')
        files = [row[0] for row in cursor.fetchall()]
        print(f"조회된 이미지 목록: {files}")
        conn.close()
        return jsonify(files)
    except Exception as e:
        print(f"이미지 목록 조회 실패: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
def save_menu_to_render(data):
    try:
        print(f"Render 서버에 저장할 데이터: {json.dumps(data, ensure_ascii=False)[:500]}...")
        
        # 요청 헤더 설정
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
        
        # 타임아웃 설정 (15초)
        response = requests.put(
            f"{RENDER_API_URL}/api/menu", 
            json=data, 
            headers=headers,
            timeout=15
        )
        
        print(f"Render 서버 응답 상태 코드: {response.status_code}")
        print(f"Render 서버 응답 내용: {response.text[:200]}")
        
        if response.status_code == 200:
            print("메뉴 데이터가 Render 서버에 저장되었습니다.")
            return True
        else:
            print(f"Render 서버에 메뉴 데이터를 저장하는데 실패했습니다: {response.status_code}")
            print(f"응답 내용: {response.text[:200]}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"Render 서버 요청 실패: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        return False
    except Exception as e:
        print(f"Render 서버 연결 실패: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        return False

@app.route('/api/menu', methods=['GET'])
def get_menu():
    try:
        print("=== 메뉴 데이터 조회 시작 ===")
        conn = get_db()
        cursor = conn.cursor()
        
        # 테이블 존재 여부 확인
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='menu'")
        if not cursor.fetchone():
            print("menu 테이블이 존재하지 않습니다.")
            conn.close()
            init_db()
            conn = get_db()
            cursor = conn.cursor()
        else:
            # 테이블이 존재하면 스키마 업데이트 확인
            update_schema(conn)
        
        try:
            # 카테고리별로 메뉴 조회
            cursor.execute("""
                SELECT id, category, name, price, image, temperature, order_index
                FROM menu
                ORDER BY category, order_index
            """)
            rows = cursor.fetchall()
            print(f"조회된 메뉴 수: {len(rows)}")
            
            # 카테고리별로 메뉴 정리
            menu_by_category = {}
            for row in rows:
                category = row['category']
                if category not in menu_by_category:
                    menu_by_category[category] = []
                
                menu_by_category[category].append({
                    'id': row['id'],
                    'name': row['name'],
                    'price': row['price'],
                    'image': row['image'],
                    'temperature': row['temperature'],
                    'order_index': row['order_index']
                })
            
            print("=== 메뉴 데이터 조회 완료 ===")
            return jsonify(menu_by_category)
            
        except Exception as e:
            print(f"메뉴 데이터 조회 중 오류 발생: {str(e)}")
            import traceback
            print("상세 오류:")
            print(traceback.format_exc())
            return jsonify({'error': str(e)}), 500
        finally:
            conn.close()
            
    except Exception as e:
        print(f"메뉴 데이터 조회 실패: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/menu', methods=['POST'])
def add_menu():
    try:
        # JSON 또는 FormData 데이터 처리 지원
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()
            
        if not data or 'category' not in data or 'name' not in data or 'price' not in data:
            return jsonify({'error': '필수 정보가 누락되었습니다.'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # 트랜잭션 시작
        conn.execute("BEGIN TRANSACTION")
        
        try:
            # 해당 카테고리의 마지막 order_index 조회
            cursor.execute("""
                SELECT MAX(order_index) as max_order
                FROM menu
                WHERE category = ?
            """, (data['category'],))
            result = cursor.fetchone()
            next_order = (result['max_order'] + 1) if result['max_order'] is not None else 0
            
            # 이미지 파일 처리
            image = 'logo.png'  # 기본 이미지
            if 'image' in request.files:
                file = request.files['image']
                if file and file.filename:
                    try:
                        # save_image 함수를 사용하여 이미지 저장
                        image = save_image(file)
                    except Exception as img_error:
                        print(f"이미지 저장 중 오류 발생: {str(img_error)}")
                        # 이미지 저장 실패 시 기본 이미지 사용
            
            # 새 메뉴 추가
            cursor.execute("""
                INSERT INTO menu (category, name, price, image, temperature, order_index)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                data['category'],
                data['name'],
                data['price'],
                image,
                data.get('temperature', ''),
                next_order
            ))
            
            # 트랜잭션 커밋
            conn.commit()
            
            # 성공 응답
            inserted_id = cursor.lastrowid
            return jsonify({
                'message': f'메뉴 "{data["name"]}"가 추가되었습니다.',
                'id': inserted_id
            })
            
        except Exception as e:
            # 오류 발생 시 롤백
            conn.rollback()
            raise e
            
    except Exception as e:
        print(f"메뉴 추가 중 오류 발생: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/menu/<category>/<int:menu_id>', methods=['PUT'])
def update_menu(menu_id, category):
    try:
        data = request.form.to_dict()
        if not data:
            return jsonify({'error': '수정할 정보가 없습니다.'}), 400
        
        conn = get_db()
        cursor = conn.cursor()
        
        # 트랜잭션 시작
        conn.execute("BEGIN TRANSACTION")
        
        try:
            # 기존 메뉴 정보 조회
            cursor.execute("SELECT * FROM menu WHERE id = ? AND category = ?", (menu_id, category))
            menu = cursor.fetchone()
            if not menu:
                return jsonify({'error': '메뉴를 찾을 수 없습니다.'}), 404
            
            # 이미지 파일 처리
            image = menu['image']  # 기본값으로 현재 이미지 사용
            if 'image' in request.files:
                file = request.files['image']
                if file and file.filename:
                    try:
                        # save_image 함수를 사용하여 이미지 저장
                        image = save_image(file)
                    except Exception as img_error:
                        print(f"이미지 저장 중 오류 발생: {str(img_error)}")
                        # 이미지 저장 실패 시 기존 이미지 유지
            
            # 메뉴 정보 업데이트
            update_fields = []
            params = []
            for key in ['name', 'price', 'temperature']:
                if key in data:
                    update_fields.append(f"{key} = ?")
                    params.append(data[key])
            
            # 이미지 필드 추가
            update_fields.append("image = ?")
            params.append(image)
            
            if update_fields:
                params.append(menu_id)
                params.append(category)
                cursor.execute(f"""
                    UPDATE menu
                    SET {', '.join(update_fields)}
                    WHERE id = ? AND category = ?
                """, params)
            
            # 트랜잭션 커밋
            conn.commit()
            return jsonify({'message': '메뉴가 수정되었습니다.'})
            
        except Exception as e:
            # 오류 발생 시 롤백
            conn.rollback()
            raise e
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

@app.route('/api/menu/<int:menu_id>', methods=['DELETE'])
def delete_menu(menu_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # 트랜잭션 시작
        conn.execute("BEGIN TRANSACTION")
        
        try:
            # 메뉴 삭제
            cursor.execute("DELETE FROM menu WHERE id = ?", (menu_id,))
            if cursor.rowcount == 0:
                return jsonify({'error': '메뉴를 찾을 수 없습니다.'}), 404
            
            # 트랜잭션 커밋
            conn.commit()
            return jsonify({'message': '메뉴가 삭제되었습니다.'})
            
        except Exception as e:
            # 오류 발생 시 롤백
            conn.rollback()
            raise e
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'conn' in locals():
            conn.close()

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
        
        # 데이터베이스에 저장
        conn = get_db()
        try:
            conn.execute(
                'INSERT OR REPLACE INTO images (filename, data, content_type) VALUES (?, ?, ?)',
                (filename, image_data, 'image/jpeg')
            )
            conn.commit()
            print(f"이미지 저장 성공: {filename}")
        except Exception as e:
            print(f"이미지 데이터베이스 저장 실패: {str(e)}")
            raise
        finally:
            conn.close()
        
        return filename
        
    except Exception as e:
        print(f"이미지 저장 실패: {str(e)}")
        return "logo.png"

@app.route('/api/images/<filename>', methods=['GET', 'OPTIONS'])
def serve_image(filename):
    print(f"\n=== 이미지 요청 시작: {filename} ===")
    print(f"요청 메서드: {request.method}")
    print(f"요청 URL: {request.url}")
    print(f"요청 헤더: {dict(request.headers)}")
    
    if request.method == 'OPTIONS':
        print("OPTIONS 요청 처리")
        response = app.make_default_options_response()
        return response

    try:
        print(f"이미지 파일 요청: {filename}")
        
        # 데이터베이스 연결 확인
        conn = get_db()
        if not conn:
            error_msg = "데이터베이스 연결 실패"
            print(error_msg)
            return jsonify({'error': error_msg}), 500
            
        cursor = conn.cursor()
        print("데이터베이스 연결 성공")
        
        try:
            # 이미지 조회
            cursor.execute('SELECT data, content_type FROM images WHERE filename = ?', (filename,))
            result = cursor.fetchone()
            
            if result and result['data']:
                print(f"이미지 찾음: {filename}, 데이터 크기: {len(result['data'])} bytes")
                
                # 이미지 데이터 검증
                try:
                    img = Image.open(io.BytesIO(result['data']))
                    print(f"이미지 포맷: {img.format}, 크기: {img.size}")
                    
                    # 이미지 데이터를 다시 바이트로 변환
                    img_byte_arr = io.BytesIO()
                    img.save(img_byte_arr, format=img.format if img.format else 'JPEG', quality=85, optimize=True)
                    img_byte_arr.seek(0)
                    
                    response = send_file(
                        img_byte_arr,
                        mimetype=result['content_type'],
                        as_attachment=False,
                        download_name=filename,
                        conditional=True
                    )
                    
                    # CORS 및 보안 헤더 설정
                    origin = request.headers.get('Origin')
                    if origin:
                        response.headers['Access-Control-Allow-Origin'] = origin
                    else:
                        response.headers['Access-Control-Allow-Origin'] = '*'
                    
                    response.headers.update({
                        'Access-Control-Allow-Methods': 'GET, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
                        'Access-Control-Max-Age': '3600',
                        'X-Content-Type-Options': 'nosniff',
                        'Cache-Control': 'public, max-age=31536000',
                        'Pragma': 'cache',
                        'Expires': 'Thu, 31 Dec 2037 23:55:55 GMT',
                        'Referrer-Policy': 'no-referrer'
                    })
                    
                    print(f"이미지 전송 완료: {filename}")
                    return response
                    
                except Exception as img_error:
                    print(f"이미지 처리 중 오류: {str(img_error)}")
                    print("기본 이미지 생성 시도")
                    return create_and_serve_default_image(filename)
            else:
                print(f"이미지를 찾을 수 없음: {filename}, 기본 이미지 생성")
                return create_and_serve_default_image(filename)
                
        except Exception as e:
            print(f"데이터베이스 쿼리 실패: {str(e)}")
            return jsonify({'error': str(e)}), 500
        finally:
            conn.close()
            print("데이터베이스 연결 종료")
            
    except Exception as e:
        print(f"이미지 처리 중 오류 발생: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500
    finally:
        print(f"=== 이미지 요청 종료: {filename} ===\n")

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
        
        # 데이터베이스에 이미지 저장
        conn = get_db()
        try:
            # 새 이미지 저장
            conn.execute(
                'INSERT OR REPLACE INTO images (filename, data, content_type) VALUES (?, ?, ?)',
                (filename, image_data, 'image/jpeg')
            )
            conn.commit()
            print(f"기본 이미지 데이터베이스 저장 완료: {filename}")
            
            # 이미지 서빙
            img_io = io.BytesIO(image_data)
            img_io.seek(0)
            
            response = send_file(
                img_io,
                mimetype='image/jpeg',
                as_attachment=False,
                download_name=filename,
                conditional=True
            )
            
            # CORS 및 보안 헤더 설정
            origin = request.headers.get('Origin')
            if origin:
                response.headers['Access-Control-Allow-Origin'] = origin
            else:
                response.headers['Access-Control-Allow-Origin'] = '*'
            
            response.headers.update({
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
                'Access-Control-Max-Age': '3600',
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'public, max-age=31536000',
                'Pragma': 'cache',
                'Expires': 'Thu, 31 Dec 2037 23:55:55 GMT',
                'Referrer-Policy': 'no-referrer'
            })
            
            print(f"기본 이미지 전송 준비 완료: {filename}")
            return response
            
        except Exception as db_error:
            print(f"기본 이미지 데이터베이스 저장 실패: {str(db_error)}")
            import traceback
            print("상세 오류:")
            print(traceback.format_exc())
            return jsonify({'error': '이미지를 생성할 수 없습니다.'}), 500
        finally:
            conn.close()
            print("데이터베이스 연결 종료")
            
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
    try:
        print("=== 카테고리 목록 조회 시작 ===")
        
        try:
            # 데이터베이스에서 직접 카테고리 조회 (순서 고려)
            conn = get_db()
            cursor = conn.cursor()
            
            # 카테고리 순서 테이블에서 먼저 조회 시도
            cursor.execute("""
                SELECT category
                FROM category_order
                ORDER BY order_index ASC
            """)
            
            ordered_categories = [row['category'] for row in cursor.fetchall()]
            print(f"카테고리 순서 테이블에서 조회된 카테고리: {ordered_categories}")
            
            # 순서 테이블에 없는 카테고리를 일반 메뉴 테이블에서 조회
            if not ordered_categories:
                cursor.execute("""
                    SELECT DISTINCT category 
                    FROM menu
                    ORDER BY category ASC
                """)
                ordered_categories = [row['category'] for row in cursor.fetchall()]
                print(f"메뉴 테이블에서 조회된 카테고리: {ordered_categories}")
                
                # 순서 테이블에 카테고리 추가 시도
                try:
                    cursor.execute("BEGIN TRANSACTION")
                    for idx, category in enumerate(ordered_categories):
                        cursor.execute("""
                            INSERT OR REPLACE INTO category_order (category, order_index)
                            VALUES (?, ?)
                        """, (category, idx))
                    cursor.execute("COMMIT")
                    print(f"카테고리 {len(ordered_categories)}개를 순서 테이블에 동기화함")
                except Exception as e:
                    cursor.execute("ROLLBACK")
                    print(f"카테고리 순서 테이블 동기화 중 오류: {str(e)}")
            
            conn.close()
            
            # 백업: 데이터베이스에서 가져온 카테고리가 없으면 menu_data 사용
            if not ordered_categories:
                menu_data = load_menu_data()
                ordered_categories = list(menu_data.keys())
                print(f"menu_data에서 대체로 가져온 카테고리 목록: {ordered_categories}")
            
            print("=== 카테고리 목록 조회 완료 ===")
            
            # 캐시 방지 및 타임스탬프 추가
            response = jsonify({
                "categories": ordered_categories,
                "timestamp": int(time.time()),
                "server": "Render" if os.environ.get('RENDER') else "Local"
            })
            
            # 캐시 관련 헤더만 추가 (CORS 헤더는 after_request에서 추가됨)
            response.headers.add('Cache-Control', 'no-cache, no-store, must-revalidate')
            response.headers.add('Pragma', 'no-cache')
            response.headers.add('Expires', '0')
            
            return response
            
        except Exception as db_error:
            print(f"데이터베이스에서 카테고리 조회 중 오류: {str(db_error)}")
            import traceback
            print("카테고리 조회 상세 오류:")
            print(traceback.format_exc())
            
            # 예비책: 데이터베이스 접근 실패 시 menu_data 사용
            menu_data = load_menu_data()
            categories = list(menu_data.keys())
            print(f"예비 방식으로 조회된 카테고리 목록: {categories}")
            
            print("=== 카테고리 목록 조회 완료 (예비 방식) ===")
            
            # 예비 방식 응답에도 캐시 방지 헤더 추가
            response = jsonify({
                "categories": categories,
                "timestamp": int(time.time()),
                "server": "Render" if os.environ.get('RENDER') else "Local",
                "method": "fallback"
            })
            
            # 캐시 관련 헤더만 추가 (CORS 헤더는 after_request에서 추가됨)
            response.headers.add('Cache-Control', 'no-cache, no-store, must-revalidate')
            response.headers.add('Pragma', 'no-cache')
            response.headers.add('Expires', '0')
            
            return response
            
    except Exception as e:
        print(f"카테고리 목록 조회 중 오류 발생: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        
        # 오류 응답에도 캐시 방지 헤더만 추가
        response = jsonify({
            'error': str(e),
            'timestamp': int(time.time())
        })
        
        # 캐시 관련 헤더만 추가 (CORS 헤더는 after_request에서 추가됨)
        response.headers.add('Cache-Control', 'no-cache, no-store, must-revalidate')
        response.headers.add('Pragma', 'no-cache')
        response.headers.add('Expires', '0')
        
        return response, 500

@app.route('/api/categories', methods=['POST'])
def add_category():
    try:
        print("=== 카테고리 추가 시작 ===")
        # 요청 데이터 로깅
        print(f"요청 Content-Type: {request.content_type}")
        print(f"요청 데이터: {request.data}")
        
        # Content-Type에 따라 데이터 파싱
        if request.content_type and 'application/json' in request.content_type:
            data = request.get_json(silent=True)
            if data is None:
                print("JSON 파싱 실패, 폼 데이터로 시도")
                data = request.form.to_dict()
        else:
            data = request.form.to_dict()
            if not data and request.data:
                # JSON 문자열로 시도
                try:
                    data = json.loads(request.data.decode('utf-8'))
                    print(f"JSON 문자열로 파싱: {data}")
                except json.JSONDecodeError as e:
                    print(f"JSON 파싱 오류: {str(e)}")
                    data = {}
        
        print(f"파싱된 데이터: {data}")
        category_name = data.get('name')
        
        print(f"추가할 카테고리: {category_name}")
        
        if not category_name:
            return jsonify({'error': '카테고리 이름이 필요합니다.'}), 400
        
        # 데이터베이스 초기화 확인
        try:
            ensure_db()
        except Exception as e:
            print(f"데이터베이스 초기화 확인 실패: {str(e)}")
        
        # 카테고리를 데이터베이스에 직접 추가
        try:
            conn = get_db()
            cursor = conn.cursor()
            
            # 트랜잭션 시작
            cursor.execute("BEGIN TRANSACTION")
            
            # 카테고리 존재 여부 확인
            cursor.execute("SELECT COUNT(*) FROM menu WHERE category = ?", (category_name,))
            if cursor.fetchone()[0] > 0:
                cursor.execute("ROLLBACK")
                conn.close()
                return jsonify({'error': '이미 존재하는 카테고리입니다.'}), 400
            
            # 카테고리 추가 (빈 메뉴 항목 사용)
            cursor.execute("""
                INSERT INTO menu (category, name, price, image, temperature, order_index)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (category_name, "대표메뉴", "0", "logo.png", "", 0))
            
            # 카테고리 순서 테이블에도 추가
            # 먼저 현재 최대 order_index 조회
            cursor.execute("SELECT MAX(order_index) as max_order FROM category_order")
            result = cursor.fetchone()
            next_order = (result['max_order'] or -1) + 1
            
            # 카테고리 순서 추가
            cursor.execute("""
                INSERT INTO category_order (category, order_index)
                VALUES (?, ?)
            """, (category_name, next_order))
            
            # 변경사항 커밋
            cursor.execute("COMMIT")
            conn.close()
            
            print(f"카테고리 '{category_name}'가 데이터베이스에 추가되었습니다.")
            
            # Render 서버와 동기화 (로컬 환경에서만)
            if not os.environ.get('RENDER'):
                try:
                    response = requests.post(
                        f"{RENDER_API_URL}/api/categories",
                        json={'name': category_name},
                        headers={'Content-Type': 'application/json'},
                        timeout=10  # 타임아웃 10초 설정
                    )
                    
                    print(f"Render 서버 응답 상태 코드: {response.status_code}")
                    if response.status_code == 201:
                        print("Render 서버에 카테고리 추가 성공")
                    else:
                        print(f"Render 서버에 카테고리 추가 실패: {response.text}")
                except Exception as e:
                    print(f"Render 서버 동기화 중 오류: {str(e)}")
                    # Render 서버 동기화 실패는 무시하고 계속 진행
            
            print("=== 카테고리 추가 완료 ===")
            return jsonify({'message': f'카테고리 "{category_name}"가 추가되었습니다.'}), 201
            
        except Exception as db_error:
            print(f"데이터베이스 작업 중 오류: {str(db_error)}")
            import traceback
            print("상세 오류:")
            print(traceback.format_exc())
            
            if 'conn' in locals() and conn:
                try:
                    cursor.execute("ROLLBACK")
                    conn.close()
                except:
                    pass
            
            return jsonify({'error': f'카테고리 추가 실패: {str(db_error)}'}), 500
        
    except Exception as e:
        print(f"카테고리 추가 중 오류 발생: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/categories/<category_name>', methods=['DELETE'])
def delete_category(category_name):
    try:
        print(f"=== 카테고리 '{category_name}' 삭제 시작 ===")
        
        try:
            conn = get_db()
            cursor = conn.cursor()
            
            # 트랜잭션 시작
            cursor.execute('BEGIN TRANSACTION')
            
            # 카테고리 존재 여부 확인
            cursor.execute("""
                SELECT COUNT(*) 
                FROM menu 
                WHERE category = ?
            """, (category_name,))
            
            if cursor.fetchone()[0] == 0:
                cursor.execute('ROLLBACK')
                conn.close()
                return jsonify({'error': '존재하지 않는 카테고리입니다.'}), 404
            
            # 해당 카테고리의 모든 항목 삭제
            cursor.execute("""
                DELETE FROM menu
                WHERE category = ?
            """, (category_name,))
            
            deleted_count = cursor.rowcount
            print(f"삭제된 메뉴 항목 수: {deleted_count}")
            
            # 카테고리 순서 테이블에서도 삭제
            cursor.execute("""
                DELETE FROM category_order
                WHERE category = ?
            """, (category_name,))
            
            print(f"카테고리 순서 테이블에서 '{category_name}' 삭제됨")
            
            # 커밋
            cursor.execute('COMMIT')
            conn.close()
            
            print(f"카테고리 '{category_name}'가 데이터베이스에서 삭제되었습니다.")
            
            # Render 서버와 동기화 (로컬 환경에서만)
            if not os.environ.get('RENDER'):
                try:
                    response = requests.delete(
                        f"{RENDER_API_URL}/api/categories/{category_name}",
                        timeout=10  # 타임아웃 10초 설정
                    )
                    
                    print(f"Render 서버 응답 상태 코드: {response.status_code}")
                    if response.status_code == 200:
                        print("Render 서버에서 카테고리 삭제 성공")
                    else:
                        print(f"Render 서버에서 카테고리 삭제 실패: {response.text}")
                except Exception as e:
                    print(f"Render 서버 동기화 중 오류: {str(e)}")
                    # Render 서버 동기화 실패는 무시하고 계속 진행
        
            print(f"=== 카테고리 '{category_name}' 삭제 완료 ===")
            return jsonify({'message': f'카테고리 "{category_name}"가 삭제되었습니다.'}), 200
            
        except Exception as db_error:
            print(f"데이터베이스에서 카테고리 삭제 중 오류: {str(db_error)}")
            if 'conn' in locals() and conn:
                cursor.execute('ROLLBACK')
                conn.close()
            
            import traceback
            print("상세 오류:")
            print(traceback.format_exc())
            return jsonify({'error': f'카테고리 삭제 실패: {str(db_error)}'}), 500
        
    except Exception as e:
        print(f"카테고리 삭제 중 오류 발생: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/categories/<category_name>', methods=['PUT'])
def update_category(category_name):
    try:
        print(f"=== 카테고리 '{category_name}' 수정 시작 ===")
        new_name = request.json.get('name')
        if not new_name:
            return jsonify({'error': '카테고리 이름이 필요합니다'}), 400

        print(f"새 카테고리 이름: {new_name}")

        # 새 이름이 현재 이름과 같으면 아무것도 하지 않음
        if new_name == category_name:
            return jsonify({'message': '카테고리 이름이 변경되지 않았습니다'}), 200

        try:
            conn = get_db()
            cursor = conn.cursor()
            
            # 트랜잭션 시작
            cursor.execute("BEGIN TRANSACTION")
            
            # 카테고리 존재 여부 확인
            cursor.execute("SELECT COUNT(*) FROM menu WHERE category = ?", (category_name,))
            if cursor.fetchone()[0] == 0:
                cursor.execute("ROLLBACK")
                conn.close()
                return jsonify({'error': '카테고리가 존재하지 않습니다'}), 404
                
            # 새 이름이 이미 존재하는지 확인
            cursor.execute("SELECT COUNT(*) FROM menu WHERE category = ?", (new_name,))
            if cursor.fetchone()[0] > 0:
                cursor.execute("ROLLBACK")
                conn.close()
                return jsonify({'message': '이미 존재하는 카테고리 이름입니다'}), 200
            
            # 메뉴 테이블에서 카테고리 이름 변경
            cursor.execute("""
                UPDATE menu
                SET category = ?
                WHERE category = ?
            """, (new_name, category_name))
            
            # 카테고리 순서 테이블에서도 변경
            cursor.execute("""
                UPDATE category_order
                SET category = ?
                WHERE category = ?
            """, (new_name, category_name))
            
            # 변경사항 커밋
            cursor.execute("COMMIT")
            conn.close()
            
            print(f"카테고리 이름을 '{category_name}'에서 '{new_name}'으로 변경 완료")
            
            # Render 서버와 동기화 (로컬 환경에서만)
            if not os.environ.get('RENDER'):
                try:
                    response = requests.put(
                        f"{RENDER_API_URL}/api/categories/{category_name}",
                        json={'name': new_name},
                        headers={'Content-Type': 'application/json'},
                        timeout=10  # 타임아웃 10초 설정
                    )
                    
                    print(f"Render 서버 응답 상태 코드: {response.status_code}")
                    if response.status_code == 200:
                        print("Render 서버에서 카테고리 수정 성공")
                    else:
                        print(f"Render 서버에서 카테고리 수정 실패: {response.text}")
                except Exception as e:
                    print(f"Render 서버 동기화 중 오류: {str(e)}")
                    # Render 서버 동기화 실패는 무시하고 계속 진행
        
            print(f"=== 카테고리 수정 완료 ===")
            return jsonify({'message': '카테고리가 수정되었습니다'}), 200
            
        except Exception as db_error:
            if 'conn' in locals() and conn:
                cursor.execute("ROLLBACK")
                conn.close()
                
            print(f"데이터베이스 작업 중 오류: {str(db_error)}")
            import traceback
            print("상세 오류:")
            print(traceback.format_exc())
            
            return jsonify({'error': f'카테고리 수정 실패: {str(db_error)}'}), 500
            
    except Exception as e:
        print(f"카테고리 수정 중 오류 발생: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

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
                                'image': item.get('image', 'logo.png'),
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
            
            # Render 서버와 동기화 (로컬 환경에서만)
            if not os.environ.get('RENDER'):
                try:
                    if save_menu_to_render(updated_menu_data):
                        print("Render 서버와 동기화 완료")
                    else:
                        print("Render 서버와 동기화 실패")
                except Exception as e:
                    print(f"Render 서버 동기화 중 오류: {str(e)}")
                    # Render 서버 동기화 실패는 무시하고 계속 진행
            
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

def sync_image_to_local(image_filename):
    try:
        if os.environ.get('RENDER'):
            # Render 서버에서 이미지 다운로드
            response = requests.get(f"{RENDER_API_URL}/static/images/{image_filename}")
            if response.status_code == 200:
                # 로컬에 이미지 저장
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], image_filename)
                with open(filepath, 'wb') as f:
                    f.write(response.content)
                print(f"이미지 동기화 성공: {image_filename}")
                return True
        return False
    except Exception as e:
        print(f"이미지 동기화 실패: {str(e)}")
        return False

def create_default_logo():
    try:
        print("기본 로고 이미지 생성 시작")
        # 기본 이미지 생성 (회색 배경의 200x200 이미지)
        img = Image.new('RGB', (200, 200), color='#CCCCCC')
        
        # 이미지를 JPEG로 변환
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True, progressive=True)
        image_data = output.getvalue()
        
        # 데이터베이스에 이미지 저장
        conn = get_db()
        try:
            # 기존 이미지 삭제
            conn.execute('DELETE FROM images WHERE filename = ?', ('logo.png',))
            
            # 새 이미지 저장
            conn.execute(
                'INSERT INTO images (filename, data, content_type) VALUES (?, ?, ?)',
                ('logo.png', image_data, 'image/jpeg')
            )
            conn.commit()
            print("기본 로고 이미지 생성 및 저장 완료")
            
            # 저장 확인
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM images WHERE filename = ?', ('logo.png',))
            count = cursor.fetchone()[0]
            print(f"저장된 로고 이미지 수: {count}")
            
        except Exception as e:
            print(f"기본 로고 이미지 저장 실패: {str(e)}")
            raise
        finally:
            conn.close()
            
    except Exception as e:
        print(f"기본 로고 이미지 생성 실패: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        raise

# 서버 시작 시 기본 로고 이미지 생성 확인
def ensure_default_logo():
    try:
        print("기본 로고 이미지 확인 시작")
        conn = get_db()
        cursor = conn.cursor()
        
        # 로고 이미지 존재 여부 확인
        cursor.execute('SELECT COUNT(*) FROM images WHERE filename = ?', ('logo.png',))
        count = cursor.fetchone()[0]
        
        if count == 0:
            print("기본 로고 이미지가 없어 생성합니다.")
            create_default_logo()
        else:
            print("기본 로고 이미지가 이미 존재합니다.")
            
    except Exception as e:
        print(f"기본 로고 이미지 확인 중 오류: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
    finally:
        conn.close()

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

@app.route('/api/categories/order', methods=['GET', 'PUT'])
def update_category_order():
    try:
        print("=== 카테고리 순서 처리 시작 ===")
        
        # GET 요청 처리 - 현재 카테고리 순서 반환
        if request.method == 'GET':
            print("카테고리 순서 조회 요청")
            conn = get_db()
            cursor = conn.cursor()
            
            # 카테고리 순서 조회
            cursor.execute("SELECT category FROM category_order ORDER BY order_index")
            ordered_categories = [row['category'] for row in cursor.fetchall()]
            
            # 순서가 없는 경우 메뉴에서 카테고리 목록 가져오기
            if not ordered_categories:
                print("저장된 카테고리 순서가 없어 메뉴에서 카테고리 목록 가져오기")
                cursor.execute("SELECT DISTINCT category FROM menu")
                ordered_categories = [row['category'] for row in cursor.fetchall()]
            
            conn.close()
            
            print(f"반환할 카테고리 순서: {ordered_categories}")
            
            return jsonify({
                'categories': ordered_categories,
                'server': 'Render',
                'timestamp': int(time.time())
            }), 200
        
        # PUT 요청 처리 - 카테고리 순서 업데이트
        data = request.get_json()
        
        if not data or 'categories' not in data:
            return jsonify({'error': '카테고리 목록이 필요합니다.'}), 400
        
        categories = data['categories']
        print(f"받은 카테고리 순서: {categories}")
        
        # 동기화 소스 확인 (무한 루프 방지)
        sync_source = data.get('sync_source', None)
        is_sync_request = sync_source is not None
        
        if is_sync_request:
            print(f"동기화 요청 (출처: {sync_source})")
        
        try:
            conn = get_db()
            cursor = conn.cursor()
            
            # 트랜잭션 시작
            cursor.execute("BEGIN TRANSACTION")
            
            # 기존 카테고리 정보 조회
            cursor.execute("SELECT category FROM category_order ORDER BY order_index")
            existing_categories = [row['category'] for row in cursor.fetchall()]
            print(f"기존 카테고리 순서: {existing_categories}")
            
            # 모든 카테고리 순서 초기화
            cursor.execute("DELETE FROM category_order")
            print("기존 카테고리 순서 초기화")
            
            # 새 순서 저장
            for index, category in enumerate(categories):
                cursor.execute("""
                    INSERT INTO category_order (category, order_index)
                    VALUES (?, ?)
                """, (category, index))
                print(f"카테고리 '{category}' 순서 {index}로 저장")
            
            # 없는 카테고리가 있는지 확인하고 필요하면 메뉴 항목 추가
            cursor.execute("SELECT DISTINCT category FROM menu")
            menu_categories = [row['category'] for row in cursor.fetchall()]
            
            for category in categories:
                if category not in menu_categories:
                    print(f"새 카테고리 '{category}' 발견, 메뉴 항목 추가")
                    cursor.execute("""
                        INSERT INTO menu (category, name, price, image, temperature, order_index)
                        VALUES (?, '대표메뉴', '0', 'logo.png', '', ?)
                    """, (category, -999))
            
            # 변경사항 커밋
            cursor.execute("COMMIT")
            conn.close()
            
            print("카테고리 순서 업데이트 완료")
            
            # 다른 서버로 동기화 (동기화 요청이 아닌 경우에만)
            if not is_sync_request:
                try:
                    # 모든 환경에서 명시적으로 동기화 서버 URL 지정
                    sync_servers = ["https://bariosk.onrender.com", "http://localhost:3000", "https://www.bariosk.com"]
                    current_host = request.host_url.rstrip('/')
                    
                    print(f"현재 호스트: {current_host}")
                    print(f"동기화할 서버 목록: {sync_servers}")
                    
                    # 현재 호스트가 아닌 다른 모든 서버로 동기화 요청 보내기
                    for server_url in sync_servers:
                        if server_url != current_host:
                            print(f"{server_url}에 카테고리 순서 동기화 요청 보내기")
                            try:
                                response = requests.put(
                                    f"{server_url}/api/categories/order",
                                    json={'categories': categories, 'sync_source': current_host},
                                    headers={
                                        'Content-Type': 'application/json',
                                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                                        'Pragma': 'no-cache',
                                        'Expires': '0'
                                    },
                                    timeout=8  # 타임아웃 줄임
                                )
                                
                                print(f"{server_url} 응답 상태 코드: {response.status_code}")
                                if response.status_code == 200:
                                    print(f"{server_url}에 카테고리 순서 동기화 성공")
                                else:
                                    print(f"{server_url}에 카테고리 순서 동기화 실패: {response.text}")
                            except Exception as server_error:
                                print(f"{server_url} 동기화 중 오류: {str(server_error)}")
                                # 개별 서버 동기화 실패는 무시하고 계속 진행
                except Exception as e:
                    print(f"서버 동기화 중 일반 오류: {str(e)}")
                    # 동기화 실패는 무시하고 계속 진행
            else:
                print(f"동기화 요청으로 추가 동기화는 수행하지 않음")
            
            # CORS 헤더 추가
            response = jsonify({'message': '카테고리 순서가 업데이트되었습니다.', 'categories': categories})
            
            # 캐시 관련 헤더만 추가
            response.headers.add('Cache-Control', 'no-cache, no-store, must-revalidate')
            response.headers.add('Pragma', 'no-cache')
            response.headers.add('Expires', '0')
            
            return response, 200
            
        except Exception as db_error:
            if 'conn' in locals() and conn:
                cursor.execute("ROLLBACK")
                conn.close()
            
            print(f"데이터베이스 작업 중 오류: {str(db_error)}")
            import traceback
            print("상세 오류:")
            print(traceback.format_exc())
            
            return jsonify({'error': f'카테고리 순서 업데이트 실패: {str(db_error)}'}), 500
        
    except Exception as e:
        print(f"카테고리 순서 처리 중 오류 발생: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/db/update-schema', methods=['GET'])
def api_update_schema():
    try:
        print("=== API를 통한 데이터베이스 스키마 업데이트 시작 ===")
        conn = get_db()
        update_schema(conn)
        conn.close()
        print("=== API를 통한 데이터베이스 스키마 업데이트 완료 ===")
        return jsonify({
            'message': '데이터베이스 스키마 업데이트가 완료되었습니다.',
            'success': True,
            'timestamp': int(time.time())
        }), 200
    except Exception as e:
        print(f"API 데이터베이스 스키마 업데이트 실패: {str(e)}")
        import traceback
        print(traceback.format_exc())
        return jsonify({
            'error': f'데이터베이스 스키마 업데이트 실패: {str(e)}',
            'success': False,
            'timestamp': int(time.time())
        }), 500

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
            try:
                # 파일 데이터를 메모리에 로드
                file_data = file.read()
                if not file_data:
                    return jsonify({'error': '파일 데이터가 비어있습니다.'}), 400
                
                # 데이터베이스에 저장
                conn = get_db()
                try:
                    # 기존 로고 삭제
                    conn.execute('DELETE FROM images WHERE filename = ?', ('logo.png',))
                    
                    # 새 로고 저장
                    conn.execute(
                        'INSERT INTO images (filename, data, content_type) VALUES (?, ?, ?)',
                        ('logo.png', file_data, file.content_type or 'image/jpeg')
                    )
                    conn.commit()
                    print("새 로고 이미지 저장 완료")
                    return jsonify({'message': '로고가 성공적으로 추가되었습니다.'}), 200
                except Exception as e:
                    print(f"데이터베이스 저장 실패: {str(e)}")
                    return jsonify({'error': '데이터베이스 저장 실패'}), 500
                finally:
                    conn.close()
            except Exception as e:
                print(f"파일 처리 실패: {str(e)}")
                return jsonify({'error': '파일 처리 실패'}), 500
        return jsonify({'error': '허용되지 않는 파일 형식입니다.'}), 400
    except Exception as e:
        print(f"로고 추가 중 오류 발생: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/upload.html')
def serve_upload_page():
    return send_from_directory('.', 'upload.html')

@app.route('/favicon.ico')
def favicon():
    try:
        # 데이터베이스에서 로고 이미지 가져오기
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('SELECT data FROM images WHERE filename = ?', ('logo.png',))
        result = cursor.fetchone()
        conn.close()
        
        if result and result['data']:
            # 로고 이미지를 PIL Image로 변환
            img = Image.open(io.BytesIO(result['data']))
            # 32x32 크기로 리사이즈
            img = img.resize((32, 32), Image.LANCZOS)
            # ICO 형식으로 변환
            ico_output = io.BytesIO()
            img.save(ico_output, format='ICO', sizes=[(32, 32)])
            ico_output.seek(0)
            
            return send_file(
                ico_output,
                mimetype='image/x-icon'
            )
    except Exception as e:
        print(f"Favicon 생성 실패: {str(e)}")
    
    # 오류 발생 시 빈 favicon 반환
    img = Image.new('RGB', (32, 32), color='#CCCCCC')
    output = io.BytesIO()
    img.save(output, format='ICO', sizes=[(32, 32)])
    output.seek(0)
    return send_file(output, mimetype='image/x-icon')

def ensure_menu_images():
    try:
        print("\n=== 메뉴 이미지 확인 시작 ===")
        conn = get_db()
        cursor = conn.cursor()
        
        # 메뉴에서 사용되는 모든 이미지 파일명 수집
        cursor.execute('SELECT DISTINCT image FROM menu WHERE image IS NOT NULL')
        menu_images = [row['image'] for row in cursor.fetchall()]
        print(f"메뉴에서 사용되는 이미지: {menu_images}")
        
        # 현재 저장된 이미지 확인
        cursor.execute('SELECT filename FROM images')
        existing_images = [row['filename'] for row in cursor.fetchall()]
        print(f"현재 저장된 이미지: {existing_images}")
        
        # 없는 이미지 생성
        for image_name in menu_images:
            if image_name not in existing_images:
                print(f"이미지 생성 시도: {image_name}")
                menu_name = image_name.split('.')[0]
                if create_default_image(image_name, menu_name):
                    print(f"이미지 생성 성공: {image_name}")
                else:
                    print(f"이미지 생성 실패: {image_name}")
        
        print("=== 메뉴 이미지 확인 완료 ===\n")
    except Exception as e:
        print(f"메뉴 이미지 확인 중 오류: {str(e)}")
    finally:
        if 'conn' in locals():
            conn.close()

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
        
        # 데이터베이스 초기화
        try:
            init_db()
            print("데이터베이스 초기화 완료")
        except Exception as e:
            print(f"데이터베이스 초기화 실패: {str(e)}")
            raise
        
        # 기본 로고 이미지 확인 및 생성
        try:
            ensure_default_logo()
            print("기본 로고 이미지 확인 완료")
        except Exception as e:
            print(f"기본 로고 이미지 확인 실패: {str(e)}")
            raise
            
        # 메뉴 이미지 확인 및 생성
        try:
            ensure_menu_images()
            print("메뉴 이미지 확인 완료")
        except Exception as e:
            print(f"메뉴 이미지 확인 실패: {str(e)}")
            raise

        # 서버 실행
        port = int(os.environ.get('PORT', 3000))
        print(f"=== 서버 시작: 포트 {port} ===")
        
        # 디버그 모드로 실행
        app.run(debug=True, host='0.0.0.0', port=port)
    except Exception as e:
        print(f"=== 서버 시작 실패 ===")
        print(f"오류 메시지: {str(e)}")
        import traceback
        print("상세 오류:")
        print(traceback.format_exc())
        raise 

