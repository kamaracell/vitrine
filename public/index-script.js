// public/index-script.js

const SUPABASE_URL = 'https://plqhzubnjchinmnjbjmi.supabase.co'; // Mantido, mas não será usado diretamente para carregar produtos aqui
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBscWh6dWJuamNoaW5tbmpiam1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMDE0MzQsImV4cCI6MjA2Njc3NzQzNH0.g6hecKDGbL5oaUdtspaigVae7IsyjkaxjXenKikDSwM';

console.log('index-script.js: Iniciando carregamento do script.');

// Variáveis para controle da rolagem infinita "carrossel"
let allProducts = []; // Vai armazenar TODOS os produtos do Supabase
let isLoadingProducts = false; // Flag para evitar múltiplas adições
const productsToPreload = 10; // Número de produtos iniciais para carregar (para garantir que a barra de rolagem apareça)

document.addEventListener('DOMContentLoaded', async () => {
    console.log('index-script.js: DOMContentLoaded disparado.');
    const productListSection = document.getElementById('product-list');
    const loadingMessage = document.getElementById('loading-message');
    const errorMessage = document.getElementById('error-message');

    function showLoadingMessage() {
        loadingMessage.textContent = 'Carregando produtos...';
        loadingMessage.style.display = 'block';
        errorMessage.style.display = 'none';
        console.log('index-script.js: Mensagem de carregamento exibida.');
    }

    function hideLoadingMessage() {
        loadingMessage.style.display = 'none';
        console.log('index-script.js: Mensagem de carregamento escondida.');
    }

    function showErrorMessage(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        hideLoadingMessage();
        console.error('index-script.js: Erro exibido na UI:', message);
    }

    function createProductCard(product) {
        const productCard = document.createElement('div');
        productCard.classList.add('product-card');

        let imageUrl = '/placeholder.png';
        if (Array.isArray(product.image_url) && product.image_url.length > 0) {
            imageUrl = product.image_url[0];
        } else if (typeof product.image_url === 'string' && product.image_url.trim() !== '') {
            try {
                const parsed = JSON.parse(product.image_url);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    imageUrl = parsed[0];
                } else {
                    imageUrl = product.image_url;
                }
            } catch (e) {
                imageUrl = product.image_url;
            }
        }

        productCard.innerHTML = `
            <a href="/product.html?id=${product.id}" class="product-link">
                <img src="${imageUrl}" alt="${product.name}" class="product-image">
                <h3 class="product-name">${product.name}</h3>
                <p class="product-description">${product.short_description || product.description || ''}</p>
                <p class="product-price">R$ ${product.price.toFixed(2).replace('.', ',')}</p>
                <button class="buy-button">Ver Detalhes</button>
            </a>
        `;
        return productCard;
    }

    // Função para adicionar produtos à DOM
    function appendProductsToDOM(productsToAdd) {
        productsToAdd.forEach(product => {
            const productCard = createProductCard(product);
            productListSection.appendChild(productCard);
        });
        console.log(`index-script.js: ${productsToAdd.length} produtos adicionados à DOM.`);
    }

    // Função para carregar TODOS os produtos do backend (apenas na primeira vez)
    async function initialLoadAllProducts() {
        if (isLoadingProducts) {
            console.log('index-script.js: Já está carregando produtos. Abortando initialLoadAllProducts.');
            return;
        }

        isLoadingProducts = true;
        showLoadingMessage();
        productListSection.innerHTML = ''; // Limpa a lista para o carregamento inicial

        try {
            // Requisição SEM limit e offset para buscar TUDO
            const response = await fetch('/api/products');
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            allProducts = data.products; // Armazena TODOS os produtos

            console.log(`index-script.js: ${allProducts.length} produtos carregados inicialmente do backend.`);

            if (allProducts.length === 0) {
                showErrorMessage('Nenhum produto cadastrado ainda.');
                return;
            }

            // Adiciona uma cópia inicial dos produtos para preencher a tela
            // Duplicamos algumas vezes para garantir que a barra de rolagem apareça
            let initialDisplayProducts = [];
            const numCopies = Math.ceil(productsToPreload / allProducts.length) + 1; // Garante que teremos pelo menos 'productsToPreload' visíveis
            for (let i = 0; i < numCopies; i++) {
                initialDisplayProducts = initialDisplayProducts.concat(allProducts);
            }
            appendProductsToDOM(initialDisplayProducts);
            hideLoadingMessage();
            console.log('index-script.js: Primeira leva de produtos renderizada com cópias.');

        } catch (error) {
            console.error('index-script.js: Erro ao carregar todos os produtos:', error);
            showErrorMessage('Erro ao carregar produtos. Por favor, tente novamente mais tarde.');
        } finally {
            isLoadingProducts = false;
        }
    }

    // Lógica de rolagem infinita "carrossel"
    window.addEventListener('scroll', () => {
        // Só adiciona mais produtos se tivermos produtos carregados e não estivermos já adicionando
        if (isLoadingProducts || allProducts.length === 0) {
            return;
        }

        const {
            scrollTop,
            scrollHeight,
            clientHeight
        } = document.documentElement;

        // Gatilho: Quando o usuário está a 300px do final da página (ajuste se necessário)
        const scrollThreshold = 300; 

        if (scrollTop + clientHeight >= scrollHeight - scrollThreshold) {
            console.log('index-script.js: Gatilho de rolagem infinita (carrossel) atingido. Adicionando mais cópias dos produtos...');
            isLoadingProducts = true; // Impede múltiplas chamadas
            
            // Adiciona uma nova cópia de TODOS os produtos à lista
            appendProductsToDOM(allProducts);
            
            // Pequeno delay para permitir que o navegador atualize o DOM e recalcule scrollHeight
            // antes de permitir outro carregamento.
            setTimeout(() => {
                isLoadingProducts = false;
                console.log('index-script.js: Adição de produtos concluída, pronto para próximo scroll.');
            }, 500); // 500ms de delay
        }
    });

    // Chama a função para carregar todos os produtos e popular a tela
    initialLoadAllProducts();
    console.log('index-script.js: initialLoadAllProducts() chamado.');
});

