// public/remote-console.js - Responsável por criar e gerenciar a UI do console remoto.
// Ele intercepta console.log/error/warn/debug e ouve eventos customizados de log.
(function() {
    let consoleContainer = document.getElementById('remote-console-container');
    let consoleOutput = document.getElementById('remote-console-output');
    let consoleHeader = document.getElementById('remote-console-header');

    // Funções auxiliares para adicionar mensagens ao console DOM
    function appendLogToDOM(message, level = 'info') {
        if (!consoleOutput) return; // Garante que o elemento existe

        const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        const formattedMessage = `[${level.toUpperCase()}] ${timestamp}: ${message}`;

        const p = document.createElement('p');
        p.classList.add(`log-${level}`);
        p.textContent = formattedMessage;
        consoleOutput.appendChild(p);
        consoleOutput.scrollTop = consoleOutput.scrollHeight; // Rolar para o final
    }

    // Se o container ainda não existe, cria-o.
    // Isso deve ser chamado por remote-console-loader.js apenas se showRemoteConsole for true.
    if (!consoleContainer) {
        consoleContainer = document.createElement('div');
        consoleContainer.id = 'remote-console-container';
        consoleContainer.innerHTML = `
            <h3 id="remote-console-header" style="cursor: pointer;">Console Remoto (Clique para expandir/recolher)</h3>
            <div id="remote-console-output" style="height: 200px; overflow-y: scroll; background-color: #333; color: #eee; padding: 10px; font-family: monospace; font-size: 12px; border: 1px solid #555; display: none;"></div>
            <style>
                #remote-console-container {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    width: 100%;
                    background-color: #222;
                    color: #eee;
                    border-top: 1px solid #555;
                    z-index: 99999;
                    font-family: sans-serif;
                    font-size: 14px;
                }
                #remote-console-header {
                    margin: 0;
                    padding: 10px;
                    background-color: #444;
                    text-align: center;
                }
                #remote-console-output p {
                    margin: 0;
                    padding: 2px 0;
                }
                .log-info { color: #eee; }
                .log-warn { color: #ffc107; }
                .log-error { color: #dc3545; }
                .log-debug { color: #17a2b8; }
            </style>
        `;
        document.body.appendChild(consoleContainer);

        // Re-seleciona os elementos após eles serem criados
        consoleOutput = document.getElementById('remote-console-output');
        consoleHeader = document.getElementById('remote-console-header');

        consoleHeader.addEventListener('click', () => {
            const isHidden = consoleOutput.style.display === 'none';
            consoleOutput.style.display = isHidden ? 'block' : 'none';
            consoleHeader.textContent = isHidden ? 'Console Remoto (Clique para recolher)' : 'Console Remoto (Clique para expandir)';
            if (isHidden) {
                consoleOutput.scrollTop = consoleOutput.scrollHeight;
            }
        });

        // Mensagem de inicialização no console dinâmico
        appendLogToDOM('Interface do console remoto carregada.', 'info');
    }

    // --- Intercepta chamadas console.log/error/warn/debug ---
    // Guarda as funções originais do console
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const originalConsoleDebug = console.debug;

    // Redefine as funções do console para capturar as mensagens
    console.log = function(...args) {
        originalConsoleLog.apply(console, args); // Chama o console nativo original
        appendLogToDOM(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), 'info');
    };
    console.error = function(...args) {
        originalConsoleError.apply(console, args);
        appendLogToDOM(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), 'error');
    };
    console.warn = function(...args) {
        originalConsoleWarn.apply(console, args);
        appendLogToDOM(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), 'warn');
    };
    console.debug = function(...args) {
        originalConsoleDebug.apply(console, args);
        appendLogToDOM(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '), 'debug');
    };

    // --- Ouve o evento customizado disparado pela sua remoteLog em script.js ---
    // Isso é para mensagens que VÊM especificamente da sua função remoteLog
    window.addEventListener('remoteLogEvent', (event) => {
        const { message, level } = event.detail;
        // Não loga no console nativo novamente aqui, pois sua remoteLog já faz isso.
        // Apenas adiciona ao DOM do console remoto.
        appendLogToDOM(message, level);
    });

})();
