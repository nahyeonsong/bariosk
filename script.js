// API 기본 URL 설정
const API_BASE_URL = getApiBaseUrl();

// 모바일 기기 확인 함수
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );
}

// 네트워크 연결 확인 함수
function checkNetworkConnection() {
    return navigator.onLine;
}

// API 기본 URL 결정 함수
function getApiBaseUrl() {
    const hostname = window.location.hostname;
    console.log("현재 호스트명:", hostname);
    console.log("모바일 기기 여부:", isMobileDevice());
    console.log(
        "네트워크 연결 상태:",
        checkNetworkConnection() ? "연결됨" : "연결 안됨"
    );

    // 모든 환경에서 Render 서버 사용 (로컬/Render 데이터 통합)
    const FORCE_RENDER_SERVER = true; // true로 설정하면 모든 환경에서 Render 서버 사용

    // Render 서버 URL
    const RENDER_SERVER_URL = "https://bariosk.onrender.com";

    // 네트워크 연결이 없는 경우 로컬 스토리지 모드로 변경
    if (!checkNetworkConnection()) {
        console.log(
            "네트워크 연결이 없습니다. 로컬 스토리지 모드로 작동합니다."
        );
        return "offline";
    }

    if (FORCE_RENDER_SERVER) {
        console.log("모든 환경에서 Render 서버 사용");
        return RENDER_SERVER_URL;
    }

    // 아래는 환경별 분기 처리 (FORCE_RENDER_SERVER가 false일 때만 사용됨)

    // Render 호스팅 도메인 또는 커스텀 도메인 - 항상 Render API 서버 사용
    if (hostname === "bariosk.onrender.com") {
        return window.location.origin; // 현재 도메인을 그대로 API 서버로 사용
    }

    // 다른 도메인(커스텀 도메인 포함) - Render API 서버 사용
    if (
        hostname === "www.bariosk.com" ||
        hostname === "bariosk.com" ||
        hostname.includes(".bariosk.com") ||
        hostname === "nahyeonsong.github.io"
    ) {
        return RENDER_SERVER_URL;
    }

    // 로컬 개발 환경
    if (hostname === "localhost" || hostname === "127.0.0.1") {
        // return "http://localhost:5000"; // 로컬 서버 사용 (기존 코드)
        return RENDER_SERVER_URL; // 로컬 환경에서도 Render 서버 사용
    }

    // 기타 모든 도메인 - Render 서버를 기본값으로 사용
    return RENDER_SERVER_URL;
}

console.log("사용할 API URL:", API_BASE_URL);

// 전역 변수
let isAdminMode = false;
let cart = [];
let menuData = {};
let categoryDraggedItem = null;
let categoryDragStartIndex = null;
let menuDraggedItem = null;

// 요청 타임아웃 설정
const REQUEST_TIMEOUT = 10000; // 15초에서 10초로 변경하여 모바일에서 응답성 향상

// 로컬 스토리지 키
const CATEGORY_ORDER_KEY = "bariosk_category_order";

// 카테고리 순서를 로컬 스토리지에 백업 저장 (오프라인 복구용)
function saveCategoryOrderToLocalStorage(categories) {
    try {
        localStorage.setItem("bariosk_categories", JSON.stringify(categories));
        localStorage.setItem("bariosk_categories_time", Date.now().toString());
        console.log("카테고리 순서 로컬 스토리지에 백업 완료:", categories);
    } catch (error) {
        console.error("카테고리 순서 로컬 저장 실패:", error);
    }
}

// 로컬 스토리지에서 카테고리 순서 복원 (서버 장애 또는 오프라인 대비용)
function loadCategoryOrderFromLocalStorage() {
    try {
        const savedCategories = localStorage.getItem("bariosk_categories");
        const savedTime = localStorage.getItem("bariosk_categories_time");

        if (savedCategories) {
            const categories = JSON.parse(savedCategories);
            const timeDiff = Date.now() - (parseInt(savedTime) || 0);
            const hoursDiff = timeDiff / (1000 * 60 * 60);

            console.log(
                `로컬 스토리지 카테고리 마지막 저장 시간: ${new Date(
                    parseInt(savedTime)
                ).toLocaleString()}`
            );
            console.log(`저장 후 경과 시간: ${hoursDiff.toFixed(1)}시간`);

            // 24시간 이내의 로컬 데이터만 유효하게 처리
            if (hoursDiff < 24) {
                console.log("유효한 로컬 카테고리 순서 로드됨:", categories);
                return categories;
            } else {
                console.log("로컬 카테고리 데이터가 오래됨 (24시간 이상)");
                return null;
            }
        }
        return null;
    } catch (error) {
        console.error("로컬 스토리지 카테고리 로드 오류:", error);
        return null;
    }
}

// API 요청 함수 (타임아웃 처리 및 재시도 로직 추가)
async function apiRequest(url, options = {}, retries = 2) {
    const startTime = performance.now();

    // 오프라인 모드 확인
    if (!navigator.onLine || API_BASE_URL === "offline") {
        console.warn("오프라인 모드: 로컬 스토리지에서 데이터 로드 시도");
        showOfflineNotification();
        throw new Error("오프라인 모드");
    }

    try {
        // AbortController를 사용하여 타임아웃 설정 (30초)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        console.log(
            `API 요청: ${url} (남은 재시도: ${retries}, 타임아웃: ${REQUEST_TIMEOUT}ms)`
        );

        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache, no-store, must-revalidate",
                Pragma: "no-cache",
                ...options.headers,
            },
        });

        clearTimeout(timeoutId);

        const elapsed = performance.now() - startTime;
        console.log(`API 응답: ${url} (${elapsed.toFixed(0)}ms)`);

        if (!response.ok) {
            let errorMessage;
            try {
                const errorData = await response.json();
                errorMessage =
                    errorData.error || `서버 오류: ${response.status}`;
            } catch (e) {
                errorMessage = `서버 오류: ${response.status}`;
            }
            throw new Error(errorMessage);
        }

        return response;
    } catch (error) {
        const elapsed = performance.now() - startTime;

        // 네트워크 연결 확인
        if (!navigator.onLine) {
            console.error(
                "네트워크 연결이 없습니다. 로컬 데이터를 사용합니다."
            );
            showOfflineNotification();
            throw new Error("네트워크 연결 없음");
        }

        if (error.name === "AbortError") {
            console.error(`요청 시간 초과: ${url} (${elapsed.toFixed(0)}ms)`);
            if (retries > 0) {
                console.log(
                    `${url} 재시도 중... (남은 재시도: ${retries - 1})`
                );
                return apiRequest(url, options, retries - 1);
            }
            throw new Error(
                "요청 시간이 초과되었습니다. 서버 응답이 지연되고 있습니다."
            );
        }

        if (
            retries > 0 &&
            (error.message.includes("Failed to fetch") ||
                error.message.includes("NetworkError"))
        ) {
            console.log(
                `네트워크 오류로 ${url} 재시도 중... (남은 재시도: ${
                    retries - 1
                })`
            );
            // 지수 백오프: 재시도 전 약간의 지연 추가
            await new Promise((r) => setTimeout(r, 1000 * (3 - retries)));
            return apiRequest(url, options, retries - 1);
        }

        throw error;
    }
}

// DOM이 로드되면 실행
document.addEventListener("DOMContentLoaded", () => {
    const adminPanel = document.getElementById("adminPanel");
    const addMenuForm = document.getElementById("addMenuForm");
    const editMenuForm = document.getElementById("editMenuForm");
    const cancelEditBtn = document.getElementById("cancelEdit");
    const addCategoryForm = document.getElementById("addCategoryForm");
    const categoryList = document.getElementById("categoryList");
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");
    const logo = document.getElementById("logo");
    const clearCartBtn = document.getElementById("clearCartBtn"); // 장바구니 비우기 버튼 참조 추가
    let pressTimer;

    // 탭 전환
    tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const tabName = button.getAttribute("data-tab");

            // 모든 탭 버튼과 콘텐츠에서 active 클래스 제거
            tabButtons.forEach((btn) => btn.classList.remove("active"));
            tabContents.forEach((content) =>
                content.classList.remove("active")
            );

            // 선택된 탭에 active 클래스 추가
            button.classList.add("active");
            document.getElementById(`${tabName}Tab`).classList.add("active");
        });
    });

    // 로고 길게 누르기 이벤트 설정
    logo.addEventListener("mousedown", function () {
        pressTimer = setTimeout(function () {
            toggleAdminMode();
        }, 3000); // 3초
    });

    logo.addEventListener("mouseup", function () {
        clearTimeout(pressTimer);
    });

    logo.addEventListener("mouseleave", function () {
        clearTimeout(pressTimer);
    });

    // 터치 이벤트도 추가 (모바일 지원)
    logo.addEventListener("touchstart", function (e) {
        e.preventDefault(); // 기본 스크롤 동작 방지
        pressTimer = setTimeout(function () {
            toggleAdminMode();
        }, 3000);
    });

    logo.addEventListener("touchend", function () {
        clearTimeout(pressTimer);
    });

    // 초기 데이터 로드
    initializeApp();

    // 카테고리 추가 폼 제출
    addCategoryForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const categoryName = document.getElementById("newCategoryName").value;
        if (!categoryName.trim()) {
            alert("카테고리 이름을 입력해주세요.");
            return;
        }

        try {
            console.log(`카테고리 추가 시도: ${categoryName}`);

            // 요청을 API_BASE_URL로 통일
            const url = `${API_BASE_URL}/api/categories`;
            console.log(`카테고리 추가 요청 URL: ${url}`);

            const requestData = JSON.stringify({ name: categoryName });
            console.log(`요청 데이터: ${requestData}`);

            // 로컬 UI 업데이트 (낙관적 UI 업데이트)
            if (!menuData[categoryName]) {
                menuData[categoryName] = [];
                console.log(`로컬 menuData에 카테고리 추가: ${categoryName}`);

                // 기존 카테고리 순서 가져오기
                const currentCategories =
                    loadCategoryOrderFromLocalStorage() ||
                    Object.keys(menuData);

                // 새 카테고리 추가
                if (!currentCategories.includes(categoryName)) {
                    currentCategories.push(categoryName);
                    saveCategoryOrderToLocalStorage(currentCategories);
                    console.log("업데이트된 카테고리 순서:", currentCategories);
                }

                // 카테고리 선택 옵션과 목록 업데이트
                updateCategorySelects(currentCategories);
                renderCategoryList(currentCategories);
                updateMenuDisplay(currentCategories);
                console.log("UI 낙관적 업데이트 완료");
            }

            // 요청 전송
            try {
                const response = await apiRequest(url, {
                    method: "POST",
                    body: requestData,
                });

                console.log(`응답 상태: ${response.status}`);
                const responseText = await response.text();
                console.log(`응답 텍스트: ${responseText}`);

                let responseData;
                try {
                    responseData = JSON.parse(responseText);
                } catch (e) {
                    console.error("응답 JSON 파싱 오류:", e);
                    responseData = { message: responseText };
                }

                if (!response.ok) {
                    throw new Error(
                        responseData.error || `서버 오류: ${response.status}`
                    );
                }

                addCategoryForm.reset();

                // 서버 데이터 로드 (백그라운드)
                try {
                    setTimeout(async () => {
                        await loadCategories();
                        await loadMenuData();

                        // 로컬 카테고리 순서 적용
                        applyLocalCategoryOrder();

                        console.log("서버 데이터 백그라운드 로드 완료");
                    }, 500);
                } catch (loadError) {
                    console.error("서버 데이터 로드 오류 (무시됨):", loadError);
                }

                alert("카테고리가 추가되었습니다.");
            } catch (apiError) {
                console.error("API 요청 오류:", apiError);
                // API 오류가 발생해도 로컬 UI는 이미 업데이트 되었으므로
                // 사용자 경험을 위해 성공 메시지 표시
                addCategoryForm.reset();
                alert("카테고리가 추가되었습니다.");
            }
        } catch (error) {
            console.error("카테고리 추가 중 오류:", error);
            alert("카테고리 추가 중 오류가 발생했습니다. 다시 시도해 주세요.");
        }
    });

    // 메뉴 추가 폼 제출
    addMenuForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = new FormData(addMenuForm);

        try {
            const response = await fetch(`${API_BASE_URL}/api/menu`, {
                method: "POST",
                body: formData, // FormData 직접 전송
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "메뉴 추가 실패");
            }

            addMenuForm.reset();
            loadMenuData();
            alert("메뉴가 추가되었습니다.");
        } catch (error) {
            console.error("Error:", error);
            if (error.message.includes("Failed to fetch")) {
                alert(
                    "서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요."
                );
            } else {
                alert("메뉴 추가 중 오류가 발생했습니다: " + error.message);
            }
        }
    });

    // 메뉴 수정 폼 제출
    editMenuForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = new FormData(editMenuForm);
        const menuId = formData.get("menuId");
        const category = formData.get("category");

        try {
            const response = await fetch(
                `${API_BASE_URL}/api/menu/${category}/${menuId}`,
                {
                    method: "PUT",
                    body: formData,
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "메뉴 수정 실패");
            }

            editMenuForm.reset();
            editMenuForm.style.display = "none";
            loadMenuData();
            alert("메뉴가 수정되었습니다.");
        } catch (error) {
            console.error("Error:", error);
            if (error.message.includes("Failed to fetch")) {
                alert(
                    "서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요."
                );
            } else {
                alert("메뉴 수정 중 오류가 발생했습니다: " + error.message);
            }
        }
    });

    // 수정 취소
    cancelEditBtn.addEventListener("click", () => {
        editMenuForm.reset();
        editMenuForm.style.display = "none";
    });

    // 메뉴 아이템에 장바구니 추가 버튼 이벤트 리스너 추가
    addMenuEventListeners();
    updateCart();

    // 장바구니 비우기 버튼 이벤트 리스너 추가
    clearCartBtn.addEventListener("click", () => {
        if (cart.length > 0) {
            if (confirm("장바구니를 비우시겠습니까?")) {
                cart = [];
                updateCart();
                alert("장바구니가 비워졌습니다.");
            }
        } else {
            alert("장바구니가 이미 비어있습니다.");
        }
    });
});

// 앱 초기화 함수
async function initializeApp() {
    try {
        console.log("앱 초기화 시작");
        const startTime = performance.now(); // 성능 측정 시작

        // 로컬 스토리지에서 관리자 모드 상태 불러오기
        const savedAdminMode = localStorage.getItem("bariosk_admin_mode");
        if (savedAdminMode === "true") {
            isAdminMode = true;
            console.log("로컬 스토리지에서 관리자 모드 상태 복원: 활성화");

            // 관리자 모드 UI 적용
            const adminPanel = document.getElementById("adminPanel");
            const logo = document.getElementById("logo");

            if (adminPanel) {
                adminPanel.style.display = "block";
            }

            if (logo) {
                logo.style.border = "2px solid red";
                logo.style.padding = "2px";
            }
        }

        // 로컬 스토리지에서 저장된 카테고리와 메뉴 데이터 먼저 확인
        try {
            // 로컬 스토리지에서 저장된 카테고리 순서 불러오기
            const savedCategories = loadCategoryOrderFromLocalStorage();
            console.log(
                "초기화 시 로컬 스토리지에서 불러온 카테고리 순서:",
                savedCategories
            );

            // 로컬 스토리지에서 메뉴 데이터 불러오기 (캐시 데이터)
            const cachedMenuData = localStorage.getItem("bariosk_menu_data");
            if (cachedMenuData) {
                try {
                    const parsedMenuData = JSON.parse(cachedMenuData);
                    const cacheTime = localStorage.getItem(
                        "bariosk_menu_data_time"
                    );
                    const cacheAge = cacheTime
                        ? (Date.now() - parseInt(cacheTime)) / 1000
                        : 0;

                    console.log(
                        "로컬 스토리지에서 메뉴 데이터 캐시 발견 (캐시 나이:",
                        cacheAge.toFixed(0),
                        "초)"
                    );

                    // 캐시가 1시간 이내인 경우 사용 (개발 중에는 짧게, 프로덕션에서는 길게 설정 가능)
                    if (cacheAge < 3600) {
                        console.log("캐시된 메뉴 데이터 사용");
                        menuData = parsedMenuData;

                        // UI 초기 업데이트 (빠른 초기 로딩을 위해)
                        if (savedCategories && savedCategories.length > 0) {
                            updateCategorySelects(savedCategories);
                            renderCategoryList(savedCategories);
                            updateMenuDisplay(savedCategories);

                            // 백그라운드에서 서버 데이터 불러오기 (UI는 이미 표시됨)
                            setTimeout(() => loadServerData(false), 500);

                            console.log(
                                "캐시 데이터로 초기 UI 구성 완료:",
                                performance.now() - startTime,
                                "ms"
                            );
                            return; // 여기서 종료, 백그라운드 로딩은 계속됨
                        }
                    } else {
                        console.log(
                            "캐시가 오래되어 서버에서 새 데이터 로드 필요"
                        );
                    }
                } catch (e) {
                    console.error("캐시된 메뉴 데이터 파싱 오류:", e);
                }
            }
        } catch (cacheError) {
            console.error("로컬 캐시 확인 중 오류:", cacheError);
        }

        // 캐시 데이터가 유효하지 않거나 없으면 서버에서 데이터 로드
        await loadServerData(true);
        console.log("앱 초기화 완료:", performance.now() - startTime, "ms");
        updateMenuDisplay(serverCategories)
        // 초기화 완료 후 로컬 카테고리 ve순서 명시적 적용
        applyLocalCategoryOrder();
    } catch (error) {
        console.error("앱 초기화 중 오류:", error);
        // 오류 발생 시 기존 로드 메서드로 복구 시도
        try {
    


        // 초기화 완료 후 로컬 카테고리 순서 명시적 적용
        applyLocalCategoryOrder();
    } catch (error) {
        console.error("앱 초기화 중 오류:", error);
        // 오류 발생 시 기존 로드 메서드로 복구 시도
        try {
            await loadCategories();
            await loadMenuData();
            updateMenuDisplay();
            

            // 복구 후에도 로컬 카테고리 순서 적용 시도
            applyLocalCategoryOrder();
        } catch (fallbackError) {
            console.error("복구 시도 실패:", fallbackError);
        }
    }
}}

// 서버에서 데이터 로드 함수 (초기화 시와 백그라운드 업데이트에 모두 사용)
async function loadServerData(isInitialLoad = true) {
    // 타임스탬프 생성 (캐시 방지)
    const timestamp = new Date().getTime();
    console.log(
        `loadServerData 호출 (초기 로드: ${isInitialLoad}, 장치: ${
            isMobileDevice() ? "모바일" : "PC"
        }, 네트워크: ${navigator.onLine ? "온라인" : "오프라인"})`
    );

    try {
        // 로컬 스토리지에서 카테고리 순서 먼저 로드
        const savedCategories = loadCategoryOrderFromLocalStorage();
        console.log("로컬 스토리지에서 로드한 카테고리 순서:", savedCategories);

        // 로컬 저장된 카테고리가 있으면 먼저 UI 초기화 (빠른 렌더링 위해)
        if (savedCategories && savedCategories.length > 0 && isInitialLoad) {
            console.log("로컬 스토리지의 카테고리 순서로 UI 초기화");
            updateCategorySelects(savedCategories);
            renderCategoryList(savedCategories);
            // 메뉴 데이터가 있을 경우 해당 순서에 맞게 표시
            if (Object.keys(menuData).length > 0) {
                updateMenuDisplay(savedCategories);
            }
        }

        // 네트워크 연결 확인
        if (!navigator.onLine) {
            console.warn("오프라인 상태: 로컬 스토리지의 데이터만 사용합니다.");
            showOfflineNotification();
            applyLocalCategoryOrder();
            return;
        }

        // 타임아웃 컨트롤러 설정
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            // 카테고리 목록과 메뉴 데이터를 병렬로 요청 (시간 단축)
            const [categoriesResponse, menuResponse] = await Promise.all([
                fetch(
                    `${API_BASE_URL}/api/categories/order?t=${timestamp}&device=${
                        isMobileDevice() ? "mobile" : "pc"
                    }`,
                    {
                        headers: {
                            "Cache-Control":
                                "no-cache, no-store, must-revalidate",
                            Pragma: "no-cache",
                        },
                        signal: controller.signal,
                    }
                ),
                fetch(
                    `${API_BASE_URL}/api/menu?t=${timestamp}&device=${
                        isMobileDevice() ? "mobile" : "pc"
                    }`,
                    {
                        headers: {
                            "Cache-Control":
                                "no-cache, no-store, must-revalidate",
                            Pragma: "no-cache",
                        },
                        signal: controller.signal,
                    }
                ),
            ]);

            // 타임아웃 클리어
            clearTimeout(timeoutId);

            // 메뉴 데이터 응답 처리
            if (menuResponse.ok) {
                menuData = await menuResponse.json();
                console.log(
                    "서버에서 메뉴 데이터 로드 성공:",
                    Object.keys(menuData)
                );

                // 로컬 스토리지에 메뉴 데이터 캐시 저장
                try {
                    localStorage.setItem(
                        "bariosk_menu_data",
                        JSON.stringify(menuData)
                    );
                    localStorage.setItem(
                        "bariosk_menu_data_time",
                        Date.now().toString()
                    );
                    console.log("메뉴 데이터를 로컬 스토리지에 캐시함");
                } catch (cacheError) {
                    console.warn("메뉴 데이터 캐시 저장 실패:", cacheError);
                }
            } else {
                console.error("메뉴 데이터 로드 실패:", menuResponse.status);
                // 오류 시 로컬 캐시 확인
                const cachedMenuData =
                    localStorage.getItem("bariosk_menu_data");
                if (cachedMenuData) {
                    try {
                        menuData = JSON.parse(cachedMenuData);
                        console.log(
                            "로컬 캐시에서 메뉴 데이터 복구:",
                            Object.keys(menuData)
                        );
                    } catch (e) {
                        console.error("캐시 메뉴 데이터 파싱 오류:", e);
                        menuData = {};
                    }
                } else {
                    console.error("메뉴 데이터를 불러올 수 없고 캐시도 없음");
                    menuData = {};
                }
            }
        } catch (fetchError) {
            // 타임아웃 클리어
            clearTimeout(timeoutId);

            // 타임아웃이나 네트워크 오류 발생 시
            console.error("서버 요청 중 오류:", fetchError);

            // 로컬 캐시에서 메뉴 데이터 복구 시도
            const cachedMenuData = localStorage.getItem("bariosk_menu_data");
            if (cachedMenuData) {
                try {
                    menuData = JSON.parse(cachedMenuData);
                    console.log(
                        "로컬 캐시에서 메뉴 데이터 복구 (오류 발생 시)"
                    );
                } catch (e) {
                    console.error("캐시 메뉴 데이터 파싱 오류:", e);
                }
            }
        }

        // 데이터 로드 후 항상 로컬 카테고리 순서 유지
        if (isInitialLoad) {
            applyLocalCategoryOrder();
        } else {
            console.log("백그라운드 로드에서도 카테고리 순서 업데이트");
            applyLocalCategoryOrder(); // 백그라운드 로드에서도 카테고리 순서 적용
        }
    } catch (error) {
        console.error("서버 데이터 로드 중 오류:", error);

        // 오류 발생 시 로컬 스토리지에서 복구 시도
        const savedCategories = loadCategoryOrderFromLocalStorage();
        if (savedCategories && savedCategories.length > 0 && isInitialLoad) {
            console.log("오류 발생으로 로컬 스토리지 사용:", savedCategories);
            updateCategorySelects(savedCategories);
            renderCategoryList(savedCategories);
            updateMenuDisplay(savedCategories);
        } else {
            throw error; // 복구 실패 시 상위 함수에서 처리하도록 오류 전파
        }
    }
}

// 카테고리 목록 로드
async function loadCategories() {
    try {
        console.log("카테고리 목록 로딩 시작");
        // 캐시 방지를 위한 타임스탬프 추가
        const timestamp = new Date().getTime();
        const url = `${API_BASE_URL}/api/categories/order?t=${timestamp}`;
        console.log(`API URL에서 카테고리 목록 로드 시도: ${url}`);

        // 먼저 로컬 스토리지에서 저장된 카테고리 가져오기
        const savedCategories = loadCategoryOrderFromLocalStorage();
        console.log("로컬 스토리지에서 로드한 카테고리:", savedCategories);

        // 서버에서 카테고리 목록 로드 시도
        let serverCategories = [];
        try {
            // 서버에서 카테고리 목록 로드 (캐시 방지 헤더 추가)
            const response = await apiRequest(
                url,
                {
                    headers: {
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        Pragma: "no-cache",
                    },
                },
                3
            ); // 재시도 횟수 증가

            const data = await response.json();

            // 새로운 API 응답 형식 확인: { categories: [...], timestamp: ... }
            serverCategories = Array.isArray(data)
                ? data
                : data.categories || [];

            // 응답에 추가 정보가 있으면 로깅
            if (data.timestamp) {
                console.log(
                    `서버 응답 시간: ${new Date(
                        data.timestamp * 1000
                    ).toLocaleString()}`
                );
            }
            if (data.server) {
                console.log(`응답 서버: ${data.server}`);
            }

            console.log("서버에서 카테고리 목록 로드 응답:", serverCategories);
        } catch (serverError) {
            console.error("서버에서 카테고리 로드 실패:", serverError);
            serverCategories = [];
        }

        // 결과적으로 사용할 카테고리 목록 결정
        let finalCategories = [];

        // 1. 서버에서 받은 카테고리가 있으면 사용
        if (serverCategories && serverCategories.length > 0) {
            console.log("서버 카테고리 목록 사용");
            finalCategories = [...serverCategories];
        }
        // 2. 서버 응답이 비어있고 로컬 스토리지에 저장된 것이 있으면 사용
        else if (savedCategories && savedCategories.length > 0) {
            console.log("서버 응답이 없어 로컬 스토리지 카테고리 사용");
            finalCategories = [...savedCategories];

            // 서버에 카테고리 순서 동기화 요청 (백그라운드)
            try {
                fetch(`${API_BASE_URL}/api/categories/order`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        Pragma: "no-cache",
                    },
                    body: JSON.stringify({ categories: finalCategories }),
                })
                    .then((response) => {
                        console.log(
                            "로컬 카테고리 순서 서버 동기화 결과:",
                            response.status
                        );
                    })
                    .catch((error) => {
                        console.warn(
                            "로컬 카테고리 순서 서버 동기화 실패:",
                            error
                        );
                    });
            } catch (syncError) {
                console.warn("카테고리 순서 동기화 요청 실패:", syncError);
            }
        }
        // 3. 서버 응답도 없고 로컬 스토리지도 없지만 메뉴 데이터가 있으면 그 키를 사용
        else if (Object.keys(menuData).length > 0) {
            finalCategories = Object.keys(menuData);
            console.log("로컬 menuData의 카테고리 사용:", finalCategories);
        }
        // 4. 아무것도 없으면 기본 카테고리 사용
        else {
            finalCategories = ["기본 카테고리"];
            console.log("기본 카테고리 사용:", finalCategories);
        }

        // 결정된 카테고리 순서를 로컬 스토리지에 저장 (백업)
        if (finalCategories.length > 0) {
            saveCategoryOrderToLocalStorage(finalCategories);
            console.log(
                "최종 카테고리 목록을 로컬 스토리지에 저장:",
                finalCategories
            );
        }

        // UI 업데이트
        updateCategorySelects(finalCategories);
        renderCategoryList(finalCategories);

        console.log("카테고리 목록 로드 및 렌더링 완료:", finalCategories);
        return finalCategories;
    } catch (error) {
        console.error("카테고리 목록 로드 중 오류:", error);

        // 오류 발생 시 로컬 스토리지에서 복구 시도
        const savedCategories = loadCategoryOrderFromLocalStorage();
        if (savedCategories && savedCategories.length > 0) {
            console.log(
                "오류 발생으로 로컬 스토리지의 카테고리 순서 사용:",
                savedCategories
            );
            updateCategorySelects(savedCategories);
            renderCategoryList(savedCategories);
            return savedCategories;
        }

        // 로컬 스토리지에도 없으면 menuData의 카테고리 사용
        const localCategories = Object.keys(menuData);
        if (localCategories.length > 0) {
            console.log(
                "오류 발생으로 로컬 menuData의 카테고리 사용:",
                localCategories
            );
            updateCategorySelects(localCategories);
            renderCategoryList(localCategories);
            return localCategories;
        }

        if (
            error.message.includes("Failed to fetch") ||
            error.message.includes("요청 시간이 초과")
        ) {
            alert(
                "서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요."
            );
        } else {
            alert(
                "카테고리 목록을 불러오는 중 오류가 발생했습니다: " +
                    error.message
            );
        }
        return ["기본 카테고리"];
    }
}

// 카테고리 선택 옵션 업데이트
function updateCategorySelects(categories) {
    const categorySelects = document.querySelectorAll(
        'select[name="category"]'
    );

    categorySelects.forEach((select) => {
        select.innerHTML = categories
            .map(
                (category) => `<option value="${category}">${category}</option>`
            )
            .join("");
    });
}

// 카테고리 목록 렌더링
function renderCategoryList(categories) {
    const categoryList = document.getElementById("categoryList");
    if (!categoryList) return;

    // 관리자 모드일 때만 드래그 가능하도록 설정
    const dragEnabled = isAdminMode;

    console.log("카테고리 목록 렌더링 (관리자 모드: " + isAdminMode + ")");
    console.log("렌더링할 카테고리 목록:", categories);

    categoryList.innerHTML = categories
        .map(
            (category, index) => `
        <li class="category-item" data-category="${category}" data-index="${index}" draggable="${dragEnabled}">
            <div class="category-content">
                ${dragEnabled ? '<span class="drag-handle">↕</span>' : ""}
                <span class="category-name">${category}</span>
            </div>
            <div class="category-actions">
                <button class="edit-category" data-category="${category}">수정</button>
                <button class="delete-category" data-category="${category}">삭제</button>
            </div>
        </li>
    `
        )
        .join("");

    // 드래그 앤 드롭 이벤트 리스너 추가 (관리자 모드일 때만)
    if (dragEnabled) {
        console.log("관리자 모드: 드래그 앤 드롭 이벤트 리스너 추가");
        const categoryItems = categoryList.querySelectorAll(".category-item");
        categoryItems.forEach((item) => {
            item.addEventListener("dragstart", handleCategoryDragStart);
            item.addEventListener("dragover", handleCategoryDragOver);
            item.addEventListener("dragleave", handleCategoryDragLeave);
            item.addEventListener("drop", handleCategoryDrop);
            item.addEventListener("dragend", handleCategoryDragEnd);
        });
    } else {
        console.log("사용자 모드: 드래그 앤 드롭 비활성화");
    }

    // 카테고리 수정 버튼 이벤트 리스너
    document.querySelectorAll(".edit-category").forEach((button) => {
        button.addEventListener("click", (e) => {
            const category = e.target.getAttribute("data-category");
            const li = e.target.closest("li");
            const nameSpan = li.querySelector(".category-name");

            const input = document.createElement("input");
            input.type = "text";
            input.className = "edit-category-input";
            input.value = category;

            const saveButton = document.createElement("button");
            saveButton.textContent = "저장";
            saveButton.className = "save-category";

            const cancelButton = document.createElement("button");
            cancelButton.textContent = "취소";
            cancelButton.className = "cancel-edit";

            const buttonContainer = document.createElement("div");
            buttonContainer.className = "edit-buttons";
            buttonContainer.appendChild(saveButton);
            buttonContainer.appendChild(cancelButton);

            // 원래 버튼들을 숨기고 입력 필드와 새 버튼들을 표시
            const actionsDiv = li.querySelector(".category-actions");
            actionsDiv.style.display = "none";
            nameSpan.replaceWith(input);
            li.appendChild(buttonContainer);

            // 저장 버튼 클릭 이벤트
            saveButton.addEventListener("click", async () => {
                const newName = input.value.trim();
                if (!newName) {
                    alert("카테고리 이름을 입력해주세요.");
                    return;
                }

                try {
                    const response = await apiRequest(
                        `${API_BASE_URL}/api/categories/${encodeURIComponent(
                            category
                        )}`,
                        {
                            method: "PUT",
                            body: JSON.stringify({ name: newName }),
                        }
                    );

                    const data = await response.json();

                    // 서버 응답 메시지에 따라 다른 동작 수행
                    if (data.message === "이미 존재하는 카테고리 이름입니다") {
                        alert("이미 존재하는 카테고리 이름입니다.");
                        input.replaceWith(nameSpan);
                        buttonContainer.remove();
                        actionsDiv.style.display = "flex";
                    } else if (
                        data.message === "카테고리 이름이 변경되지 않았습니다"
                    ) {
                        alert("카테고리 이름이 변경되지 않았습니다.");
                        input.replaceWith(nameSpan);
                        buttonContainer.remove();
                        actionsDiv.style.display = "flex";
                    } else {
                        await loadCategories();
                        await loadMenuData();
                        alert("카테고리가 수정되었습니다.");
                    }
                } catch (error) {
                    console.error("카테고리 수정 중 오류:", error);
                    alert(
                        "카테고리 수정 중 오류가 발생했습니다: " + error.message
                    );
                    input.replaceWith(nameSpan);
                    buttonContainer.remove();
                    actionsDiv.style.display = "flex";
                }
            });

            // 취소 버튼 클릭 이벤트
            cancelButton.addEventListener("click", () => {
                input.replaceWith(nameSpan);
                buttonContainer.remove();
                actionsDiv.style.display = "flex";
            });
        });
    });

    // 카테고리 삭제 버튼 이벤트 리스너
    document.querySelectorAll(".delete-category").forEach((button) => {
        button.addEventListener("click", async (e) => {
            const category = e.target.getAttribute("data-category");

            if (confirm(`정말로 "${category}" 카테고리를 삭제하시겠습니까?`)) {
                try {
                    await apiRequest(
                        `${API_BASE_URL}/api/categories/${encodeURIComponent(
                            category
                        )}`,
                        {
                            method: "DELETE",
                        }
                    );

                    await loadCategories();
                    await loadMenuData();
                    alert("카테고리가 삭제되었습니다.");
                } catch (error) {
                    console.error("카테고리 삭제 중 오류:", error);
                    alert(
                        "카테고리 삭제 중 오류가 발생했습니다: " + error.message
                    );
                }
            }
        });
    });
}

// 온도 표시 텍스트 생성 함수
function getTemperatureText(temperature) {
    if (temperature === "H") return "(H)";
    if (temperature === "I") return "(I)";
    return "";
}

// 메뉴 데이터 로드
async function loadMenuData() {
    try {
        console.log("메뉴 데이터 로딩 시작");
        const startTime = performance.now();

        // 로컬 스토리지에서 캐시된 메뉴 데이터 확인
        const cachedMenuData = localStorage.getItem("bariosk_menu_data");
        const cacheTime = localStorage.getItem("bariosk_menu_data_time");

        if (cachedMenuData && cacheTime) {
            const cacheAge = (Date.now() - parseInt(cacheTime)) / 1000;
            console.log(
                "메뉴 데이터 캐시 발견 (나이:",
                cacheAge.toFixed(0),
                "초)"
            );

            // 캐시가 1시간 이내이면 사용
            if (cacheAge < 3600) {
                console.log("캐시된 메뉴 데이터 사용");
                menuData = JSON.parse(cachedMenuData);

                // 백그라운드에서 최신 데이터 로드 (UI는 이미 표시됨)
                setTimeout(() => refreshMenuData(), 1000);

                // 로컬 스토리지의 카테고리 순서에 맞게 UI 업데이트
                const savedCategories = loadCategoryOrderFromLocalStorage();
                if (savedCategories && savedCategories.length > 0) {
                    loadCategoriesAndUpdateDisplay();
                }

                console.log(
                    `캐시된 메뉴 데이터 로드 완료: ${(
                        performance.now() - startTime
                    ).toFixed(0)}ms`
                );
                return menuData;
            }
        }

        // 캐시가 없거나 오래된 경우 서버에서 로드
        return await refreshMenuData();
    } catch (error) {
        console.error("메뉴 데이터 로드 중 오류:", error);

        // 이미 메뉴 데이터가 있으면 그대로 사용
        if (Object.keys(menuData).length > 0) {
            console.log("오류 발생으로 기존 메뉴 데이터 유지");
            loadCategoriesAndUpdateDisplay();
            return menuData;
        }

        // 메뉴 데이터가 없는 경우 카테고리만이라도 설정
        try {
            const categories = await loadCategories();
            console.log("카테고리에서 빈 메뉴 데이터 생성:", categories);
            for (const category of categories) {
                menuData[category] = [];
            }
            loadCategoriesAndUpdateDisplay();
        } catch (catError) {
            console.error("카테고리 및 메뉴 데이터 모두 로드 실패");
            alert("메뉴 데이터를 불러오는데 실패했습니다: " + error.message);
        }

        return menuData;
    }
}

// 서버에서 최신 메뉴 데이터 새로고침
async function refreshMenuData() {
    const startTime = performance.now();
    try {
        const url = `${API_BASE_URL}/api/menu?t=${Date.now()}`;
        console.log(`API URL에서 최신 메뉴 데이터 로드 시도: ${url}`);

        const response = await apiRequest(url);
        const data = await response.json();

        console.log(
            `최신 메뉴 데이터 로드 완료: ${(
                performance.now() - startTime
            ).toFixed(0)}ms`
        );
        console.log("새로운 메뉴 데이터:", Object.keys(data));

        // 메뉴 데이터 업데이트
        menuData = data;

        // 로컬 스토리지에서 카테고리 순서 확인
        const savedCategories = loadCategoryOrderFromLocalStorage();
        if (savedCategories && savedCategories.length > 0) {
            console.log(
                "로컬 스토리지에서 카테고리 순서 사용:",
                savedCategories
            );

            // 서버에서 새로 추가된 카테고리 확인하여 추가
            const allCategories = [...savedCategories];
            Object.keys(menuData).forEach((category) => {
                if (!allCategories.includes(category)) {
                    allCategories.push(category);
                    console.log("새 카테고리 발견하여 추가:", category);
                }
            });

            // 메뉴 데이터에 없는 카테고리 필터링
            const finalCategories = allCategories.filter((category) =>
                Object.keys(menuData).includes(category)
            );

            // 로컬 스토리지에 업데이트된 카테고리 순서 저장
            if (finalCategories.length !== savedCategories.length) {
                saveCategoryOrderToLocalStorage(finalCategories);
                console.log("업데이트된 카테고리 순서 저장:", finalCategories);
            }

            // UI 업데이트
            updateCategorySelects(finalCategories);
            renderCategoryList(finalCategories);
            updateMenuDisplay(finalCategories);
        } else {
            // 로컬에 저장된 순서가 없으면 현재 메뉴 데이터의 카테고리 키 순서 사용
            const currentCategories = Object.keys(menuData);
            console.log(
                "현재 메뉴 데이터의 카테고리 순서 사용:",
                currentCategories
            );

            // 로컬 스토리지에 저장
            saveCategoryOrderToLocalStorage(currentCategories);

            // UI 업데이트
            updateCategorySelects(currentCategories);
            renderCategoryList(currentCategories);
            updateMenuDisplay(currentCategories);
        }

        // 로컬 스토리지에 메뉴 데이터 캐싱
        try {
            localStorage.setItem("bariosk_menu_data", JSON.stringify(menuData));
            localStorage.setItem(
                "bariosk_menu_data_time",
                Date.now().toString()
            );
            console.log("메뉴 데이터를 로컬 스토리지에 캐시함");
        } catch (storageError) {
            console.warn("메뉴 데이터 캐시 저장 실패:", storageError);
        }

        return menuData;
    } catch (error) {
        console.error("최신 메뉴 데이터 로드 실패:", error);
        throw error;
    }
}

// 카테고리 로드 후 메뉴 업데이트 함수
async function loadCategoriesAndUpdateDisplay() {
    try {
        // 정렬된 카테고리 목록 가져오기
        const sortedCategories = await loadCategories();
        console.log("정렬된 카테고리 순서로 메뉴 업데이트:", sortedCategories);

        // 정렬된 카테고리 순서로 메뉴 표시 업데이트
        updateMenuDisplay(sortedCategories);
    } catch (error) {
        console.error("카테고리 로드 후 메뉴 업데이트 실패:", error);
        // 오류 발생 시 기본 메뉴 표시
        updateMenuDisplay();
    }
}

// 메뉴 표시 업데이트 - 카테고리 순서 문제 해결을 위해 전면 수정
function updateMenuDisplay(sortedCategories = null) {
    const menuContainer = document.getElementById("menuContainer");

    console.log('debuginginigggg')

    // 디버깅 정보 출력
    console.log("메뉴 표시 업데이트 호출됨 (관리자 모드:", isAdminMode, ")");
    console.log(
        "현재 menuData 상태:",
        menuData ? Object.keys(menuData) : "없음"
    );

    // 메뉴 데이터가 비어있으면 로드 시도
    if (!menuData || Object.keys(menuData).length === 0) {
        console.log("메뉴 데이터가 비어있어 다시 로드 시도");
        (async () => {
            try {
                await loadMenuData();
                updateMenuDisplay(sortedCategories);
            } catch (error) {
                console.error("빈 메뉴 데이터 로드 시도 중 오류:", error);
            }
        })();
        return; // 함수 종료하고 비동기 로드 기다림
    }

    // 메뉴 컨테이너 초기화
    menuContainer.innerHTML = "";

    try {
        // 카테고리 순서 결정
        let categories = [];

        // 1. 파라미터로 전달된 순서가 있으면 우선 사용
        if (sortedCategories && sortedCategories.length > 0) {
            console.log("전달된 카테고리 순서 사용:", sortedCategories);
            categories = [...sortedCategories];
        }
        // 2. 로컬 스토리지에 저장된 순서가 있으면 사용
        else {
            const savedCategories = loadCategoryOrderFromLocalStorage();
            if (savedCategories && savedCategories.length > 0) {
                console.log(
                    "로컬 스토리지의 카테고리 순서 사용:",
                    savedCategories
                );
                categories = [...savedCategories];
            }
            // 3. 없으면 menuData의 키 순서 사용
            else {
                console.log("menuData의 키 순서 사용");
                categories = Object.keys(menuData);
            }
        }

        // 메뉴 데이터에 없는 카테고리 필터링
        categories = categories.filter((category) =>
            menuData.hasOwnProperty(category)
        );

        // 메뉴 데이터에는 있지만 순서 목록에 없는 카테고리 추가
        Object.keys(menuData).forEach((category) => {
            if (!categories.includes(category)) {
                categories.push(category);
                console.log(`누락된 카테고리 추가: ${category}`);
            }
        });

        console.log("최종 표시 카테고리 순서:", categories);

        // 카테고리 순서에 맞게 메뉴 섹션 생성
        let anyMenuDisplayed = false;

        for (const category of categories) {
            // 해당 카테고리가 menuData에 없으면 건너뛰기
            if (!menuData[category]) {
                console.log(
                    `카테고리 '${category}'의 메뉴 데이터 없음, 건너뜀`
                );
                continue;
            }

            console.log(
                `카테고리 '${category}' 메뉴 항목 수:`,
                menuData[category].length
            );
            anyMenuDisplayed = true;

            const categorySection = document.createElement("div");
            categorySection.className = "menu-section";
            categorySection.id = `category-${category}`;

            // 카테고리 제목
            const categoryTitle = document.createElement("h2");
            categoryTitle.textContent = category;
            categorySection.appendChild(categoryTitle);

            // 메뉴 그리드 생성
            const menuGrid = document.createElement("div");
            menuGrid.className = "menu-grid";

            // 각 메뉴 아이템 추가
            menuData[category].forEach((menu) => {
                if (!menu.category) {
                    menu.category = category;
                }

                const menuItem = createMenuItem(menu);
                menuGrid.appendChild(menuItem);
            });

            categorySection.appendChild(menuGrid);
            menuContainer.appendChild(categorySection);
        }

        // 메뉴가 하나도 표시되지 않은 경우 메시지 표시
        if (!anyMenuDisplayed) {
            console.warn("표시할 메뉴가 없음");
            menuContainer.innerHTML = `
                <div class="empty-menu-message">
                    <p>표시할 메뉴가 없습니다. ${
                        isAdminMode
                            ? "카테고리를 추가하고 메뉴를 등록해보세요."
                            : "메뉴를 준비 중입니다."
                    }</p>
                </div>
            `;
        }
    } catch (error) {
        console.error("메뉴 표시 업데이트 중 오류:", error);
        menuContainer.innerHTML = `
            <div class="error-message">
                <p>메뉴를 표시하는 중 오류가 발생했습니다: ${error.message}</p>
            </div>
        `;
    }

    // 이벤트 리스너 추가
    if (isAdminMode) {
        // 수정 버튼 클릭 이벤트
        document.querySelectorAll(".edit-btn").forEach((button) => {
            button.addEventListener("click", () => {
                const menuId = button.getAttribute("data-id");
                const category = button.getAttribute("data-category");
                const menu = menuData[category].find(
                    (item) => item.id === parseInt(menuId)
                );
                if (menu) {
                    showEditForm(menu, category);
                }
            });
        });
    } else {
        // 장바구니 추가 버튼 클릭 이벤트를 위한 이벤트 리스너 추가
        addMenuEventListeners();
    }
}

// 관리자 모드 토글 시 메뉴 표시 업데이트
function toggleAdminMode() {
    isAdminMode = !isAdminMode;
    const adminPanel = document.getElementById("adminPanel");
    const logo = document.getElementById("logo");

    // 관리자 모드 상태를 로컬 스토리지에 저장
    localStorage.setItem("bariosk_admin_mode", isAdminMode.toString());
    console.log("관리자 모드 상태 변경:", isAdminMode ? "활성화" : "비활성화");

    if (adminPanel) {
        adminPanel.style.display = isAdminMode ? "block" : "none";
    }

    if (logo) {
        logo.style.border = isAdminMode ? "2px solid red" : "none";
        logo.style.padding = isAdminMode ? "2px" : "0";
    }

    // 관리자 모드 전환 시 카테고리 목록 바로 다시 렌더링
    const savedCategories = loadCategoryOrderFromLocalStorage();
    if (savedCategories && savedCategories.length > 0) {
        console.log("관리자 모드 전환 후 카테고리 목록 다시 렌더링");
        renderCategoryList(savedCategories);
    }

    // 메뉴 데이터와 카테고리 다시 로드
    (async () => {
        try {
            // 메뉴 데이터 먼저 로드
            console.log("관리자 모드 전환 후 메뉴 데이터 다시 로드 시도");
            const timestamp = new Date().getTime();
            const menuResponse = await fetch(
                `${API_BASE_URL}/api/menu?t=${timestamp}`,
                {
                    headers: {
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        Pragma: "no-cache",
                    },
                }
            );

            if (menuResponse.ok) {
                menuData = await menuResponse.json();
                console.log(
                    "관리자 모드 전환 후 메뉴 데이터 로드 성공:",
                    Object.keys(menuData)
                );

                // 카테고리 로드 후 메뉴 표시 업데이트
                const categories = await loadCategories();
                console.log("관리자 모드 전환 후 로드된 카테고리:", categories);

                // 카테고리 목록 다시 렌더링 (관리자 모드 반영을 위해)
                renderCategoryList(categories);

                // 메뉴 표시 업데이트
                updateMenuDisplay(categories);
            } else {
                console.error("관리자 모드 전환 후 메뉴 데이터 로드 실패");

                // 카테고리 목록 다시 로드하고 메뉴 표시 업데이트
                await loadCategoriesAndUpdateDisplay();
            }
        } catch (error) {
            console.error("관리자 모드 전환 중 오류:", error);
            // 오류 발생 시 기존 방식으로 로드
            await loadCategoriesAndUpdateDisplay();
        }
    })();
}

// 메뉴 아이템 복제 함수
async function cloneMenuItem(item, category) {
    try {
        console.log("메뉴 복제 시도:", item, "카테고리:", category);

        // 항목 또는 카테고리가 없는 경우 오류
        if (!item) {
            throw new Error("복제할 메뉴 항목이 없습니다");
        }

        // 카테고리가 전달되지 않았을 경우 항목에서 가져오기
        if (!category && item.category) {
            category = item.category;
            console.log("항목에서 카테고리 가져옴:", category);
        }

        if (!category) {
            throw new Error("카테고리 정보가 없어 메뉴를 복제할 수 없습니다");
        }

        // 메뉴 데이터에서 해당 카테고리 확인
        if (!menuData[category]) {
            console.warn(`카테고리 '${category}'가 menuData에 없음`);
            menuData[category] = [];
        }

        // Create a new item with the same data but a new name
        const newItem = {
            ...item,
            name: `${item.name}`,
            id: undefined, // Remove the ID so a new one will be generated
            category: category, // 카테고리 명시적 설정
        };

        // Create FormData for the request
        const formData = new FormData();
        formData.append("category", category);
        formData.append("name", newItem.name);
        formData.append("price", item.price);
        formData.append("temperature", item.temperature || "");

        // If there's an image, fetch it and append it
        if (item.image) {
            try {
                const imageResponse = await fetch(
                    `${API_BASE_URL}/static/images/${item.image}`
                );
                const imageBlob = await imageResponse.blob();
                formData.append("image", imageBlob, "image.jpg");
            } catch (error) {
                console.error("이미지 가져오기 오류:", error);
                // Continue without the image if there's an error
            }
        }

        console.log("메뉴 복제 API 요청:", `${API_BASE_URL}/api/menu`);
        const response = await fetch(`${API_BASE_URL}/api/menu`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            // 응답이 JSON이 아닐 수 있으므로 안전하게 처리
            try {
                const errorData = await response.json();
                throw new Error(errorData.error || "메뉴 복제 실패");
            } catch (jsonError) {
                console.error("JSON 파싱 오류:", jsonError);
                throw new Error(
                    `메뉴 복제 실패 (상태 코드: ${response.status})`
                );
            }
        }

        // 응답 처리
        try {
            const result = await response.json();
            console.log("메뉴 복제 성공:", result);
        } catch (jsonError) {
            console.warn(
                "복제 성공 응답 처리 중 JSON 파싱 오류 (무시됨):",
                jsonError
            );
        }

        // Refresh the menu display
        await loadMenuData();

        // Show success message
        alert("메뉴가 복제되었습니다");
    } catch (error) {
        console.error("메뉴 복제 중 오류:", error);
        alert(error.message || "메뉴 복제에 실패했습니다");
    }
}

// 메뉴 삭제 함수
async function deleteMenuItem(menuId, category) {
    if (confirm("정말로 이 메뉴를 삭제하시겠습니까?")) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/menu/${menuId}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                // 응답이 JSON이 아닐 수 있으므로 안전하게 처리
                try {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "메뉴 삭제 실패");
                } catch (jsonError) {
                    console.error("JSON 파싱 오류:", jsonError);
                    throw new Error(
                        `메뉴 삭제 실패 (상태 코드: ${response.status})`
                    );
                }
            }

            // 메뉴 데이터 새로고침
            await loadMenuData();
            alert("메뉴가 삭제되었습니다.");
        } catch (error) {
            console.error("Error:", error);
            if (error.message.includes("Failed to fetch")) {
                alert(
                    "서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요."
                );
            } else {
                alert("메뉴 삭제 중 오류가 발생했습니다: " + error.message);
            }
        }
    }
}

// 메뉴 드래그 앤 드롭 처리 함수
async function handleDrop() {
    this.classList.remove("drag-over");
    const dragEndIndex = Array.from(this.parentNode.children).indexOf(this);
    const category = this.dataset.category;

    if (dragStartIndex !== dragEndIndex) {
        // 메뉴 데이터 업데이트
        const items = menuData[category];
        const [movedItem] = items.splice(dragStartIndex, 1);
        items.splice(dragEndIndex, 0, movedItem);

        // 메뉴 항목의 order_index 명시적 업데이트
        for (let i = 0; i < items.length; i++) {
            items[i].order_index = i;
        }

        console.log(
            `메뉴 순서 변경: 카테고리 '${category}'에서 인덱스 ${dragStartIndex}에서 ${dragEndIndex}로`
        );
        console.log(
            "업데이트된 메뉴 순서:",
            items.map((item) => `${item.name} (order: ${item.order_index})`)
        );

        // 변경된 데이터 저장
        try {
            const response = await fetch(`${API_BASE_URL}/api/menu`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    Pragma: "no-cache",
                },
                body: JSON.stringify(menuData),
            });

            if (!response.ok) {
                // 응답이 JSON이 아닐 수 있으므로 안전하게 처리
                try {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "메뉴 순서 저장 실패");
                } catch (jsonError) {
                    console.error("JSON 파싱 오류:", jsonError);
                    throw new Error(
                        `메뉴 순서 저장 실패 (상태 코드: ${response.status})`
                    );
                }
            }

            console.log("메뉴 순서 업데이트 성공");

            // 서버에서 메뉴 데이터 다시 로드
            await loadMenuData();
        } catch (error) {
            console.error("메뉴 순서 저장 오류:", error);
            alert("메뉴 순서 저장 중 오류가 발생했습니다: " + error.message);
        }
    }
}

// 메뉴 아이템 생성
function createMenuItem(item) {
    const menuItem = document.createElement("div");
    menuItem.className = "menu-item";
    menuItem.draggable = isAdminMode;
    menuItem.dataset.id = item.id;
    menuItem.dataset.category = item.category;

    const adminControls = isAdminMode
        ? `
        <div class="admin-controls">
            <button class="edit-btn" data-id="${item.id}" data-category="${
              item.category
          }">수정</button>
            <button class="clone-btn" onclick="cloneMenuItem(${JSON.stringify(
                item
            ).replace(/"/g, "&quot;")}, '${item.category}')">복제</button>
            <button class="delete-btn" onclick="deleteMenuItem(${item.id}, '${
              item.category
          }')">삭제</button>
        </div>
        `
        : "";

    // 담기 버튼에서 직접 onclick 속성을 제거하고 대신 data-id만 설정
    const addToCartButton = !isAdminMode
        ? `<button class="add-to-cart" data-id="${item.id}">담기</button>`
        : "";

    menuItem.innerHTML = `
        <img src="${API_BASE_URL}/static/images/${
        item.image || "logo.png"
    }" alt="${
        item.name
    }" onerror="this.src='${API_BASE_URL}/static/images/logo.png'">
        <div class="menu-info">
            <h3>${item.name}</h3>
            <p class="price">${item.price.toLocaleString()}원</p>
            <p class="temperature">${getTemperatureText(item.temperature)}</p>
        </div>
        ${adminControls}
        ${addToCartButton}
    `;

    if (isAdminMode) {
        menuItem.addEventListener("dragstart", handleDragStart);
        menuItem.addEventListener("dragover", handleDragOver);
        menuItem.addEventListener("dragenter", handleDragEnter);
        menuItem.addEventListener("dragleave", handleDragLeave);
        menuItem.addEventListener("drop", handleDrop);
        menuItem.addEventListener("dragend", handleDragEnd);
    }

    return menuItem;
}

// 수정 폼 표시
function showEditForm(menu, category) {
    const editForm = document.getElementById("editMenuForm");
    const editMenuId = document.getElementById("editMenuId");
    const editCategory = document.getElementById("editCategory");
    const editName = document.getElementById("editName");
    const editTemperature = document.getElementById("editTemperature");
    const editPrice = document.getElementById("editPrice");
    const editImage = document.getElementById("editImage");
    const deleteMenuBtn = document.getElementById("deleteMenu");
    const cloneMenuBtn = document.getElementById("cloneMenu");

    editMenuId.value = menu.id;
    editCategory.value = category;
    editName.value = menu.name;
    editTemperature.value = menu.temperature || " ";
    editPrice.value = menu.price;
    editImage.value = ""; // 이미지 입력 필드 초기화

    // 삭제 버튼에 이벤트 리스너 추가
    deleteMenuBtn.onclick = async () => {
        if (confirm(`정말로 "${menu.name}" 메뉴를 삭제하시겠습니까?`)) {
            try {
                const response = await fetch(
                    `${API_BASE_URL}/api/menu/${menu.id}`,
                    {
                        method: "DELETE",
                    }
                );

                if (!response.ok) {
                    throw new Error("메뉴 삭제 실패");
                }

                editForm.style.display = "none";
                loadMenuData();
                alert("메뉴가 삭제되었습니다.");
            } catch (error) {
                console.error("Error:", error);
                alert("메뉴 삭제 중 오류가 발생했습니다: " + error.message);
            }
        }
    };

    // 복제 버튼에 이벤트 리스너 추가
    cloneMenuBtn.onclick = async () => {
        try {
            // 폼을 먼저 숨김
            editForm.style.display = "none";

            // 현재 수정 중인 메뉴를 복제
            await cloneMenuItem(menu, category);
        } catch (error) {
            console.error("Error:", error);
            alert("메뉴 복제 중 오류가 발생했습니다: " + error.message);
        }
    };

    editForm.style.display = "block";
    editForm.scrollIntoView({ behavior: "smooth" });
}

// 장바구니에 메뉴 추가
function addToCart(menuId) {
    const menu = findMenuById(menuId);
    if (!menu) {
        console.error("Menu not found:", menuId);
        return;
    }

    console.log("Adding to cart:", menu); // 디버깅용

    const existingItem = cart.find((item) => item.id === menuId);
    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({
            id: menu.id,
            name: menu.name,
            price: menu.price,
            quantity: 1,
            temperature: menu.temperature || "",
        });
    }

    updateCart();
}

// 장바구니에서 메뉴 제거
function removeFromCart(menuId) {
    cart = cart.filter((item) => item.id !== menuId);
    updateCart();
}

// 장바구니 수량 업데이트
function updateQuantity(menuId, change) {
    const item = cart.find((item) => item.id === menuId);
    if (!item) return;

    item.quantity += change;
    if (item.quantity <= 0) {
        removeFromCart(menuId);
    } else {
        updateCart();
    }
}

// 장바구니 UI 업데이트
function updateCart() {
    const cartItems = document.getElementById("cartItems");
    const totalAmount = document.getElementById("totalAmount");
    const checkoutBtn = document.getElementById("checkoutBtn");

    cartItems.innerHTML = "";
    let total = 0;

    cart.forEach((item) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;

        const cartItem = document.createElement("div");
        cartItem.className = "cart-item";
        cartItem.innerHTML = `
            <div class="cart-item-info">
                <div>${getTemperatureText(item.temperature)}${
            getTemperatureText(item.temperature) ? " " : ""
        }${item.name}</div>
                <div>${item.price.toLocaleString()}원</div>
            </div>
            <div class="cart-item-quantity">
                <button class="quantity-btn" onclick="updateQuantity(${
                    item.id
                }, -1)">-</button>
                <span>${item.quantity}</span>
                <button class="quantity-btn" onclick="updateQuantity(${
                    item.id
                }, 1)">+</button>
            </div>
        `;
        cartItems.appendChild(cartItem);
    });

    totalAmount.textContent = `${total.toLocaleString()}원`;
    checkoutBtn.disabled = cart.length === 0;
}

// 주문서 생성 및 다운로드
async function generateReceipt() {
    const receipt = document.createElement("div");
    receipt.className = "receipt";
    receipt.style.position = "absolute";
    receipt.style.left = "-9999px";
    document.body.appendChild(receipt);

    receipt.innerHTML = `
        <div class="receipt-header">
            <h2>주문서</h2>
            <p>${new Date().toLocaleString()}</p>
        </div>
        <div class="receipt-items">
            ${cart
                .map((item) => {
                    const temperatureText = getTemperatureText(
                        item.temperature
                    );
                    return `
                        <div class="receipt-item">
                            <span>${temperatureText}${
                        temperatureText ? " " : ""
                    }${item.name} x ${item.quantity}</span>
                            <span>${(
                                item.price * item.quantity
                            ).toLocaleString()}원</span>
                        </div>
                    `;
                })
                .join("")}
        </div>
        <div class="receipt-total">
            <span>총 금액</span>
            <span>${cart
                .reduce((total, item) => total + item.price * item.quantity, 0)
                .toLocaleString()}원</span>
        </div>
        <div class="receipt-footer">
            <p>감사합니다. 또 방문해 주세요!</p>
        </div>
    `;

    try {
        const canvas = await html2canvas(receipt, {
            scale: 2,
            useCORS: true,
            logging: true,
            allowTaint: true,
        });
        const link = document.createElement("a");
        link.download = `주문서_${new Date().toISOString().slice(0, 10)}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    } catch (error) {
        console.error("Error generating receipt:", error);
        alert("주문서 생성 중 오류가 발생했습니다.");
    } finally {
        document.body.removeChild(receipt);
    }
}

// 결제 버튼 이벤트 리스너
document.getElementById("checkoutBtn").addEventListener("click", async () => {
    if (cart.length > 0) {
        if (confirm("주문서를 출력하시겠습니까?")) {
            try {
                await generateReceipt();
                cart = [];
                updateCart();
                alert("주문서 출력이 완료되었습니다. 주문서가 다운로드됩니다.");
            } catch (error) {
                console.error("Error during checkout:", error);
                alert("주문서처리 중 오류가 발생했습니다.");
            }
        }
    }
});

// 메뉴 아이템에 장바구니 추가 버튼 이벤트 리스너 추가
function addMenuEventListeners() {
    // 기존 이벤트 리스너 제거를 위해 모든 버튼에서 클론 생성 후 교체
    document.querySelectorAll(".menu-item .add-to-cart").forEach((btn) => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
    });

    // 새 이벤트 리스너 추가
    document.querySelectorAll(".menu-item .add-to-cart").forEach((btn) => {
        btn.addEventListener("click", function () {
            const menuId = parseInt(this.getAttribute("data-id"));
            console.log("장바구니 담기 버튼 클릭:", menuId);
            addToCart(menuId);
        });
    });
}

// 메뉴 ID로 메뉴 찾기
function findMenuById(menuId) {
    for (const category in menuData) {
        const menu = menuData[category].find(
            (item) => item.id === parseInt(menuId)
        );
        if (menu) {
            console.log("Found menu:", menu); // 디버깅용
            return menu;
        }
    }
    console.error("Menu not found in any category:", menuId); // 디버깅용
    return null;
}

// 드래그 앤 드롭 이벤트 핸들러
function handleDragStart(e) {
    draggedItem = this;
    dragStartIndex = Array.from(this.parentNode.children).indexOf(this);
    this.classList.add("dragging");
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDragEnter(e) {
    e.preventDefault();
    this.classList.add("drag-over");
}

function handleDragLeave() {
    this.classList.remove("drag-over");
}

function handleDragEnd() {
    this.classList.remove("dragging");
    document.querySelectorAll(".menu-item").forEach((item) => {
        item.classList.remove("drag-over");
    });
}

// 카테고리 드래그 앤 드롭 이벤트 핸들러
function handleCategoryDragStart(e) {
    console.log("카테고리 드래그 시작", this.dataset.category);
    categoryDraggedItem = this;
    categoryDragStartIndex = Array.from(this.parentNode.children).indexOf(this);
    console.log("카테고리 드래그 시작 위치:", categoryDragStartIndex);
    this.classList.add("dragging");
}

function handleCategoryDragOver(e) {
    e.preventDefault();
}

function handleCategoryDragLeave() {
    this.classList.remove("drag-over");
}

function handleCategoryDragEnd() {
    this.classList.remove("dragging");
    document.querySelectorAll(".category-item").forEach((item) => {
        item.classList.remove("drag-over");
    });
}

async function handleCategoryDrop(e) {
    e.preventDefault();
    this.classList.remove("drag-over");

    // 드롭 후 카테고리 순서 인덱스 계산
    const categoryDragEndIndex = Array.from(this.parentNode.children).indexOf(
        this
    );

    // 드래그 시작 위치가 없거나 같은 위치면 처리하지 않음
    if (
        categoryDragStartIndex === null ||
        categoryDragStartIndex === categoryDragEndIndex
    ) {
        console.log("카테고리 드롭: 위치 변경 없음");
        return;
    }

    console.log("=== 카테고리 드래그 앤 드롭 처리 시작 ===");
    console.log("관리자 모드 상태:", isAdminMode);
    console.log(
        `카테고리 순서 변경: ${categoryDragStartIndex}에서 ${categoryDragEndIndex}로`
    );

    try {
        // 카테고리 목록 구성
        const categoryList = document.getElementById("categoryList");
        const categoryItems = categoryList.querySelectorAll(".category-item");
        const categories = [];

        // 새 순서로 카테고리 목록 구성
        categoryItems.forEach((item) => {
            categories.push(item.dataset.category);
        });

        // 올바른 스왑 로직으로 수정
        [categories[categoryDragStartIndex], categories[categoryDragEndIndex]] =
            [
                categories[categoryDragEndIndex],
                categories[categoryDragStartIndex],
            ];
        console.log(`새 카테고리 순서:`, categories);

        // 로컬 스토리지에 새 순서 즉시 저장
        saveCategoryOrderToLocalStorage(categories);
        console.log("로컬 스토리지에 카테고리 순서 저장 완료");

        // UI 즉시 업데이트 (서버 응답 기다리지 않음)
        updateCategorySelects(categories);
        updateMenuDisplay(categories);

        // 카테고리 목록 다시 렌더링하여 드래그 앤 드롭 기능 유지
        renderCategoryList(categories);

        console.log("UI 업데이트 완료");

        // 서버에 카테고리 순서 저장 시 일정시간 대기 후 시도
        setTimeout(async () => {
            try {
                const serverSaveResult = await saveCategoryOrderToServer(
                    categories
                );

                if (serverSaveResult) {
                    console.log(
                        "카테고리 순서가 서버에 성공적으로 저장되었습니다."
                    );
                    // alert를 제거하여 모바일 사용성 향상

                    // 서버에서 최신 카테고리 목록 다시 가져오기
                    try {
                        const serverCategories = await fetchCategoryOrder();
                        if (serverCategories && serverCategories.length > 0) {
                            console.log(
                                "서버에서 최신 카테고리 순서 가져옴:",
                                serverCategories
                            );

                            // 서버와 로컬 순서가 다른 경우에만 UI 업데이트
                            if (
                                JSON.stringify(serverCategories) !==
                                JSON.stringify(categories)
                            ) {
                                console.log(
                                    "서버 카테고리 순서가 로컬과 다름, UI 업데이트"
                                );
                                saveCategoryOrderToLocalStorage(
                                    serverCategories
                                );
                                updateCategorySelects(serverCategories);
                                updateMenuDisplay(serverCategories);
                                renderCategoryList(serverCategories);
                            }
                        }
                    } catch (refreshError) {
                        console.warn(
                            "최신 카테고리 순서 가져오기 실패:",
                            refreshError
                        );
                    }
                } else {
                    console.warn("서버 저장 실패, 로컬만 적용됨");
                    // 모바일에서는 알림을 제거하여 사용성 향상
                }
            } catch (error) {
                console.error("카테고리 저장 지연 시도 중 오류:", error);
            }
        }, 500); // 0.5초 후에 서버 저장 시도

        console.log("=== 카테고리 드래그 앤 드롭 처리 완료 ===");
    } catch (error) {
        console.error("카테고리 순서 변경 중 오류:", error);
        alert("카테고리 순서 변경 중 오류가 발생했습니다.");
    }
}

// 페이지 초기화 시 카테고리 순서를 명시적으로 적용하는 함수
function applyCategoryOrder(categories) {
    if (!categories || categories.length === 0) {
        console.warn("적용할 카테고리 순서가 없습니다.");
        return;
    }

    console.log("카테고리 순서 강제 적용:", categories);

    // 1. UI 카테고리 선택기 업데이트
    updateCategorySelects(categories);

    // 2. 카테고리 목록 렌더링
    renderCategoryList(categories);

    // 3. 메뉴 표시를 지정된 카테고리 순서로 업데이트
    updateMenuDisplay(categories);

    console.log("카테고리 순서 적용 완료");
}

// 로컬 스토리지의 카테고리 순서를 적용하는 함수
function applyLocalCategoryOrder() {
    // 로컬 스토리지에서 카테고리 순서 가져오기
    const savedCategories = loadCategoryOrderFromLocalStorage();
    if (savedCategories && savedCategories.length > 0) {
        console.log("로컬 스토리지에서 카테고리 순서 로드:", savedCategories);

        // 메뉴 데이터에 카테고리가 있는지 확인하고 누락된 카테고리 추가
        const existingCategories = Object.keys(menuData);
        console.log("현재 메뉴 데이터의 카테고리:", existingCategories);

        // 두 배열을 병합 (로컬 순서를 유지하면서 새 카테고리 추가)
        const allCategories = [...savedCategories];

        // 메뉴 데이터에는 있지만 저장된 순서에는 없는 카테고리 추가
        existingCategories.forEach((category) => {
            if (!allCategories.includes(category)) {
                allCategories.push(category);
                console.log("새 카테고리 발견하여 추가:", category);
            }
        });

        // 메뉴 데이터에 없는 카테고리 제거
        const finalCategories = allCategories.filter((category) =>
            existingCategories.includes(category)
        );

        // 로컬 스토리지에 업데이트된 카테고리 순서 저장
        if (
            JSON.stringify(finalCategories) !== JSON.stringify(savedCategories)
        ) {
            saveCategoryOrderToLocalStorage(finalCategories);
            console.log("업데이트된 카테고리 순서 저장:", finalCategories);
        }

        // 카테고리 순서 강제 적용
        applyCategoryOrder(finalCategories);
        return finalCategories;
    } else {
        console.log("로컬 스토리지에 저장된 카테고리 순서 없음");
        return null;
    }
}

// 서버에서 카테고리 순서 조회
async function fetchCategoryOrder() {
    try {
        console.log("서버에서 카테고리 순서 조회 시도");
        const timestamp = new Date().getTime();

        // 새로운 카테고리 순서 전용 엔드포인트 사용
        const response = await fetch(
            `${API_BASE_URL}/api/categories/order?t=${timestamp}`,
            {
                headers: {
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    Pragma: "no-cache",
                },
            }
        );

        if (!response.ok) {
            throw new Error(`서버 응답 오류: ${response.status}`);
        }

        const data = await response.json();
        console.log("서버 응답 데이터:", data);

        // 새로운 API 응답 형식 처리
        const categories = Array.isArray(data) ? data : data.categories || [];
        console.log("서버에서 가져온 카테고리 순서:", categories);

        return categories;
    } catch (error) {
        console.error("카테고리 순서 조회 중 오류:", error);
        // 로컬 스토리지에서 복구 시도
        const savedCategories = loadCategoryOrderFromLocalStorage();
        console.log("로컬 스토리지에서 복구한 카테고리 순서:", savedCategories);
        return savedCategories || [];
    }
}

// 서버에 카테고리 순서 저장
async function saveCategoryOrderToServer(categories) {
    console.log("서버에 카테고리 순서 저장 시도:", categories);

    if (!categories || categories.length === 0) {
        console.error("저장할 카테고리가 없습니다.");
        return false;
    }

    try {
        const apiEndpoint = `${API_BASE_URL}/api/categories/order`;
        const requestData = { categories: categories };

        console.log(`API 엔드포인트: ${apiEndpoint}`);
        console.log(`전송 데이터:`, JSON.stringify(requestData));

        // 서버에 PUT 요청 전송
        const response = await fetch(apiEndpoint, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache",
            },
            body: JSON.stringify(requestData),
        });

        const statusCode = response.status;
        console.log(`서버 응답 상태 코드: ${statusCode}`);

        // 응답 처리
        let responseText = "";
        let responseJson = null;

        try {
            responseText = await response.text();
            console.log(`서버 응답 텍스트:`, responseText);

            if (responseText) {
                try {
                    responseJson = JSON.parse(responseText);
                    console.log("응답 JSON:", responseJson);
                } catch (jsonError) {
                    console.warn("JSON 파싱 실패:", jsonError);
                }
            }
        } catch (textError) {
            console.warn("응답 텍스트 읽기 실패:", textError);
        }

        if (response.ok) {
            console.log("카테고리 순서 서버 저장 성공!");
            return true;
        } else {
            console.warn(`서버 저장 실패 (${statusCode}): ${responseText}`);
            return false;
        }
    } catch (error) {
        console.error("카테고리 순서 저장 네트워크 오류:", error);
        return false;
    }
}

// 네트워크 상태 변화 감지 리스너
window.addEventListener("online", function () {
    console.log("네트워크 연결이 복원되었습니다.");
    // 네트워크 복원 시 데이터 동기화 시도
    if (document.readyState === "complete") {
        synchronizeDataWithServer();
    }
});

window.addEventListener("offline", function () {
    console.log("네트워크 연결이 끊겼습니다. 로컬 데이터를 사용합니다.");
    // 오프라인 상태 메시지 표시 (선택사항)
    showOfflineNotification();
});

// 네트워크 연결이 복원되었을 때 서버와 데이터 동기화
function synchronizeDataWithServer() {
    try {
        console.log("서버와 데이터 동기화 시도 중...");

        // 로컬 스토리지의 카테고리 순서 확인
        const savedCategories = loadCategoryOrderFromLocalStorage();
        if (savedCategories && savedCategories.length > 0) {
            // 카테고리 순서 동기화
            saveCategoryOrderToServer(savedCategories)
                .then((result) => {
                    console.log("카테고리 순서 동기화 결과:", result);
                    if (result) {
                        console.log("카테고리 순서 동기화 성공");
                    }
                })
                .catch((err) => {
                    console.error("카테고리 순서 동기화 실패:", err);
                });
        }

        // 다른 데이터 동기화 로직 추가...

        // 다시 데이터 로드
        setTimeout(() => {
            loadServerData(true);
        }, 1000);
    } catch (error) {
        console.error("데이터 동기화 중 오류:", error);
    }
}

// 오프라인 상태 알림
function showOfflineNotification() {
    const notification = document.createElement("div");
    notification.className = "offline-notification";
    notification.textContent = "오프라인 모드입니다. 일부 기능이 제한됩니다.";

    // 기존 알림이 있으면 제거
    const existingNotification = document.querySelector(
        ".offline-notification"
    );
    if (existingNotification) {
        existingNotification.remove();
    }

    document.body.appendChild(notification);

    // 5초 후 알림 자동 제거
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// 네트워크 상태 메시지 표시
function showNetworkMessage(message) {
    const notification = document.createElement("div");
    notification.className = "network-notification";
    notification.textContent = message;

    // 기존 알림이 있으면 제거
    const existingNotification = document.querySelector(
        ".network-notification"
    );
    if (existingNotification) {
        existingNotification.remove();
    }

    document.body.appendChild(notification);

    // 3초 후 알림 자동 제거
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}
