import { leagues } from '../data/leaguesConfig.js';

const DRAFT_LIMITS = {
    porterias: 2,
    defensas: 6,
    mediocampistas: 6,
    delanteros: 4
};

let currentLeagueId = '';
let radarPlayers = [];
let draftedPlayers = [];

document.addEventListener('DOMContentLoaded', () => {
    currentLeagueId = localStorage.getItem('selectedLeague');
    
    if (!currentLeagueId || !leagues[currentLeagueId]) {
        window.location.href = 'index.html';
        return;
    }

    const currentLeague = leagues[currentLeagueId];
    
    document.body.classList.add(`theme-${currentLeague.id}`);
    document.getElementById('header-logo').src = currentLeague.logo;
    document.getElementById('header-title').textContent = currentLeague.name;
    document.title = currentLeague.name + ' - Draft Board';

    // Cargar datos guardados y pintar tablas
    loadData();
    renderAll();
    
    document.getElementById('player-form').addEventListener('submit', handleFormSubmit);
});

// ==========================================
// CONTROL DE INTERFAZ (UI)
// ==========================================

window.openTab = function(evt, tabName) {
    const tabPanes = document.getElementsByClassName("tab-pane");
    for (let i = 0; i < tabPanes.length; i++) {
        tabPanes[i].style.display = "none";
        tabPanes[i].classList.remove("active");
    }
    const tabButtons = document.getElementsByClassName("tab-button");
    for (let i = 0; i < tabButtons.length; i++) {
        tabButtons[i].classList.remove("active");
    }
    document.getElementById(tabName).style.display = "block";
    
    if (evt && evt.currentTarget) {
        evt.currentTarget.classList.add("active");
    }
};

window.openDraft = function() {
    openTab(null, 'mi-draft');
};

window.openModal = function() {
    document.getElementById('player-modal').style.display = 'block';
    toggleStatsFields();
};

window.closeModal = function() {
    document.getElementById('player-modal').style.display = 'none';
    document.getElementById('player-form').reset();
};

window.toggleStatsFields = function() {
    const pos = document.getElementById('player-position').value;
    const groupVallas = document.getElementById('group-vallas');
    const groupGoles = document.getElementById('group-goles');
    const groupAsistencias = document.getElementById('group-asistencias');

    if (pos === 'porterias') {
        groupVallas.style.display = 'block';
        groupGoles.style.display = 'none';
        groupAsistencias.style.display = 'none';
    } else {
        groupVallas.style.display = 'none';
        groupGoles.style.display = 'block';
        groupAsistencias.style.display = 'block';
    }
};

window.onclick = function(event) {
    const modal = document.getElementById('player-modal');
    if (event.target == modal) {
        closeModal();
    }
};

// ==========================================
// LÓGICA DE ALMACENAMIENTO Y TABLAS
// ==========================================

function loadData() {
    const radarData = localStorage.getItem(`radar_${currentLeagueId}`);
    const draftData = localStorage.getItem(`draft_${currentLeagueId}`);
    
    // Si hay datos, los convierte a JSON, si no, inicia arrays vacíos.
    radarPlayers = radarData ? JSON.parse(radarData) : [];
    draftedPlayers = draftData ? JSON.parse(draftData) : [];
}

function saveData() {
    // Guarda de forma independiente el estudio y el equipo final
    localStorage.setItem(`radar_${currentLeagueId}`, JSON.stringify(radarPlayers));
    localStorage.setItem(`draft_${currentLeagueId}`, JSON.stringify(draftedPlayers));
    
    renderAll();
}

function handleFormSubmit(e) {
    e.preventDefault();
    
    const playerName = document.getElementById('player-name').value.trim();
    
    // Validar duplicados en ambas listas
    const isDuplicate = radarPlayers.some(p => p.name.toLowerCase() === playerName.toLowerCase()) || 
                        draftedPlayers.some(p => p.name.toLowerCase() === playerName.toLowerCase());
                        
    if (isDuplicate) {
        alert('Este jugador ya está en tu radar o en tu equipo drafteado.');
        return;
    }

    const pos = document.getElementById('player-position').value;
    
    // Objeto del jugador sin precio
    const newPlayer = {
        id: Date.now().toString(),
        name: playerName,
        position: pos,
        team: document.getElementById('player-team').value,
        fotmob: parseFloat(document.getElementById('player-fotmob').value),
        vallas: pos === 'porterias' ? parseInt(document.getElementById('player-vallas').value) : null,
        goles: pos !== 'porterias' ? parseInt(document.getElementById('player-goles').value) : null,
        asistencias: pos !== 'porterias' ? parseInt(document.getElementById('player-asistencias').value) : null
    };

    radarPlayers.push(newPlayer);
    saveData(); // Esto actualizará el LocalStorage y redibujará las tablas
    closeModal();
}

window.deleteFromRadar = function(id) {
    radarPlayers = radarPlayers.filter(p => p.id !== id);
    saveData();
}

window.draftPlayer = function(id) {
    const player = radarPlayers.find(p => p.id === id);
    if (!player) return;

    const draftedCount = draftedPlayers.filter(p => p.position === player.position).length;
    
    if (draftedCount >= DRAFT_LIMITS[player.position]) {
        alert(`Límite alcanzado para la posición de ${player.position}.`);
        return;
    }

    // Mueve de Radar a Draft
    radarPlayers = radarPlayers.filter(p => p.id !== id);
    draftedPlayers.push(player);
    saveData();
}

window.releasePlayer = function(id) {
    const player = draftedPlayers.find(p => p.id === id);
    if (!player) return;

    // Mueve de Draft a Radar
    draftedPlayers = draftedPlayers.filter(p => p.id !== id);
    radarPlayers.push(player);
    saveData();
}

function renderAll() {
    // 1. Limpiar estructuras
    ['porterias', 'defensas', 'mediocampistas', 'delanteros'].forEach(pos => {
        document.getElementById(`tbody-${pos}`).innerHTML = '';
        document.getElementById(`draft-${pos}`).innerHTML = '';
        document.getElementById(`count-${pos}`).textContent = '0';
    });

    // 2. Pintar Radar
    radarPlayers.forEach((player, index) => {
        const tbody = document.getElementById(`tbody-${player.position}`);
        const tr = document.createElement('tr');
        
        let statsHTML = '';
        if (player.position === 'porterias') {
            statsHTML = `<td>${player.vallas}</td><td>${player.fotmob.toFixed(2)}</td>`;
        } else {
            statsHTML = `<td>${player.goles}</td><td>${player.asistencias}</td><td>${player.fotmob.toFixed(2)}</td>`;
        }

        tr.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${player.name}</strong></td>
            <td>${player.team}</td>
            ${statsHTML}
            <td>
                <button class="select-btn" onclick="draftPlayer('${player.id}')">Draftear ✔</button>
                <button class="delete-btn" onclick="deleteFromRadar('${player.id}')">Eliminar ✖</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // 3. Pintar Mi Draft
    let totalPlayers = draftedPlayers.length;

    draftedPlayers.forEach(player => {
        const container = document.getElementById(`draft-${player.position}`);
        const card = document.createElement('div');
        card.className = 'player-draft-card';
        
        card.innerHTML = `
            <strong>${player.name}</strong>
            <span>${player.team}</span>
            <span>Nota: ${player.fotmob.toFixed(2)}</span>
            <button class="delete-btn" style="margin-top: 5px;" onclick="releasePlayer('${player.id}')">Soltar Jugador</button>
        `;
        container.appendChild(card);
    });

    // 4. Actualizar contadores
    ['porterias', 'defensas', 'mediocampistas', 'delanteros'].forEach(pos => {
        const count = draftedPlayers.filter(p => p.position === pos).length;
        document.getElementById(`count-${pos}`).textContent = count;
    });

    document.getElementById('total-jugadores').textContent = totalPlayers;
}