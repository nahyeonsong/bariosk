import sqlite3
import os

def update_database():
    try:
        # 데이터베이스 파일 경로
        db_path = os.path.join('data', 'menu.db')
        
        # 데이터베이스 연결
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # order_index 컬럼 추가
        try:
            cursor.execute("ALTER TABLE menu ADD COLUMN order_index INTEGER DEFAULT 0;")
            print("order_index 컬럼 추가 완료")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e):
                print("order_index 컬럼이 이미 존재합니다")
            else:
                raise
        
        # 기존 데이터의 order_index 업데이트
        cursor.execute("""
            UPDATE menu 
            SET order_index = (
                SELECT COUNT(*) 
                FROM menu m2 
                WHERE m2.category = menu.category 
                AND m2.id <= menu.id
            ) - 1;
        """)
        
        conn.commit()
        print("order_index 값 업데이트 완료")
        
        # 업데이트된 데이터 확인
        cursor.execute("SELECT category, name, order_index FROM menu ORDER BY category, order_index;")
        rows = cursor.fetchall()
        print("\n=== 업데이트된 메뉴 순서 ===")
        for row in rows:
            print(f"카테고리: {row[0]}, 이름: {row[1]}, 순서: {row[2]}")
        
        conn.close()
        print("\n데이터베이스 업데이트 완료")
        
    except Exception as e:
        print(f"오류 발생: {str(e)}")
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    update_database() 