// public/admin-layout.js
// As chaves do Supabase precisam ser definidas para que o script possa se conectar.
const SUPABASE_URL = 'https://plqhzubnjchinmnjbjmi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBscWh6dWJuamNoaW5tbmpiam1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMDE0MzQsImV4cCI6MjA2Njc3NzQzNH0.g6hecKDGbL5oaUdtspaigVae7IsyjkaxjXenKikDSwM';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// Função para logar mensagens no console e na página
function remoteLog(message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const logEntry = document.createElement('div');
    logEntry.classList.add('log-entry', level);
    logEntry.innerHTML = `[${level.toUpperCase()}] ${timestamp}: ${message}`;
    const pageLogsDiv = document.getElementById('page-logs');
    if (pageLogsDiv) {
        pageLogsDiv.appendChild(logEntry);
        pageLogsDiv.scrollTop = pageLogsDiv.scrollHeight; // Rolar para o final
    }
    // Também loga no console do navegador
    if (level === 'error') console.error(`[LOG][${level.toUpperCase()}] ${timestamp}: ${message}`);
    else if (level === 'warn') console.warn(`[LOG][${level.toUpperCase()}] ${timestamp}: ${message}`);
    else console.log(`[LOG][${level.toUpperCase()}] ${timestamp}: ${message}`);
}

remoteLog('[ADMIN-LAYOUT] Script admin-layout.js carregado.', 'info');

document.addEventListener('DOMContentLoaded', async () => {
    // --- VERIFICAÇÃO DE AUTENTICAÇÃO ---
    remoteLog('[ADMIN-LAYOUT] Verificando sessão do usuário...', 'info');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        remoteLog('[ADMIN-LAYOUT] Nenhuma sessão encontrada. Redirecionando para index.html.', 'warn');
        window.location.href = '/index.html';
        return; // Interrompe a execução do restante do script
    }
    remoteLog('[ADMIN-LAYOUT] Sessão ativa encontrada. Carregando conteúdo da página.', 'success');
    // --- FIM DA VERIFICAÇÃO ---
    
    const uploadForm = document.getElementById('uploadForm');
    const customFileNameInput = document.getElementById('customFileName');
    const imageUploadInput = document.getElementById('imageUpload');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadedImageUrlDiv = document.getElementById('uploadedImageUrl');
    const imageListContainer = document.getElementById('imageListContainer');
    const imageListStatus = document.getElementById('imageListStatus');
    const imageCountSpan = document.getElementById('imageCount');
    const noImagesMessage = document.getElementById('noImagesMessage');

    // Elementos do formulário de configuração de layout
    const layoutConfigForm = document.getElementById('layoutConfigForm');
    const siteNameInput = document.getElementById('siteName');
    const siteNameColorInput = document.getElementById('siteNameColor');
    const headerColorInput = document.getElementById('headerColor');
    const headerLinkColorInput = document.getElementById('headerLinkColor');
    const footerColorInput = document.getElementById('footerColor');
    const footerTextColorInput = document.getElementById('footerTextColor');
    const buttonColorInput = document.getElementById('buttonColor');
    const layoutConfigStatus = document.getElementById('layoutConfigStatus');

    // Função para carregar e exibir as imagens
    async function loadImages() {
        remoteLog('[ADMIN-LAYOUT][Listar] Carregando imagens existentes...', 'info');
        imageListStatus.textContent = 'Carregando imagens...';
        imageListStatus.className = 'status-message';
        imageListContainer.innerHTML = '';
        noImagesMessage.classList.add('hidden');

        try {
            const response = await fetch('/api/admin/images');
            const result = await response.json();

            if (result.success && result.images.length > 0) {
                imageCountSpan.textContent = result.images.length;
                result.images.forEach(fileName => {
                    const imageUrl = `/images/${fileName}`;
                    const imageItem = document.createElement('div');
                    imageItem.classList.add('image-item');
                    imageItem.innerHTML = `
                        <img src="${imageUrl}" alt="${fileName}">
                        <p title="${fileName}">${fileName}</p>
                        <button data-file-name="${fileName}">Excluir</button>
                    `;
                    imageListContainer.appendChild(imageItem);

                    imageItem.querySelector('button').addEventListener('click', handleDeleteImage);
                });
                imageListStatus.textContent = '';
                imageListStatus.classList.remove('success', 'error');
                remoteLog(`[ADMIN-LAYOUT][Listar] ${result.images.length} imagens carregadas.`, 'success');
            } else {
                imageCountSpan.textContent = '0';
                noImagesMessage.classList.remove('hidden');
                imageListStatus.textContent = 'Nenhuma imagem encontrada.';
                imageListStatus.classList.add('info');
                remoteLog('[ADMIN-LAYOUT][Listar] Nenhuma imagem encontrada na pasta /public/images.', 'warn');
            }
        } catch (error) {
            imageCountSpan.textContent = 'Erro';
            imageListStatus.textContent = `Erro ao carregar imagens: ${error.message}`;
            imageListStatus.classList.add('error');
            remoteLog(`[ADMIN-LAYOUT][Listar] Erro ao carregar imagens: ${error.message}`, 'error');
            console.error('Erro ao carregar imagens:', error);
        }
    }

    // Função para lidar com a exclusão de imagens
    async function handleDeleteImage(event) {
        const button = event.target;
        const fileName = button.dataset.fileName;
        if (!confirm(`Tem certeza que deseja excluir a imagem "${fileName}"?`)) {
            return;
        }

        remoteLog(`[ADMIN-LAYOUT][Excluir] Tentando excluir imagem: ${fileName}`, 'info');
        imageListStatus.textContent = `Excluindo ${fileName}...`;
        imageListStatus.className = 'status-message';

        try {
            const response = await fetch(`/api/admin/images/${fileName}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (result.success) {
                imageListStatus.textContent = `Sucesso: ${result.message}`;
                imageListStatus.classList.add('success');
                remoteLog(`[ADMIN-LAYOUT][Excluir] Imagem "${fileName}" excluída com sucesso.`, 'success');
                loadImages();
            } else {
                imageListStatus.textContent = `Erro: ${result.message}`;
                imageListStatus.classList.add('error');
                remoteLog(`[ADMIN-LAYOUT][Excluir] Erro ao excluir imagem "${fileName}": ${result.message}`, 'error');
            }
        } catch (error) {
            imageListStatus.textContent = `Erro de rede ao excluir: ${error.message}.`;
            imageListStatus.classList.add('error');
            remoteLog(`[ADMIN-LAYOUT][Excluir] Erro de rede/servidor ao excluir "${fileName}": ${error.message}`, 'error');
            console.error('Erro ao excluir imagem:', error);
        }
    }

    // Lógica para o formulário de upload
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            remoteLog('[ADMIN-LAYOUT][Upload] Formulário de upload submetido.', 'info');
            uploadStatus.textContent = 'Enviando imagem...';
            uploadStatus.className = 'status-message';
            uploadedImageUrlDiv.classList.add('hidden');

            const formData = new FormData();
            const file = imageUploadInput.files[0];

            if (!file) {
                uploadStatus.textContent = 'Por favor, selecione uma imagem para upload.';
                uploadStatus.className = 'status-message error';
                remoteLog('[ADMIN-LAYOUT][Upload] Nenhuma imagem selecionada para upload.', 'warn');
                return;
            }

            formData.append('image', file);

            const customFileName = customFileNameInput.value.trim();
            formData.append('customFileName', customFileName);

            // ADIÇÃO CRÍTICA DE DEPURAÇÃO: Log do conteúdo do FormData antes do envio
            remoteLog(`[ADMIN-LAYOUT][DEPURAÇÃO] Conteúdo do FormData antes do envio:`, 'info');
            for (const [key, value] of formData.entries()) {
                remoteLog(`- Chave: "${key}", Valor: "${value}"`, 'info');
            }

            try {
                const response = await fetch('/api/admin/upload-image', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();
                if (result.success) {
                    uploadStatus.textContent = `Sucesso: ${result.message}`;
                    uploadStatus.classList.add('success');
                    uploadedImageUrlDiv.textContent = `URL da Imagem: ${window.location.origin}${result.imageUrl} (Nome: ${result.fileName})`;
                    uploadedImageUrlDiv.classList.remove('hidden');
                    remoteLog(`[ADMIN-LAYOUT][Upload] Imagem enviada com sucesso. URL: ${result.imageUrl}, Nome Salvo: ${result.fileName}`, 'info');
                    uploadForm.reset();
                    loadImages();
                } else {
                    uploadStatus.textContent = `Erro: ${result.message}`;
                    uploadStatus.classList.add('error');
                    remoteLog(`[ADMIN-LAYOUT][Upload] Erro no upload: ${result.message}`, 'error');
                }
            } catch (error) {
                uploadStatus.textContent = `Erro de rede: ${error.message}. Verifique o servidor.`;
                uploadStatus.classList.add('error');
                remoteLog(`[ADMIN-LAYOUT][Upload] Erro de rede ou servidor: ${error.message}`, 'error');
                console.error('Erro no upload da imagem:', error);
            }
        });
    } else {
        remoteLog('[ADMIN-LAYOUT] Formulário de upload não encontrado (ID: uploadForm).', 'warn');
    }

    // --- Lógica para o formulário de configurações de layout ---
    async function fetchLayoutConfig() {
        remoteLog('[ADMIN-LAYOUT][Config] Carregando configurações de layout...', 'info');
        layoutConfigStatus.textContent = 'Carregando configurações...';
        layoutConfigStatus.className = 'status-message info';
        try {
            const response = await fetch('/api/layout-config');
            const config = await response.json();

            if (response.ok) {
                siteNameInput.value = config.siteName || 'Sua Loja Online';
                siteNameColorInput.value = config.siteNameColor || '#61dafb';
                headerColorInput.value = config.headerColor || '#343a40';
                headerLinkColorInput.value = config.headerLinkColor || '#ffffff';
                footerColorInput.value = config.footerColor || '#343a40';
                footerTextColorInput.value = config.footerTextColor || '#ffffff';
                buttonColorInput.value = config.buttonColor || '#007bff';
                layoutConfigStatus.textContent = 'Configurações carregadas.';
                layoutConfigStatus.className = 'status-message success';
                remoteLog('[ADMIN-LAYOUT][Config] Configurações de layout carregadas com sucesso.', 'success');
            } else {
                throw new Error(config.error || 'Erro ao carregar configurações de layout.');
            }
        } catch (error) {
            console.error('Erro ao buscar configurações de layout:', error);
            layoutConfigStatus.textContent = `Erro ao carregar configurações: ${error.message}`;
            layoutConfigStatus.className = 'status-message error';
            remoteLog(`[ADMIN-LAYOUT][Config] Erro ao carregar configurações: ${error.message}`, 'error');
        }
    }

    if (layoutConfigForm) {
        layoutConfigForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            remoteLog('[ADMIN-LAYOUT][Config] Formulário de configurações submetido.', 'info');

            layoutConfigStatus.textContent = 'Salvando configurações...';
            layoutConfigStatus.className = 'status-message info';

            const newConfig = {
                siteName: siteNameInput.value,
                siteNameColor: siteNameColorInput.value,
                headerColor: headerColorInput.value,
                headerLinkColor: headerLinkColorInput.value,
                footerColor: footerColorInput.value,
                footerTextColor: footerTextColorInput.value,
                buttonColor: buttonColorInput.value
            };

            try {
                const response = await fetch('/api/layout-config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(newConfig)
                });

                const result = await response.json();
                if (response.ok) {
                    layoutConfigStatus.textContent = result.message;
                    layoutConfigStatus.className = 'status-message success';
                    remoteLog('[ADMIN-LAYOUT][Config] Configurações de layout salvas com sucesso.', 'success');
                    fetchLayoutConfig();
                } else {
                    throw new Error(result.error || 'Erro ao salvar configurações.');
                }
            } catch (error) {
                console.error('Erro ao salvar configurações de layout:', error);
                layoutConfigStatus.textContent = `Erro ao salvar configurações: ${error.message}`;
                layoutConfigStatus.className = 'status-message error';
                remoteLog(`[ADMIN-LAYOUT][Config] Erro ao salvar configurações: ${error.message}`, 'error');
            }
        });
    } else {
        remoteLog('[ADMIN-LAYOUT] Formulário de configurações de layout não encontrado (ID: layoutConfigForm).', 'warn');
    }

    loadImages();
    fetchLayoutConfig();
});
