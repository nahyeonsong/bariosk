// API 기본 URL 설정
const API_BASE_URL = "http://localhost:5000";

// DOM이 로드되면 실행
document.addEventListener("DOMContentLoaded", () => {
    const adminToggle = document.getElementById("adminToggle");
    const adminPanel = document.getElementById("adminPanel");
    const addMenuForm = document.getElementById("addMenuForm");
    const editMenuForm = document.getElementById("editMenuForm");
    const cancelEditBtn = document.getElementById("cancelEdit");
    const addCategoryForm = document.getElementById("addCategoryForm");
    const categoryList = document.getElementById("categoryList");
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

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

    // 관리자 패널 토글
    adminToggle.addEventListener("click", () => {
        console.log("관리자 모드 버튼 클릭됨");
        const currentDisplay = adminPanel.style.display;
        console.log("현재 display 값:", currentDisplay);
        adminPanel.style.display = currentDisplay === "none" ? "block" : "none";
        console.log("변경된 display 값:", adminPanel.style.display);
    });

    // 메뉴 데이터 로드
    loadMenuData();

    // 카테고리 목록 로드
    loadCategories();

    // 카테고리 추가 폼 제출
    addCategoryForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const categoryName = document.getElementById("newCategoryName").value;

        try {
            const response = await fetch(`${API_BASE_URL}/api/categories`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name: categoryName }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "카테고리 추가 실패");
            }

            addCategoryForm.reset();
            loadCategories();
            loadMenuData(); // 메뉴 데이터도 새로고침하여 카테고리 옵션 업데이트
            alert("카테고리가 추가되었습니다.");
        } catch (error) {
            console.error("Error:", error);
            if (error.message.includes("Failed to fetch")) {
                alert(
                    "서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요."
                );
            } else {
                alert("카테고리 추가 중 오류가 발생했습니다: " + error.message);
            }
        }
    });

    // 메뉴 추가 폼 제출
    addMenuForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = new FormData(addMenuForm);

        try {
            const response = await fetch(`${API_BASE_URL}/api/menu`, {
                method: "POST",
                body: formData,
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
});

// 카테고리 목록 로드
async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/categories`);
        if (!response.ok) {
            throw new Error("카테고리 목록 로드 실패");
        }

        const categories = await response.json();
        updateCategorySelects(categories);
        renderCategoryList(categories);
    } catch (error) {
        console.error("Error:", error);
        if (error.message.includes("Failed to fetch")) {
            alert(
                "서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요."
            );
        } else {
            alert(
                "카테고리 목록을 불러오는 중 오류가 발생했습니다: " +
                    error.message
            );
        }
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
            saveButton.addEventListener("click", async () => {
                try {
                    const response = await fetch(
                        `${API_BASE_URL}/api/categories/${category}`,
                        {
                            method: "PUT",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ name: input.value }),
                        }
                    );

                    if (!response.ok) {
                        throw new Error("카테고리 수정 실패");
                    }

                    loadCategories();
                    loadMenuData();
                } catch (error) {
                    console.error("Error:", error);
                    alert(
                        "카테고리 수정 중 오류가 발생했습니다: " + error.message
                    );
                }
            });

            nameSpan.replaceWith(input);
            e.target.replaceWith(saveButton);
        });
    });

    // 카테고리 삭제 버튼 이벤트 리스너
    document.querySelectorAll(".delete-category").forEach((button) => {
        button.addEventListener("click", async (e) => {
            const category = e.target.getAttribute("data-category");

            if (confirm(`정말로 "${category}" 카테고리를 삭제하시겠습니까?`)) {
                try {
                    const response = await fetch(
                        `${API_BASE_URL}/api/categories/${category}`,
                        {
                            method: "DELETE",
                        }
                    );

                    if (!response.ok) {
                        throw new Error("카테고리 삭제 실패");
                    }

                    loadCategories();
                    loadMenuData();
                    alert("카테고리가 삭제되었습니다.");
                } catch (error) {
                    console.error("Error:", error);
                    alert(
                        "카테고리 삭제 중 오류가 발생했습니다: " + error.message
                    );
                }
            }
        });
    });
}

// 메뉴 데이터 로드 및 렌더링
async function loadMenuData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/menu`);
        if (!response.ok) {
            throw new Error("메뉴 데이터 로드 실패");
        }

        const menuData = await response.json();
        renderMenu(menuData);
    } catch (error) {
        console.error("Error:", error);
        if (error.message.includes("Failed to fetch")) {
            alert(
                "서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요."
            );
        } else {
            alert(
                "메뉴 데이터를 불러오는 중 오류가 발생했습니다: " +
                    error.message
            );
        }
    }
}

// 메뉴 렌더링
function renderMenu(menuData) {
    const menuContainer = document.querySelector(".menu-container");
    menuContainer.innerHTML = "";

    for (const [category, items] of Object.entries(menuData)) {
        const menuSection = document.createElement("div");
        menuSection.className = "menu-section";

        const sectionTitle = document.createElement("h2");
        sectionTitle.textContent = category;
        menuSection.appendChild(sectionTitle);

        const menuGrid = document.createElement("div");
        menuGrid.className = "menu-grid";

        items.forEach((item) => {
            const menuItem = document.createElement("div");
            menuItem.className = "menu-item";

            const img = document.createElement("img");
            img.src = `/static/images/${item.image}`;
            img.alt = item.name;

            const itemInfo = document.createElement("div");
            itemInfo.className = "menu-item-info";

            const name = document.createElement("h3");
            name.textContent = item.name;

            const price = document.createElement("p");
            price.textContent = `${item.price.toLocaleString()}원`;

            itemInfo.appendChild(name);
            itemInfo.appendChild(price);

            menuItem.appendChild(img);
            menuItem.appendChild(itemInfo);
            menuGrid.appendChild(menuItem);
        });

        menuSection.appendChild(menuGrid);
        menuContainer.appendChild(menuSection);
    }
}
