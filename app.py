from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
from werkzeug.utils import secure_filename
from PIL import Image
import io
import uuid
import base64
import pillow_avif  # AVIF 지원을 위한 플러그인

app = Flask(__name__, static_folder='static')
CORS(app)

# 설정
UPLOAD_FOLDER = os.path.join('static', 'images')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# 허용된 파일 확장자
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'avif'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# 메뉴 데이터 파일 경로
MENU_DATA_FILE = 'menu_data.json'

def load_menu_data():
    if os.path.exists(MENU_DATA_FILE):
        with open(MENU_DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {
        'main': [],
        'side': [],
        'drink': []
    }

def save_menu_data(data):
    with open(MENU_DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

def save_image(file):
    try:
        # 디렉토리가 없으면 생성
        if not os.path.exists(app.config['UPLOAD_FOLDER']):
            os.makedirs(app.config['UPLOAD_FOLDER'])
        
        # 파일 데이터를 메모리에 로드
        file_data = file.read()
        
        # 이미지 데이터를 PIL Image로 변환
        try:
            img = Image.open(io.BytesIO(file_data))
            print(f"이미지 포맷: {img.format}")  # 디버깅용 로그
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
        return unique_filename
        
    except Exception as e:
        print(f"이미지 저장 실패: {str(e)}")
        raise

@app.route('/api/menu', methods=['GET'])
def get_menu():
    try:
        menu_data = load_menu_data()
        print("현재 메뉴 데이터:", menu_data)  # 디버깅용 로그
        return jsonify(menu_data)
    except Exception as e:
        print(f"메뉴 데이터 로드 중 오류 발생: {str(e)}")  # 디버깅용 로그
        import traceback
        print(traceback.format_exc())  # 전체 스택 트레이스 출력
        return jsonify({'error': str(e)}), 500

@app.route('/api/menu', methods=['POST'])
def add_menu():
    try:
        print("요청 데이터:", request.form)
        print("파일 데이터:", request.files)
        
        if 'image' not in request.files:
            return jsonify({'error': '이미지 파일이 없습니다.'}), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': '선택된 파일이 없습니다.'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': '허용되지 않는 파일 형식입니다.'}), 400
        
        # 메뉴 데이터 로드
        menu_data = load_menu_data()
        print("현재 메뉴 데이터:", menu_data)
        
        # 새로운 메뉴 정보
        category = request.form.get('category')
        name = request.form.get('name')
        price = request.form.get('price')
        
        print(f"카테고리: {category}, 이름: {name}, 가격: {price}")
        
        if not all([category, name, price]):
            return jsonify({'error': '필수 정보가 누락되었습니다.'}), 400
        
        # 카테고리가 없으면 생성
        if category not in menu_data:
            menu_data[category] = []
            print(f"새 카테고리 생성: {category}")
        
        try:
            # 이미지 저장
            image_path = save_image(file)
            print(f"이미지 저장 성공: {image_path}")
            
            # 새 메뉴 ID 생성
            new_id = 1
            if menu_data[category]:
                new_id = max(menu['id'] for menu in menu_data[category]) + 1
            
            # 새 메뉴 추가
            new_menu = {
                'id': new_id,
                'name': name,
                'price': price,
                'image': image_path
            }
            
            print(f"추가할 메뉴: {new_menu}")
            menu_data[category].append(new_menu)
            save_menu_data(menu_data)
            
            return jsonify(new_menu), 201
            
        except ValueError as ve:
            return jsonify({'error': str(ve)}), 400
        except Exception as e:
            print(f"이미지 처리 중 오류 발생: {str(e)}")
            return jsonify({'error': f'이미지 처리 중 오류가 발생했습니다: {str(e)}'}), 500
            
    except Exception as e:
        print(f"메뉴 추가 중 오류 발생: {str(e)}")
        import traceback
        print(traceback.format_exc())
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
        price = request.form.get('price', menu['price'])
        
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
        menu['price'] = price
        
        save_menu_data(menu_data)
        return jsonify(menu)
    except Exception as e:
        print(f"메뉴 수정 중 오류 발생: {str(e)}")  # 디버깅용 로그
        return jsonify({'error': str(e)}), 500

@app.route('/static/images/<filename>')
def serve_image(filename):
    try:
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

if __name__ == '__main__':
    # 서버 시작 시 static/images 디렉토리 확인
    if not os.path.exists(UPLOAD_FOLDER):
        os.makedirs(UPLOAD_FOLDER)
    app.run(debug=True, port=5000) 