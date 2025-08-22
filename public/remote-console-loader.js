   // public/remote-console-loader.js - Carrega o console remoto UI e mostra um indicador visual de status.
   (function() {
   // Verifica o status do console remoto no localStorage
   const showConsole = localStorage.getItem('showRemoteConsole') === 'true';
   // *** Adiciona um indicador visual discreto ***
document.addEventListener('DOMContentLoaded', () => {
    const indicator = document.createElement('div');
    indicator.id = 'remoteConsoleStatusIndicator'; // Adiciona um ID para facilitar futuras alterações se necessário
    indicator.style.position = 'fixed';
    indicator.style.top = '5px'; // Ajusta a posição vertical
    indicator.style.right = '5px'; // Ajusta a posição horizontal
    indicator.style.width = '10px';
    indicator.style.height = '10px';
    indicator.style.borderRadius = '50%'; // Cria um círculo (pingo)
    indicator.style.zIndex = '999999'; // Z-index alto para visibilidade

    if (showConsole) {
        indicator.style.backgroundColor = '#28a745'; // Verde se habilitado
        indicator.style.opacity = '0.8';
    } else {
        indicator.style.backgroundColor = 'transparent'; // Transparente se desabilitado
    }

    document.body.appendChild(indicator);
});
// *** Fim do indicador ***

if (showConsole) {
    // Carrega o script principal do console remoto (remote-console.js)
    const script = document.createElement('script');
    script.src = '/remote-console.js';
    script.async = true;
    script.onload = () => {
        console.log('[REMOTE_CONSOLE_LOADER] remote-console.js carregado com sucesso.');
    };
    script.onerror = () => {
        console.error('[REMOTE_CONSOLE_LOADER] ERRO ao carregar remote-console.js. Verifique o caminho ou erros no arquivo.');
    };
    document.head.appendChild(script);
} else {
    console.log('[REMOTE_CONSOLE_LOADER] Console remoto desabilitado por localStorage. Não carregando remote-console.js.');
}

   })();
