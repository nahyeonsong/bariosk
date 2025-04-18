// DOM이 로드되면 실행
document.addEventListener("DOMContentLoaded", () => {
    const adminToggle = document.getElementById("adminToggle");
    const adminPanel = document.getElementById("adminPanel");
    const addMenuForm = document.getElementById("addMenuForm");
    const editMenuForm = document.getElementById("editMenuForm");
    const cancelEditBtn = document.getElementById("cancelEdit");

    // 관리자 패널 토글
    adminToggle.addEventListener("click", () => {
        console.log("관리자 모드 버튼 클릭됨"); // 디버깅용 로그
        const currentDisplay = adminPanel.style.display;
        console.log("현재 display 값:", currentDisplay); // 디버깅용 로그
        adminPanel.style.display = currentDisplay === "none" ? "block" : "none";
        console.log("변경된 display 값:", adminPanel.style.display); // 디버깅용 로그
    });

    // 메뉴 데이터 로드
    loadMenuData();

    // 메뉴 추가 폼 제출
    addMenuForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const formData = new FormData(addMenuForm);

        try {
            const response = await fetch("http://localhost:5000/api/menu", {
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
            alert("메뉴 추가 중 오류가 발생했습니다: " + error.message);
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
                `http://localhost:5000/api/menu/${category}/${menuId}`,
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
            alert("메뉴 수정 중 오류가 발생했습니다: " + error.message);
        }
    });

    // 수정 취소
    cancelEditBtn.addEventListener("click", () => {
        editMenuForm.reset();
        editMenuForm.style.display = "none";
    });
});

// 메뉴 데이터 로드 및 렌더링
async function loadMenuData() {
    try {
        const response = await fetch("http://localhost:5000/api/menu");
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "메뉴 데이터 로드 실패");
        }

        const menuData = await response.json();
        renderMenu(menuData);
    } catch (error) {
        console.error("Error:", error);
        alert(
            "메뉴 데이터를 불러오는 중 오류가 발생했습니다: " + error.message
        );
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
