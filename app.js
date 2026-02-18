let data;
let inventory = JSON.parse(localStorage.getItem("inventory")) || {};
let currentSeason = "summer";
let currentView = "inventoryView";
let viewStack = [];
let map;
let mapInitialized = false;
let mineralLayer;
let mineralData;
let currentCategory = null;
let imageHTML = "";
let activeFire = null;

const redStarIcon = L.icon({
    iconUrl: 'images/map-icons/red-star.png',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
});

const blueStarIcon = L.icon({
    iconUrl: 'images/map-icons/blue-star.png',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
});

fetch("data.json")
    .then(response => response.json())
    .then(json => {
        data = json;
        renderCategoryButtons();
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
    container.innerHTML = "";

    Object.keys(inventory).forEach(id => {

        const resource = data.resources.find(r => r.id === id);
        if (!resource) return;

        const div = document.createElement("div");
        div.className = "card resource";

const isWood = resource.type === "Wood";
const currentValue = isWood
    ? inventory[id]?.weight_kg || 0
    : inventory[id] || 0;

if (currentValue <= 0) return;

div.innerHTML = `
    <div class="resource-info" onclick="openDetail('${resource.id}')">
        <strong>${resource.name}</strong><br>
        ${isWood ? "Weight" : "Quantity"}:
        ${isWood ? currentValue.toFixed(2) + " kg" : currentValue}
    </div>

    <div class="resource-controls">
        <button class="secondary"
            onclick="event.stopPropagation(); modifyInventoryWithStep('${resource.id}', -1)">
            -
        </button>

        <input type="number"
            id="step_${resource.id}"
            value="${isWood ? 1 : 1}"
            min="0.1"
            step="0.1"
            style="width:60px; text-align:center;">

        <button class="primary"
            onclick="event.stopPropagation(); modifyInventoryWithStep('${resource.id}', 1)">
            +
        </button>
    </div>
`;

        container.appendChild(div);
    });

    if (container.innerHTML === "") {
        container.innerHTML = "<div class='card'>No items in inventory.</div>";
    }
}

function modifyInventory(resourceId, amount) {

    inventory[resourceId] = (inventory[resourceId] || 0) + amount;

    if (inventory[resourceId] <= 0) {
        delete inventory[resourceId];
    }

    localStorage.setItem("inventory", JSON.stringify(inventory));

    displayInventory();
    renderCategoryResources();
    displayCraftView();
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

    if (viewId === "fireView") {
        displayFireView();
    }

    if (viewId === "mapView") {
    initializeMap();

    setTimeout(() => {
        map.invalidateSize();
    }, 100);
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

    switchView("detailView");

    document.getElementById("detailTitle").textContent = resource.name;

    // Find recipes that use this resource
    const usedInRecipes = data.recipes.filter(recipe =>
        recipe.ingredients.some(ing => ing.resource === resourceId)
    );

    let usesHTML = "";

    if (usedInRecipes.length === 0) {
        usesHTML = "No known crafting uses.";
    } else {
        usedInRecipes.forEach(recipe => {
            usesHTML += `
                <div onclick="openRecipeDetail('${recipe.id}')" 
                     style="color:#2b7a78; cursor:pointer; margin-bottom:6px;">
                    ${recipe.name}
                </div>
            `;
        });
    }

    // If tree has multiple identification images
    if (resource.images) {

    imageHTML = `
        <div class="tree-images">

            <div class="image-block">
                <img src="${resource.images.leaf}" alt="Leaf">
                <div class="image-label">Leaf</div>
            </div>

            <div class="image-block">
                <img src="${resource.images.bark_mature}" alt="Mature Bark">
                <div class="image-label">Mature Bark</div>
            </div>

            <div class="image-block">
                <img src="${resource.images.bark_young}" alt="Young Bark">
                <div class="image-label">Young Bark</div>
            </div>

        </div>
    `;
    }
    else if (resource.image) {
    imageHTML = `<img src="${resource.image}" alt="${resource.name}">`;
    }

    document.getElementById("detailContent").innerHTML = `
        <div class="card">
            ${imageHTML}
        </div>

        <div class="card">
            <strong>Type:</strong> ${resource.type}<br>
            <strong>Season:</strong> ${resource.season.join(", ")}<br>
            <strong>Regions:</strong> ${resource.regions.join(", ")}<br>
            <strong>Tags:</strong> ${resource.tags?.join(", ") || ""}
        </div>

        <div class="card">
            <strong>Description</strong><br>
            ${resource.description}
        </div>

        <div class="card">
            <strong>Uses</strong><br>
            ${usesHTML}
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

    switchView("detailView");

    document.getElementById("detailTitle").textContent = recipe.name;

    // Ingredients
    let ingredientList = "";
    recipe.ingredients.forEach(ing => {
        const res = data.resources.find(r => r.id === ing.resource);

        ingredientList += `
            <div onclick="openDetail('${res.id}')" 
                 style="color:#2b7a78; cursor:pointer; margin-bottom:6px;">
                ${res.name} × ${ing.qty}
            </div>
        `;
    });

    // Procedure steps
    let procedureList = "";
    if (recipe.procedure) {
        recipe.procedure.forEach((step, index) => {
            procedureList += `
                <div style="margin-bottom:8px;">
                    <strong>Step ${index + 1}:</strong> ${step}
                </div>
            `;
        });
    } else {
        procedureList = "No procedure recorded.";
    }

    document.getElementById("detailContent").innerHTML = `
        <div class="card">
            <strong>Produces:</strong><br>
            <div onclick="openDetail('${producedResource.id}')" 
                 style="color:#2b7a78; cursor:pointer;">
                ${producedResource.name}
            </div>
        </div>

        <div class="card">
            <strong>Ingredients</strong><br>
            ${ingredientList}
        </div>

        <div class="card">
            <strong>Procedure</strong><br>
            ${procedureList}
        </div>

        <div class="card">
            <strong>Status</strong><br>
            ${canCraftResource(recipe.produces) 
                ? "You can craft this now."
                : "You cannot craft this yet."}
        </div>
    `;
}


function initializeMap() {

    if (mapInitialized) return;

    map = L.map('map').setView([45.0, -63.0], 7);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    fetch("data/mineral_occurrences.json")
    .then(response => response.json())
    .then(geojsonData => {

        mineralData = geojsonData;

        populateMineralFilter(geojsonData);

        renderMineralLayer(geojsonData);
    });

    mapInitialized = true;
}

function renderMapMarkers() {

    data.resources.forEach(resource => {

        if (!resource.lat || !resource.lng) return;

        const marker = L.marker([resource.lat, resource.lng])
            .addTo(map)
            .bindPopup(resource.name);

        marker.on('click', function() {
            openDetail(resource.id);
        });
    });
}

function renderMineralLayer(geojsonData) {

    if (mineralLayer) {
        map.removeLayer(mineralLayer);
    }

    const selectedMineral = document.getElementById("mineralFilter")?.value;

    mineralLayer = L.geoJSON(geojsonData, {

        filter: function(feature) {

            if (!selectedMineral) return true;

            const mineralList = getMineralList(feature);

         if (!mineralList) return false;

            const minerals = mineralList
            .split(",")
         .map(m => m.trim().toLowerCase());

            return minerals.includes(selectedMineral.toLowerCase());
        },

        pointToLayer: function(feature, latlng) {

            const occType = feature.properties.Occ_type;

            return L.circleMarker(latlng, {
                radius: 4,
                fillColor: occType === "M" ? "red" : "blue",
                color: "#000",
                weight: 1,
                fillOpacity: 0.8
            });
        },

        onEachFeature: function(feature, layer) {

    const mineralList = getMineralList(feature);

    const minerals = mineralList
        ? mineralList.split(",")
        : [];

    let mineralHTML = "";

    minerals.forEach(mineral => {

        const trimmed = mineral.trim();
        const id = ensureMineralResourceExists(trimmed);

        mineralHTML += `
            <div 
                onclick="openDetail('${id}')"
                style="color:#2b7a78; cursor:pointer; margin-bottom:4px;">
                ${trimmed}
            </div>
        `;
    });

    layer.bindPopup(`
        <strong>${feature.properties.Name}</strong><br>
        <strong>Type:</strong> ${feature.properties.Occ_type}<br>
        <strong>Minerals:</strong><br>
        ${mineralHTML || "None listed"}
    `);
}

    }).addTo(map);
}

function populateMineralFilter(geojsonData) {

    const select = document.getElementById("mineralFilter");
    const mineralSet = new Set();

    geojsonData.features.forEach(feature => {

        const mineralList = getMineralList(feature);
        if (!mineralList) return;

        mineralList.split(",").forEach(mineral => {
            const trimmed = mineral.trim();
            if (trimmed) mineralSet.add(trimmed);
        });
    });

    mineralSet.forEach(mineral => {
        const option = document.createElement("option");
        option.value = mineral;
        option.textContent = mineral;
        select.appendChild(option);
    });
}

function applyMapFilter() {
    renderMineralLayer(mineralData);
}

function mineralToId(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
}

function ensureMineralResourceExists(mineralName) {

    if (!data || !data.resources) return mineralToId(mineralName);

    const id = mineralToId(mineralName);

    let existing = data.resources.find(r => r.id === id);

    if (!existing) {
        data.resources.push({
            id: id,
            name: mineralName,
            type: "mineral",
            season: ["all"],
            regions: ["province-wide"],
            tags: ["mineral"],
            description: "Mineral occurrence identified in provincial dataset."
        });

        // Only refresh inventory if function exists
        if (typeof displayInventory === "function") {
            displayInventory();
        }
    }

    return id;
}

function getMineralList(feature) {

    const occType = feature.properties.Occ_type;

    const minList = (feature.properties.Min_list || "").trim();
    const commList = (feature.properties.Comm_list || "").trim();

    if (occType === "M") {
        return minList;
    }

    if (occType === "I") {

        if (!commList) return minList;

        const commItems = commList
            .split(",")
            .map(item => item.trim())
            .filter(item => item.length > 0);

        // If ANY entry is 3 characters or fewer → use Min_list
        const anyShort = commItems.some(item => item.length <= 3);

        if (anyShort) {
            return minList;
        }

        return commList;
    }

    return "";
}

function renderCategoryButtons() {

    const container = document.getElementById("categoryButtons");
    container.innerHTML = "";

    // 🔹 Add "All" button first
    const allButton = document.createElement("button");
    allButton.className = "primary";
    allButton.style.marginRight = "8px";
    allButton.style.marginBottom = "8px";
    allButton.textContent = "All";

    allButton.onclick = () => openCategory("all");

    container.appendChild(allButton);

    // 🔹 Get unique categories
    const categories = [...new Set(data.resources.map(r => r.type))];

    categories.forEach(category => {

        const button = document.createElement("button");
        button.className = "primary";
        button.style.marginRight = "8px";
        button.style.marginBottom = "8px";
        button.textContent = capitalize(category);

        button.onclick = () => openCategory(category);

        container.appendChild(button);
    });
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function openCategory(category) {

    if (!data || !data.resources) {
        console.error("Data not loaded yet");
        return;
    }

    currentCategory = category;

    const title = document.getElementById("categoryTitle");
    if (title) {
        title.textContent = category.charAt(0).toUpperCase() + category.slice(1);
    }

    switchView("categoryView");

    populateCategoryTagFilter();
    renderCategoryResources();
}

function populateCategoryTagFilter() {

    const select = document.getElementById("categoryTagFilter");
    select.innerHTML = '<option value="">All Tags</option>';

    const tags = new Set();

    data.resources
        .filter(r => currentCategory === "all" || r.type === currentCategory)
        .forEach(r => r.tags?.forEach(tag => tags.add(tag)));

    tags.forEach(tag => {
        const option = document.createElement("option");
        option.value = tag;
        option.textContent = tag;
        select.appendChild(option);
    });
}

function renderCategoryResources() {

    const container = document.getElementById("categoryResourceList");

    if (!container || !currentCategory) return;

    const search = document.getElementById("categorySearch")?.value.toLowerCase() || "";
    const selectedTag = document.getElementById("categoryTagFilter")?.value || "";

    container.innerHTML = "";

    data.resources
        .filter(r => currentCategory === "all" || r.type === currentCategory)
        .filter(r => r.name.toLowerCase().includes(search))
        .filter(r => !selectedTag || (r.tags && r.tags.includes(selectedTag)))
        .forEach(resource => {
            const div = document.createElement("div");
            div.className = "card";
            const isWood = resource.type === "Wood";

if (isWood) {

    const currentWeight = inventory[resource.id]?.weight_kg || 0;

    div.innerHTML = `
        <div onclick="openDetail('${resource.id}')">
            <strong>${resource.name}</strong>
        </div>

        <div>
            Diameter (in):
            <input type="number" id="diam_${resource.id}" value="8" min="1" style="width:60px;">
        </div>

        <div>
            Length (ft):
            <input type="number" id="length_${resource.id}" value="4" min="1" style="width:60px;">
        </div>

        <button class="primary"
            onclick="event.stopPropagation(); addWoodToInventory('${resource.id}')">
            Add To Inventory
        </button>

        <div>
            Total Stored: ${currentWeight.toFixed(2)} kg
        </div>
    `;
}
else {

    const qty = inventory[resource.id] || 0;

    div.innerHTML = `
    <div class="resource-info" onclick="openDetail('${resource.id}')">
        <strong>${resource.name}</strong><br>
        Quantity: ${qty}
    </div>

    <div class="resource-controls">
        <button class="secondary"
            onclick="event.stopPropagation(); modifyInventory('${resource.id}', -1)">-</button>
        <button class="primary"
            onclick="event.stopPropagation(); modifyInventory('${resource.id}', 1)">+</button>
    </div>
`;
}

            container.appendChild(div);
        });
}

function estimateLogWeightImperial(diameterIn, lengthFt, densityKgPerM3) {

    const diameterM = diameterIn * 0.0254;
    const lengthM = lengthFt * 0.3048;

    const radius = diameterM / 2;

    const volume = Math.PI * radius * radius * lengthM;

    return volume * densityKgPerM3;
}

function adjustDiameter(id, delta) {

    const item = inventory[id] || { diameter_in: 0, length_ft: 0 };

    item.diameter_in = Math.max(0, (item.diameter_in || 0) + delta);

    updateWoodWeight(id, item);
}

function adjustLength(id, delta) {

    const item = inventory[id] || { diameter_in: 0, length_ft: 0 };

    item.length_ft = Math.max(0, (item.length_ft || 0) + delta);

    updateWoodWeight(id, item);
}

function updateWoodWeight(id, item) {

    const resource = data.resources.find(r => r.id === id);

    if (!resource.density) return;

    item.weight_kg = estimateLogWeightImperial(
        item.diameter_in,
        item.length_ft,
        resource.density
    );

    inventory[id] = item;

    localStorage.setItem("inventory", JSON.stringify(inventory));

    displayInventory();
    renderCategoryResources();
}

function addWoodToInventory(id) {

    const resource = data.resources.find(r => r.id === id);
    if (!resource.density) return;

    const diameter = parseFloat(document.getElementById(`diam_${id}`).value);
    const length = parseFloat(document.getElementById(`length_${id}`).value);

    if (!diameter || !length) {
        alert("Enter valid dimensions.");
        return;
    }

    const weight = estimateLogWeightImperial(
        diameter,
        length,
        resource.density
    );

    const currentWeight = inventory[id]?.weight_kg || 0;

    inventory[id] = {
        weight_kg: currentWeight + weight
    };

    localStorage.setItem("inventory", JSON.stringify(inventory));

    displayInventory();
    renderCategoryResources();
}

function renderFireCraftSection(container) {

    const fuelMaterials = data.resources.filter(r =>
        r.tags.includes("fuel") && r.fuel_properties
    );

    if (fuelMaterials.length === 0) return;

    const options = fuelMaterials.map(mat =>
        `<option value="${mat.id}">${mat.name}</option>`
    ).join("");

    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
        <h3>Fire Planning</h3>

        <label>Fuel Material:</label>
        <select id="fireMaterialSelect">${options}</select>

        <label>Desired Duration (hours):</label>
        <input type="number" id="fireDurationInput" value="2" min="0.5" step="0.5">

        <button class="primary" onclick="handleFireCalculation()">
            Calculate Fuel Needed
        </button>

        <div id="fireResult" style="margin-top:10px;"></div>

        <hr>

        <button class="primary" onclick="startFireFromPlanner()">
            Start Fire With Required Fuel
        </button>

        <div id="activeFirePanel" style="margin-top:15px;"></div>
    `;

    container.appendChild(div);
}


function startFireFromPlanner() {

    const materialId =
        document.getElementById("fireMaterialSelect").value;

    const material =
        data.resources.find(r => r.id === materialId);

    if (!material) return;

    const airflow =
        document.getElementById("fireAirflowSelect").value;

    const moisture =
        parseFloat(document.getElementById("fireMoistureInput").value);

    const mode =
        document.querySelector("input[name='fireMode']:checked").value;

    const logs =
        parseInt(document.getElementById("pieceLogs").value) || 0;

    const splits =
        parseInt(document.getElementById("pieceSplits").value) || 0;

    const kindling =
        parseInt(document.getElementById("pieceKindling").value) || 0;

    if (logs + splits + kindling === 0) {
        alert("You must specify at least one piece of wood.");
        return;
    }

    let weight;

    if (mode === "duration") {

        const desiredHours =
            parseFloat(document.getElementById("fireDurationInput").value);

        // Estimate required weight by inverting model
        const test = calculateCombustion(
            material,
            1,
            airflow,
            moisture,
            logs,
            splits,
            kindling
        );

        const burnRate = 1 / test.durationHours;

        weight = desiredHours * burnRate;

    } else {

        weight =
            parseFloat(document.getElementById("fireWeightInput").value);
    }

    const inventoryWeight =
        inventory[materialId]?.weight_kg || 0;

    if (inventoryWeight < weight) {
        alert("Not enough fuel in inventory.");
        return;
    }

    // Remove fuel from inventory
    inventory[materialId].weight_kg -= weight;

    if (inventory[materialId].weight_kg <= 0) {
        delete inventory[materialId];
    }

    localStorage.setItem("inventory", JSON.stringify(inventory));
    displayInventory();

    const results = calculateCombustion(
        material,
        weight,
        airflow,
        moisture,
        logs,
        splits,
        kindling
    );

    activeFire = {
        material_id: materialId,
        total_weight: weight,
        burn_time: results.durationHours,
        max_temperature: results.maxTemperature,
        smoke_level: results.smokeLevel,
        ignition_difficulty: results.ignitionDifficulty,
        airflow,
        moisture,
        logs,
        splits,
        kindling
    };

    renderActiveFirePanel();
}

function displayFireView() {

    const container = document.getElementById("fireContainer");
    container.innerHTML = "";

    renderFirePlanner(container);
}

function renderFirePlanner(container) {

    const fuelMaterials = data.resources.filter(r =>
        r.tags.includes("fuel") && r.fuel_properties
    );

    const options = fuelMaterials.map(mat =>
        `<option value="${mat.id}">${mat.name}</option>`
    ).join("");

    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
        <h3>Fire Planning</h3>

        <label>Fuel:</label>
        <select id="fireMaterialSelect">${options}</select>

        <hr>

        <label>
            <input type="radio" name="fireMode" value="duration" checked>
            Calculate by Duration
        </label>

        <label>
            <input type="radio" name="fireMode" value="weight">
            Calculate by Weight
        </label>

        <div id="durationInputBlock">
            <label>Desired Duration (hours):</label>
            <input type="number" id="fireDurationInput" value="2" min="0.5" step="0.5">
        </div>

        <div id="weightInputBlock" style="display:none;">
            <label>Fuel Weight (kg):</label>
            <input type="number" id="fireWeightInput" value="5" min="0.1" step="0.1">
        </div>

        <hr>

        <label>Airflow:</label>
        <select id="fireAirflowSelect">
            <option value="low">Low (Sheltered)</option>
            <option value="medium" selected>Medium (Open)</option>
            <option value="high">High (Windy)</option>
        </select>

        <label>Moisture Content (%):</label>
        <input type="number" id="fireMoistureInput"
          value="15" min="0" max="60" step="1">

        <hr>

        <h4>Wood Breakdown</h4>

        <label>Large Logs:</label>
        <input type="number" id="pieceLogs" value="2" min="0">

        <label>Medium Splits:</label>
        <input type="number" id="pieceSplits" value="3" min="0">

        <label>Kindling:</label>
        <input type="number" id="pieceKindling" value="4" min="0">

        <div id="firePreview" style="margin-top:15px;"></div>

        <button class="primary" onclick="startFireFromPlanner()">
            Start Fire
        </button>

        <div id="activeFirePanel" style="margin-top:15px;"></div>
    `;

    container.appendChild(div);

    setupFireModeToggle();
    setupFireReactiveUpdates();
}

function setupFireModeToggle() {

    document.querySelectorAll("input[name='fireMode']")
        .forEach(radio => {

            radio.addEventListener("change", () => {

                const mode = document.querySelector("input[name='fireMode']:checked").value;

                document.getElementById("durationInputBlock").style.display =
                    mode === "duration" ? "block" : "none";

                document.getElementById("weightInputBlock").style.display =
                    mode === "weight" ? "block" : "none";
            });
        });
}


function startFireFromPreview() {

    if (!firePreviewData) return;

    const { materialId, weight, maxTemp, smoke } = firePreviewData;

    const inventoryWeight = inventory[materialId]?.weight_kg || 0;

    if (inventoryWeight < weight) {

        alert("Not enough fuel in inventory.");
        return;
    }

    // subtract fuel
    inventory[materialId].weight_kg -= weight;

    if (inventory[materialId].weight_kg <= 0) {
        delete inventory[materialId];
    }

    localStorage.setItem("inventory", JSON.stringify(inventory));
    displayInventory();

    activeFire = {
        material_id: materialId,
        total_weight: weight,
        max_temperature: maxTemp,
        smoke_level: smoke
    };

    renderActiveFirePanel();
}

function renderActiveFirePanel() {

    const panel = document.getElementById("activeFirePanel");

    if (!activeFire) {
        panel.innerHTML = "No Active Fire";
        return;
    }

    panel.innerHTML = `
        <h4>Active Fire</h4>
        Fuel: ${activeFire.material_id}<br>
        Total Fuel: ${activeFire.total_weight.toFixed(2)} kg<br>
        Max Temp: ${activeFire.max_temperature} °C<br>
        Smoke Level: ${(activeFire.smoke_level * 100).toFixed(0)}%
    `;
}

function setupFireReactiveUpdates() {

    const inputs = [
    "fireMaterialSelect",
    "fireDurationInput",
    "fireWeightInput",
    "fireAirflowSelect",
    "fireMoistureInput",
    "pieceLogs",
    "pieceSplits",
    "pieceKindling"
];

    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", updateFirePreview);
        }
    });

    document.querySelectorAll("input[name='fireMode']")
        .forEach(radio => {
            radio.addEventListener("change", updateFirePreview);
        });

    updateFirePreview(); // initial render
}

function updateFirePreview() {

    const materialId =
        document.getElementById("fireMaterialSelect").value;

    const material =
        data.resources.find(r => r.id === materialId);

    if (!material) return;

    const airflow =
        document.getElementById("fireAirflowSelect").value;

    const moisture =
        parseFloat(document.getElementById("fireMoistureInput").value);

    const logs = parseInt(document.getElementById("pieceLogs").value) || 0;
    const splits = parseInt(document.getElementById("pieceSplits").value) || 0;
    const kindling = parseInt(document.getElementById("pieceKindling").value) || 0;

    const mode =
        document.querySelector("input[name='fireMode']:checked").value;

    let weight;

    if (mode === "duration") {

        const desiredHours =
            parseFloat(document.getElementById("fireDurationInput").value);

        // Invert model to estimate required weight
        const test = calculateCombustion(
            material,
            1,
            airflow,
            moisture,
            logs,
            splits,
            kindling
        );

        const burnRate = 1 / test.durationHours;

        weight = desiredHours * burnRate;

    } else {

        weight =
            parseFloat(document.getElementById("fireWeightInput").value);
    }

    const results = calculateCombustion(
    material,
    weight,
    airflow,
    moisture,
    logs,
    splits,
    kindling
);

    const inventoryWeight =
        inventory[materialId]?.weight_kg || 0;

    document.getElementById("firePreview").innerHTML = `
    Required Fuel: ${weight.toFixed(2)} kg<br>
    Estimated Duration: ${results.durationHours.toFixed(2)} hrs<br>
    Max Temperature: ${results.maxTemperature.toFixed(0)} °C<br>
    Smoke Level: ${(results.smokeLevel * 100).toFixed(0)}%<br>
    Ignition Difficulty: ${(results.ignitionDifficulty * 100).toFixed(0)}%<br>
    Available in Inventory: ${inventoryWeight.toFixed(2)} kg
`;
}

function calculateSurfaceFromMassDistribution(totalMassKg, logs, splits, kindling) {

    const massFactors = {
        log: 4,
        split: 2,
        kindling: 1
    };

    const exposedFraction = {
        log: 0.3,
        split: 0.7,
        kindling: 1.0
    };

    const totalFactor =
        logs * massFactors.log +
        splits * massFactors.split +
        kindling * massFactors.kindling;

    if (totalFactor === 0) {
        return null;
    }

    const unitMass = totalMassKg / totalFactor;

    const logMass = massFactors.log * unitMass;
    const splitMass = massFactors.split * unitMass;
    const kindlingMass = massFactors.kindling * unitMass;

    // Surface ~ mass^(2/3)
    const logSurface =
        logs * Math.pow(logMass, 2/3) * exposedFraction.log;

    const splitSurface =
        splits * Math.pow(splitMass, 2/3) * exposedFraction.split;

    const kindlingSurface =
        kindling * Math.pow(kindlingMass, 2/3) * exposedFraction.kindling;

    const totalSurface =
        logSurface + splitSurface + kindlingSurface;

    return totalSurface;
}

function calculateCombustion(material, weightKg, airflowLevel, moisturePercent, logs, splits, kindling) {

    const fuel = material.fuel_properties;

    const baseBurnRate =
        material.tags.includes("softwood") ? 4.0 : 2.5;

    const airflowMultipliers = {
        low: 0.6,
        medium: 1.0,
        high: 1.6
    };

    const airflowFactor =
        airflowMultipliers[airflowLevel] || 1.0;

    const moistureFraction = moisturePercent / 100;

    const combustionEfficiency =
        Math.max(0.3, 1 - (moistureFraction * 1.2));

    const N = logs + splits + kindling;
    if (N <= 0) return null;

    // Surface scaling (physical)
    const surfaceFactor =
        calculateSurfaceFactor(weightKg, logs, splits, kindling);

    // Oxygen-limited burn rate
    const effectiveBurnRate =
        baseBurnRate *
        combustionEfficiency *
        Math.min(surfaceFactor, airflowFactor * 2);

    const durationHours =
        weightKg / effectiveBurnRate;

    // Chemical temperature ceiling
    const oxygenBalance =
        airflowLevel === "medium" ? 1.0 :
        airflowLevel === "low" ? 0.8 : 0.9;

    // Burn intensity relative to base burn rate
const burnIntensity =
    effectiveBurnRate / baseBurnRate;

// Saturation constant (tunable)
const k = 1.5;

// Temperature approaches chemical maximum asymptotically
const maxTemperature =
    fuel.max_temperature *
    combustionEfficiency *
    (1 - Math.exp(-k * burnIntensity));

    const barkExposure =
        calculateBarkExposure(logs, splits, kindling);

    const smokeLevel =
        fuel.smoke_factor *
        (1 + moistureFraction * 1.8) *
        (1 / barkExposure) *
        (airflowLevel === "low" ? 1.3 : 1.0);

    const ignitionDifficulty =
        (1 - fuel.ignition_factor) *
        (1 + moistureFraction * 1.5) *
        (1 / barkExposure);

    const energyMJ =
        weightKg *
        fuel.energy_density *
        combustionEfficiency;

    return {
        durationHours,
        energyMJ,
        smokeLevel,
        maxTemperature,
        ignitionDifficulty
    };
}

function removeWoodWeight(id, amountKg) {

    if (!inventory[id]) return;

    inventory[id].weight_kg -= amountKg;

    if (inventory[id].weight_kg <= 0) {
        delete inventory[id];
    }

    localStorage.setItem("inventory", JSON.stringify(inventory));

    displayInventory();
}

function modifyInventoryWithStep(id, direction) {

    const resource = data.resources.find(r => r.id === id);
    if (!resource) return;

    const stepInput = document.getElementById(`step_${id}`);
    const step = parseFloat(stepInput.value) || 1;

    const isWood = resource.type === "Wood";

    if (isWood) {

        if (!inventory[id]) inventory[id] = { weight_kg: 0 };

        inventory[id].weight_kg += direction * step;

        if (inventory[id].weight_kg <= 0) {
            delete inventory[id];
        }

    } else {

        if (!inventory[id]) inventory[id] = 0;

        inventory[id] += direction * step;

        if (inventory[id] <= 0) {
            delete inventory[id];
        }
    }

    localStorage.setItem("inventory", JSON.stringify(inventory));
    displayInventory();
}

function calculateSurfaceFactor(totalMassKg, logs, splits, kindling) {

    const N = logs + splits + kindling;

    if (N <= 0) return null;

    // Surface ∝ M^(2/3) * N^(1/3)
    const surface = Math.pow(totalMassKg, 2/3) * Math.pow(N, 1/3);

    // Normalize to reference case (1 piece)
    const reference =
        Math.pow(totalMassKg, 2/3) * Math.pow(1, 1/3);

    return surface / reference;
}

function calculateBarkExposure(logs, splits, kindling) {

    const N = logs + splits + kindling;
    if (N <= 0) return 1;

    const exposure =
        logs * 0.3 +
        splits * 0.7 +
        kindling * 1.0;

    return exposure / N;
}