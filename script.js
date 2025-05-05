// API 기본 URL 설정
const API_BASE_URL = getApiBaseUrl();

// API 기본 URL 결정 함수
function getApiBaseUrl() {
    const hostname = window.location.hostname;
    console.log("현재 호스트명:", hostname);

    // 모든 환경에서 Render 서버 사용 (로컬/Render 데이터 통합)
    const FORCE_RENDER_SERVER = true; // true로 설정하면 모든 환경에서 Render 서버 사용

    if (FORCE_RENDER_SERVER) {
        console.log("모든 환경에서 Render 서버 사용");
        return "https://bariosk.onrender.com";
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
        return "https://bariosk.onrender.com";
    }

    // 로컬 개발 환경
    if (hostname === "localhost" || hostname === "127.0.0.1") {
        // return "http://localhost:5000"; // 로컬 서버 사용 (기존 코드)
        return "https://bariosk.onrender.com"; // 로컬 환경에서도 Render 서버 사용
    }

    // 기타 모든 도메인 - Render 서버를 기본값으로 사용
    return "https://bariosk.onrender.com";
}

console.log("사용할 API URL:", API_BASE_URL);

// 전역 변수
let isAdminMode = false;
let cart = [];
let menuData = {};

// 드래그 앤 드롭 관련 변수
let draggedItem = null;
let dragStartIndex = null;

// 요청 타임아웃 설정
const REQUEST_TIMEOUT = 15000; // 15초

// API 요청 함수 (타임아웃 처리 및 재시도 로직 추가)
async function apiRequest(url, options = {}, retries = 2) {
    try {
        // AbortController를 사용하여 타임아웃 설정
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        console.log(`API 요청: ${url} (남은 재시도: ${retries})`);

        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                ...options.headers,
            },
        });

        clearTimeout(timeoutId);

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
        if (error.name === "AbortError") {
            console.error("요청 시간 초과:", url);
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

    // 초기 메뉴 데이터 로드
    loadMenuData();

    // 카테고리 목록 로드
    loadCategories();

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

                // 카테고리 선택 옵션과 목록 업데이트
                const categories = Object.keys(menuData);
                updateCategorySelects(categories);
                renderCategoryList(categories);
                updateMenuDisplay();
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
        const menuData = {
            category: formData.get("category"),
            name: formData.get("name"),
            price: formData.get("price"),
            temperature: formData.get("temperature") || "",
            image: "logo.png", // 기본 이미지 사용
        };

        try {
            const response = await fetch(`${API_BASE_URL}/api/menu`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(menuData),
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
});

// 카테고리 목록 로드
async function loadCategories() {
    try {
        console.log("카테고리 목록 로딩 시작");
        const url = `${API_BASE_URL}/api/categories`;
        console.log(`API URL에서 카테고리 목록 로드 시도: ${url}`);

        const response = await apiRequest(url);
        let categories = await response.json();
        console.log("카테고리 목록 로드 응답:", categories);

        // 빈 배열이 반환된 경우 로컬 menuData의 카테고리 유지
        if (Array.isArray(categories) && categories.length === 0) {
            console.log("서버에서 빈 카테고리 목록이 반환됨");

            if (Object.keys(menuData).length > 0) {
                console.log("로컬 menuData의 카테고리 사용");
                categories = Object.keys(menuData);
            } else {
                // 기본 카테고리 설정
                categories = ["기본 카테고리"];
                console.log("빈 응답으로 기본 카테고리 사용");
            }
        }

        console.log("카테고리 목록 최종:", categories);

        // UI 업데이트
        updateCategorySelects(categories);
        renderCategoryList(categories);
        return categories;
    } catch (error) {
        console.error("카테고리 목록 로드 중 오류:", error);
        // 오류 발생 시 로컬 menuData의 카테고리 사용
        const localCategories = Object.keys(menuData);
        if (localCategories.length > 0) {
            console.log("오류 발생으로 로컬 카테고리 사용:", localCategories);
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

    categoryList.innerHTML = categories
        .map(
            (category) => `
        <li>
            <span class="category-name">${category}</span>
            <div class="category-actions">
                <button class="edit-category" data-category="${category}">수정</button>
                <button class="delete-category" data-category="${category}">삭제</button>
            </div>
        </li>
    `
        )
        .join("");

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
        const url = `${API_BASE_URL}/api/menu`;
        console.log(`API URL에서 메뉴 데이터 로드 시도: ${url}`);

        const response = await apiRequest(url);
        const data = await response.json();
        console.log("메뉴 데이터 로드 응답:", Object.keys(data));

        // 빈 객체 또는 오류 응답인지 확인
        if (data && typeof data === "object" && Object.keys(data).length > 0) {
            menuData = data;
            console.log("메뉴 데이터 설정 완료");
        } else {
            console.log("서버에서 빈 메뉴 데이터 또는 오류 응답이 반환됨");
            // 기존 데이터가 있으면 유지
            if (Object.keys(menuData).length === 0) {
                // 완전히 빈 데이터인 경우에만 기본 데이터 추가
                console.log("기본 메뉴 데이터 설정");
                const categories = await loadCategories();
                for (const category of categories) {
                    if (!menuData[category]) {
                        menuData[category] = [];
                    }
                }
            }
        }

        updateMenuDisplay();
        return menuData;
    } catch (error) {
        console.error("메뉴 데이터 로드 중 오류:", error);

        // 이미 메뉴 데이터가 있으면 그대로 사용
        if (Object.keys(menuData).length > 0) {
            console.log("오류 발생으로 기존 메뉴 데이터 유지");
            updateMenuDisplay();
            return menuData;
        }

        // 메뉴 데이터가 없는 경우 카테고리만이라도 설정
        try {
            const categories = await loadCategories();
            console.log("카테고리에서 빈 메뉴 데이터 생성:", categories);
            for (const category of categories) {
                menuData[category] = [];
            }
            updateMenuDisplay();
        } catch (catError) {
            console.error("카테고리 및 메뉴 데이터 모두 로드 실패");
            alert("메뉴 데이터를 불러오는데 실패했습니다: " + error.message);
        }

        return menuData;
    }
}

// 메뉴 표시 업데이트
function updateMenuDisplay() {
    const menuContainer = document.getElementById("menuContainer");
    if (!menuContainer) {
        console.error("menuContainer element not found");
        return;
    }

    // 메뉴 컨테이너 초기화
    menuContainer.innerHTML = "";

    // 각 카테고리별로 메뉴 섹션 생성
    for (const category in menuData) {
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
            const menuItem = document.createElement("div");
            menuItem.className = "menu-item";
            menuItem.draggable = isAdminMode;
            menuItem.dataset.id = menu.id;
            menuItem.dataset.category = category;

            const adminControls = isAdminMode
                ? `
                <div class="admin-controls">
                    <button class="edit-btn" data-id="${
                        menu.id
                    }" data-category="${category}">수정</button>
                    <button class="clone-btn" onclick="cloneMenuItem(${JSON.stringify(
                        menu
                    ).replace(/"/g, "&quot;")}, '${category}')">복제</button>
                    <button class="delete-btn" onclick="deleteMenuItem(${
                        menu.id
                    }, '${category}')">삭제</button>
                </div>
                `
                : "";

            const addToCartButton = !isAdminMode
                ? `<button class="add-to-cart" onclick="addToCart(${menu.id})">담기</button>`
                : "";

            menuItem.innerHTML = `
                <img src="${API_BASE_URL}/static/images/${menu.image}" alt="${
                menu.name
            }" onerror="this.src='${API_BASE_URL}/static/images/logo.png'">
                <div class="menu-info">
                    <h3>${menu.name}</h3>
                    <p class="price">${menu.price.toLocaleString()}원</p>
                    <p class="temperature">${getTemperatureText(
                        menu.temperature
                    )}</p>
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

            menuGrid.appendChild(menuItem);
        });

        categorySection.appendChild(menuGrid);
        menuContainer.appendChild(categorySection);
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
        // 장바구니 추가 버튼 클릭 이벤트
        document.querySelectorAll(".add-to-cart").forEach((button) => {
            button.addEventListener("click", () => {
                const menuId = parseInt(button.getAttribute("data-id"));
                addToCart(menuId);
            });
        });
    }
}

// 관리자 모드 토글 시 메뉴 표시 업데이트
function toggleAdminMode() {
    isAdminMode = !isAdminMode;
    const adminPanel = document.getElementById("adminPanel");
    const logo = document.getElementById("logo");

    if (adminPanel) {
        adminPanel.style.display = isAdminMode ? "block" : "none";
    }

    if (logo) {
        logo.style.border = isAdminMode ? "2px solid red" : "none";
        logo.style.padding = isAdminMode ? "2px" : "0";
    }

    // 메뉴 표시 업데이트
    updateMenuDisplay();
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

    const addToCartButton = !isAdminMode
        ? `<button class="add-to-cart" onclick="addToCart(${item.id})">담기</button>`
        : "";

    menuItem.innerHTML = `
        <img src="${API_BASE_URL}/static/images/${item.image}" alt="${
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

    editMenuId.value = menu.id;
    editCategory.value = category;
    editName.value = menu.name;
    editTemperature.value = menu.temperature || "H";
    editPrice.value = menu.price;
    editImage.value = ""; // 이미지 입력 필드 초기화

    // 삭제 버튼에 이벤트 리스너 추가
    deleteMenuBtn.onclick = async () => {
        if (confirm(`정말로 "${menu.name}" 메뉴를 삭제하시겠습니까?`)) {
            try {
                const response = await fetch(
                    `${API_BASE_URL}/api/menu/${category}/${menu.id}`,
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
    document.querySelectorAll(".menu-item").forEach((item) => {
        const addToCartBtn = item.querySelector(".add-to-cart");
        if (addToCartBtn) {
            addToCartBtn.addEventListener("click", () => {
                const menuId = parseInt(item.dataset.id);
                addToCart(menuId);
            });
        }
    });
}

// 메뉴 ID로 메뉴 찾기
function findMenuById(menuId) {
    for (const category in menuData) {
        const menu = menuData[category].find((item) => item.id === menuId);
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

async function handleDrop() {
    this.classList.remove("drag-over");
    const dragEndIndex = Array.from(this.parentNode.children).indexOf(this);
    const category = this.dataset.category;

    if (dragStartIndex !== dragEndIndex) {
        // 메뉴 데이터 업데이트
        const items = menuData[category];
        const [movedItem] = items.splice(dragStartIndex, 1);
        items.splice(dragEndIndex, 0, movedItem);

        // 변경된 데이터 저장
        try {
            const response = await fetch(`${API_BASE_URL}/api/menu`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(menuData),
            });

            if (!response.ok) {
                throw new Error("메뉴 순서 저장 실패");
            }

            // UI 업데이트
            updateMenuDisplay();
        } catch (error) {
            console.error("Error:", error);
            alert("메뉴 순서 저장 중 오류가 발생했습니다.");
        }
    }
}

function handleDragEnd() {
    this.classList.remove("dragging");
    document.querySelectorAll(".menu-item").forEach((item) => {
        item.classList.remove("drag-over");
    });
}

// 메뉴 복제 기능
document
    .getElementById("cloneMenu")
    .addEventListener("click", async function () {
        const menuId = document.getElementById("editMenuId").value;
        const category = document.getElementById("editCategory").value;
        const name = document.getElementById("editName").value;
        const price = document.getElementById("editPrice").value;
        const temperature = document.getElementById("editTemperature").value;
        const image = document.getElementById("editImage").files[0];

        // 폼 데이터 생성
        const formData = new FormData();
        formData.append("category", category);
        formData.append("name", name);
        formData.append("price", price);
        formData.append("temperature", temperature);
        if (image) {
            formData.append("image", image);
        }

        try {
            const response = await fetch("/api/menu", {
                method: "POST",
                body: formData,
            });

            if (response.ok) {
                alert("메뉴가 복제되었습니다.");
                loadMenuData();
                document.getElementById("editMenuForm").style.display = "none";
            } else {
                const error = await response.json();
                alert(error.error || "메뉴 복제 중 오류가 발생했습니다.");
            }
        } catch (error) {
            console.error("Error:", error);
            alert("메뉴 복제 중 오류가 발생했습니다.");
        }
    });

// 장바구니 초기화
function clearCart() {
    if (cart.length > 0) {
        if (confirm("장바구니를 비우시겠습니까?")) {
            cart = [];
            updateCart();
        }
    }
}

// 장바구니 초기화 버튼 이벤트 리스너
document.getElementById("clearCartBtn").addEventListener("click", clearCart);

// 메뉴 아이템 복제 함수
async function cloneMenuItem(itemId) {
    try {
        const item = menuData[category].find((item) => item.id === itemId);
        if (!item) {
            throw new Error("Menu item not found");
        }

        // Create a new item with the same data but a new name
        const newItem = {
            ...item,
            name: `${item.name} (Copy)`,
            id: undefined, // Remove the ID so a new one will be generated
        };

        // Create FormData for the request
        const formData = new FormData();
        formData.append("category", item.category);
        formData.append("name", newItem.name);
        formData.append("price", item.price);
        formData.append("temperature", item.temperature);

        // If there's an image, fetch it and append it
        if (item.image) {
            try {
                const imageResponse = await fetch(item.image);
                const imageBlob = await imageResponse.blob();
                formData.append("image", imageBlob, "image.jpg");
            } catch (error) {
                console.error("Error fetching image:", error);
                // Continue without the image if there's an error
            }
        }

        const response = await fetch(`${API_BASE_URL}/api/menu`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to clone menu item");
        }

        const result = await response.json();
        console.log("Menu item cloned successfully:", result);

        // Refresh the menu display
        await loadMenuData();

        // Show success message
        alert("Menu item cloned successfully");
    } catch (error) {
        console.error("Error cloning menu item:", error);
        alert(error.message || "Failed to clone menu item");
    }
}

// 메뉴 삭제 함수
async function deleteMenuItem(menuId, category) {
    if (confirm("정말로 이 메뉴를 삭제하시겠습니까?")) {
        try {
            const response = await fetch(
                `${API_BASE_URL}/api/menu/${category}/${menuId}`,
                {
                    method: "DELETE",
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "메뉴 삭제 실패");
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
