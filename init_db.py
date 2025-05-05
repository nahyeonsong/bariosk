import sqlite3
import os

def init_database():
    conn = None
    try:
        # 데이터베이스 파일 경로
        data_dir = 'data'
        if not os.path.exists(data_dir):
            os.makedirs(data_dir)
        
        db_path = os.path.join(data_dir, 'menu.db')
        
        # 데이터베이스 연결
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 트랜잭션 시작
        conn.execute("BEGIN TRANSACTION")
        
        try:
            # 기존 테이블 삭제
            cursor.execute("DROP TABLE IF EXISTS menu;")
            
            # 테이블 생성
            cursor.execute('''
                CREATE TABLE menu (
                    id INTEGER PRIMARY KEY,
                    category TEXT NOT NULL,
                    name TEXT NOT NULL,
                    price TEXT NOT NULL,
                    image TEXT NOT NULL,
                    temperature TEXT,
                    order_index INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # 초기 데이터 준비
            initial_data = [
                # Coffee 카테고리
                (1, 'coffee', '아메리카노', '2000', 'logo.png', 'H', 0),
                (2, 'coffee', '아메리카노', '2000', 'logo.png', 'I', 1),
                (3, 'coffee', '카페라떼', '2500', 'logo.png', 'H', 2),
                (4, 'coffee', '카페라떼', '2500', 'logo.png', 'I', 3),
                
                # Non-Coffee 카테고리
                (5, 'non-coffee', '초코라떼', '3000', 'logo.png', 'H', 0),
                (6, 'non-coffee', '초코라떼', '3000', 'logo.png', 'I', 1),
                (7, 'non-coffee', '딸기라떼', '3500', 'logo.png', 'I', 2),
                
                # Dessert 카테고리
                (8, 'dessert', '휘낭시에', '2000', 'logo.png', '', 0),
                (9, 'dessert', '크로플', '3500', 'logo.png', '', 1),
            ]
            
            # 데이터 삽입
            cursor.executemany('''
                INSERT INTO menu (id, category, name, price, image, temperature, order_index)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', initial_data)
            
            # 트랜잭션 커밋
            conn.commit()
            print("데이터베이스 초기화 및 기본 데이터 삽입 완료")
            
            # 삽입된 데이터 확인
            cursor.execute("SELECT category, name, price, temperature FROM menu ORDER BY category, order_index")
            rows = cursor.fetchall()
            print("\n=== 삽입된 메뉴 목록 ===")
            for row in rows:
                print(f"카테고리: {row[0]}, 메뉴: {row[1]}, 가격: {row[2]}, 온도: {row[3]}")
                
        except Exception as e:
            # 오류 발생 시 롤백
            conn.rollback()
            raise e
            
    except Exception as e:
        print(f"오류 발생: {str(e)}")
        if conn:
            try:
                conn.rollback()
            except:
                pass
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    init_database() 