import http.server
import socketserver
from flask import send_file, abort
from io import BytesIO

PORT = 5000
DIRECTORY = "."

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    # CORS 헤더를 추가하지 않음 - Flask의 CORS 처리 사용
    def end_headers(self):
        super().end_headers()

    def do_GET(self):
        if self.path.startswith('/api/images/'):
            # 이미지 서빙 로직
            filename = self.path[len('/api/images/'):]
            image_data, mime_type = get_image_from_db(filename)
            if image_data is None:
                self.send_error(404, "Image not found")
            else:
                self.send_response(200)
                self.send_header('Content-type', mime_type)
                self.end_headers()
                self.wfile.write(image_data)
        else:
            super().do_GET()

handler = Handler
httpd = socketserver.TCPServer(("", PORT), handler)
print(f"서버가 http://localhost:{PORT}/ 에서 시작되었습니다.")
httpd.serve_forever() 