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

let searchTerm = '';
let sortState = { column: null, asc: true };

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

    loadData();
    renderAll();
    
    document.getElementById('player-form').addEventListener('submit', handleFormSubmit);
    
    document.getElementById('search-input').addEventListener('input', (e) => {
        searchTerm = e.target.value.toLowerCase();
        renderAll();
    });

    document.querySelectorAll('.players-table th.sortable').forEach(th => {
        th.addEventListener('click', function() {
            const column = th.getAttribute('data-sort');
            if (sortState.column === column) {
                if (sortState.asc) {
                    sortState.asc = false;
                } else {
                    sortState.column = null;
                    sortState.asc = true;
                }
            } else {
                sortState.column = column;
                sortState.asc = false; 
            }
            renderAll();
        });
    });
});

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

    const btnAddRadar = document.getElementById('btn-add-radar');
    if (btnAddRadar) {
        btnAddRadar.style.display = tabName === 'mi-draft' ? 'none' : 'block';
    }
};

window.openDraft = function() {
    openTab(null, 'mi-draft');
};

window.openModal = function() {
    document.getElementById('modal-title').textContent = 'Agregar Jugador';
    document.getElementById('player-id').value = '';
    document.getElementById('player-form').reset();
    document.getElementById('player-modal').style.display = 'block';
    
    const floatBtn = document.querySelector('.jugadores-total-btn');
    if(floatBtn) floatBtn.style.display = 'none';
    
    toggleStatsFields();
};

window.closeModal = function() {
    document.getElementById('player-modal').style.display = 'none';
    
    const floatBtn = document.querySelector('.jugadores-total-btn');
    if(floatBtn) floatBtn.style.display = '';
};

window.onclick = function(event) {
    const modal = document.getElementById('player-modal');
    if (event.target == modal) {
        closeModal();
    }
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

function loadData() {
    const radarData = localStorage.getItem(`radar_${currentLeagueId}`);
    const draftData = localStorage.getItem(`draft_${currentLeagueId}`);
    radarPlayers = radarData ? JSON.parse(radarData) : [];
    draftedPlayers = draftData ? JSON.parse(draftData) : [];
}

function saveData() {
    localStorage.setItem(`radar_${currentLeagueId}`, JSON.stringify(radarPlayers));
    localStorage.setItem(`draft_${currentLeagueId}`, JSON.stringify(draftedPlayers));
    renderAll();
}

function handleFormSubmit(e) {
    e.preventDefault();
    
    const editId = document.getElementById('player-id').value;
    const playerName = document.getElementById('player-name').value.trim();
    const pos = document.getElementById('player-position').value;
    
    const isDuplicate = radarPlayers.some(p => p.name.toLowerCase() === playerName.toLowerCase() && p.id !== editId) || 
                        draftedPlayers.some(p => p.name.toLowerCase() === playerName.toLowerCase() && p.id !== editId);
                        
    if (isDuplicate) {
        alert('Este jugador ya está en tu radar o en tu equipo drafteado.');
        return;
    }

    const playerObj = {
        id: editId ? editId : Date.now().toString(),
        name: playerName,
        position: pos,
        team: document.getElementById('player-team').value,
        fotmob: parseFloat(document.getElementById('player-fotmob').value) || 0,
        vallas: pos === 'porterias' ? parseInt(document.getElementById('player-vallas').value) || 0 : null,
        goles: pos !== 'porterias' ? parseInt(document.getElementById('player-goles').value) || 0 : null,
        asistencias: pos !== 'porterias' ? parseInt(document.getElementById('player-asistencias').value) || 0 : null
    };

    if (editId) {
        const index = radarPlayers.findIndex(p => p.id === editId);
        if (index > -1) {
            radarPlayers[index] = playerObj;
        }
    } else {
        radarPlayers.push(playerObj);
    }

    saveData();
    closeModal();
}

window.editPlayer = function(id) {
    const player = radarPlayers.find(p => p.id === id);
    if (!player) return;

    document.getElementById('modal-title').textContent = 'Editar Jugador';
    document.getElementById('player-id').value = player.id;
    document.getElementById('player-name').value = player.name;
    document.getElementById('player-position').value = player.position;
    document.getElementById('player-team').value = player.team;
    document.getElementById('player-fotmob').value = player.fotmob;

    toggleStatsFields();

    if (player.position === 'porterias') {
        document.getElementById('player-vallas').value = player.vallas || 0;
    } else {
        document.getElementById('player-goles').value = player.goles || 0;
        document.getElementById('player-asistencias').value = player.asistencias || 0;
    }

    document.getElementById('player-modal').style.display = 'block';
    
    const floatBtn = document.querySelector('.jugadores-total-btn');
    if(floatBtn) floatBtn.style.display = 'none';
}

window.movePlayer = function(id, direction) {
    const index = radarPlayers.findIndex(p => p.id === id);
    if (index === -1) return;

    sortState.column = null;

    if (direction === 'up' && index > 0) {
        [radarPlayers[index], radarPlayers[index - 1]] = [radarPlayers[index - 1], radarPlayers[index]];
    } else if (direction === 'down' && index < radarPlayers.length - 1) {
        [radarPlayers[index], radarPlayers[index + 1]] = [radarPlayers[index + 1], radarPlayers[index]];
    }
    
    saveData();
}

window.deleteFromRadar = function(id) {
    if(confirm('¿Seguro que deseas eliminar este jugador de tu estudio?')) {
        radarPlayers = radarPlayers.filter(p => p.id !== id);
        saveData();
    }
}

window.draftPlayer = function(id) {
    const player = radarPlayers.find(p => p.id === id);
    if (!player) return;

    const draftedCount = draftedPlayers.filter(p => p.position === player.position).length;
    if (draftedCount >= DRAFT_LIMITS[player.position]) {
        alert(`Límite alcanzado para la posición de ${player.position}.`);
        return;
    }

    radarPlayers = radarPlayers.filter(p => p.id !== id);
    draftedPlayers.push(player);
    saveData();
}

window.releasePlayer = function(id) {
    const player = draftedPlayers.find(p => p.id === id);
    if (!player) return;

    draftedPlayers = draftedPlayers.filter(p => p.id !== id);
    radarPlayers.push(player);
    saveData();
}

function renderAll() {
    ['porterias', 'defensas', 'mediocampistas', 'delanteros'].forEach(pos => {
        document.getElementById(`tbody-${pos}`).innerHTML = '';
        document.getElementById(`draft-${pos}`).innerHTML = '';
        document.getElementById(`count-${pos}`).textContent = '0';
    });

    let filteredPlayers = [...radarPlayers];

    if (searchTerm) {
        filteredPlayers = filteredPlayers.filter(p => 
            p.name.toLowerCase().includes(searchTerm) || 
            p.team.toLowerCase().includes(searchTerm)
        );
    }

    if (sortState.column) {
        filteredPlayers.sort((a, b) => {
            let valA = a[sortState.column];
            let valB = b[sortState.column];
            
            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return sortState.asc ? -1 : 1;
            if (valA > valB) return sortState.asc ? 1 : -1;
            return 0;
        });
    }

    const isSortedOrFiltered = sortState.column !== null || searchTerm !== '';

    filteredPlayers.forEach((player, visualIndex) => {
        const tbody = document.getElementById(`tbody-${player.position}`);
        const tr = document.createElement('tr');
        
        let statsHTML = '';
        if (player.position === 'porterias') {
            statsHTML = `<td>${player.vallas}</td><td>${player.fotmob.toFixed(2)}</td>`;
        } else {
            statsHTML = `<td>${player.goles}</td><td>${player.asistencias}</td><td>${player.fotmob.toFixed(2)}</td>`;
        }

        let arrowBtns = isSortedOrFiltered ? '' : `
            <button class="move-btn" onclick="movePlayer('${player.id}', 'up')" title="Subir">▲</button>
            <button class="move-btn" onclick="movePlayer('${player.id}', 'down')" title="Bajar">▼</button>
        `;

        tr.innerHTML = `
            <td>${visualIndex + 1}</td>
            <td><strong>${player.name}</strong></td>
            <td>${player.team}</td>
            ${statsHTML}
            <td>
                ${arrowBtns}
                <button class="edit-btn" onclick="editPlayer('${player.id}')">Editar</button>
                <button class="select-btn" onclick="draftPlayer('${player.id}')">Draftear</button>
                <button class="delete-btn" onclick="deleteFromRadar('${player.id}')">✖</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    draftedPlayers.forEach(player => {
        const container = document.getElementById(`draft-${player.position}`);
        const card = document.createElement('div');
        card.className = 'player-draft-card';
        
        let statsStr = player.position === 'porterias' 
            ? `Vallas: ${player.vallas}` 
            : `G: ${player.goles} | A: ${player.asistencias}`;
        
        card.innerHTML = `
            <strong>${player.name}</strong>
            <span>${player.team}</span>
            <span>${statsStr} | Nota: ${player.fotmob.toFixed(2)}</span>
            <button class="delete-btn" style="margin-top: 5px;" onclick="releasePlayer('${player.id}')">Soltar Jugador</button>
        `;
        container.appendChild(card);
    });

    ['porterias', 'defensas', 'mediocampistas', 'delanteros'].forEach(pos => {
        const count = draftedPlayers.filter(p => p.position === pos).length;
        document.getElementById(`count-${pos}`).textContent = count;
    });

    document.getElementById('total-jugadores').textContent = draftedPlayers.length;
}