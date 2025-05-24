const express = require("express");
const path = require("path");
const app = express();

// 정적 파일 제공
app.use(express.static(path.join(__dirname)));

// 모든 요청을 index.html로 라우팅
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// 3000 포트에서 서버 실행
app.listen(3000, () => {
    console.log("Frontend server is running on http://localhost:3000");
});
