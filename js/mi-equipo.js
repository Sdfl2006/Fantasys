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
let currentTabPosition = 'porterias';
let apiPlayersData = [];

let searchTerm = '';
let sortState = { column: null, asc: true };
let accionPendienteDeConfirmacion = null;

const fotmobTeamIds = {
    "AFC Bournemouth": 8678, "Bournemouth": 8678,
    "Arsenal": 9825,
    "Aston Villa": 10252,
    "Brentford": 9937,
    "Brighton & Hove Albion": 10204, "Brighton": 10204,
    "Chelsea": 8455,
    "Coventry City": 8669, "Coventry": 8669,
    "Crystal Palace": 9826,
    "Everton": 8668,
    "Fulham": 9879,
    "Hull City": 8667, "Hull": 8667,
    "Ipswich Town": 9902, "Ipswich": 9902,
    "Leeds United": 8463, "Leeds": 8463,
    "Liverpool": 8650,
    "Manchester City": 8456, "Man City": 8456,
    "Manchester United": 10260, "Man United": 10260,
    "Newcastle United": 10261, "Newcastle": 10261,
    "Nottingham Forest": 10203, "Nottm Forest": 10203,
    "Sunderland": 8472,
    "Tottenham Hotspur": 8586, "Tottenham": 8586
};

window.getEscudoUrl = function(teamName) {
    const id = fotmobTeamIds[teamName];
    // Usamos el CDN directo de FotMob para escudos
    return id ? `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png` : '';
};

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
    currentTabPosition = tabName; 

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

    const actionsContainer = document.getElementById('radar-actions-container');
    if (actionsContainer) {
        if (tabName === 'mi-draft') {
            actionsContainer.style.display = 'none';
        } else {
            actionsContainer.style.display = 'flex'; 
            const labels = {
                'porterias': 'Porteros',
                'defensas': 'Defensas',
                'mediocampistas': 'Mediocampistas',
                'delanteros': 'Delanteros'
            };
            const btnDeleteAll = document.getElementById('btn-delete-all-radar');
            if (btnDeleteAll) {
                btnDeleteAll.textContent = `Borrar todos los ${labels[tabName]}`;
            }
        }
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
        asistencias: pos !== 'porterias' ? parseInt(document.getElementById('player-asistencias').value) || 0 : null,
        imagen: 'https://premierleague.com/resources/prod/v2/smart/img/player-missing.png'
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
    const player = radarPlayers.find(p => p.id === id);
    if (!player) return;

    showCustomConfirm(
        'Eliminar Jugador', 
        `¿Estás seguro de que deseas eliminar a ${player.name} de tu estudio?`, 
        () => {
            radarPlayers = radarPlayers.filter(p => p.id !== id);
            saveData();
        }
    );
};

window.deleteAllInCurrentTab = function() {
    const labels = {
        'porterias': 'Porteros',
        'defensas': 'Defensas',
        'mediocampistas': 'Mediocampistas',
        'delanteros': 'Delanteros'
    };
    const positionName = labels[currentTabPosition];
    const hasPlayers = radarPlayers.some(p => p.position === currentTabPosition);
    
    if(!hasPlayers) {
        showCustomAlert('Aviso', `No tienes ${positionName.toLowerCase()} en tu radar para borrar.`);
        return; 
    }

    showCustomConfirm(
        'Borrar Posición Completa', 
        `¿Estás seguro de que deseas eliminar a todos los ${positionName.toLowerCase()} de tu radar de estudio? Esta acción no se puede deshacer.`, 
        () => {
            radarPlayers = radarPlayers.filter(p => p.position !== currentTabPosition);
            saveData();
        }
    );
};

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

function getTop10PorPosicion() {
    const disponibles = apiPlayersData.filter(jugador => {
        const yaEnRadar = radarPlayers.some(p => p.name === jugador.name);
        const yaDrafteado = draftedPlayers.some(p => p.name === jugador.name);
        const esMismaPosicion = jugador.position === currentTabPosition;
        
        return !yaEnRadar && !yaDrafteado && esMismaPosicion;
    });

    disponibles.sort((a, b) => b.fotmob - a.fotmob);
    return disponibles.slice(0, 10);
}

window.openApiModal = async function() {
    if (currentLeagueId !== 'premier') {
        alert('Esta acción solo está disponible para la FantaPremier.');
        return;
    }
    
    document.getElementById('api-search-modal').style.display = 'block';
    document.getElementById('api-search-input').value = '';
    document.getElementById('api-search-results').innerHTML = '';

    if (apiPlayersData.length === 0) {
        const btnLoadApi = document.getElementById('btn-load-api');
        const originalText = btnLoadApi.textContent;
        btnLoadApi.textContent = 'Cargando Base de Datos...';
        btnLoadApi.disabled = true;

        try {
            const response = await fetch('./data/jugadores_actualizados.json');
            
            if (!response.ok) {
                throw new Error('No se encontró el archivo local.');
            }
            
            apiPlayersData = await response.json();
            
        } catch (error) {
            console.error(error);
            alert('Aún no has generado el archivo JSON con el scraper de Node.js.');
            closeApiModal();
            return;
        } finally {
            btnLoadApi.textContent = originalText;
            btnLoadApi.disabled = false;
        }
    }

    const topPlayers = getTop10PorPosicion();
    mostrarResultadosApi(topPlayers);
};

window.closeApiModal = function() {
    document.getElementById('api-search-modal').style.display = 'none';
};

function mostrarResultadosApi(jugadoresArray) {
    const resultsContainer = document.getElementById('api-search-results');
    resultsContainer.innerHTML = '';

    jugadoresArray.forEach(jugador => {
        const existe = radarPlayers.some(p => p.name === jugador.name) || 
                       draftedPlayers.some(p => p.name === jugador.name);

        const iniciales = jugador.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const imgFallback = `https://ui-avatars.com/api/?name=${iniciales}&background=eaeaea&color=333&size=110`;

        const item = document.createElement('div');
        item.className = 'api-result-item';
        item.innerHTML = `
            <div class="api-result-info">
                <img src="${jugador.imagen}" onerror="this.onerror=null; this.src='${imgFallback}';" alt="${jugador.name}">
                <div>
                    <strong>${jugador.name}</strong>
                    <small style="display: flex; align-items: center; gap: 5px; margin-top: 4px;">
                        <span> ${jugador.team} • ${jugador.position.charAt(0).toUpperCase() + jugador.position.slice(1)}</span>
                    </small>
                </div>
            </div>
            <button class="add-player-btn" style="padding: 0.6rem 1.2rem; ${existe ? 'background: #ccc; box-shadow: none;' : ''}" 
                    ${existe ? 'disabled' : ''} 
                    onclick="agregarDesdeJSON('${jugador.id}')">
                ${existe ? 'Añadido' : 'Agregar'}
            </button>
        `;
        resultsContainer.appendChild(item);
    });
}

document.getElementById('api-search-input').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const resultsContainer = document.getElementById('api-search-results');
    
    if (query.length === 0) {
        const topPlayers = getTop10PorPosicion();
        mostrarResultadosApi(topPlayers);
        return;
    }
    
    if (query.length < 2) return;

    const encontrados = apiPlayersData.filter(j => 
        j.name.toLowerCase().includes(query)
    ).slice(0, 15);

    if (encontrados.length === 0) {
        const nombreSugerido = query.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        
        resultsContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem 1rem; border: 1px dashed #ccc; border-radius: 8px; margin-top: 1rem;">
                <p style="color: #666; margin-bottom: 1rem;">No encontramos a "<strong>${nombreSugerido}</strong>" en la base de datos actual.</p>
                <button class="add-player-btn" style="margin: 0 auto; display: inline-block;" 
                    onclick="closeApiModal(); openModal(); document.getElementById('player-name').value = '${nombreSugerido}';">
                    Crear Jugador Manualmente
                </button>
            </div>
        `;
        return;
    }

    mostrarResultadosApi(encontrados);
});

window.agregarDesdeJSON = function(idLocal) {
    const jugador = apiPlayersData.find(j => j.id === idLocal);
    if(!jugador) return;

    radarPlayers.push(jugador); 
    saveData();
    
    document.getElementById('api-search-input').dispatchEvent(new Event('input'));
};

window.showCustomConfirm = function(titulo, mensaje, accionConfirmada) {
    document.getElementById('confirm-title').textContent = titulo;
    document.getElementById('confirm-message').textContent = mensaje;
    
    document.getElementById('confirm-cancel-btn').style.display = 'inline-block';
    const acceptBtn = document.getElementById('confirm-accept-btn');
    acceptBtn.textContent = 'Eliminar';
    acceptBtn.style.background = '#e74c3c';
    
    accionPendienteDeConfirmacion = accionConfirmada;
    document.getElementById('custom-confirm-modal').style.display = 'block';
};

window.showCustomAlert = function(titulo, mensaje) {
    document.getElementById('confirm-title').textContent = titulo;
    document.getElementById('confirm-message').textContent = mensaje;
    
    document.getElementById('confirm-cancel-btn').style.display = 'none';
    const acceptBtn = document.getElementById('confirm-accept-btn');
    acceptBtn.textContent = 'Entendido';
    acceptBtn.style.background = '#3498db'; 
    
    accionPendienteDeConfirmacion = null; 
    document.getElementById('custom-confirm-modal').style.display = 'block';
};

window.closeCustomConfirm = function() {
    document.getElementById('custom-confirm-modal').style.display = 'none';
    accionPendienteDeConfirmacion = null;
};

document.addEventListener('DOMContentLoaded', () => {
    
    const acceptBtn = document.getElementById('confirm-accept-btn');
    if(acceptBtn) {
        acceptBtn.addEventListener('click', () => {
            if(accionPendienteDeConfirmacion) {
                accionPendienteDeConfirmacion();
            }
            closeCustomConfirm();
        });
    }
});

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

    let contadores = {
        porterias: 1,
        defensas: 1,
        mediocampistas: 1,
        delanteros: 1
    };

    filteredPlayers.forEach(player => {
        const tbody = document.getElementById(`tbody-${player.position}`);
        const tr = document.createElement('tr');
        const numeroFila = contadores[player.position]++;
        
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

        const iniciales = player.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const fallbackUrl = `https://ui-avatars.com/api/?name=${iniciales}&background=eaeaea&color=333&size=110`;

        tr.innerHTML = `
            <td>${numeroFila}</td>
            <td><img src="${player.imagen || fallbackUrl}" onerror="this.onerror=null; this.src='${fallbackUrl}';" alt="${player.name}" width="55" height="70" style="border-radius: 2px; object-fit: cover; background: #eaeaea;"></td>
            <td><strong>${player.name}</strong></td>
            <td style="text-align: center; vertical-align: middle;">
                <img src="${getEscudoUrl(player.team)}" title="${player.team}" style="width: 55px; height: 70px; object-fit: contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">
                <span style="display: none; font-size: 0.85rem; font-weight: 500;">${player.team}</span>
            </td>
            ${statsHTML}
            <td>
                ${arrowBtns}
                <button class="edit-btn" onclick="editPlayer('${player.id}')">Editar</button>
                <button class="select-btn" onclick="draftPlayer('${player.id}')">Draftear</button>
                <button class="delete-btn" onclick="deleteFromRadar('${player.id}')">X</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    draftedPlayers.forEach(player => {
        const container = document.getElementById(`draft-${player.position}`);
        const card = document.createElement('div');
        card.className = 'player-draft-card';
        
        // Formato de estadísticas
        let statsStr = player.position === 'porterias' 
            ? `Vallas Invictas: <strong>${player.vallas}</strong>` 
            : `Goles: <strong>${player.goles}</strong>
             Asistencias: <strong>${player.asistencias}</strong>`;
        
        const iniciales = player.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const fallbackUrl = `https://ui-avatars.com/api/?name=${iniciales}&background=eaeaea&color=333&size=150`;

        // Estilos para transformar la tarjeta en un diseño vertical (tipo cromo / carta)
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.justifyContent = 'space-between';
        card.style.padding = '1.2rem 1rem 1rem 1rem';
        card.style.background = '#ffffff';
        card.style.border = '1px solid #eaeaea';
        card.style.borderRadius = '12px';
        card.style.boxShadow = '0 4px 6px rgba(0,0,0,0.03)';
        card.style.width = '160px';
        card.style.textAlign = 'center';
        
        card.innerHTML = `
            <!-- 1. FOTO GRANDE ARRIBA -->
            <div style="width: 90px; height: 90px; margin-bottom: 0.8rem; border-radius: 50%; overflow: hidden; background: #f4f4f4; border: 3px solid #eaeaea; display: flex; align-items: center; justify-content: center;">
                <img src="${player.imagen || fallbackUrl}" onerror="this.onerror=null; this.src='${fallbackUrl}';" alt="${player.name}" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
            
            <!-- 2. NOMBRE Y ESCUDO -->
            <div style="width: 100%; margin-bottom: 0.6rem;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 0.2rem;">
                    <img src="${getEscudoUrl(player.team)}" title="${player.team}" style="width: 18px; height: 18px; object-fit: contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
                    <span style="display: none; font-size: 0.75rem; color: #555;">${player.team}</span>
                    <strong style="font-size: 0.95rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px;" title="${player.name}">${player.name}</strong>
                </div>
            </div>

            <!-- 3. ESTADÍSTICAS ABAJO -->
            <div style="width: 100%; font-size: 0.8rem; color: #666; background: #f9f9f9; padding: 0.5rem; border-radius: 6px; margin-bottom: 0.8rem; border: 1px solid #f0f0f0;">
                <div style="margin-bottom: 0.2rem;">${statsStr}</div>
                <div>Nota: <strong>${player.fotmob.toFixed(2)}</strong></div>
            </div>
            
            <!-- 4. BOTÓN SOLTAR ABAJO -->
            <button class="delete-btn" title="Soltar a ${player.name}" onclick="releasePlayer('${player.id}')" style="width: 100%; margin: 0; padding: 0.4rem 0; border-radius: 6px; font-weight: 600; font-size: 0.85rem; cursor: pointer;">
                Soltar
            </button>
        `;
        container.appendChild(card);
    });

    ['porterias', 'defensas', 'mediocampistas', 'delanteros'].forEach(pos => {
        const count = draftedPlayers.filter(p => p.position === pos).length;
        document.getElementById(`count-${pos}`).textContent = count;
    });

    document.getElementById('total-jugadores').textContent = draftedPlayers.length;
}