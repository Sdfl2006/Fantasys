# 🏆 Fantasys - Draft Board & Radar de Estudio

Una plataforma interactiva y multiliga diseñada para la gestión táctica, estudio exhaustivo y simulación de Draft de jugadores para ligas Fantasy. 

Construida con una arquitectura modular y un enfoque *frontend-first* en Vanilla JavaScript, la aplicación funciona de manera autónoma sin necesidad de un backend tradicional. Se alimenta de bases de datos generadas dinámicamente mediante un motor de scraping en Node.js que extrae estadísticas, imágenes y escudos en alta resolución directamente desde FotMob.

---

## ✨ Características Principales

* 🌍 **Entorno Multiliga Dinámico:** El ecosistema soporta múltiples ligas simultáneas (FantaPremier, FantaLiga, FantaCalcio). La interfaz, los colores, logotipos y bases de datos mutan instantáneamente dependiendo de la liga seleccionada a través de un sistema de variables CSS y módulos JS.
* 🧠 **Buscador Inteligente Contextual:** Un motor de búsqueda que sugiere un "Top 10" dinámico de jugadores disponibles según la pestaña activa (ej. sugiere los jugadores con más vallas invictas en 'Porteros' o con más goles en 'Delanteros'). Excluye automáticamente a los jugadores que ya han sido drafteados o están en el radar.
* 🃏 **Draft Board Estilo "Ultimate Team":** Los jugadores seleccionados se organizan en tarjetas premium cuadradas, destacando la fotografía del jugador, el escudo del club y sus estadísticas clave en un diseño limpio y altamente visual.
* 🛡️ **Validaciones y Gestión de Estado:** Algoritmos que bloquean las selecciones al alcanzar los límites de plantilla estandarizados (2 Porteros, 6 Defensas, 6 Medios, 4 Delanteros). La persistencia de datos está garantizada de forma local y segura mediante `localStorage`.
* 📱 **Diseño 100% Responsivo (Native App Feel):** Las tablas tradicionales de escritorio mutan a un diseño de tarjetas independientes en dispositivos móviles mediante *Flexbox*, asegurando una navegación sin *scroll* horizontal y facilitando la interacción táctil.
* 🔔 **Sistema de Alertas Nativas:** Despedida completa de los `alert()` y `confirm()` genéricos del navegador, sustituyéndolos por modales HTML integrados con la paleta de colores de la aplicación.

---

## 🛠️ Stack Tecnológico

**Frontend:**
* **HTML5 & CSS3:** Maquetación semántica, Flexbox/Grid y variables CSS globales para el manejo de temas por liga.
* **Vanilla JavaScript (ES6+):** Lógica del Draft, renderizado de componentes DOM en tiempo real, `fetch` asíncrono e inyección de datos sin el peso de frameworks externos.

**Backend / Extracción de Datos:**
* **Node.js:** Entorno de ejecución para los scripts de recolección de datos.
* **Axios:** Cliente HTTP para la comunicación con los endpoints no documentados de FotMob.
* **File System (`fs`):** Para la escritura y actualización automatizada de los archivos JSON locales.

---

## 📁 Estructura del Proyecto

```text
Fantasys/
│
├── index.html            # Landing page y selector de liga
├── mi-equipo.html        # Aplicación principal (Radar y Draft Board)
│
├── assets/               # Logotipos e imágenes estáticas de las ligas
│
├── data/                 # Bases de datos consumidas por el Frontend
│   ├── leaguesConfig.js         # Módulo central de configuración de ligas
│   ├── jugadores_premier.json   # DB autogenerada de la Premier League
│   ├── jugadores_liga.json      # DB autogenerada de LaLiga
│   └── jugadores_calcio.json    # DB autogenerada de la Serie A
│
├── js/                   # Lógica del Frontend
│   ├── main.js                  # Lógica de la Landing Page
│   └── mi-equipo.js             # Lógica core: Renderizado, Modal, Búsqueda y LocalStorage
│
├── styles/               # Hojas de estilo
│   └── styles.css               # Estilos globales, temas y Media Queries
│
└── scraper/              # Motor de Scraping
    ├── index.js                 # Script maestro multiliga
    ├── agregar_fichaje.js       # Script para forzar la inyección manual de un jugador
    ├── package.json             # Dependencias del scraper (Axios)
    └── node_modules/
```

---

## 🤖 Uso del Motor Multi-Liga (Scraper)

La plataforma cuenta con un potente *scraper* ético que extrae las plantillas completas de los 20 equipos de una liga específica, obtiene sus estadísticas de la última temporada (Goles, Asistencias, Vallas invictas y Nota FotMob) y empaqueta todo en un JSON consumible por la app.

### Instalación inicial
1. Abre tu terminal y navega a la carpeta del scraper: `cd scraper`
2. Instala las dependencias necesarias: `npm install`

### Actualización de Bases de Datos
Para extraer o actualizar la información de una liga, ejecuta el script maestro pasándole como argumento el ID de la liga:

```bash
# Para actualizar la Premier League
node index.js premier

# Para actualizar LaLiga Española
node index.js liga

# Para actualizar la Serie A Italiana
node index.js calcio
```

> **Nota:** El script automatiza pausas (`delays`) entre peticiones para respetar los servidores de origen. Al finalizar, depositará un archivo (ej. `jugadores_premier.json`) de forma directa en la carpeta `/data`.

---

## 🚀 Despliegue en Producción

Al ser una aplicación **Frontend Estática**, Fantasys está preparada para ser desplegada en segundos utilizando plataformas como **Netlify**, **Vercel** o **GitHub Pages**:

1. Sube tu repositorio completo a GitHub.
2. Vincula el repositorio a Netlify/Vercel.
3. Deja los campos de *Build Command* y *Publish Directory* en blanco (o usa la raíz `/`).
4. Despliega. Los archivos JSON generados por el scraper funcionarán como tu propia API interna y la página se ejecutará a la velocidad de la luz.

---
*Diseñado y desarrollado para dominar las ligas Fantasy con análisis de datos.*