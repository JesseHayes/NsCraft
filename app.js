let data;
let inventory = JSON.parse(localStorage.getItem("inventory")) || {};
let currentSeason = "summer";
let currentView = "inventoryView";
let viewStack = [];

fetch("data.json")
    .then(response => response.json())
    .then(json => {
        data = json;

        initializeTagFilter();
        displayInventory();
        displayCraftView();   // NEW
    });

function initializeSeasonSelector() {
    const seasons = ["spring", "summer", "fall", "winter"];
    const select = document.getElementById("seasonSelect");

    seasons.forEach(season => {
        const option = document.createElement("option");
        option.value = season;
        option.textContent = season;
        select.appendChild(option);
    });

    select.value = currentSeason;

    select.addEventListener("change", function() {
        currentSeason = this.value;
        renderAll();
    });
}

function renderAll() {
    displayInventory();
    displayCraftable();
}

function displayInventory() {
    const container = document.getElementById("inventoryList");
    const search = document.getElementById("searchInput")?.value.toLowerCase() || "";

    container.innerHTML = "";

    data.resources
        .filter(r => {
        const matchesSearch = r.name.toLowerCase().includes(search);
        const selectedTag = document.getElementById("tagFilter")?.value;
        const matchesTag = !selectedTag || r.tags?.includes(selectedTag);
        return matchesSearch && matchesTag;
        })
        .forEach(resource => {

            const qty = inventory[resource.id] || 0;

            const div = document.createElement("div");
            div.className = "card resource";

            div.innerHTML = `
                <div onclick="openDetail('${resource.id}')">
                    <strong>${resource.name}</strong><br>
                    Quantity: ${qty}
                </div>
                <div>
                    <button class="secondary" onclick="event.stopPropagation(); modifyInventory('${resource.id}', -1)">-</button>
                    <button class="primary" onclick="event.stopPropagation(); modifyInventory('${resource.id}', 1)">+</button>
                </div>
            `;

            container.appendChild(div);
        });
}

function modifyInventory(resourceId, amount) {
    inventory[resourceId] = (inventory[resourceId] || 0) + amount;

    if (inventory[resourceId] < 0) {
        inventory[resourceId] = 0;
    }

    localStorage.setItem("inventory", JSON.stringify(inventory));

    displayInventory();
    displayCraftView();   // refresh craft page too
}

function resourceInSeason(resourceId) {
    const resource = data.resources.find(r => r.id === resourceId);
    return resource.season.includes(currentSeason) || resource.season.includes("all");
}

function canCraftResource(resourceId, visited = new Set()) {

    // Prevent infinite loops
    if (visited.has(resourceId)) return false;
    visited.add(resourceId);

    const available = inventory[resourceId] || 0;
    if (available > 0) return true;

    // Find recipe that produces this resource
    const recipe = data.recipes.find(r => r.produces === resourceId);
    if (!recipe) return false;

    // Check if all ingredients can be crafted
    for (let ingredient of recipe.ingredients) {
        if (!canCraftResource(ingredient.resource, visited)) {
            return false;
        }
    }

    return true;
}

function displayCraftable() {
    const container = document.getElementById("craftable");
    container.innerHTML = "";

    data.resources.forEach(resource => {
        const div = document.createElement("div");
        div.className = "resource";

        if (canCraftResource(resource.id)) {
            div.innerHTML = `<span class="craftable">${resource.name}</span>`;
        } else {
            div.innerHTML = `<span class="notcraftable">${resource.name}</span>`;
        }

        container.appendChild(div);
    });
}

function analyzeRecipe(recipe) {
    let missing = [];
    let canCraft = true;

    for (let ingredient of recipe.ingredients) {
        const available = inventory[ingredient.resource] || 0;
        const resource = data.resources.find(r => r.id === ingredient.resource);

        if (available < ingredient.qty) {
            missing.push(`${resource.name} (${ingredient.qty - available})`);
            canCraft = false;
        }

        if (!resourceInSeason(ingredient.resource)) {
            missing.push(`${resource.name} (out of season)`);
            canCraft = false;
        }
    }

    return { canCraft, missing };
}

function calculateRequirements(resourceId, qtyNeeded, requirements = {}, visited = new Set()) {

    if (visited.has(resourceId)) return requirements;
    visited.add(resourceId);

    const available = inventory[resourceId] || 0;
    const deficit = Math.max(qtyNeeded - available, 0);

    if (deficit === 0) return requirements;

    const recipe = data.recipes.find(r => r.produces === resourceId);

    // If no recipe exists, it's a base resource
    if (!recipe) {
        requirements[resourceId] = (requirements[resourceId] || 0) + deficit;
        return requirements;
    }

    // Multiply ingredient requirements
    for (let ingredient of recipe.ingredients) {
        const totalNeeded = ingredient.qty * deficit;
        calculateRequirements(ingredient.resource, totalNeeded, requirements, visited);
    }

    return requirements;
}

function initializeTargetSelector() {
    const select = document.getElementById("targetSelect");

    data.resources.forEach(resource => {
        const option = document.createElement("option");
        option.value = resource.id;
        option.textContent = resource.name;
        select.appendChild(option);
    });
}

function planCraft() {
    const target = document.getElementById("targetSelect").value;
    const requirements = calculateRequirements(target, 1);

    const output = document.getElementById("planOutput");
    output.innerHTML = "";

    if (Object.keys(requirements).length === 0) {
        output.innerHTML = "You already have everything needed.";
        return;
    }

    output.innerHTML = "<strong>You must gather:</strong><br>";

    for (let resourceId in requirements) {
        const resource = data.resources.find(r => r.id === resourceId);
        output.innerHTML += `${resource.name}: ${requirements[resourceId]}<br>`;
    }
}

function switchView(viewId, element = null) {

    if (currentView !== viewId) {
        viewStack.push(currentView);
    }

    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(viewId).classList.add("active");

    if (element) {
        document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
        element.classList.add("active");
    }

    currentView = viewId;
}

function goBack() {
    if (viewStack.length === 0) return;

    const lastView = viewStack.pop();

    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById(lastView).classList.add("active");

    currentView = lastView;
}

function openDetail(resourceId) {
    const resource = data.resources.find(r => r.id === resourceId);

    previousView = currentView;
    switchView("detailView");

    document.getElementById("detailTitle").textContent = resource.name;

    document.getElementById("detailContent").innerHTML = `
        <div class="card">
            <img src="${resource.image}" class="detail-image">
        </div>
        <div class="card">
            <strong>Type:</strong> ${resource.type}<br>
            <strong>Season:</strong> ${resource.season.join(", ")}<br>
            <strong>Regions:</strong> ${resource.regions.join(", ")}<br>
            <strong>Tags:</strong> ${resource.tags.join(", ")}
        </div>
        <div class="card">
            <strong>Description</strong><br>
            ${resource.description}
        </div>
    `;
}

function displayCraftView() {
    const container = document.getElementById("craftSection");
    container.innerHTML = "";

    data.recipes.forEach(recipe => {

        const div = document.createElement("div");
        div.className = "card resource";

        const craftable = canCraftResource(recipe.produces);

        div.innerHTML = `
            <div onclick="openRecipeDetail('${recipe.id}')">
                <strong>${recipe.name}</strong><br>
                ${craftable ? "✅ Craftable" : "❌ Not craftable"}
            </div>
        `;

        container.appendChild(div);
    });
}

function openRecipeDetail(recipeId) {
    const recipe = data.recipes.find(r => r.id === recipeId);
    const producedResource = data.resources.find(r => r.id === recipe.produces);

    previousView = currentView;
    switchView("detailView");

    document.getElementById("detailTitle").textContent = recipe.name;

    let ingredientList = "";

    recipe.ingredients.forEach(ing => {
        const res = data.resources.find(r => r.id === ing.resource);
        ingredientList += `<span onclick="openDetail('${res.id}')" style="color:#2b7a78; cursor:pointer;">
        ${res.name}
        </span> × ${ing.qty}<br>`;
    });

    document.getElementById("detailContent").innerHTML = `
        <div class="card">
            <strong>Produces:</strong><br>
            ${producedResource.name}
        </div>

        <div class="card">
            <strong>Ingredients:</strong><br>
            ${ingredientList}
        </div>

        <div class="card">
            <strong>Status:</strong><br>
            ${canCraftResource(recipe.produces) ? 
                "You can craft this now." : 
                "You cannot craft this yet."}
        </div>
    `;
}

function initializeTagFilter() {
    const select = document.getElementById("tagFilter");

    const allTags = new Set();

    data.resources.forEach(r => {
        r.tags?.forEach(tag => allTags.add(tag));
    });

    allTags.forEach(tag => {
        const option = document.createElement("option");
        option.value = tag;
        option.textContent = tag;
        select.appendChild(option);
    });
}