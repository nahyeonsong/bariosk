// API 기본 URL 설정
const API_BASE_URL =
    window.location.hostname === "nahyeonsong.github.io"
        ? "https://bariosk.onrender.com"
        : "http://localhost:5000";

// 전역 변수
let isAdminMode = false;
let cart = [];
let menuData = {};

// 드래그 앤 드롭 관련 변수
let draggedItem = null;
let dragStartIndex = null;

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

    // 메뉴 아이템에 장바구니 추가 버튼 이벤트 리스너 추가
    addMenuEventListeners();
    updateCart();
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
                    const response = await fetch(
                        `${API_BASE_URL}/api/categories/${encodeURIComponent(
                            category
                        )}`,
                        {
                            method: "PUT",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ name: newName }),
                        }
                    );

                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.error || "카테고리 수정 실패");
                    }

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
                        loadCategories();
                        loadMenuData();
                        alert("카테고리가 수정되었습니다.");
                    }
                } catch (error) {
                    console.error("Error:", error);
                    alert(
                        "카테고리 수정 중 오류가 발생했습니다: " + error.message
                    );
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
                    const response = await fetch(
                        `${API_BASE_URL}/api/categories/${encodeURIComponent(
                            category
                        )}`,
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

// 메뉴 데이터 로드
async function loadMenuData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/menu`);
        if (!response.ok) {
            throw new Error("메뉴 데이터를 불러오는데 실패했습니다.");
        }
        menuData = await response.json();
        console.log("Loaded menu data:", menuData); // 디버깅용
        updateMenuDisplay();
    } catch (error) {
        console.error("Error loading menu data:", error);
        alert("메뉴 데이터를 불러오는데 실패했습니다.");
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

            // 관리자 모드에서만 드래그 가능하도록 설정
            if (isAdminMode) {
                menuItem.draggable = true;
                menuItem.dataset.index = menuData[category].indexOf(menu);
                menuItem.dataset.category = category;

                // 드래그 이벤트 리스너 추가
                menuItem.addEventListener("dragstart", handleDragStart);
                menuItem.addEventListener("dragover", handleDragOver);
                menuItem.addEventListener("dragenter", handleDragEnter);
                menuItem.addEventListener("dragleave", handleDragLeave);
                menuItem.addEventListener("drop", handleDrop);
                menuItem.addEventListener("dragend", handleDragEnd);
            }

            // 온도 표시 텍스트 설정
            let temperatureText = "";
            if (menu.temperature === "H") temperatureText = "(H)";
            else if (menu.temperature === "I") temperatureText = "(I)";

            menuItem.innerHTML = `
                ${isAdminMode ? '<div class="drag-handle"></div>' : ""}
                <img src="static/images/${menu.image}" alt="${menu.name}">
                <div class="menu-item-info">
                    <h3>${temperatureText}${temperatureText ? " " : ""}${
                menu.name
            }</h3>
                    <p>${menu.price}원</p>
                    ${
                        isAdminMode
                            ? `<button class="edit-menu-btn" data-id="${menu.id}" data-category="${category}">수정</button>`
                            : `<button class="add-to-cart-btn" data-id="${menu.id}">장바구니에 추가</button>`
                    }
                </div>
            `;

            menuGrid.appendChild(menuItem);
        });

        categorySection.appendChild(menuGrid);
        menuContainer.appendChild(categorySection);
    }

    // 이벤트 리스너 추가
    if (isAdminMode) {
        // 수정 버튼 클릭 이벤트
        document.querySelectorAll(".edit-menu-btn").forEach((button) => {
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
        document.querySelectorAll(".add-to-cart-btn").forEach((button) => {
            button.addEventListener("click", () => {
                const menuId = button.getAttribute("data-id");
                addToCart(parseInt(menuId));
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
    menuItem.dataset.id = item.id;

    const buttonText = isAdminMode ? "수정" : "담기";
    const buttonClass = isAdminMode ? "edit-menu-btn" : "add-to-cart";

    menuItem.innerHTML = `
        <img src="static/images/${item.image}" alt="${item.name}">
        <div class="menu-item-info">
            <h3>${item.name}</h3>
            <p>${item.price.toLocaleString()}원</p>
            <button class="${buttonClass}">${buttonText}</button>
        </div>
    `;

    const button = menuItem.querySelector("button");
    if (isAdminMode) {
        button.addEventListener("click", () => showEditForm(item));
    } else {
        button.addEventListener("click", () => addToCart(item.id));
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
    if (!menu) return;

    const existingItem = cart.find((item) => item.id === menuId);
    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({
            id: menu.id,
            name: menu.name,
            price: menu.price,
            quantity: 1,
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
                <div>${item.name}</div>
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

    // 온도 표시 텍스트 생성 함수
    const getTemperatureText = (menu) => {
        if (menu.temperature === "H") return "(H)";
        if (menu.temperature === "I") return "(I)";
        return "";
    };

    receipt.innerHTML = `
        <div class="receipt-header">
            <h2>주문서</h2>
            <p>${new Date().toLocaleString()}</p>
        </div>
        <div class="receipt-items">
            ${cart
                .map((item) => {
                    const menu = findMenuById(item.id);
                    const temperatureText = menu
                        ? getTemperatureText(menu)
                        : "";
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
        try {
            await generateReceipt();
            cart = [];
            updateCart();
            alert("결제가 완료되었습니다. 주문서가 다운로드됩니다.");
        } catch (error) {
            console.error("Error during checkout:", error);
            alert("결제 처리 중 오류가 발생했습니다.");
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
    for (const items of Object.values(menuData)) {
        const menu = items.find((item) => item.id === menuId);
        if (menu) return menu;
    }
    return null;
}

// 드래그 앤 드롭 이벤트 핸들러
function handleDragStart(e) {
    draggedItem = this;
    dragStartIndex = parseInt(this.dataset.index);
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
    const dragEndIndex = parseInt(this.dataset.index);

    if (dragStartIndex !== dragEndIndex) {
        // 메뉴 데이터 업데이트
        const category = this.dataset.category;

        // 항목 순서 변경
        const items = menuData[category];
        const [movedItem] = items.splice(dragStartIndex, 1);
        items.splice(dragEndIndex, 0, movedItem);

        // 변경된 데이터 저장
        await saveMenuData(menuData);

        // UI 업데이트
        updateMenuDisplay();
    }
}

function handleDragEnd() {
    this.classList.remove("dragging");
    document.querySelectorAll(".menu-item").forEach((item) => {
        item.classList.remove("drag-over");
    });
}

// 메뉴 데이터 저장 함수
async function saveMenuData(menuData) {
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

        const data = await response.json();
        console.log("메뉴 순서가 저장되었습니다:", data);
    } catch (error) {
        console.error("메뉴 순서 저장 중 오류 발생:", error);
        alert("메뉴 순서 저장 중 오류가 발생했습니다.");
    }
}
