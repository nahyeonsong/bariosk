// 만약 강제로 배포 서버를 사용하고 싶으면 아래 주석을 해제하세요.
const API_BASE_URL = "https://bariosk.onrender.com";

// 모바일 기기 확인 함수
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );
}

// 네트워크 연결 상태 확인 함수 (모바일 호환)
async function checkNetworkConnection() {
    // 기본 온라인 상태 확인
    if (!navigator.onLine) {
        console.log("navigator.onLine: false");
        return false;
    }
    
    // 모바일에서는 실제 연결 테스트 수행
    if (isMobileDevice()) {
        try {
            console.log("모바일에서 실제 네트워크 연결 테스트 수행");
            
            // 실제 API 서버 연결 테스트 (더 안정적)
            const API_BASE_URL = "https://bariosk.onrender.com";
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃
            
            const response = await fetch(`${API_BASE_URL}/api/menu`, {
                method: 'HEAD',
                mode: 'cors',
                signal: controller.signal,
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            
            clearTimeout(timeoutId);
            console.log("모바일 API 서버 연결 테스트 성공");
            return true;
            
        } catch (error) {
            console.log("모바일 API 서버 연결 테스트 실패:", error.message);
            
            // 대체 방법: 간단한 이미지 로드 테스트
            try {
                const testImage = new Image();
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                
                await new Promise((resolve, reject) => {
                    testImage.onload = resolve;
                    testImage.onerror = reject;
                    testImage.src = 'https://www.google.com/favicon.ico?_=' + Date.now();
                    
                    setTimeout(() => {
                        if (testImage.complete) {
                            resolve();
                        } else {
                            reject(new Error('이미지 로드 타임아웃'));
                        }
                    }, 3000);
                });
                
                clearTimeout(timeoutId);
                console.log("모바일 이미지 로드 테스트 성공");
                return true;
                
            } catch (imgError) {
                console.log("모바일 이미지 로드 테스트 실패:", imgError.message);
                return false;
            }
        }
    }
    
    // PC에서는 기본 온라인 상태만 확인
    console.log("PC에서 기본 온라인 상태 확인:", navigator.onLine);
    return navigator.onLine;
}

// API 기본 URL 결정 함수
async function getApiBaseUrl() {
    const hostname = window.location.hostname;
    console.log("현재 호스트명:", hostname);
    console.log("모바일 기기 여부:", isMobileDevice());
    
    // 네트워크 연결 상태 확인
    const isOnline = await checkNetworkConnection();
    console.log("네트워크 연결 상태:", isOnline ? "연결됨" : "연결 안됨");

    // 모든 환경에서 Render 서버 사용 (로컬/Render 데이터 통합)
    const FORCE_RENDER_SERVER = true; // true로 설정하면 모든 환경에서 Render 서버 사용

    // Render 서버 URL
    const RENDER_SERVER_URL = "https://bariosk.onrender.com";

    // 네트워크 연결이 없는 경우 로컬 스토리지 모드로 변경
    if (!isOnline) {
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
        return "http://localhost:6190"; // 로컬 서버 사용
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

// API 요청 함수
async function apiRequest(endpoint, options = {}) {
    const defaultOptions = {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Requested-With': 'XMLHttpRequest'
        },
        mode: 'cors'
    };

    // 기존 헤더와 새 헤더 병합
    const mergedHeaders = {
        ...defaultOptions.headers,
        ...(options.headers || {})
    };

    // 최종 옵션 설정
    const finalOptions = {
        ...defaultOptions,
        ...options,
        headers: mergedHeaders
    };

    try {
        const API_BASE_URL = await getApiBaseUrl();
        const timestamp = Date.now();
        const device = isMobileDevice() ? 'mobile' : 'pc';
        const randomId = Math.random().toString(36).substring(7);
        
        // 더 강력한 캐시 무효화를 위한 파라미터
        const url = `${API_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}t=${timestamp}&device=${device}&v=${randomId}&_=${Date.now()}`;
        
        console.log('API 요청 URL:', url);
        console.log('API 요청 옵션:', finalOptions);
        console.log('디바이스:', device);
        console.log('타임스탬프:', new Date(timestamp).toISOString());

        const response = await fetch(url, finalOptions);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // 응답 헤더 확인
        console.log('응답 헤더:', Object.fromEntries(response.headers.entries()));
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            console.log('API 응답 데이터:', data);
            return data;
        } else {
            return response;
        }
    } catch (error) {
        console.error('서버 요청 중 오류:', error);
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
    const clearCartBtn = document.getElementById("clearCartBtn"); // 장바구니 비우기 버튼 참조 추가

    // 관리자 모드 토글
    const adminToggle = document.getElementById("adminToggle");
    if (adminToggle) {
        adminToggle.addEventListener("click", toggleAdminMode);
    }

    // 탭 버튼 이벤트 리스너
    tabButtons.forEach(button => {
        button.addEventListener("click", () => {
            const tabName = button.getAttribute("data-tab");
            switchTab(tabName);
        });
    });

    // 메뉴 추가 폼 이벤트 리스너
    if (addMenuForm) {
        addMenuForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const formData = new FormData(addMenuForm);
            const menuData = {
                category: formData.get("category"),
                name: formData.get("name"),
                price: formData.get("price"),
                temperature: formData.get("temperature")
            };
            
            // 순서가 입력된 경우에만 추가
            const orderIndex = formData.get("orderIndex");
            if (orderIndex) {
                menuData.order_index = parseInt(orderIndex);
            }

            try {
                const response = await apiRequest("/api/menu", {
                    method: "POST",
                    body: JSON.stringify(menuData)
                });
                console.log("메뉴 추가 성공:", response);
                addMenuForm.reset();
                await loadMenuData();
                await loadCategories();
            } catch (error) {
                console.error("메뉴 추가 실패:", error);
                alert("메뉴 추가에 실패했습니다.");
            }
        });
    }

    // 메뉴 수정 폼 이벤트 리스너
    if (editMenuForm) {
        editMenuForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const formData = new FormData(editMenuForm);
            const menuId = parseInt(formData.get("menuId"));
            const category = formData.get("category");
            const menuData = {
                name: formData.get("name"),
                price: formData.get("price"),
                temperature: formData.get("temperature")
            };
            
            // 순서가 입력된 경우에만 추가
            const orderIndex = formData.get("orderIndex");
            if (orderIndex) {
                menuData.order_index = parseInt(orderIndex);
            }

            try {
                const response = await apiRequest(`/api/menu/${category}/${menuId}`, {
                    method: "PUT",
                    body: JSON.stringify(menuData)
                });
                console.log("메뉴 수정 성공:", response);
                editMenuForm.style.display = "none";
                addMenuForm.style.display = "block";
                await loadMenuData();
            } catch (error) {
                console.error("메뉴 수정 실패:", error);
                alert("메뉴 수정에 실패했습니다.");
            }
        });
    }

    // 수정 취소 버튼 이벤트 리스너
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener("click", () => {
            editMenuForm.style.display = "none";
            addMenuForm.style.display = "block";
        });
    }

    // 카테고리 추가 폼 이벤트 리스너
    if (addCategoryForm) {
        addCategoryForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const formData = new FormData(addCategoryForm);
            const categoryData = {
                name: formData.get("name")
            };

            try {
                const response = await apiRequest("/api/categories", {
                    method: "POST",
                    body: JSON.stringify(categoryData)
                });
                console.log("카테고리 추가 성공:", response);
                addCategoryForm.reset();
                await loadCategories();
            } catch (error) {
                console.error("카테고리 추가 실패:", error);
                alert("카테고리 추가에 실패했습니다.");
            }
        });
    }

    // 장바구니 비우기 버튼 이벤트 리스너
    if (clearCartBtn) {
        clearCartBtn.addEventListener("click", () => {
            cart = [];
            updateCart();
        });
    }

    // 데이터 새로고침 버튼 이벤트 리스너
    const refreshDataBtn = document.getElementById("refreshDataBtn");
    if (refreshDataBtn) {
        refreshDataBtn.addEventListener("click", async () => {
            refreshDataBtn.disabled = true;
            refreshDataBtn.textContent = "🔄 새로고침 중...";
            
            try {
                await forceRefreshData();
            } finally {
                refreshDataBtn.disabled = false;
                refreshDataBtn.textContent = "🔄 새로고침";
            }
        });
    }

    // 주문서 출력 버튼 이벤트 리스너
    const checkoutBtn = document.getElementById("checkoutBtn");
    if (checkoutBtn) {
        checkoutBtn.addEventListener("click", generateReceipt);
    }

    // 앱 초기화
    initializeApp();
});

// 앱 초기화 함수
async function initializeApp() {
    console.log("=== 앱 초기화 시작 ===");
    
    try {
        // 서버 데이터 로드
        await loadServerData(true);
        
        // 카테고리 순서 로드 및 적용
        await loadCategoriesAndUpdateDisplay();
        
        // 데이터 동기화 기능 활성화
        synchronizeDataWithServer();
        
        console.log("=== 앱 초기화 완료 ===");
    } catch (error) {
        console.error("앱 초기화 중 오류:", error);
        showNetworkMessage("서버 연결에 실패했습니다. 오프라인 모드로 작동합니다.");
    }
}

// 서버 데이터 로드 함수
async function loadServerData(isInitialLoad = true) {
    console.log("=== 서버 데이터 로드 시작 ===");
    console.log("디바이스:", isMobileDevice() ? "모바일" : "PC");
    
    const isOnline = await checkNetworkConnection();
    console.log("네트워크 상태:", isOnline ? "연결됨" : "연결 안됨");
    
    try {
        // 메뉴 데이터 로드
        await loadMenuData();
        
        // 카테고리 데이터 로드
        await loadCategories();
        
        if (isInitialLoad) {
            console.log("초기 로드 완료");
            // 데이터 동기화 상태 표시
            showNetworkMessage("서버와 동기화 완료");
        }
        
        console.log("=== 서버 데이터 로드 완료 ===");
    } catch (error) {
        console.error("서버 데이터 로드 실패:", error);
        
        // 오프라인 모드로 전환
        showOfflineNotification();
        
        // 로컬 스토리지에서 데이터 복원 시도
        try {
            const localMenuData = localStorage.getItem("bariosk_menu_data");
            const localCategories = localStorage.getItem("bariosk_categories");
            
            if (localMenuData) {
                menuData = JSON.parse(localMenuData);
                console.log("로컬 메뉴 데이터 복원됨");
                showNetworkMessage("오프라인 모드: 로컬 데이터 사용 중");
            }
            
            if (localCategories) {
                const categories = JSON.parse(localCategories);
                console.log("로컬 카테고리 데이터 복원됨");
            }
            
            // UI 업데이트
            updateMenuDisplay();
            
        } catch (localError) {
            console.error("로컬 데이터 복원 실패:", localError);
        }
    }
}

// 카테고리 데이터 로드 함수
async function loadCategories() {
    console.log("=== 카테고리 데이터 로드 시작 ===");
    
    try {
        // 캐시 무효화를 위한 추가 파라미터
        const cacheBuster = Date.now();
        const response = await apiRequest(`/api/categories?_cb=${cacheBuster}`);
        console.log("카테고리 응답:", response);
        
        if (Array.isArray(response)) {
            const categories = response;
            console.log("로드된 카테고리:", categories);
            console.log("카테고리 개수:", categories.length);
            
            // 카테고리 순서 업데이트
            updateCategorySelects(categories);
            renderCategoryList(categories);
            
            // 로컬 스토리지에 백업
            try {
                localStorage.setItem("bariosk_categories", JSON.stringify(categories));
                localStorage.setItem("bariosk_categories_time", Date.now().toString());
                console.log("카테고리 로컬 저장 완료");
            } catch (error) {
                console.error("카테고리 로컬 저장 실패:", error);
            }
            
            console.log("=== 카테고리 데이터 로드 완료 ===");
            return categories;
        } else {
            console.error("카테고리 응답이 배열이 아님:", response);
            return [];
        }
    } catch (error) {
        console.error("카테고리 로드 실패:", error);
        
        // 로컬 스토리지에서 복원 시도
        const localCategories = loadCategoryOrderFromLocalStorage();
        if (localCategories) {
            console.log("로컬 카테고리 데이터 사용:", localCategories);
            updateCategorySelects(localCategories);
            renderCategoryList(localCategories);
            return localCategories;
        }
        
        return [];
    }
}

// 카테고리 선택 옵션 업데이트
function updateCategorySelects(categories) {
    const categorySelect = document.getElementById("category");
    const editCategorySelect = document.getElementById("editCategory");
    
    if (categorySelect) {
        categorySelect.innerHTML = '<option value="">카테고리 선택</option>';
        categories.forEach(category => {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });
    }
    
    if (editCategorySelect) {
        editCategorySelect.innerHTML = '<option value="">카테고리 선택</option>';
        categories.forEach(category => {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
            editCategorySelect.appendChild(option);
        });
    }
}

// 카테고리 목록 렌더링
function renderCategoryList(categories) {
    const categoryList = document.getElementById("categoryList");
    if (!categoryList) return;
    
    categoryList.innerHTML = "";
    
    categories.forEach(category => {
        const categoryItem = document.createElement("div");
        categoryItem.className = "category-item";
        categoryItem.draggable = true;
        categoryItem.setAttribute("data-category", category);
        
        categoryItem.innerHTML = `
            <span class="category-name">${category}</span>
            <div class="category-actions">
                <button class="edit-category-btn" onclick="editCategory('${category}')">수정</button>
                <button class="delete-category-btn" onclick="deleteCategory('${category}')">삭제</button>
            </div>
        `;
        
        // 드래그 이벤트 리스너 추가
        categoryItem.addEventListener("dragstart", handleCategoryDragStart);
        categoryItem.addEventListener("dragover", handleCategoryDragOver);
        categoryItem.addEventListener("dragleave", handleCategoryDragLeave);
        categoryItem.addEventListener("dragend", handleCategoryDragEnd);
        categoryItem.addEventListener("drop", handleCategoryDrop);
        
        categoryList.appendChild(categoryItem);
    });
}

// 온도 텍스트 변환 함수
function getTemperatureText(temperature) {
    switch (temperature) {
        case 'H': return 'Hot';
        case 'I': return 'Ice';
        default: return '';
    }
}

// 메뉴 데이터 로드 함수
async function loadMenuData() {
    console.log("=== 메뉴 데이터 로드 시작 ===");
    
    try {
        // 캐시 무효화를 위한 추가 파라미터
        const cacheBuster = Date.now();
        const response = await apiRequest(`/api/menu?_cb=${cacheBuster}`);
        console.log("메뉴 응답:", response);
        
        if (response && typeof response === 'object') {
            // 데이터 유효성 검사
            const isValidData = Object.keys(response).length > 0 && 
                               Object.values(response).some(items => Array.isArray(items) && items.length > 0);
            
            if (!isValidData) {
                console.warn("서버에서 빈 메뉴 데이터를 받았습니다.");
                throw new Error("서버에서 유효하지 않은 메뉴 데이터를 받았습니다.");
            }
            
            menuData = response;
            console.log("로드된 메뉴 데이터:", menuData);
            console.log("메뉴 데이터 크기:", JSON.stringify(menuData).length, "bytes");
            
            // 로컬 스토리지에 백업
            try {
                localStorage.setItem("bariosk_menu_data", JSON.stringify(menuData));
                localStorage.setItem("bariosk_menu_data_time", Date.now().toString());
                console.log("메뉴 데이터 로컬 저장 완료");
            } catch (error) {
                console.error("메뉴 데이터 로컬 저장 실패:", error);
            }
            
            // UI 업데이트
            updateMenuDisplay();
            
            console.log("=== 메뉴 데이터 로드 완료 ===");
            return menuData;
        } else {
            console.error("메뉴 응답이 유효하지 않음:", response);
            throw new Error("서버에서 유효하지 않은 메뉴 데이터를 받았습니다.");
        }
    } catch (error) {
        console.error("메뉴 데이터 로드 실패:", error);
        
        // 로컬 스토리지에서 복원 시도
        const localMenuData = localStorage.getItem("bariosk_menu_data");
        if (localMenuData) {
            try {
                menuData = JSON.parse(localMenuData);
                console.log("로컬 메뉴 데이터 복원됨");
                updateMenuDisplay();
                return menuData;
            } catch (parseError) {
                console.error("로컬 메뉴 데이터 파싱 실패:", parseError);
            }
        }
        
        throw error;
    }
}

// 메뉴 데이터 새로고침 함수
async function refreshMenuData() {
    console.log("=== 메뉴 데이터 새로고침 시작 ===");
    
    try {
        // 서버에서 최신 데이터 가져오기
        await loadServerData(false);
        
        // UI 업데이트
        updateMenuDisplay();
        
        console.log("=== 메뉴 데이터 새로고침 완료 ===");
    } catch (error) {
        console.error("메뉴 데이터 새로고침 실패:", error);
        showNetworkMessage("데이터 새로고침에 실패했습니다.");
    }
}

// 카테고리와 메뉴 표시 업데이트 함수
async function loadCategoriesAndUpdateDisplay() {
    console.log("=== 카테고리 및 메뉴 표시 업데이트 시작 ===");
    
    try {
        // 카테고리 순서 로드
        const categories = await loadCategories();
        
        // 메뉴 표시 업데이트
        updateMenuDisplay(categories);
        
        console.log("=== 카테고리 및 메뉴 표시 업데이트 완료 ===");
    } catch (error) {
        console.error("카테고리 및 메뉴 표시 업데이트 실패:", error);
    }
}

// 메뉴 표시 업데이트 함수
function updateMenuDisplay(sortedCategories = null) {
    console.log("=== 메뉴 표시 업데이트 시작 ===");
    
    const menuContainer = document.getElementById("menuContainer");
    if (!menuContainer) {
        console.error("메뉴 컨테이너를 찾을 수 없습니다.");
        return;
    }
    
    // 기존 메뉴 컨테이너 초기화
    menuContainer.innerHTML = "";
    
    // 카테고리 순서 결정
    let categories = sortedCategories;
    if (!categories) {
        categories = Object.keys(menuData);
    }
    
    console.log("표시할 카테고리 순서:", categories);
    
    // 각 카테고리별로 메뉴 섹션 생성
    categories.forEach(category => {
        if (!menuData[category] || menuData[category].length === 0) {
            console.log(`카테고리 '${category}'에 메뉴가 없습니다.`);
            return;
        }
        
        const categorySection = document.createElement("div");
        categorySection.className = "menu-section";
        categorySection.setAttribute("data-category", category);
        
        const categoryTitle = document.createElement("h2");
        categoryTitle.textContent = category;
        categorySection.appendChild(categoryTitle);
        
        const menuGrid = document.createElement("div");
        menuGrid.className = "menu-grid";
        
        // 해당 카테고리의 메뉴 아이템들 렌더링 (order_index 순으로 정렬)
        const sortedItems = [...menuData[category]].sort((a, b) => 
            (a.order_index || 0) - (b.order_index || 0)
        );
        
        sortedItems.forEach(item => {
            const menuItem = createMenuItem(item);
            menuGrid.appendChild(menuItem);
        });
        
        categorySection.appendChild(menuGrid);
        menuContainer.appendChild(categorySection);
    });
    
    // 관리자 모드에서 메뉴 그리드 업데이트
    if (isAdminMode) {
        updateAdminMenuGrid();
    }
    
    console.log("=== 메뉴 표시 업데이트 완료 ===");
}

// 관리자 모드 토글 함수
function toggleAdminMode() {
    isAdminMode = !isAdminMode;
    const adminPanel = document.getElementById("adminPanel");
    const adminToggle = document.getElementById("adminToggle");
    
    if (isAdminMode) {
        adminPanel.style.display = "block";
        adminToggle.textContent = "일반 모드";
        updateAdminMenuGrid();
    } else {
        adminPanel.style.display = "none";
        adminToggle.textContent = "관리자 모드";
    }
}

// 관리자 메뉴 그리드 업데이트
function updateAdminMenuGrid() {
    const menuGrid = document.getElementById("menuGrid");
    if (!menuGrid) return;
    
    menuGrid.innerHTML = "";
    
    Object.keys(menuData).forEach(category => {
        // order_index 순으로 정렬
        const sortedItems = [...menuData[category]].sort((a, b) => 
            (a.order_index || 0) - (b.order_index || 0)
        );
        
        sortedItems.forEach(item => {
            const menuItem = document.createElement("div");
            menuItem.className = "admin-menu-item";
            menuItem.setAttribute("data-id", item.id);
            menuItem.setAttribute("data-category", category);
            
            const temperatureText = getTemperatureText(item.temperature);
            const temperatureDisplay = temperatureText ? ` (${temperatureText})` : '';
            
            menuItem.innerHTML = `
                <div class="menu-info">
                    <h3>${item.name}${temperatureDisplay}</h3>
                    <p>${item.price}원</p>
                    <p>카테고리: ${category}</p>
                    <p>순서: ${item.order_index || 1}</p>
                </div>
                <div class="menu-actions">
                    <button onclick="showEditForm(${item.id}, '${category}')">수정</button>
                    <button onclick="deleteMenuItem(${item.id}, '${category}')">삭제</button>
                    <button onclick="cloneMenuItem(${item.id}, '${category}')">복제</button>
                </div>
            `;
            
            menuGrid.appendChild(menuItem);
        });
    });
}

// 메뉴 아이템 복제 함수
async function cloneMenuItem(item, category) {
    try {
        const newItem = {
            ...item,
            id: undefined // 새 ID가 서버에서 생성됨
        };
        
        const response = await apiRequest("/api/menu", {
            method: "POST",
            body: JSON.stringify(newItem)
        });
        
        console.log("메뉴 복제 성공:", response);
        await loadMenuData();
        await loadCategories();
    } catch (error) {
        console.error("메뉴 복제 실패:", error);
        alert("메뉴 복제에 실패했습니다.");
    }
}

// 메뉴 아이템 삭제 함수
async function deleteMenuItem(menuId, category) {
    if (!confirm("정말로 이 메뉴를 삭제하시겠습니까?")) {
        return;
    }
    
    try {
        const response = await apiRequest(`/api/menu/${category}/${menuId}`, {
            method: "DELETE"
        });
        
        console.log("메뉴 삭제 성공:", response);
        await loadMenuData();
        await loadCategories();
    } catch (error) {
        console.error("메뉴 삭제 실패:", error);
        alert("메뉴 삭제에 실패했습니다.");
    }
}

// 메뉴 아이템 생성 함수
function createMenuItem(item) {
    const menuItem = document.createElement("div");
    menuItem.className = "menu-item";
    menuItem.setAttribute("data-id", item.id);
    
    const temperatureText = getTemperatureText(item.temperature);
    const temperatureDisplay = temperatureText ? ` (${temperatureText})` : '';
    
    menuItem.innerHTML = `
        <div class="menu-content">
            <h3>${item.name}${temperatureDisplay}</h3>
            <p class="price">${item.price}원</p>
            <div class="menu-actions">
                <button onclick="addToCart(${item.id})" class="add-to-cart-btn">장바구니에 추가</button>
            </div>
        </div>
    `;
    
    return menuItem;
}

// 메뉴 수정 폼 표시 함수
function showEditForm(menu, category) {
    const editForm = document.getElementById("editMenuForm");
    const addForm = document.getElementById("addMenuForm");
    
    // 폼 필드 설정
    document.getElementById("editMenuId").value = menu.id;
    document.getElementById("editCategory").value = category;
    document.getElementById("editName").value = menu.name;
    document.getElementById("editPrice").value = menu.price;
    document.getElementById("editTemperature").value = menu.temperature || "";
    document.getElementById("editOrderIndex").value = menu.order_index || 1;
    
    // 폼 표시 전환
    addForm.style.display = "none";
    editForm.style.display = "block";
}

// 장바구니 관련 함수들
function addToCart(menuId) {
    const existingItem = cart.find(item => item.id === menuId);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        const menuItem = findMenuById(menuId);
        if (menuItem) {
            cart.push({
                ...menuItem,
                quantity: 1
            });
        }
    }
    updateCart();
}

function removeFromCart(menuId) {
    cart = cart.filter(item => item.id !== menuId);
    updateCart();
}

function updateQuantity(menuId, change) {
    const item = cart.find(item => item.id === menuId);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(menuId);
        } else {
            updateCart();
        }
    }
}

function updateCart() {
    const cartItems = document.getElementById("cartItems");
    const totalAmount = document.getElementById("totalAmount");
    const checkoutBtn = document.getElementById("checkoutBtn");
    
    if (cartItems) {
        cartItems.innerHTML = "";
        cart.forEach(item => {
            const cartItem = document.createElement("div");
            cartItem.className = "cart-item";
            cartItem.innerHTML = `
                <span>${item.name}</span>
                <div class="quantity-controls">
                    <button onclick="updateQuantity(${item.id}, -1)">-</button>
                    <span>${item.quantity}</span>
                    <button onclick="updateQuantity(${item.id}, 1)">+</button>
                </div>
                <span>${item.price * item.quantity}원</span>
                <button onclick="removeFromCart(${item.id})">삭제</button>
            `;
            cartItems.appendChild(cartItem);
        });
    }
    
    if (totalAmount) {
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        totalAmount.textContent = `${total}원`;
    }
    
    if (checkoutBtn) {
        checkoutBtn.disabled = cart.length === 0;
    }
}

// 주문서 생성 함수
async function generateReceipt() {
    if (cart.length === 0) {
        alert("장바구니가 비어있습니다.");
        return;
    }
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const currentDate = new Date();
    const dateStr = currentDate.toLocaleDateString('ko-KR', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
    });
    const timeStr = currentDate.toLocaleTimeString('ko-KR', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    // 주문서 HTML 생성
    const receiptHTML = `
        <div style="
            font-family: 'Courier New', monospace;
            width: 400px;
            min-height: 600px;
            background-color: #ffffff;
            padding: 30px;
            box-sizing: border-box;
            border: 2px solid #000;
            border-radius: 8px;
        ">
            <!-- 헤더 -->
            <div style="
                text-align: center;
                border-bottom: 2px dashed #000;
                padding-bottom: 20px;
                margin-bottom: 20px;
            ">
                <h1 style="
                    margin: 0 0 5px 0;
                    font-size: 24px;
                    font-weight: bold;
                    color: #000;
                    letter-spacing: 2px;
                ">BARIOSK</h1>
                <p style="
                    margin: 0 0 10px 0;
                    font-size: 14px;
                    color: #333;
                    font-weight: bold;
                ">영수증</p>
                <div style="
                    font-size: 12px;
                    color: #666;
                    line-height: 1.4;
                ">
                    <div>📅 ${dateStr}</div>
                    <div>🕐 ${timeStr}</div>
                </div>
            </div>

            <!-- 메뉴 목록 -->
            <div style="margin-bottom: 20px;">
                <div style="
                    border-bottom: 1px solid #000;
                    padding-bottom: 5px;
                    margin-bottom: 15px;
                    font-weight: bold;
                    font-size: 14px;
                ">
                    주문 내역
                </div>
                
                ${cart.map((item, index) => `
                    <div style="
                        margin-bottom: 12px;
                        padding-bottom: 8px;
                        border-bottom: 1px dotted #ccc;
                    ">
                        <div style="
                            display: flex;
                            justify-content: space-between;
                            margin-bottom: 4px;
                        ">
                            <span style="
                                font-weight: bold;
                                font-size: 14px;
                                color: #000;
                            ">${item.name}</span>
                            <span style="
                                font-weight: bold;
                                font-size: 14px;
                                color: #000;
                            ">${(item.price * item.quantity).toLocaleString()}원</span>
                        </div>
                        <div style="
                            display: flex;
                            justify-content: space-between;
                            font-size: 12px;
                            color: #666;
                        ">
                            <span>수량: ${item.quantity}개</span>
                            <span>단가: ${item.price.toLocaleString()}원</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- 총액 -->
            <div style="
                border-top: 2px dashed #000;
                padding-top: 20px;
                margin-bottom: 20px;
            ">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-weight: bold;
                    font-size: 16px;
                    color: #000;
                    margin-bottom: 15px;
                ">
                    <span>총 결제 금액</span>
                    <span>${total.toLocaleString()}원</span>
                </div>
            </div>

            <!-- 푸터 -->
            <div style="
                text-align: center;
                border-top: 1px solid #000;
                padding-top: 20px;
                font-size: 12px;
                color: #666;
                line-height: 1.4;
            ">
                <div style="margin-bottom: 5px;">감사합니다!</div>
                <div>Bariosk 카페</div>
                <div style="margin-top: 10px; font-size: 10px;">
                    이용해 주셔서 감사합니다
                </div>
            </div>
        </div>
    `;
    
    // 임시 div 생성하여 주문서 HTML 삽입
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = receiptHTML;
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '0';
    document.body.appendChild(tempDiv);
    
    try {
        // html2canvas를 사용하여 이미지 생성
        const canvas = await html2canvas(tempDiv.firstElementChild, {
            backgroundColor: '#ffffff',
            scale: 2, // 고해상도 이미지 생성
            width: 460,
            height: 700,
            useCORS: true,
            allowTaint: true,
            logging: false
        });
        
        // Canvas를 Blob으로 변환
        canvas.toBlob((blob) => {
            // 모바일과 데스크톱 모두 지원하는 다운로드 방식
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `bariosk_receipt_${currentDate.toISOString().slice(0, 19).replace(/:/g, '-')}.jpg`;
            
            // 모바일에서 다운로드 속성이 작동하지 않을 경우를 대비
            if (isMobileDevice()) {
                // 모바일에서는 새 탭에서 열기
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                
                // iOS Safari를 위한 특별 처리
                if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
                    // iOS에서는 이미지를 새 창에서 열고 사용자가 수동으로 저장하도록 함
                    const newWindow = window.open();
                    newWindow.document.write(`
                        <html>
                            <head>
                                <title>Bariosk 영수증</title>
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                <style>
                                    body { 
                                        margin: 0; 
                                        padding: 20px; 
                                        background: #f5f5f5; 
                                        font-family: Arial, sans-serif;
                                    }
                                    .receipt-container {
                                        max-width: 100%;
                                        margin: 0 auto;
                                        background: white;
                                        border-radius: 8px;
                                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                                        overflow: hidden;
                                    }
                                    .receipt-image {
                                        width: 100%;
                                        height: auto;
                                        display: block;
                                    }
                                    .download-info {
                                        text-align: center;
                                        padding: 20px;
                                        background: white;
                                        margin-top: 20px;
                                        border-radius: 8px;
                                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                                    }
                                    .download-btn {
                                        background: #007AFF;
                                        color: white;
                                        border: none;
                                        padding: 12px 24px;
                                        border-radius: 6px;
                                        font-size: 16px;
                                        cursor: pointer;
                                        margin: 10px;
                                    }
                                    .download-btn:hover {
                                        background: #0056CC;
                                    }
                                </style>
                            </head>
                            <body>
                                <div class="receipt-container">
                                    <img src="${url}" alt="Bariosk 영수증" class="receipt-image">
                                </div>
                                <div class="download-info">
                                    <p>영수증을 저장하려면 이미지를 길게 누르고 "이미지 저장"을 선택하세요.</p>
                                    <button class="download-btn" onclick="window.print()">인쇄하기</button>
                                </div>
                            </body>
                        </html>
                    `);
                    newWindow.document.close();
                } else {
                    // 안드로이드 등 다른 모바일 브라우저
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            } else {
                // 데스크톱에서는 기존 방식 사용
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
            
            // 메모리 정리
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 1000);
        }, 'image/jpeg', 0.95);
        
    } catch (error) {
        console.error('주문서 이미지 생성 실패:', error);
        alert('주문서 이미지 생성에 실패했습니다.');
    } finally {
        // 임시 div 제거
        document.body.removeChild(tempDiv);
    }
}

// 메뉴 이벤트 리스너 추가 함수
function addMenuEventListeners() {
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('add-to-cart-btn')) {
                const menuId = parseInt(item.getAttribute('data-id'));
                addToCart(menuId);
            }
        });
    });
}

// ID로 메뉴 찾기 함수
function findMenuById(menuId) {
    for (const category in menuData) {
        const item = menuData[category].find(item => item.id === menuId);
        if (item) return item;
    }
    return null;
}

// 카테고리 드래그 이벤트 핸들러들
function handleCategoryDragStart(e) {
    categoryDraggedItem = e.target;
    categoryDragStartIndex = Array.from(e.target.parentNode.children).indexOf(e.target);
    e.dataTransfer.effectAllowed = 'move';
}

function handleCategoryDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleCategoryDragLeave() {
    // 카테고리 드래그 리브 이벤트 처리
}

function handleCategoryDragEnd() {
    categoryDraggedItem = null;
    categoryDragStartIndex = null;
}

// 카테고리 드롭 이벤트 핸들러
async function handleCategoryDrop(e) {
    e.preventDefault();
    
    if (!categoryDraggedItem) return;
    
    const targetItem = e.target.closest('.category-item');
    if (!targetItem) return;
    
    const targetIndex = Array.from(targetItem.parentNode.children).indexOf(targetItem);
    const draggedIndex = categoryDragStartIndex;
    
    if (draggedIndex === targetIndex) return;
    
    try {
        // 카테고리 순서 업데이트
        const categoryList = document.getElementById("categoryList");
        const categories = Array.from(categoryList.children).map(item => 
            item.getAttribute('data-category')
        );
        
        // 드래그된 아이템을 새 위치로 이동
        const draggedCategory = categories[draggedIndex];
        categories.splice(draggedIndex, 1);
        categories.splice(targetIndex, 0, draggedCategory);
        
        // 서버에 순서 저장
        await saveCategoryOrderToServer(categories);
        
        // UI 업데이트
        renderCategoryList(categories);
        updateCategorySelects(categories);
        
    } catch (error) {
        console.error("카테고리 순서 업데이트 실패:", error);
        alert("카테고리 순서 변경에 실패했습니다.");
    }
}

// 카테고리 순서 적용 함수
function applyCategoryOrder(categories) {
    console.log("카테고리 순서 적용:", categories);
    
    // 카테고리 선택 옵션 업데이트
    updateCategorySelects(categories);
    
    // 카테고리 목록 렌더링
    renderCategoryList(categories);
    
    // 메뉴 표시 업데이트
    updateMenuDisplay(categories);
}

// 로컬 카테고리 순서 적용 함수
function applyLocalCategoryOrder() {
    console.log("=== 로컬 카테고리 순서 적용 시작 ===");
    
    try {
        const localCategories = loadCategoryOrderFromLocalStorage();
        if (localCategories && localCategories.length > 0) {
            console.log("로컬 카테고리 순서 적용:", localCategories);
            applyCategoryOrder(localCategories);
            return true;
        }
        return false;
    } catch (error) {
        console.error("로컬 카테고리 순서 적용 실패:", error);
        return false;
    }
}

// 카테고리 순서 가져오기 함수
async function fetchCategoryOrder() {
    console.log("=== 카테고리 순서 가져오기 시작 ===");
    
    try {
        const response = await apiRequest("/api/categories/order");
        console.log("카테고리 순서 응답:", response);
        
        if (response && response.categories) {
            const categories = response.categories;
            console.log("서버에서 가져온 카테고리 순서:", categories);
            
            // 로컬 스토리지에 저장
            saveCategoryOrderToLocalStorage(categories);
            
            // UI에 적용
            applyCategoryOrder(categories);
            
            console.log("=== 카테고리 순서 가져오기 완료 ===");
            return categories;
        } else {
            console.log("서버에서 카테고리 순서를 가져올 수 없음");
            return null;
        }
    } catch (error) {
        console.error("카테고리 순서 가져오기 실패:", error);
        
        // 로컬 데이터로 폴백
        const localApplied = applyLocalCategoryOrder();
        if (localApplied) {
            console.log("로컬 카테고리 순서로 폴백됨");
        }
        
        return null;
    }
}

// 카테고리 순서를 서버에 저장하는 함수
async function saveCategoryOrderToServer(categories) {
    console.log("=== 카테고리 순서 서버 저장 시작 ===");
    console.log("저장할 카테고리 순서:", categories);
    
    try {
        const response = await apiRequest("/api/categories/order", {
            method: "PUT",
            body: JSON.stringify({ categories: categories })
        });
        
        console.log("카테고리 순서 저장 응답:", response);
        
        // 로컬 스토리지에도 저장
        saveCategoryOrderToLocalStorage(categories);
        
        console.log("=== 카테고리 순서 서버 저장 완료 ===");
        return response;
    } catch (error) {
        console.error("카테고리 순서 서버 저장 실패:", error);
        throw error;
    }
}

// 데이터 동기화 함수
function synchronizeDataWithServer() {
    console.log("=== 데이터 동기화 시작 ===");
    
    // 주기적으로 서버와 데이터 동기화 (더 자주 체크)
    setInterval(async () => {
        try {
            console.log("자동 데이터 동기화 실행 중...");
            await loadServerData(false);
            console.log("자동 데이터 동기화 완료");
        } catch (error) {
            console.error("자동 데이터 동기화 실패:", error);
        }
    }, 15000); // 15초마다 동기화 (30초에서 단축)
    
    // 페이지 포커스 시 동기화
    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) {
            console.log("페이지 포커스됨 - 데이터 동기화 실행");
            try {
                await loadServerData(false);
            } catch (error) {
                console.error("포커스 시 동기화 실패:", error);
            }
        }
    });
    
    // 온라인 상태 복구 시 동기화
    window.addEventListener('online', async () => {
        console.log("네트워크 연결 복구됨 - 데이터 동기화 실행");
        try {
            await forceRefreshData();
        } catch (error) {
            console.error("온라인 복구 시 동기화 실패:", error);
        }
    });
}

// 모바일 네트워크 연결 간단 테스트
async function testMobileConnection() {
    if (!isMobileDevice()) return true;
    
    try {
        console.log("모바일 연결 간단 테스트 시작");
        
        // 간단한 fetch 테스트
        const response = await fetch('https://bariosk.onrender.com/api/menu', {
            method: 'HEAD',
            mode: 'cors',
            cache: 'no-cache'
        });
        
        console.log("모바일 연결 테스트 성공");
        return true;
        
    } catch (error) {
        console.log("모바일 연결 테스트 실패:", error.message);
        return false;
    }
}

// 강제 새로고침 함수 (모바일/PC 데이터 동기화용)
async function forceRefreshData() {
    console.log("=== 강제 새로고침 시작 ===");
    
    try {
        // 모바일에서 연결 테스트
        if (isMobileDevice()) {
            const isConnected = await testMobileConnection();
            if (!isConnected) {
                showNetworkMessage("모바일에서 서버 연결에 실패했습니다. 인터넷 연결을 확인해주세요.");
                return;
            }
        }
        
        // 로컬 스토리지 캐시 클리어
        localStorage.removeItem("bariosk_menu_data");
        localStorage.removeItem("bariosk_menu_data_time");
        localStorage.removeItem("bariosk_categories");
        localStorage.removeItem("bariosk_categories_time");
        localStorage.removeItem("bariosk_category_order");
        
        // 브라우저 캐시 무효화를 위한 추가 헤더
        const cacheBuster = Date.now();
        
        console.log("로컬 캐시 클리어 완료");
        console.log("캐시 무효화 타임스탬프:", cacheBuster);
        
        // 서버에서 최신 데이터 로드 (강제 새로고침)
        await loadServerData(true);
        
        // UI 완전 새로고침
        updateMenuDisplay();
        updateAdminMenuGrid();
        
        showNetworkMessage("데이터 새로고침 완료 - 모든 캐시 클리어됨");
        console.log("=== 강제 새로고침 완료 ===");
        
    } catch (error) {
        console.error("강제 새로고침 실패:", error);
        showNetworkMessage("새로고침 실패: " + error.message);
    }
}

// 오프라인 알림 표시 함수
function showOfflineNotification() {
    console.log("오프라인 모드로 전환");
    showNetworkMessage("네트워크 연결이 없습니다. 오프라인 모드로 작동합니다.");
    
    // 모바일에서 추가 안내
    if (isMobileDevice()) {
        setTimeout(() => {
            showNetworkMessage("모바일에서 새로고침 버튼을 눌러 연결을 다시 시도해보세요.");
        }, 3000);
    }
}

// 네트워크 메시지 표시 함수
function showNetworkMessage(message) {
    // 기존 메시지 제거
    const existingMessage = document.getElementById('networkMessage');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // 새 메시지 생성
    const messageDiv = document.createElement('div');
    messageDiv.id = 'networkMessage';
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #007bff;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-size: 14px;
        max-width: 300px;
        word-wrap: break-word;
        animation: slideIn 0.3s ease-out;
    `;
    
    // 애니메이션 스타일 추가
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.remove();
                }
            }, 300);
        }
    }, 3000);
    
    // 콘솔에도 로그
    console.log("네트워크 메시지:", message);
}

// 탭 전환 함수
function switchTab(tabName) {
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");
    
    tabButtons.forEach(button => {
        button.classList.remove("active");
        if (button.getAttribute("data-tab") === tabName) {
            button.classList.add("active");
        }
    });
    
    tabContents.forEach(content => {
        content.classList.remove("active");
        if (content.id === tabName + "Tab") {
            content.classList.add("active");
        }
    });
}

// 카테고리 수정 함수
async function editCategory(categoryName) {
    const newName = prompt("새 카테고리 이름을 입력하세요:", categoryName);
    if (!newName || newName === categoryName) return;
    
    try {
        const response = await apiRequest(`/api/categories/${categoryName}`, {
            method: "PUT",
            body: JSON.stringify({ new_name: newName })
        });
        
        console.log("카테고리 수정 성공:", response);
        await loadCategories();
        await loadMenuData();
    } catch (error) {
        console.error("카테고리 수정 실패:", error);
        alert("카테고리 수정에 실패했습니다.");
    }
}

// 카테고리 삭제 함수
async function deleteCategory(categoryName) {
    if (!confirm(`정말로 '${categoryName}' 카테고리를 삭제하시겠습니까?`)) {
        return;
    }
    
    try {
        const response = await apiRequest(`/api/categories/${categoryName}`, {
            method: "DELETE"
        });
        
        console.log("카테고리 삭제 성공:", response);
        await loadCategories();
        await loadMenuData();
    } catch (error) {
        console.error("카테고리 삭제 실패:", error);
        alert("카테고리 삭제에 실패했습니다.");
    }
}
