// public/admin-login.js
const SUPABASE_URL = 'https://plqhzubnjchinmnjbjmi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBscWh6dWJuamNoaW5tbmpiam1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMDE0MzQsImV4cCI6MjA2Njc3NzQzNH0.g6hecKDGbL5oaUdtspaigVae7IsyjkaxjXenKikDSwM';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ADMIN_EMAIL = 'kamaranegocios@gmail.com';

const passwordForm = document.getElementById('passwordForm');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('loginButton');
const statusMessage = document.getElementById('statusMessage');

// Função para exibir mensagens de status
function showStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.classList.remove('hidden', 'success', 'error');
    statusMessage.classList.add(isError ? 'error' : 'success');
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = urlParams.get('access_token');
    
    if (accessToken) {
        // Se houver um token, tenta fazer login com ele
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
            // Se o token for inválido, redireciona para a página inicial
            window.location.href = '/index.html';
        } else {
            // Se o token for válido, mostra o formulário de senha
            passwordForm.classList.remove('hidden');
        }
    } else {
        // Envia o link tokenizado para o e-mail do administrador
        await supabase.auth.signInWithOtp({
            email: ADMIN_EMAIL,
            options: {
                emailRedirectTo: `${window.location.origin}/admin-login.html`
            }
        });

        // Redireciona o usuário imediatamente para a página inicial
        window.location.href = '/index.html';
    }
});

passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passwordInput.value;

    showStatus('Verificando senha...', false);
    loginButton.disabled = true;

    const { data: { user }, error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password });

    if (error) {
        showStatus(`Erro: ${error.message}`, true);
        loginButton.disabled = false;
    } else {
        showStatus('Acesso concedido. Redirecionando...', false);
        window.location.href = '/admin-painel.html';
    }
});

// Nota: O email kamaranegocios@gmail.com deve ser adicionado manualmente como usuário na autenticação do Supabase.
// Você também precisará definir a senha dele lá.
