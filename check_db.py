import sqlite3
import os
import json

def check_database():
    try:
        # 데이터베이스 파일 경로
        db_path = os.path.join('data', 'menu.db')
        
        # 데이터베이스 파일 존재 확인
        if not os.path.exists(db_path):
            print(f"데이터베이스 파일이 존재하지 않습니다: {db_path}")
            return
        
        # 데이터베이스 연결
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # 테이블 목록 확인
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print("\n=== 테이블 목록 ===")
        for table in tables:
            print(f"- {table[0]}")
        
        # menu 테이블 구조 확인
        print("\n=== menu 테이블 구조 ===")
        cursor.execute("PRAGMA table_info(menu);")
        columns = cursor.fetchall()
        for col in columns:
            print(f"- {col[1]} ({col[2]})")
        
        # 메뉴 데이터 확인
        print("\n=== 메뉴 데이터 ===")
        cursor.execute("SELECT * FROM menu ORDER BY category, order_index;")
        rows = cursor.fetchall()
        
        # 카테고리별로 데이터 정리
        menu_data = {}
        for row in rows:
            category = row['category']
            if category not in menu_data:
                menu_data[category] = []
            
            menu_item = {
                'id': row['id'],
                'name': row['name'],
                'price': row['price'],
                'image': row['image'],
                'temperature': row['temperature'],
                'order_index': row['order_index']
            }
            menu_data[category].append(menu_item)
        
        # JSON 형식으로 출력
        print(json.dumps(menu_data, indent=2, ensure_ascii=False))
        
        # 데이터 개수 출력
        print(f"\n총 메뉴 항목 수: {len(rows)}")
        
        conn.close()
        
    except Exception as e:
        print(f"오류 발생: {str(e)}")

if __name__ == "__main__":
    check_database() 