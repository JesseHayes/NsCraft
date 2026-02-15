let data;
let inventory = JSON.parse(localStorage.getItem("inventory")) || {};
let currentSeason = "summer";

fetch("data.json")
    .then(response => response.json())
    .then(json => {
        data = json;
        initializeTargetSelector();
        initializeSeasonSelector();
        renderAll();
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
    const container = document.getElementById("inventory");
    container.innerHTML = "";

    data.resources.forEach(resource => {
        const qty = inventory[resource.id] || 0;

        const div = document.createElement("div");
        div.innerHTML = `
            <strong>${resource.name}</strong> (${resource.type}) 
            [Season: ${resource.season.join(", ")}]
            <br>
            Quantity: ${qty}
        `;

        const addBtn = document.createElement("button");
        addBtn.textContent = "+";
        addBtn.onclick = () => modifyInventory(resource.id, 1);

        const removeBtn = document.createElement("button");
        removeBtn.textContent = "-";
        removeBtn.onclick = () => modifyInventory(resource.id, -1);

        div.appendChild(addBtn);
        div.appendChild(removeBtn);

        container.appendChild(div);
        container.appendChild(document.createElement("hr"));
    });
}

function modifyInventory(resourceId, amount) {
    inventory[resourceId] = (inventory[resourceId] || 0) + amount;

    if (inventory[resourceId] < 0) {
        inventory[resourceId] = 0;
    }

    localStorage.setItem("inventory", JSON.stringify(inventory));
    renderAll();
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
    const list = document.getElementById("craftable");
    list.innerHTML = "";

    data.resources.forEach(resource => {

        const li = document.createElement("li");

        if (canCraftResource(resource.id)) {
            li.innerHTML = `<strong>${resource.name}</strong> ✅ craftable`;
        } else {
            li.innerHTML = `${resource.name} ❌ not craftable`;
        }

        list.appendChild(li);
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