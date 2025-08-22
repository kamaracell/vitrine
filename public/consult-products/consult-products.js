// public/consult-products/consult-products.js
const SUPABASE_URL = 'https://plqhzubnjchinmnjbjmi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBscWh6dWJuamNoaW5tbmpiam1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEyMDE0MzQsImV4cCI6MjA2Njc3NzQ0NH0.g6hecKDGbL5oaUdtspaigVae7IsyjkaxjXenKikDSwM';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Variável para armazenar todos os produtos para acesso rápido nos detalhes e na pesquisa
let allProducts = [];

// Elementos da página
const productsTableBody = document.getElementById('products-table-body');
const deleteButton = document.getElementById('delete-selected-btn');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const searchInput = document.getElementById('search-input');
const modal = document.getElementById('product-details-modal');
const closeModalButton = document.querySelector('#product-details-modal .close-button');
const modalProductName = document.getElementById('modal-product-name');
const modalImage = document.getElementById('modal-image');
const modalDetailsContent = document.getElementById('modal-details-content');

// Funções de utilidade
function showStatusMessage(message, type) {
    productsTableBody.innerHTML = `<tr><td colspan="7" class="status-${type}" style="text-align:center;">${message}</td></tr>`;
}

function isHexColor(hex) {
    return /^#([A-Fa-f0-9]{3}){1,2}$/.test(hex);
}

// Lógica principal de exibição
function populateProductsTable(products) {
    productsTableBody.innerHTML = '';

    if (products.length === 0) {
        showStatusMessage('Nenhum produto encontrado.', 'info');
        return;
    }

    products.forEach(product => {
        const row = productsTableBody.insertRow();
        row.setAttribute('data-product-id', product.id);
        row.setAttribute('data-product-code', product.product_code);

        // Checkbox
        const checkboxCell = row.insertCell();
        checkboxCell.innerHTML = `<input type="checkbox" class="product-checkbox">`;

        // Imagem
        const imageCell = row.insertCell();
        const mainImage = Array.isArray(product.image_url) && product.image_url.length > 0 ? product.image_url[0] : '/placeholder.png';
        imageCell.innerHTML = `<img src="${mainImage}" alt="${product.name}" title="${product.name}">`;

        // Nome
        const nameCell = row.insertCell();
        nameCell.textContent = product.name;

        // Código do Produto
        const codeCell = row.insertCell();
        codeCell.textContent = product.product_code || 'N/A';
        
        // Preço
        const priceCell = row.insertCell();
        priceCell.textContent = `R$ ${product.price.toFixed(2).replace('.', ',')}`;

        // Cores
        const colorsCell = row.insertCell();
        const colorsHtml = product.colors && product.colors.length > 0
            ? product.colors.map(color => `<span class="color-display-small" style="background-color: ${isHexColor(color) ? color : 'transparent'};" title="${color}"></span>`).join('')
            : 'N/A';
        colorsCell.innerHTML = colorsHtml;

        // Tamanhos
        const sizesCell = row.insertCell();
        sizesCell.textContent = product.available_sizes && product.available_sizes.length > 0 ? product.available_sizes.join(', ') : 'N/A';

        // Botão de Ações
        const actionsCell = row.insertCell();
        actionsCell.innerHTML = `<button class="button view-details-btn">Ver Detalhes</button>`;
        actionsCell.querySelector('.view-details-btn').addEventListener('click', () => showProductDetails(product));
    });
}

async function fetchProductsFromAPI() {
    showStatusMessage('Carregando produtos...', 'info');
    try {
        const response = await fetch('/api/products');
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erro HTTP! status: ${response.status}`);
        }
        const data = await response.json();
        allProducts = data.products; // Armazena a lista completa
        populateProductsTable(allProducts); // Exibe a lista completa
    } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        showStatusMessage(`Erro ao carregar produtos: ${error.message}.`, 'error');
    }
}

// Lógica de Pesquisa
function filterProducts() {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredProducts = allProducts.filter(product => {
        const nameMatch = product.name.toLowerCase().includes(searchTerm);
        const codeMatch = product.product_code && product.product_code.toLowerCase().includes(searchTerm);
        const priceMatch = product.price && product.price.toFixed(2).replace('.', ',').includes(searchTerm);
        return nameMatch || codeMatch || priceMatch;
    });
    populateProductsTable(filteredProducts);
}

// Lógica de Exclusão
async function deleteSelectedProducts() {
    const selectedCheckboxes = document.querySelectorAll('.product-checkbox:checked');
    if (selectedCheckboxes.length === 0) {
        alert('Selecione pelo menos um produto para excluir.');
        return;
    }

    if (!confirm(`Tem certeza que deseja excluir ${selectedCheckboxes.length} produto(s) selecionado(s)?`)) {
        return;
    }

    const deletePromises = Array.from(selectedCheckboxes).map(checkbox => {
        const productCode = checkbox.closest('tr').getAttribute('data-product-code');
        return fetch(`/admin/products/${productCode}`, { method: 'DELETE' });
    });

    showStatusMessage('Excluindo produtos...', 'info');
    try {
        const results = await Promise.all(deletePromises);
        const failedDeletions = results.filter(res => !res.ok);
        if (failedDeletions.length > 0) {
            alert('Alguns produtos não puderam ser excluídos. Verifique o console para mais detalhes.');
            console.error('Falha na exclusão de:', failedDeletions);
        } else {
            alert('Produto(s) excluído(s) com sucesso!');
        }
        fetchProductsFromAPI(); // Recarrega a tabela
    } catch (error) {
        console.error('Erro ao excluir produtos:', error);
        alert('Erro ao excluir produtos.');
        fetchProductsFromAPI();
    }
}

// Lógica do Modal de Detalhes
function showProductDetails(product) {
    modal.style.display = 'block';
    
    // Preenche o modal com os dados
    modalProductName.textContent = product.name;
    modalImage.src = Array.isArray(product.image_url) && product.image_url.length > 0 ? product.image_url[0] : '/placeholder.png';
    modalImage.alt = product.name;

    let detailsHtml = `
        <div class="detail-item"><strong>Código do Produto:</strong> ${product.product_code || 'N/A'}</div>
        <div class="detail-item"><strong>Preço:</strong> R$ ${product.price.toFixed(2).replace('.', ',')}</div>
        <div class="detail-item"><strong>Descrição Curta:</strong> ${product.description || 'N/A'}</div>
        <div class="detail-item"><strong>Descrição Longa:</strong> ${product.long_description || 'N/A'}</div>
        <div class="detail-item"><strong>Especificações Técnicas:</strong></div>
    `;

    // Converte especificações técnicas em uma lista
    if (product.technical_specifications && Array.isArray(product.technical_specifications) && product.technical_specifications.length > 0) {
        const specsList = product.technical_specifications.map(spec => `<li><strong>${spec.key}:</strong> ${spec.value}</li>`).join('');
        detailsHtml += `<ul class="detail-list">${specsList}</ul>`;
    } else {
        detailsHtml += `<p>N/A</p>`;
    }

    modalDetailsContent.innerHTML = detailsHtml;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', fetchProductsFromAPI);
deleteButton.addEventListener('click', deleteSelectedProducts);
searchInput.addEventListener('input', filterProducts);

selectAllCheckbox.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.product-checkbox').forEach(checkbox => {
        checkbox.checked = isChecked;
    });
});

closeModalButton.addEventListener('click', () => {
    modal.style.display = 'none';
});

window.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
});
