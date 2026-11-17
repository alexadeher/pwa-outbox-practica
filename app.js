const endpoint = 'https://jsonplaceholder.typicode.com/posts';

// Registro del Service Worker (ruta relativa)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
            console.log('[SW] Scope:', reg.scope);
        })
        .catch((err) => {
            console.error('[SW] Error:', err);
        });
}

// Recibir mensajes del Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.tipo === 'OUTBOX_SINCRONIZADO') {
            console.log('[UI] Confirmación recibida del Service Worker. Actualizando bandeja...');
            renderizarColaOutbox();
        }
    });
}


// Indicador de red
function actualizarIndicadorRed() {
    const badge = document.getElementById('badge-red');
    badge.textContent = navigator.onLine ? 'En Línea' : 'Sin Conexión';
    badge.className = 'badge ' + (navigator.onLine ? 'online' : 'offline');
}

// Read - Mostrar registros guardados
function renderizarColaOutbox() {
    return obtenerTodosLosRegistros().then((registros) => {
        const lista = document.getElementById('lista-outbox');
        lista.innerHTML = '';

        registros.forEach((item) => {
        const li = document.createElement('li');
        const hora = new Date(item.fechaCreacion).toLocaleTimeString('es-MX');
        li.textContent = `${item.titulo} - ${item.estado} - ${hora}`;
        lista.appendChild(li);
        });
    });
}

function procesarEnvioReporte(datosFormulario){
    return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosFormulario)
    })
        .then((respuesta) => {
        if (!respuesta.ok) throw new Error('Error HTTP del servidor');
        return respuesta.json();
        })
        .then(() => {
        // Envío exitoso en vivo: registrar en bitácora local como sincronizado
        return guardarRegistro({
            ...datosFormulario,
            estado: 'sincronizado',
            fechaCreacion: Date.now()
        });
        })
    .catch(() => {
        console.warn('[Outbox] Sin conexión. Encolando en IndexedDB...');

        return guardarRegistro({
            ...datosFormulario,
            estado: 'pendiente',
            fechaCreacion: Date.now()
        })
            .then(() => {
            // Detección de soporte para Background Sync API
            if ('serviceWorker' in navigator && 'SyncManager' in window) {
                return navigator.serviceWorker.ready
                .then((registro) => {
                    console.log('[Outbox] Registrando etiqueta sync-reportes en el SW...');
                    return registro.sync.register('sync-reportes');
                });
            }
            });
        })
}

function sincronizarPendientesFallback(){
    console.log('[Outbox] Conexión detectada. Buscando registros pendientes...');

    return obtenerTodosLosRegistros()
        .then((registros) => {
        const pendientes = registros.filter((item) => item.estado === 'pendiente');

        if (pendientes.length === 0) {
            console.log('[Outbox] No hay transacciones pendientes por sincronizar.');
            return;
        }

        // Convertir cada registro pendiente en una promesa de envío + actualización
        const promesasDeEnvio = pendientes.map((item) => {
            return fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: item.titulo, body: item.descripcion })
            })
            .then((res) => {
                if (!res.ok) throw new Error('Falla al reintentar envío');
                // Actualizar estado en IndexedDB de 'pendiente' a 'sincronizado'
                return actualizarEstadoRegistro(item.id, 'sincronizado');
            });
        });

        // Esperar a que todos los reenvíos concluyan
        return Promise.all(promesasDeEnvio);
        })
        .then(() => {
        return renderizarColaOutbox();
        })
        .catch((error) => {
        console.error('[Outbox] Error durante la sincronización masiva:', error);
        });
}

// Escuchar el regreso de la conectividad (eventos de red)
window.addEventListener('online', () => {
    actualizarIndicadorRed();

    // Degradación elegante: Solo sincronizar desde UI si el navegador NO soporta Background Sync (ej. Safari/iOS)
    if (!('SyncManager' in window)) {
        console.log('[Outbox] Navegador sin SyncManager. Ejecutando fallback por evento online...');
        sincronizarPendientesFallback();
    }
});

window.addEventListener('offline', actualizarIndicadorRed);

// Formulario
document.getElementById('form-incidencia')
    .addEventListener('submit', (e) => {
        e.preventDefault();

        const datos = {
        titulo: document.getElementById('titulo').value.trim(),
        descripcion: document.getElementById('descripcion').value.trim()
        };

        procesarEnvioReporte(datos)
        .then(() => e.target.reset());
    });


// Delete
document.getElementById('btn-purgar')
    .addEventListener('click', () => {
        obtenerTodosLosRegistros()
        .then((registros) => {
            const sincronizados = registros.filter(
            (item) => item.estado === 'sincronizado'
            );

            return Promise.all(
            sincronizados.map((item) => eliminarRegistro(item.id))
            );
        })
        .then(() => renderizarColaOutbox());
    });

actualizarIndicadorRed();
renderizarColaOutbox();