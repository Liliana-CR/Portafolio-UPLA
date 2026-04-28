// ========== CONFIGURACIÓN DE SUPABASE ==========
const SUPABASE_URL = 'https://coxfocyzsoiokhqedftr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_abVcVRLBYZujewoB3xsezQ_3ZugrMF1';

// ========== APLICACIÓN PRINCIPAL ==========
class PortafolioApp {
    constructor() {
        this.currentPage = 'inicio';
        this.isLoggedIn = false;
        this.semanas = {};
        this.supabase = null;
        this.pdfDoc = null;
        this.currentPageNum = 1;
        this.totalPages = 1;
        this.currentZoom = 1.5;
        this.currentPdfUrl = null;
        
        this.unidades = [
            { id: 1, nombre: 'Unidad I', tema: 'Introducción a la arquitectura de B.D' },
            { id: 2, nombre: 'Unidad II', tema: 'SQL Avanzado' },
            { id: 3, nombre: 'Unidad III', tema: 'Transacciones y Concurrencia' },
            { id: 4, nombre: 'Unidad IV', tema: 'NoSQL y Tendencias' }
        ];
        
        this.init();
    }

    async init() {
        this.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('✅ Supabase inicializado');
        
        await this.cargarSemanas();
        this.setupNavigation();
        this.setupLogin();
        this.setupAdminPanel();
        this.setupFileUpload();
        this.renderUnidades();
        this.updateProgress();
        this.checkAuthState();
        
        // Configurar PDF.js
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        }
    }

    async cargarSemanas() {
        try {
            const { data, error } = await this.supabase
                .from('semanas')
                .select('*');
            
            if (error) throw error;
            
            this.semanas = {};
            if (data) {
                data.forEach(item => {
                    this.semanas[item.id] = item;
                });
            }
            console.log('✅ Datos cargados:', Object.keys(this.semanas).length);
        } catch (error) {
            console.error('Error:', error);
            this.semanas = {};
        }
    }

    setupNavigation() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateTo(link.dataset.page);
            });
        });
    }

    navigateTo(page) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.dataset.page === page) link.classList.add('active');
        });

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        if (page === 'inicio') {
            document.getElementById('inicio-page').classList.add('active');
            this.updateProgress();
        } else if (page === 'trabajos') {
            document.getElementById('trabajos-page').classList.add('active');
            this.renderUnidades();
        } else if (page === 'login') {
            if (this.isLoggedIn) {
                document.getElementById('admin-page').classList.add('active');
                this.renderSemanasList();
            } else {
                document.getElementById('login-page').classList.add('active');
            }
        }
        this.currentPage = page;
    }

    setupFileUpload() {
        const archivosInput = document.getElementById('archivosInput');
        const filesPreview = document.getElementById('filesPreview');
        
        if (archivosInput) {
            archivosInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                if (files.length > 0) {
                    let totalSize = 0;
                    const fileList = files.map(f => {
                        const size = (f.size / 1024).toFixed(0);
                        totalSize += f.size;
                        return `<i class="fas fa-file"></i> ${f.name} (${size} KB)`;
                    }).join('<br>');
                    const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
                    filesPreview.innerHTML = `<div><strong>${files.length} archivo(s):</strong><br>${fileList}<br><small>Total: ${totalMB} MB</small></div>`;
                }
            });
        }
    }

    setupLogin() {
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const username = document.getElementById('username').value;
                const password = document.getElementById('password').value;

                if (username === 'admin' && password === 'admin123') {
                    this.isLoggedIn = true;
                    localStorage.setItem('isLoggedIn', 'true');
                    this.navigateTo('login');
                    this.renderSemanasList();
                    this.showNotification('¡Bienvenida! ✨', 'success');
                } else {
                    this.showNotification('Credenciales incorrectas', 'error');
                }
            });
        }

        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            this.isLoggedIn = false;
            localStorage.removeItem('isLoggedIn');
            this.navigateTo('inicio');
            this.showNotification('Sesión cerrada', 'info');
        });
    }

    setupAdminPanel() {
        const unidadSelect = document.getElementById('unidadSelect');
        const semanaSelect = document.getElementById('semanaSelect');

        unidadSelect?.addEventListener('change', () => {
            const unidad = unidadSelect.value;
            semanaSelect.innerHTML = '<option value="">Seleccionar semana</option>';
            if (unidad) {
                const inicio = (unidad - 1) * 4 + 1;
                for (let i = 0; i < 4; i++) {
                    const semanaNum = inicio + i;
                    const option = document.createElement('option');
                    option.value = semanaNum;
                    option.textContent = `Semana ${semanaNum}`;
                    semanaSelect.appendChild(option);
                }
            }
        });

        document.getElementById('uploadForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.guardarSemana();
        });
    }

    async guardarSemana() {
        const unidad = document.getElementById('unidadSelect').value;
        const semana = document.getElementById('semanaSelect').value;
        const titulo = document.getElementById('tituloSemana').value;
        const descripcion = document.getElementById('descripcionSemana').value;
        const archivos = Array.from(document.getElementById('archivosInput').files);

        if (!unidad || !semana || !titulo || archivos.length === 0) {
            this.showNotification('Completa todos los campos', 'error');
            return;
        }

        this.showNotification('Subiendo... ☁️', 'info');
        const key = `${unidad}-${semana}`;
        const fechaActual = new Date().toISOString().split('T')[0];
        
        try {
            // Subir nuevos archivos a Storage
            const nuevosArchivos = [];
            for (const file of archivos) {
                const filePath = `${key}/${Date.now()}_${file.name}`;
                const { error: uploadError } = await this.supabase.storage
                    .from('portafolio-archivos')
                    .upload(filePath, file);
                if (uploadError) throw uploadError;
                
                const { data: urlData } = this.supabase.storage
                    .from('portafolio-archivos')
                    .getPublicUrl(filePath);
                
                nuevosArchivos.push({
                    nombre: file.name,
                    tipo: file.type,
                    tamaño: file.size,
                    url: urlData.publicUrl,
                    fecha: fechaActual
                });
            }
            
            // Obtener archivos existentes (si los hay)
            const semanaExistente = this.semanas[key];
            let archivosExistentes = [];
            if (semanaExistente && semanaExistente.archivos) {
                archivosExistentes = semanaExistente.archivos;
            }
            
            // Combinar archivos existentes con nuevos (sin duplicados por nombre)
            const archivosCombinados = [...archivosExistentes];
            for (const nuevo of nuevosArchivos) {
                const yaExiste = archivosCombinados.some(a => a.nombre === nuevo.nombre);
                if (!yaExiste) {
                    archivosCombinados.push(nuevo);
                }
            }

            // Guardar en la tabla
            const { error: insertError } = await this.supabase
                .from('semanas')
                .upsert({
                    id: key,
                    unidad: parseInt(unidad),
                    semana: parseInt(semana),
                    titulo: titulo,
                    descripcion: descripcion || 'Sin descripción',
                    fecha: fechaActual,
                    archivos: archivosCombinados
                });
            
            if (insertError) throw insertError;
            
            await this.cargarSemanas();
            this.showNotification('¡Guardado! 🎉', 'success');
            
            document.getElementById('uploadForm').reset();
            document.getElementById('filesPreview').innerHTML = '';
            this.renderSemanasList();
            this.renderUnidades();
            this.updateProgress();
            
        } catch (error) {
            console.error('Error:', error);
            this.showNotification('Error: ' + error.message, 'error');
        }
    }

    renderUnidades() {
        const container = document.getElementById('unidadesContainer');
        if (!container) return;
        container.innerHTML = '';

        this.unidades.forEach(unidad => {
            let semanasHtml = '';
            for (let i = 1; i <= 4; i++) {
                const semanaNum = (unidad.id - 1) * 4 + i;
                const key = `${unidad.id}-${semanaNum}`;
                const semana = this.semanas[key];
                
                if (semana) {
                    const totalArchivos = semana.archivos ? semana.archivos.length : 0;
                    semanasHtml += `
                        <div class="semana-item">
                            <div class="semana-header">
                                <span class="semana-titulo">Semana ${semanaNum}: ${semana.titulo}</span>
                                <span class="semana-estado estado-completado">✅ Completado</span>
                            </div>
                            <p class="semana-descripcion">${semana.descripcion || 'Sin descripción'}</p>
                            <div class="archivos-container">
                                ${semana.archivos ? semana.archivos.map(a => `<span class="archivo-tag"><i class="fas fa-file"></i> ${a.nombre.substring(0, 20)}...</span>`).join('') : ''}
                            </div>
                            <button class="btn-ver" onclick="app.verSemana('${key}')">Ver detalles (${totalArchivos} archivos)</button>
                        </div>
                    `;
                } else {
                    semanasHtml += `
                        <div class="semana-item">
                            <div class="semana-header">
                                <span class="semana-titulo">Semana ${semanaNum}</span>
                                <span class="semana-estado estado-pendiente">⏳ Pendiente</span>
                            </div>
                            <p class="semana-descripcion">Trabajo no entregado</p>
                        </div>
                    `;
                }
            }
            
            container.innerHTML += `
                <div class="unidad-section">
                    <div class="unidad-header unidad-${unidad.id}">
                        <div><h3>${unidad.nombre}</h3><p>${unidad.tema}</p></div>
                    </div>
                    <div class="semanas-list">${semanasHtml}</div>
                </div>
            `;
        });
    }

    verSemana(key) {
        const semana = this.semanas[key];
        if (!semana) return;

        const modal = document.getElementById('modalSemana');
        document.getElementById('modalTitulo').innerHTML = `Unidad ${semana.unidad} - ${semana.titulo}`;
        document.getElementById('modalDescripcion').innerHTML = semana.descripcion || 'Sin descripción';
        
        const archivosList = document.getElementById('modalArchivosList');
        archivosList.innerHTML = '';
        
        if (semana.archivos) {
            semana.archivos.forEach((archivo, index) => {
                const sizeKB = (archivo.tamaño / 1024).toFixed(0);
                archivosList.innerHTML += `
                    <div class="archivo-item">
                        <div class="archivo-info">
                            <i class="fas ${archivo.tipo.includes('pdf') ? 'fa-file-pdf' : 'fa-file'}"></i>
                            <div>
                                <strong>${archivo.nombre}</strong><br>
                                <small>${sizeKB} KB • ${archivo.fecha}</small>
                            </div>
                        </div>
                        <div class="archivo-acciones">
                            <button class="btn-ver-archivo" onclick="app.visualizarArchivo('${key}', ${index})">
                                <i class="fas fa-eye"></i> Ver
                            </button>
                            <button class="btn-descargar-archivo" onclick="app.descargarArchivo('${key}', ${index})">
                                <i class="fas fa-download"></i> Descargar
                            </button>
                        </div>
                    </div>
                `;
            });
        }
        
        // Ocultar visor PDF
        document.getElementById('pdfViewer').style.display = 'none';
        modal.style.display = 'block';
    }

    async visualizarArchivo(key, index) {
        const semana = this.semanas[key];
        const archivo = semana.archivos[index];
        
        // Si es PDF, usar el visor integrado
        if (archivo.tipo === 'application/pdf') {
            this.showNotification(`📄 Cargando PDF: ${archivo.nombre}`, 'info');
            
            const pdfViewer = document.getElementById('pdfViewer');
            const pdfTitle = document.getElementById('pdfTitle');
            
            pdfViewer.style.display = 'block';
            pdfTitle.textContent = archivo.nombre;
            
            try {
                // Cargar PDF desde URL
                const loadingTask = pdfjsLib.getDocument(archivo.url);
                this.pdfDoc = await loadingTask.promise;
                this.totalPages = this.pdfDoc.numPages;
                this.currentPageNum = 1;
                this.currentPdfUrl = archivo.url;
                
                await this.renderPage(1);
                
                document.getElementById('pageInfo').textContent = `Página 1 de ${this.totalPages}`;
                document.getElementById('prevPageBtn').disabled = true;
                document.getElementById('nextPageBtn').disabled = this.totalPages <= 1;
                
                pdfViewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                this.showNotification(`✅ PDF cargado: ${this.totalPages} páginas`, 'success');
                
            } catch (error) {
                console.error('Error cargando PDF:', error);
                this.showNotification('Error al cargar el PDF', 'error');
            }
        } else {
            // Para otros archivos, abrir en nueva pestaña
            window.open(archivo.url, '_blank');
        }
    }

    async renderPage(pageNum) {
        if (!this.pdfDoc) return;
        
        const page = await this.pdfDoc.getPage(pageNum);
        const canvas = document.getElementById('pdfCanvas');
        const ctx = canvas.getContext('2d');
        
        const viewport = page.getViewport({ scale: this.currentZoom });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        document.getElementById('pageInfo').textContent = `Página ${pageNum} de ${this.totalPages}`;
        document.getElementById('prevPageBtn').disabled = pageNum <= 1;
        document.getElementById('nextPageBtn').disabled = pageNum >= this.totalPages;
    }

    async nextPage() {
        if (this.pdfDoc && this.currentPageNum < this.totalPages) {
            this.currentPageNum++;
            await this.renderPage(this.currentPageNum);
        }
    }

    async prevPage() {
        if (this.pdfDoc && this.currentPageNum > 1) {
            this.currentPageNum--;
            await this.renderPage(this.currentPageNum);
        }
    }

    zoomIn() {
        this.currentZoom += 0.25;
        this.renderPage(this.currentPageNum);
    }

    zoomOut() {
        if (this.currentZoom > 0.5) {
            this.currentZoom -= 0.25;
            this.renderPage(this.currentPageNum);
        }
    }

    descargarArchivo(key, index) {
        const semana = this.semanas[key];
        const archivo = semana.archivos[index];
        
        // Crear enlace de descarga
        const link = document.createElement('a');
        link.href = archivo.url;
        link.download = archivo.nombre;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showNotification(`📥 Descargando: ${archivo.nombre}`, 'success');
    }

    cerrarModal() {
        document.getElementById('modalSemana').style.display = 'none';
        document.getElementById('pdfViewer').style.display = 'none';
        this.pdfDoc = null;
    }

    renderSemanasList() {
        const container = document.getElementById('semanasList');
        if (!container) return;

        const semanasArray = Object.entries(this.semanas);
        if (semanasArray.length === 0) {
            container.innerHTML = '<p>No hay semanas</p>';
            return;
        }

        container.innerHTML = '';
        semanasArray.forEach(([key, semana]) => {
            const totalArchivos = semana.archivos ? semana.archivos.length : 0;
            container.innerHTML += `
                <div class="semana-admin-item">
                    <div>
                        <strong>Unidad ${semana.unidad} - Semana ${semana.semana}</strong>
                        <p>${semana.titulo}</p>
                        <small>${totalArchivos} archivo(s)</small>
                    </div>
                    <button class="btn-delete" onclick="app.eliminarSemana('${key}')">Eliminar</button>
                </div>
            `;
        });
    }

    async eliminarSemana(key) {
        if (confirm('¿Eliminar esta semana y TODOS sus archivos?')) {
            await this.supabase.from('semanas').delete().eq('id', key);
            await this.cargarSemanas();
            this.renderSemanasList();
            this.renderUnidades();
            this.updateProgress();
            this.showNotification('Semana eliminada', 'success');
        }
    }

    updateProgress() {
        const completadas = Object.keys(this.semanas).length;
        const porcentaje = (completadas / 16) * 100;
        const progressBar = document.getElementById('progressBar');
        const progressText = document.getElementById('progressText');
        const progressPercentage = document.getElementById('progressPercentage');
        
        if (progressBar) progressBar.style.width = `${porcentaje}%`;
        if (progressText) progressText.textContent = `${completadas} de 16 semanas completadas`;
        if (progressPercentage) progressPercentage.textContent = `${porcentaje.toFixed(0)}%`;
    }

    checkAuthState() {
        this.isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed; bottom: 20px; right: 20px;
            background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#3B82F6'};
            color: white; padding: 1rem 1.5rem; border-radius: 10px; z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        notification.innerHTML = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
}

const app = new PortafolioApp();

window.onclick = (e) => {
    const modal = document.getElementById('modalSemana');
    if (e.target === modal) app.cerrarModal();
};