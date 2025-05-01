from flask import Flask, request, jsonify, send_from_directory
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

app = Flask(__name__, static_folder='static')
CORS(app)

# 설정
UPLOAD_FOLDER = os.path.join('static', 'images')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# 데이터베이스 파일 경로 설정
if os.environ.get('RENDER'):
    # Render 환경
    DATABASE = os.path.join(os.environ.get('RENDER_DISK_PATH', '/opt/render/project/src'), 'menu.db')
else:
    # 로컬 환경
    DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'menu.db')

print(f"데이터베이스 경로: {DATABASE}")  # 디버깅용

def get_db():
    try:
        # 데이터베이스 디렉토리 확인 및 생성
        db_dir = os.path.dirname(DATABASE)
        if not os.path.exists(db_dir):
            os.makedirs(db_dir)
            print(f"데이터베이스 디렉토리 생성: {db_dir}")

        db = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
        return db
    except Exception as e:
        print(f"데이터베이스 연결 실패: {str(e)}")
        raise

def init_db():
    try:
        with get_db() as db:
            db.execute('''
                CREATE TABLE IF NOT EXISTS menu (
                    id INTEGER PRIMARY KEY,
                    category TEXT NOT NULL,
                    name TEXT NOT NULL,
                    price TEXT NOT NULL,
                    image TEXT NOT NULL,
                    temperature TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            db.commit()
            print("데이터베이스 초기화 성공")
    except Exception as e:
        print(f"데이터베이스 초기화 실패: {str(e)}")
        raise

def load_menu_data():
    try:
        with get_db() as db:
            cursor = db.execute('SELECT * FROM menu ORDER BY category, id')
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
                    'temperature': row['temperature']
                })
            print(f"메뉴 데이터 로드 성공: {menu_data}")  # 디버깅용
            return menu_data
    except Exception as e:
        print(f"메뉴 데이터 로드 실패: {str(e)}")
        return {}

def save_menu_data(data):
    try:
        with get_db() as db:
            # 기존 데이터 삭제
            db.execute('DELETE FROM menu')
            
            # 새 데이터 저장
            for category, items in data.items():
                for item in items:
                    db.execute(
                        'INSERT INTO menu (id, category, name, price, image, temperature) VALUES (?, ?, ?, ?, ?, ?)',
                        (item['id'], category, item['name'], item['price'], item['image'], item.get('temperature', ''))
                    )
            db.commit()
            print(f"메뉴 데이터 저장 성공: {data}")  # 디버깅용
    except Exception as e:
        print(f"메뉴 데이터 저장 실패: {str(e)}")
        raise

# 허용된 파일 확장자
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'avif'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# 데이터베이스 초기화
with app.app_context():
    init_db()

def save_image(file):
    try:
        # 디렉토리가 없으면 생성
        if not os.path.exists(app.config['UPLOAD_FOLDER']):
            print(f"이미지 디렉토리 생성: {app.config['UPLOAD_FOLDER']}")
            os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        
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
        
        # 고유한 파일명 생성
        unique_filename = f"{uuid.uuid4()}.jpg"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        
        # 이미지 저장 (최적화 옵션 추가)
        img.save(filepath, 'JPEG', quality=85, optimize=True, progressive=True)
        print(f"이미지 저장 성공: {filepath}")
        
        # 저장된 파일이 실제로 존재하는지 확인
        if not os.path.exists(filepath):
            raise ValueError("이미지 파일이 저장되지 않았습니다.")
            
        return unique_filename
        
    except Exception as e:
        print(f"이미지 저장 실패: {str(e)}")
        return "logo.png"

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/menu', methods=['GET'])
def get_menu():
    try:
        menu_data = load_menu_data()
        print("Sending menu data:", menu_data)  # 디버깅용
        return jsonify(menu_data)
    except Exception as e:
        print(f"Error in get_menu: {str(e)}")  # 디버깅용
        return jsonify({"error": str(e)}), 500

@app.route('/api/menu', methods=['POST'])
def add_menu():
    try:
        menu_data = load_menu_data()
        print(f"현재 메뉴 데이터: {menu_data}")  # 디버깅용 로그 추가
        
        # 폼 데이터에서 정보 추출
        category = request.form.get('category')
        name = request.form.get('name')
        price = request.form.get('price')  # 문자열로 받기
        image_file = request.files.get('image')
        temperature = request.form.get('temperature', '')
        
        print(f"추가할 메뉴 정보: category={category}, name={name}, price={price}, temperature={temperature}")  # 디버깅용 로그 추가
        
        if not all([category, name, price]):
            return jsonify({'error': '카테고리, 이름, 가격은 필수 입력 항목입니다'}), 400
        
        # 이미지 저장 (이미지가 있는 경우에만)
        image_filename = "logo.png"  # 기본 이미지
        if image_file and image_file.filename != '':
            try:
                image_filename = save_image(image_file)
            except Exception as e:
                print(f"이미지 저장 실패: {str(e)}")
                # 이미지 저장 실패 시에도 기본 이미지 사용
        
        # 새 메뉴 ID 생성
        new_id = generate_new_menu_id(menu_data)
        
        # 새 메뉴 항목 생성
        menu = {
            "id": new_id,
            "name": name,
            "price": price,  # 문자열로 저장
            "image": image_filename,
            "temperature": temperature
        }
        
        print(f"생성된 메뉴 항목: {menu}")  # 디버깅용 로그 추가
        
        # 카테고리가 없으면 새로 생성
        if category not in menu_data:
            menu_data[category] = []
        
        # 메뉴 추가
        menu_data[category].append(menu)
        
        print(f"저장할 메뉴 데이터: {menu_data}")  # 디버깅용 로그 추가
        
        # 데이터 저장
        save_menu_data(menu_data)
        
        return jsonify({'message': '메뉴가 추가되었습니다'}), 201
    
    except Exception as e:
        print(f"메뉴 추가 중 오류 발생: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/menu/<category>/<int:menu_id>', methods=['PUT'])
def update_menu(category, menu_id):
    try:
        menu_data = load_menu_data()
        
        if category not in menu_data:
            return jsonify({'error': '존재하지 않는 카테고리입니다.'}), 404
        
        menu_index = next((index for (index, d) in enumerate(menu_data[category]) if d['id'] == menu_id), None)
        if menu_index is None:
            return jsonify({'error': '존재하지 않는 메뉴입니다.'}), 404
        
        # 기존 메뉴 정보
        menu = menu_data[category][menu_index]
        
        # 업데이트할 정보
        name = request.form.get('name', menu['name'])
        price = request.form.get('price', menu['price'])  # 문자열로 처리
        new_category = request.form.get('category', category)
        temperature = request.form.get('temperature', menu.get('temperature', 'H'))
        
        # 이미지 업데이트
        if 'image' in request.files:
            file = request.files['image']
            if file.filename != '' and allowed_file(file.filename):
                # 기존 이미지 삭제
                old_image_path = os.path.join(app.config['UPLOAD_FOLDER'], menu['image'])
                if os.path.exists(old_image_path):
                    os.remove(old_image_path)
                
                # 새 이미지 저장
                image_path = save_image(file)
                menu['image'] = image_path
        
        # 메뉴 정보 업데이트
        menu['name'] = name
        menu['price'] = price  # 문자열로 저장
        menu['temperature'] = temperature
        
        # 카테고리가 변경된 경우
        if new_category != category:
            # 기존 카테고리에서 메뉴 제거
            menu_data[category].pop(menu_index)
            # 새 카테고리에 메뉴 추가
            if new_category not in menu_data:
                menu_data[new_category] = []
            menu_data[new_category].append(menu)
        else:
            menu_data[category][menu_index] = menu
        
        # 변경사항 저장
        save_menu_data(menu_data)
        print(f"메뉴 수정 완료: {menu}")  # 디버깅용 로그 추가
        
        return jsonify(menu)
    except Exception as e:
        print(f"메뉴 수정 중 오류 발생: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/menu/<category>/<int:menu_id>', methods=['DELETE'])
def delete_menu(category, menu_id):
    try:
        menu_data = load_menu_data()
        
        if category not in menu_data:
            return jsonify({'error': '존재하지 않는 카테고리입니다.'}), 404
        
        # 메뉴 찾기
        menu_index = next((index for (index, d) in enumerate(menu_data[category]) if d['id'] == menu_id), None)
        if menu_index is None:
            return jsonify({'error': '존재하지 않는 메뉴입니다.'}), 404
        
        # 이미지 파일 삭제
        menu = menu_data[category][menu_index]
        image_path = os.path.join(app.config['UPLOAD_FOLDER'], menu['image'])
        if os.path.exists(image_path):
            os.remove(image_path)
        
        # 메뉴 삭제
        menu_data[category].pop(menu_index)
        
        # 빈 카테고리 제거
        if not menu_data[category]:
            del menu_data[category]
        
        save_menu_data(menu_data)
        return jsonify({'message': '메뉴가 삭제되었습니다.'}), 200
        
    except Exception as e:
        print(f"메뉴 삭제 중 오류 발생: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/static/images/<filename>')
def serve_image(filename):
    try:
        image_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(image_path):
            print(f"이미지 파일을 찾을 수 없음: {filename}")
            # 기본 이미지 경로
            default_image = os.path.join(app.config['UPLOAD_FOLDER'], 'logo.png')
            if os.path.exists(default_image):
                print(f"기본 이미지 사용: logo.png")
                return send_from_directory(app.config['UPLOAD_FOLDER'], 'logo.png')
            return jsonify({'error': '이미지를 찾을 수 없습니다.'}), 404
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    except Exception as e:
        print(f"이미지 서빙 중 오류 발생: {str(e)}")
        return jsonify({'error': '이미지를 찾을 수 없습니다.'}), 404

@app.route('/api/categories', methods=['GET'])
def get_categories():
    menu_data = load_menu_data()
    return jsonify(list(menu_data.keys()))

@app.route('/api/categories', methods=['POST'])
def add_category():
    try:
        data = request.get_json()
        category_name = data.get('name')
        
        if not category_name:
            return jsonify({'error': '카테고리 이름이 필요합니다.'}), 400
        
        menu_data = load_menu_data()
        
        if category_name in menu_data:
            return jsonify({'error': '이미 존재하는 카테고리입니다.'}), 400
        
        # 새 카테고리 추가
        menu_data[category_name] = []
        save_menu_data(menu_data)
        
        return jsonify({'message': f'카테고리 "{category_name}"가 추가되었습니다.'}), 201
        
    except Exception as e:
        print(f"카테고리 추가 중 오류 발생: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/categories/<category_name>', methods=['DELETE'])
def delete_category(category_name):
    try:
        menu_data = load_menu_data()
        
        if category_name not in menu_data:
            return jsonify({'error': '존재하지 않는 카테고리입니다.'}), 404
        
        # 카테고리 삭제
        del menu_data[category_name]
        save_menu_data(menu_data)
        
        return jsonify({'message': f'카테고리 "{category_name}"가 삭제되었습니다.'}), 200
        
    except Exception as e:
        print(f"카테고리 삭제 중 오류 발생: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/categories/<category_name>', methods=['PUT'])
def update_category(category_name):
    try:
        new_name = request.json.get('name')
        if not new_name:
            return jsonify({'error': '카테고리 이름이 필요합니다'}), 400

        # 메뉴 데이터 로드
        menu_data = load_menu_data()

        # 카테고리가 존재하는지 확인
        if category_name not in menu_data:
            return jsonify({'error': '카테고리가 존재하지 않습니다'}), 404

        # 새 이름이 현재 이름과 같으면 아무것도 하지 않음
        if new_name == category_name:
            return jsonify({'message': '카테고리 이름이 변경되지 않았습니다'}), 200

        # 새 이름이 이미 존재하는 경우
        if new_name in menu_data:
            return jsonify({'message': '이미 존재하는 카테고리 이름입니다'}), 200

        # 카테고리 이름 변경
        menu_data[new_name] = menu_data.pop(category_name)
        save_menu_data(menu_data)

        return jsonify({'message': '카테고리가 수정되었습니다'}), 200
    except Exception as e:
        print(f"카테고리 수정 중 오류 발생: {str(e)}")
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
        
        # 기존 메뉴 데이터 로드
        menu_data = load_menu_data()
        
        # 새로운 메뉴 데이터로 업데이트
        menu_data.update(new_menu_data)
        
        # 변경사항 저장
        save_menu_data(menu_data)
        
        return jsonify({'message': '메뉴 순서가 업데이트되었습니다.'}), 200
        
    except Exception as e:
        print(f"메뉴 순서 업데이트 중 오류 발생: {str(e)}")
        return jsonify({'error': str(e)}), 500

def initialize_menu_data():
    initial_data = {
        "coffee": [
            {
                "id": 1,
                "name": "아메리카노",
                "price": 2000,
                "image": "e954dc77-2879-4e30-9685-4d8ae14a993d.jpg",
                "temperature": "H"
            },
            {
                "id": 2,
                "name": "카페라떼",
                "price": 2500,
                "image": "15185792-5ecb-435d-90db-dbd67b630206.jpg",
                "temperature": "H"
            }
        ]
    }
    save_menu_data(initial_data)

def backup_json_file():
    try:
        json_file = 'menu_data.json'
        if os.path.exists(json_file):
            # 백업 파일명 생성 (날짜_시간 포함)
            backup_filename = f'menu_data_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
            # 백업 디렉토리 생성
            backup_dir = 'backups'
            if not os.path.exists(backup_dir):
                os.makedirs(backup_dir)
            # 파일 복사
            shutil.copy2(json_file, os.path.join(backup_dir, backup_filename))
            print(f"JSON 파일 백업 완료: {backup_filename}")
    except Exception as e:
        print(f"JSON 파일 백업 실패: {str(e)}")

def migrate_json_to_db():
    try:
        # JSON 파일에서 데이터 로드
        json_file = 'menu_data.json'
        if os.path.exists(json_file):
            with open(json_file, 'r', encoding='utf-8') as f:
                menu_data = json.load(f)
                print(f"JSON 데이터 로드 성공: {menu_data}")
                
                # 데이터베이스에 저장
                with get_db() as db:
                    # 기존 데이터 삭제
                    db.execute('DELETE FROM menu')
                    
                    # 새 데이터 저장
                    for category, items in menu_data.items():
                        for item in items:
                            db.execute(
                                'INSERT INTO menu (id, category, name, price, image, temperature) VALUES (?, ?, ?, ?, ?, ?)',
                                (item['id'], category, item['name'], item['price'], item['image'], item.get('temperature', ''))
                            )
                    db.commit()
                    print("JSON 데이터 마이그레이션 성공")
                    
                    # 마이그레이션 성공 후 JSON 파일 백업
                    backup_json_file()
        else:
            print("JSON 파일이 존재하지 않습니다.")
    except Exception as e:
        print(f"JSON 데이터 마이그레이션 실패: {str(e)}")

def create_default_logo():
    try:
        # 기본 이미지 디렉토리 확인 및 생성
        if not os.path.exists(app.config['UPLOAD_FOLDER']):
            os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        
        # 기본 이미지 경로
        logo_path = os.path.join(app.config['UPLOAD_FOLDER'], 'logo.png')
        
        # 이미지가 이미 존재하는지 확인
        if os.path.exists(logo_path):
            print("기본 로고 이미지가 이미 존재합니다.")
            return
        
        # 기본 이미지 생성 (회색 배경의 200x200 이미지)
        img = Image.new('RGB', (200, 200), color='#CCCCCC')
        
        # 이미지 저장
        img.save(logo_path, 'PNG')
        print(f"기본 로고 이미지 생성 완료: {logo_path}")
    except Exception as e:
        print(f"기본 로고 이미지 생성 실패: {str(e)}")

# 서버 실행
if __name__ == '__main__':
    try:
        # 디렉토리 생성
        if not os.path.exists(UPLOAD_FOLDER):
            os.makedirs(UPLOAD_FOLDER)
        
        # 기본 로고 이미지 생성
        create_default_logo()
        
        # 데이터베이스 초기화
        init_db()
        
        # JSON 데이터 마이그레이션
        migrate_json_to_db()
        
        # 서버 실행
        port = int(os.environ.get('PORT', 5000))
        print(f"서버 시작: 포트 {port}")
        app.run(debug=True, host='0.0.0.0', port=port)
    except Exception as e:
        print(f"서버 시작 실패: {str(e)}") 