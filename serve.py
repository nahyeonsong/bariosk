import http.server
import socketserver

PORT = 3000
DIRECTORY = "."

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    # CORS 헤더를 추가하지 않음 - Flask의 CORS 처리 사용
    def end_headers(self):
        super().end_headers()

handler = Handler
httpd = socketserver.TCPServer(("", PORT), handler)
print(f"서버가 http://localhost:{PORT}/ 에서 시작되었습니다.")
httpd.serve_forever() 