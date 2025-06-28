// 만약 강제로 배포 서버를 사용하고 싶으면 아래 주석을 해제하세요.
const API_BASE_URL = "https://bariosk.onrender.com";

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

// API 요청 함수
async function apiRequest(endpoint, options = {}) {
    const defaultOptions = {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
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
        const API_BASE_URL = getApiBaseUrl();
        const timestamp = Date.now();
        const device = isMobileDevice() ? 'mobile' : 'pc';
        const url = `${API_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}t=${timestamp}&device=${device}`;
        
        console.log('API 요청 URL:', url);
        console.log('API 요청 옵션:', finalOptions);

        const response = await fetch(url, finalOptions);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // 응답 헤더 확인
        console.log('응답 헤더:', Object.fromEntries(response.headers.entries()));
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
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
        
        console.log("=== 앱 초기화 완료 ===");
    } catch (error) {
        console.error("앱 초기화 중 오류:", error);
        showNetworkMessage("서버 연결에 실패했습니다. 오프라인 모드로 작동합니다.");
    }
}

// 서버 데이터 로드 함수
async function loadServerData(isInitialLoad = true) {
    console.log("=== 서버 데이터 로드 시작 ===");
    
    try {
        // 메뉴 데이터 로드
        await loadMenuData();
        
        // 카테고리 데이터 로드
        await loadCategories();
        
        if (isInitialLoad) {
            console.log("초기 로드 완료");
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
        const response = await apiRequest("/api/categories");
        console.log("카테고리 응답:", response);
        
        if (Array.isArray(response)) {
            const categories = response;
            console.log("로드된 카테고리:", categories);
            
            // 카테고리 순서 업데이트
            updateCategorySelects(categories);
            renderCategoryList(categories);
            
            // 로컬 스토리지에 백업
            try {
                localStorage.setItem("bariosk_categories", JSON.stringify(categories));
                localStorage.setItem("bariosk_categories_time", Date.now().toString());
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
        const response = await apiRequest("/api/menu");
        console.log("메뉴 응답:", response);
        
        if (response && typeof response === 'object') {
            menuData = response;
            console.log("로드된 메뉴 데이터:", menuData);
            
            // 로컬 스토리지에 백업
            try {
                localStorage.setItem("bariosk_menu_data", JSON.stringify(menuData));
                localStorage.setItem("bariosk_menu_data_time", Date.now().toString());
            } catch (error) {
                console.error("메뉴 데이터 로컬 저장 실패:", error);
            }
            
            // UI 업데이트
            updateMenuDisplay();
            
            console.log("=== 메뉴 데이터 로드 완료 ===");
            return menuData;
        } else {
            console.error("메뉴 응답이 객체가 아님:", response);
            return {};
        }
    } catch (error) {
        console.error("메뉴 로드 실패:", error);
        
        // 로컬 스토리지에서 복원 시도
        try {
            const localMenuData = localStorage.getItem("bariosk_menu_data");
            if (localMenuData) {
                menuData = JSON.parse(localMenuData);
                console.log("로컬 메뉴 데이터 복원됨");
                updateMenuDisplay();
                return menuData;
            }
        } catch (localError) {
            console.error("로컬 메뉴 데이터 복원 실패:", localError);
        }
        
        return {};
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
        
        // 해당 카테고리의 메뉴 아이템들 렌더링
        menuData[category].forEach(item => {
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
        menuData[category].forEach(item => {
            const menuItem = document.createElement("div");
            menuItem.className = "admin-menu-item";
            menuItem.draggable = true;
            menuItem.setAttribute("data-id", item.id);
            menuItem.setAttribute("data-category", category);
            
            const temperatureText = getTemperatureText(item.temperature);
            const temperatureDisplay = temperatureText ? ` (${temperatureText})` : '';
            
            menuItem.innerHTML = `
                <div class="menu-info">
                    <h3>${item.name}${temperatureDisplay}</h3>
                    <p>${item.price}원</p>
                    <p>카테고리: ${category}</p>
                </div>
                <div class="menu-actions">
                    <button onclick="showEditForm(${item.id}, '${category}')">수정</button>
                    <button onclick="deleteMenuItem(${item.id}, '${category}')">삭제</button>
                    <button onclick="cloneMenuItem(${item.id}, '${category}')">복제</button>
                </div>
            `;
            
            // 드래그 이벤트 리스너 추가
            menuItem.addEventListener("dragstart", handleDragStart);
            menuItem.addEventListener("dragover", handleDragOver);
            menuItem.addEventListener("dragenter", handleDragEnter);
            menuItem.addEventListener("dragleave", handleDragLeave);
            menuItem.addEventListener("dragend", handleDragEnd);
            menuItem.addEventListener("drop", handleDrop);
            
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

// 드래그 앤 드롭 이벤트 핸들러들
function handleDrop(e) {
    e.preventDefault();
    const draggedItem = menuDraggedItem;
    const targetItem = e.target.closest('.admin-menu-item');
    
    if (draggedItem && targetItem) {
        const draggedId = parseInt(draggedItem.getAttribute('data-id'));
        const draggedCategory = draggedItem.getAttribute('data-category');
        const targetId = parseInt(targetItem.getAttribute('data-id'));
        const targetCategory = targetItem.getAttribute('data-category');
        
        // 메뉴 순서 업데이트 로직
        updateMenuOrder(draggedId, draggedCategory, targetId, targetCategory);
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
    
    const receiptWindow = window.open("", "_blank");
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    const receiptHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>주문서 - Bariosk</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .receipt { max-width: 400px; margin: 0 auto; }
                .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                .item { display: flex; justify-content: space-between; margin: 5px 0; }
                .total { border-top: 1px solid #000; padding-top: 10px; margin-top: 20px; font-weight: bold; }
                .footer { text-align: center; margin-top: 30px; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="receipt">
                <div class="header">
                    <h1>Bariosk</h1>
                    <p>주문서</p>
                    <p>${new Date().toLocaleString()}</p>
                </div>
                ${cart.map(item => `
                    <div class="item">
                        <span>${item.name} x${item.quantity}</span>
                        <span>${item.price * item.quantity}원</span>
                    </div>
                `).join('')}
                <div class="total">
                    <div class="item">
                        <span>총 금액</span>
                        <span>${total}원</span>
                    </div>
                </div>
                <div class="footer">
                    <p>감사합니다!</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    receiptWindow.document.write(receiptHTML);
    receiptWindow.document.close();
    receiptWindow.print();
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

// 드래그 이벤트 핸들러들
function handleDragStart(e) {
    menuDraggedItem = e.target;
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
}

function handleDragLeave() {
    // 드래그 리브 이벤트 처리
}

function handleDragEnd() {
    menuDraggedItem = null;
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
    
    // 주기적으로 서버와 데이터 동기화
    setInterval(async () => {
        try {
            await loadServerData(false);
            console.log("데이터 동기화 완료");
        } catch (error) {
            console.error("데이터 동기화 실패:", error);
        }
    }, 30000); // 30초마다 동기화
}

// 오프라인 알림 표시 함수
function showOfflineNotification() {
    console.log("오프라인 모드로 전환");
    showNetworkMessage("네트워크 연결이 없습니다. 오프라인 모드로 작동합니다.");
}

// 네트워크 메시지 표시 함수
function showNetworkMessage(message) {
    // 간단한 알림 표시 (필요시 더 정교한 UI로 개선 가능)
    console.log("네트워크 메시지:", message);
    // alert(message); // 사용자에게 알림 표시 (선택사항)
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

// 메뉴 순서 업데이트 함수
async function updateMenuOrder(draggedId, draggedCategory, targetId, targetCategory) {
    try {
        const updates = [{
            old_category: draggedCategory,
            new_category: targetCategory,
            menu_id: draggedId,
            new_index: null
        }];
        
        const response = await apiRequest("/api/menu", {
            method: "PUT",
            body: JSON.stringify({ updates: updates })
        });
        
        console.log("메뉴 순서 업데이트 성공:", response);
        await loadMenuData();
    } catch (error) {
        console.error("메뉴 순서 업데이트 실패:", error);
        alert("메뉴 순서 변경에 실패했습니다.");
    }
}
