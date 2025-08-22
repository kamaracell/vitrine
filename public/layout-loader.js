// public/layout-loader.js

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[LayoutLoader] Carregando configurações de layout...');
    try {
        const response = await fetch('/api/layout-config');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const config = await response.json();
        console.log('[LayoutLoader] Configurações recebidas:', config);

        // Aplica o nome do site
        const siteNameElements = document.querySelectorAll('.site-name');
        siteNameElements.forEach(element => {
            element.textContent = config.siteName || 'Sua Loja Online';
        });

        // Aplica as cores via variáveis CSS
        const root = document.documentElement; // Pega o elemento <html>
        root.style.setProperty('--site-name-color', config.siteNameColor || '#61dafb'); // NOVO: Cor do nome do site
        root.style.setProperty('--header-background-color', config.headerColor || '#343a40'); // Renomeado para clareza
        root.style.setProperty('--header-link-color', config.headerLinkColor || '#ffffff'); // NOVO: Cor dos links do cabeçalho
        root.style.setProperty('--footer-background-color', config.footerColor || '#343a40'); // Renomeado para clareza
        root.style.setProperty('--footer-text-color', config.footerTextColor || '#ffffff'); // NOVO: Cor do texto do rodapé
        root.style.setProperty('--button-color', config.buttonColor || '#007bff');

        console.log('[LayoutLoader] Configurações de layout aplicadas.');

    } catch (error) {
        console.error('[LayoutLoader] Erro ao carregar ou aplicar configurações de layout:', error);
        // Opcional: Fallback para cores padrão ou mostrar mensagem de erro na UI
    }
});
