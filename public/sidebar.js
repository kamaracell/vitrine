// sidebar.js
document.addEventListener('DOMContentLoaded', () => {

    const body = document.body;
    const sidebar = document.getElementById('sidebar');
    const menuIcon = document.getElementById('menuIcon');
    const toggleBtn = document.getElementById('toggleBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const contentArea = document.getElementById('content-area');

    const SUPABASE_URL = 'https://plqhzubnjchinmnjbjmi.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBscWh6dWJuamNoaW5tbmpiam1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMDE0MzQsImV4cCI6MjA2Njc3NzQyNH0.g6hecKikDSwM';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Mapeamento global de páginas para caminhos
    const pagePaths = {
        'admin-geral-conteudo': '/admin-geral-conteudo.html',
        'admin-product-registration-conteudo': '/product-registration/admin-product-registration-conteudo.html'
    };

    // Lógica para navegação dinâmica
    const sidebarLinks = document.querySelectorAll('[data-page]');

    async function loadPage(pageName) {
        try {
            const path = pagePaths[pageName];
            if (!path) {
                throw new Error(`Caminho não encontrado para a página: ${pageName}`);
            }
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Erro ao carregar a página: ${pageName}.html`);
            }
            const pageContent = await response.text();
            contentArea.innerHTML = pageContent;
        } catch (error) {
            console.error(error);
            contentArea.innerHTML = `<p style="color: red;">${error.message}</p>`;
        }
    }

    // Carrega a página inicial ao carregar a aplicação
    loadPage('admin-geral-conteudo');

    sidebarLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const pageName = event.currentTarget.dataset.page;
            loadPage(pageName);
            // Fecha a barra lateral em telas menores
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        });
    });

    // Lógica de logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error('Erro ao sair da sessão:', error.message);
                alert('Erro ao sair da sessão.');
            } else {
                window.location.replace('/index.html');
            }
        });
    }

    // Lógica da barra lateral (abrir/fechar/arrastar)
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    body.appendChild(overlay);

    let isDragging = false;
    let startX = 0;
    const dragThreshold = 50;

    function openSidebar() {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        body.classList.add('sidebar-active');
    }

    function closeSidebar() {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        body.classList.remove('sidebar-active');
    }

    if (menuIcon) {
        menuIcon.addEventListener('click', () => {
            openSidebar();
        });
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            closeSidebar();
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            closeSidebar();
        });
    }

    function onDragStart(event) {
        const clientX = event.clientX || event.touches[0].clientX;
        if (sidebar.classList.contains('active')) {
            isDragging = true;
            startX = clientX;
            sidebar.style.transition = 'none';
        } else if (clientX < 20) {
            isDragging = true;
            startX = clientX;
            sidebar.style.transition = 'none';
        }
    }

    function onDragMove(event) {
        if (!isDragging) return;
        const clientX = event.clientX || event.touches[0].clientX;
        const deltaX = clientX - startX;
        if (sidebar.classList.contains('active')) {
            if (deltaX < 0) {
                const newTransform = Math.min(0, deltaX);
                sidebar.style.transform = `translateX(${newTransform}px)`;
                overlay.style.opacity = 1 + (newTransform / 250);
            }
        } else {
            if (deltaX > 0) {
                const newTransform = Math.min(0, deltaX - 250);
                sidebar.style.transform = `translateX(${newTransform}px)`;
                overlay.style.opacity = Math.max(0, (deltaX / 250));
            }
        }
    }

    function onDragEnd(event) {
        if (!isDragging) return;
        isDragging = false;
        sidebar.style.transition = 'transform 0.3s ease-in-out';
        overlay.style.transition = 'opacity 0.3s ease, visibility 0.3s ease';
        const finalX = event.changedTouches ? event.changedTouches[0].clientX : event.clientX;
        const deltaX = finalX - startX;
        if (sidebar.classList.contains('active')) {
            if (deltaX < -dragThreshold) {
                closeSidebar();
            } else {
                openSidebar();
            }
        } else {
            if (deltaX > dragThreshold) {
                openSidebar();
            } else {
                closeSidebar();
            }
        }
        setTimeout(() => {
            sidebar.style.transform = '';
            overlay.style.opacity = '';
        }, 300);
    }
    document.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchstart', onDragStart);
    document.addEventListener('touchmove', onDragMove);
    document.addEventListener('touchend', onDragEnd);
});
