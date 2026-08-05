import { leagues } from '../data/leaguesConfig.js';

document.addEventListener('DOMContentLoaded', () => {
    const selectorContainer = document.getElementById('league-selector');

    Object.values(leagues).forEach(league => {
        const card = document.createElement('div');
        card.className = 'league-card';
        card.style.cursor = 'pointer';
        card.innerHTML = `
            <img src="${league.logo}" alt="Logo ${league.name}" width="150">
            <h2>${league.name}</h2>
        `;
        
        card.addEventListener('click', () => {
            // Guardamos la liga seleccionada en el almacenamiento del navegador
            localStorage.setItem('selectedLeague', league.id);
            // Redirigimos a la vista general de equipos
            window.location.href = 'mi-equipo.html';
        });

        selectorContainer.appendChild(card);
    });
});