/**
 * Ghost Recon Wildlands - Base Mapper Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const mapViewport = document.getElementById('mapViewport');
  const mapStage = document.getElementById('mapStage');
  const mapImage = document.getElementById('mapImage');
  const markerOverlay = document.getElementById('markerOverlay');

  // Controls
  const modeAddBtn = document.getElementById('modeAddBtn');
  const modePanBtn = document.getElementById('modePanBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomRange = document.getElementById('zoomRange');
  const zoomValueDisplay = document.getElementById('zoomValueDisplay');
  const zoomResetBtn = document.getElementById('zoomResetBtn');
  const searchInput = document.getElementById('searchInput');
  const coordsDisplay = document.getElementById('coordsDisplay');
  const baseCount = document.getElementById('baseCount');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const importJsonBtn = document.getElementById('importJsonBtn');
  const fileInput = document.getElementById('fileInput');
  const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
  const sidebar = document.getElementById('sidebar');
  const baseList = document.getElementById('baseList');
  const emptyState = document.getElementById('emptyState');

  // Quick Modal Elements
  const quickModal = document.getElementById('quickModal');
  const modalTitle = document.getElementById('modalTitle');
  const baseNameInput = document.getElementById('baseNameInput');
  const modalCoordsInfo = document.getElementById('modalCoordsInfo');
  const saveBaseBtn = document.getElementById('saveBaseBtn');
  const deleteModalBaseBtn = document.getElementById('deleteModalBaseBtn');
  const cancelBaseBtn = document.getElementById('cancelBaseBtn');
  const modalCloseBtn = document.getElementById('modalCloseBtn');

  // State Variables
  let bases = []; // Array of { id, name, x, y, timestamp }
  let mode = 'add'; // 'add' or 'pan'
  let zoom = 1.0; // 1.0 = 100%, max = 1.5 (150%)
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 1.5;

  let panX = 0;
  let panY = 0;
  let isMouseDown = false;
  let isDragging = false;
  let hasDragged = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialPanX = 0;
  let initialPanY = 0;

  let pendingCoords = null; // { x, y } when clicking map to add
  let editingBaseId = null;

  // Initialize
  init();

  async function init() {
    await loadBasesData();
    setupImage();
    setupEventListeners();
    updateUI();
  }

  function setupImage() {
    if (mapImage.complete) {
      onImageLoaded();
    } else {
      mapImage.onload = onImageLoaded;
    }
  }

  function onImageLoaded() {
    // Set SVG viewBox to match natural image size for pixel perfect alignment
    const w = mapImage.naturalWidth || mapImage.width;
    const h = mapImage.naturalHeight || mapImage.height;
    mapStage.style.width = w + 'px';
    mapStage.style.height = h + 'px';
    markerOverlay.setAttribute('viewBox', `0 0 ${w} ${h}`);
    markerOverlay.setAttribute('width', w);
    markerOverlay.setAttribute('height', h);
    
    // Initial center position
    centerMap();
    renderMarkers();
  }

  function centerMap() {
    const viewportRect = mapViewport.getBoundingClientRect();
    const stageW = (mapImage.naturalWidth || mapImage.width || 1000) * zoom;
    const stageH = (mapImage.naturalHeight || mapImage.height || 1000) * zoom;

    panX = (viewportRect.width - stageW) / 2;
    panY = (viewportRect.height - stageH) / 2;
    applyTransform();
  }

  function applyTransform() {
    mapStage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    zoomValueDisplay.textContent = `${Math.round(zoom * 100)}%`;
    zoomRange.value = Math.round(zoom * 100);
  }

  // Persistence: API, LocalStorage & Default bases.json Fallback
  async function loadBasesData() {
    // 1. Try LocalStorage first (user's saved session)
    try {
      const saved = localStorage.getItem('grw_saved_bases');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          bases = parsed;
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load saved bases from localStorage:', e);
    }

    // 2. Try Server API if configured
    try {
      const res = await fetch('/api/bases');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          bases = data;
          saveBasesToStorage();
          return;
        }
      }
    } catch (e) {
      // Server API not reachable
    }

    // 3. Fallback: Default static bases.json file
    try {
      const res = await fetch('bases.json');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          bases = data;
          saveBasesToStorage();
          return;
        }
      }
    } catch (e) {
      console.error('Failed to load default bases.json:', e);
    }

    bases = [];
  }

  async function syncBases() {
    saveBasesToStorage();
    try {
      await fetch('/api/bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bases, null, 2)
      });
    } catch (e) {
      // Direct file mode fallback
    }
  }

  function saveBasesToStorage() {
    try {
      localStorage.setItem('grw_saved_bases', JSON.stringify(bases, null, 2));
    } catch (e) {
      console.error('Failed to save bases to localStorage:', e);
    }
  }

  // Event Listeners
  function setupEventListeners() {
    // Mode Switch
    modeAddBtn.addEventListener('click', () => setMode('add'));
    modePanBtn.addEventListener('click', () => setMode('pan'));

    // Zoom Controls
    zoomInBtn.addEventListener('click', () => setZoom(zoom + 0.1));
    zoomOutBtn.addEventListener('click', () => setZoom(zoom - 0.1));
    zoomResetBtn.addEventListener('click', () => {
      zoom = 1.0;
      centerMap();
    });
    zoomRange.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value) / 100;
      setZoom(val);
    });

    // Mouse Wheel Zoom
    mapViewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * zoomFactor));

      const rect = mapViewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const stageMouseX = (mouseX - panX) / zoom;
      const stageMouseY = (mouseY - panY) / zoom;

      zoom = newZoom;
      panX = mouseX - stageMouseX * zoom;
      panY = mouseY - stageMouseY * zoom;

      applyTransform();
    }, { passive: false });

    // Click-Hold to Pan & Quick-Click to Add Base Logic
    mapViewport.addEventListener('mousedown', (e) => {
      if (e.target.closest('.quick-modal')) return;

      isMouseDown = true;
      hasDragged = false;
      isDragging = false;

      dragStartX = e.clientX;
      dragStartY = e.clientY;
      initialPanX = panX;
      initialPanY = panY;
    });

    window.addEventListener('mousemove', (e) => {
      const rect = mapViewport.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const stageX = Math.round((e.clientX - rect.left - panX) / zoom);
        const stageY = Math.round((e.clientY - rect.top - panY) / zoom);
        const imgW = mapImage.naturalWidth || 1;
        const imgH = mapImage.naturalHeight || 1;

        if (stageX >= 0 && stageX <= imgW && stageY >= 0 && stageY <= imgH) {
          coordsDisplay.textContent = `X: ${stageX} | Y: ${stageY}`;
        }
      }

      if (isMouseDown) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;

        // Trigger drag mode if moved more than 4 pixels
        if (Math.hypot(dx, dy) > 4) {
          hasDragged = true;
          isDragging = true;
          mapViewport.classList.add('is-dragging');
        }

        if (isDragging) {
          panX = initialPanX + dx;
          panY = initialPanY + dy;
          applyTransform();
        }
      }
    });

    window.addEventListener('mouseup', () => {
      isMouseDown = false;
      setTimeout(() => {
        isDragging = false;
        mapViewport.classList.remove('is-dragging');
      }, 50);
    });

    // Quick-Click to place base (only if NOT dragged)
    mapViewport.addEventListener('click', (e) => {
      if (hasDragged) return; // Skip if user was panning/dragging
      if (mode !== 'add') return;
      if (e.target.closest('.quick-modal') || e.target.closest('.base-marker-group')) return;

      const rect = mapViewport.getBoundingClientRect();
      const clickX = Math.round((e.clientX - rect.left - panX) / zoom);
      const clickY = Math.round((e.clientY - rect.top - panY) / zoom);

      const imgW = mapImage.naturalWidth || mapImage.width;
      const imgH = mapImage.naturalHeight || mapImage.height;

      if (clickX < 0 || clickX > imgW || clickY < 0 || clickY > imgH) return;

      openQuickModal(clickX, clickY, e.clientX - rect.left, e.clientY - rect.top);
    });

    // Quick Modal Actions
    saveBaseBtn.addEventListener('click', saveCurrentBase);
    deleteModalBaseBtn.addEventListener('click', async () => {
      if (editingBaseId) {
        await deleteBase(editingBaseId);
        closeQuickModal();
      }
    });
    cancelBaseBtn.addEventListener('click', closeQuickModal);
    modalCloseBtn.addEventListener('click', closeQuickModal);

    baseNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveCurrentBase();
      } else if (e.key === 'Escape') {
        closeQuickModal();
      }
    });

    // JSON Export / Import
    exportJsonBtn.addEventListener('click', exportJSON);
    importJsonBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', importJSON);

    // Sidebar & Search
    toggleSidebarBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });

    const collapseSidebarToggle = document.getElementById('collapseSidebarToggle');
    if (collapseSidebarToggle) {
      collapseSidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }

    searchInput.addEventListener('input', renderBaseList);
  }

  function setMode(newMode) {
    mode = newMode;
    if (mode === 'add') {
      modeAddBtn.classList.add('active');
      modePanBtn.classList.remove('active');
      mapViewport.classList.remove('mode-pan');
    } else {
      modePanBtn.classList.add('active');
      modeAddBtn.classList.remove('active');
      mapViewport.classList.add('mode-pan');
      closeQuickModal();
    }
  }

  function setZoom(newZoom) {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
    applyTransform();
  }

  // Quick Modal Naming Logic
  function openQuickModal(x, y, screenX, screenY, existingBase = null) {
    pendingCoords = { x, y };
    editingBaseId = existingBase ? existingBase.id : null;

    if (existingBase) {
      if (modalTitle) modalTitle.textContent = 'EDIT BASE LOCATION';
      saveBaseBtn.textContent = 'Save Changes';
      deleteModalBaseBtn.style.display = 'inline-block';
    } else {
      if (modalTitle) modalTitle.textContent = 'NEW BASE LOCATION';
      saveBaseBtn.textContent = 'Save Base';
      deleteModalBaseBtn.style.display = 'none';
    }

    baseNameInput.value = existingBase ? existingBase.name : '';
    modalCoordsInfo.textContent = `Coordinates: X=${x}, Y=${y}`;

    const modalWidth = 280;
    const modalHeight = 160;
    const viewportRect = mapViewport.getBoundingClientRect();

    let left = screenX + 15;
    let top = screenY + 15;

    if (left + modalWidth > viewportRect.width - 20) {
      left = screenX - modalWidth - 15;
    }
    if (top + modalHeight > viewportRect.height - 20) {
      top = screenY - modalHeight - 15;
    }

    quickModal.style.left = `${Math.max(10, left)}px`;
    quickModal.style.top = `${Math.max(10, top)}px`;
    quickModal.style.display = 'block';

    setTimeout(() => {
      baseNameInput.focus();
      baseNameInput.select();
    }, 50);

    renderTempMarker(x, y);
  }

  function closeQuickModal() {
    quickModal.style.display = 'none';
    pendingCoords = null;
    editingBaseId = null;
    removeTempMarker();
  }

  async function saveCurrentBase() {
    const name = baseNameInput.value.trim();
    if (!name) {
      alert('Please enter a name for the base!');
      baseNameInput.focus();
      return;
    }

    if (editingBaseId) {
      const idx = bases.findIndex(b => b.id === editingBaseId);
      if (idx !== -1) {
        bases[idx].name = name;
      }
    } else if (pendingCoords) {
      const newBase = {
        id: 'base_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        name: name,
        x: pendingCoords.x,
        y: pendingCoords.y,
        timestamp: new Date().toISOString()
      };
      bases.push(newBase);
    }

    await syncBases();
    closeQuickModal();
    updateUI();
  }

  // SVG Marker Rendering
  function renderMarkers() {
    const tempElement = document.getElementById('tempMarkerGroup');
    markerOverlay.innerHTML = '';
    if (tempElement) markerOverlay.appendChild(tempElement);

    bases.forEach(base => {
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('class', 'base-marker-group');
      group.setAttribute('data-id', base.id);
      group.setAttribute('transform', `translate(${base.x}, ${base.y})`);

      // Circle Outer
      const circleOuter = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circleOuter.setAttribute('cx', '0');
      circleOuter.setAttribute('cy', '0');
      circleOuter.setAttribute('r', '32.4');
      circleOuter.setAttribute('class', 'base-marker-circle');

      // Center Dot
      const centerDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      centerDot.setAttribute('cx', '0');
      centerDot.setAttribute('cy', '0');
      centerDot.setAttribute('r', '7.2');
      centerDot.setAttribute('class', 'base-marker-center');

      // Label Container & Background Pill Badge
      const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      labelGroup.setAttribute('class', 'base-marker-label-group');

      const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      labelBg.setAttribute('class', 'base-marker-label-bg');
      labelBg.setAttribute('rx', '5.4');
      labelBg.setAttribute('ry', '5.4');

      const textLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textLabel.setAttribute('x', '0');
      textLabel.setAttribute('y', '-43.2');
      textLabel.setAttribute('class', 'base-marker-label');
      textLabel.textContent = base.name.toUpperCase();

      labelGroup.appendChild(labelBg);
      labelGroup.appendChild(textLabel);

      group.appendChild(circleOuter);
      group.appendChild(centerDot);
      group.appendChild(labelGroup);

      // Measure text length for dynamic dark badge sizing after append
      requestAnimationFrame(() => {
        try {
          const bbox = textLabel.getBBox();
          const paddingX = 21.6;
          const paddingY = 12.6;
          labelBg.setAttribute('x', bbox.x - paddingX / 2);
          labelBg.setAttribute('y', bbox.y - paddingY / 2);
          labelBg.setAttribute('width', bbox.width + paddingX);
          labelBg.setAttribute('height', bbox.height + paddingY);
        } catch (err) {}
      });

      group.addEventListener('click', (e) => {
        if (hasDragged) return;
        e.stopPropagation();
        const screenX = base.x * zoom + panX;
        const screenY = base.y * zoom + panY;
        openQuickModal(base.x, base.y, screenX, screenY, base);
      });

      markerOverlay.appendChild(group);
    });
  }

  function renderTempMarker(x, y) {
    removeTempMarker();
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('id', 'tempMarkerGroup');
    group.setAttribute('transform', `translate(${x}, ${y})`);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '0');
    circle.setAttribute('cy', '0');
    circle.setAttribute('r', '36');
    circle.setAttribute('fill', 'rgba(6, 182, 212, 0.4)');
    circle.setAttribute('stroke', '#06b6d4');
    circle.setAttribute('stroke-width', '2.7');
    circle.setAttribute('stroke-dasharray', '5.4 5.4');

    group.appendChild(circle);
    markerOverlay.appendChild(group);
  }

  function removeTempMarker() {
    const existing = document.getElementById('tempMarkerGroup');
    if (existing) existing.remove();
  }

  // Sidebar List Rendering
  function renderBaseList() {
    const filter = searchInput.value.toLowerCase().trim();
    const filteredBases = bases.filter(b => b.name.toLowerCase().includes(filter));

    baseList.innerHTML = '';
    
    if (bases.length === 0) {
      emptyState.style.display = 'flex';
      baseList.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    baseList.style.display = 'flex';

    filteredBases.forEach(base => {
      const li = document.createElement('li');
      li.className = 'base-item';
      li.innerHTML = `
        <div class="base-item-info">
          <span class="base-item-name">${escapeHtml(base.name)}</span>
          <span class="base-item-coords">X: ${base.x} | Y: ${base.y}</span>
        </div>
        <div class="base-item-actions">
          <button class="item-action-btn delete-btn" title="Delete Base">&times;</button>
        </div>
      `;

      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn')) return;
        jumpToBase(base);
      });

      const delBtn = li.querySelector('.delete-btn');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteBase(base.id);
      });

      baseList.appendChild(li);
    });
  }

  function jumpToBase(base) {
    const viewportRect = mapViewport.getBoundingClientRect();
    panX = viewportRect.width / 2 - base.x * zoom;
    panY = viewportRect.height / 2 - base.y * zoom;
    applyTransform();

    const markerEl = markerOverlay.querySelector(`[data-id="${base.id}"]`);
    if (markerEl) {
      markerEl.style.transform = `translate(${base.x}px, ${base.y}px) scale(1.5)`;
      setTimeout(() => {
        markerEl.style.transform = `translate(${base.x}px, ${base.y}px) scale(1)`;
      }, 400);
    }
  }

  async function deleteBase(id) {
    bases = bases.filter(b => b.id !== id);
    await syncBases();
    updateUI();
  }

  function updateUI() {
    baseCount.textContent = bases.length;
    renderMarkers();
    renderBaseList();
  }

  // JSON Export / Import
  function exportJSON() {
    if (bases.length === 0) {
      alert('No bases to export! Click on the map to add some bases first.');
      return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bases, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "bases.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(event) {
      try {
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported)) {
          bases = imported;
          await syncBases();
          updateUI();
          alert(`Successfully imported ${imported.length} base locations!`);
        } else {
          alert('Invalid JSON format: Expected an array of base objects.');
        }
      } catch (err) {
        alert('Error reading JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
});
