// public/cart-script.js - Gerencia a lógica do carrinho (localStorage) e a UI em cart.html.

// --- Funções de utilidade para o carrinho (localStorage) ---
function getCart() {
    try {
        const cart = JSON.parse(localStorage.getItem('cart'));
        // Garante que o carrinho é um array e que selected_size/color são nulls consistentes
        // Garante que product_code existe, mesmo que seja string vazia
        return Array.isArray(cart) ? cart.map(item => ({
            ...item,
            selected_size: item.selected_size || null,
            selected_color: item.selected_color || null,
            product_code: item.product_code || '' // Garante que product_code seja uma string
        })) : [];
    } catch (e) {
        console.error("[cart-script.js][getCart] Erro ao carregar carrinho do localStorage:", e);
        return [];
    }
}

function saveCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
    // console.log('[cart-script.js][saveCart] Carrinho salvo:', cart); // Descomente para depuração
    updateCartCounter(); // Atualiza o contador em qualquer página (se houver)
    // Se estiver na página do carrinho, recarrega os detalhes
    if (window.location.pathname === '/cart.html') {
        loadCartDetails();
    }
}

// Esta é a função principal para adicionar ao carrinho
// Ela será chamada pelos botões de "Adicionar ao Carrinho" nas páginas de produtos.
// Refatorada para considerar variações (tamanho/cor)
function addToCart(productData, quantity = 1) {
    // Validação básica dos dados do produto
    if (!productData || !productData.id || !productData.name || !productData.price) {
        console.error('[cart-script.js][addToCart] Dados do produto inválidos ou incompletos:', productData);
        showAlert('Erro ao adicionar produto: dados incompletos.', 'danger');
        return;
    }

    let cart = getCart();
    let found = false;

    // Padroniza size/color para null se forem vazios ou 'null' string
    const selectedSize = (productData.selected_size === '' || productData.selected_size === undefined || productData.selected_size === 'null') ? null : productData.selected_size;
    const selectedColor = (productData.selected_color === '' || productData.selected_color === undefined || productData.selected_color === 'null') ? null : productData.selected_color;
    const productCode = productData.product_code || ''; // Garante que é string, mesmo que vazia/null/undefined

    // Procurar por um item existente que corresponda EXATAMENTE em ID, Código, Tamanho e Cor
    for (let i = 0; i < cart.length; i++) {
        const existingItem = cart[i];
        if (existingItem.id === productData.id &&
            existingItem.product_code === productCode && // Compara também o código do produto
            (existingItem.selected_size === selectedSize) && // Compara o tamanho
            (existingItem.selected_color === selectedColor)    // Compara a cor
        ) {
            existingItem.quantity += quantity;
            found = true;
            // console.log(`[cart-script.js][addToCart] Quantidade de ${productData.name} (ID: ${productData.id}, Tam: ${selectedSize}, Cor: ${selectedColor}) aumentada para ${existingItem.quantity}.`); // Descomente para depuração
            break;
        }
    }

    if (!found) {
        // Se não encontrou um item exato, adiciona como um novo item
        const itemToAdd = {
            id: productData.id,
            product_code: productCode, // Adiciona o product_code
            name: productData.name,
            price: productData.price,
            image_url: productData.image_url,
            selected_size: selectedSize,
            selected_color: selectedColor,
            quantity: quantity
        };
        cart.push(itemToAdd);
        // console.log(`[cart-script.js][addToCart] Novo produto ${productData.name} (ID: ${productData.id}, Tam: ${selectedSize}, Cor: ${selectedColor}) adicionado ao carrinho.`); // Descomente para depuração
    }

    saveCart(cart);
    let alertMessage = `${quantity}x ${productData.name}`;
    if (selectedSize) {
        alertMessage += ` (Tam: ${selectedSize})`;
    }
    if (selectedColor) {
        alertMessage += ` (Cor: ${selectedColor})`;
    }
    alertMessage += ' adicionado(s) ao carrinho!';
    showAlert(alertMessage, 'success'); // Usa a função showAlert para feedback visual
}

function updateCartCounter() {
    const cartCounter = document.getElementById('cart-counter');
    if (cartCounter) {
        const cart = getCart();
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCounter.textContent = totalItems > 0 ? totalItems : '';
        cartCounter.style.display = totalItems > 0 ? 'inline-block' : 'none';
        // console.log(`[cart-script.js][updateCartCounter] Contador do carrinho atualizado para: ${totalItems}`); // Descomente para depuração
    } else {
        // console.log('[cart-script.js][updateCartCounter] Elemento #cart-counter não encontrado.'); // Descomente para depuração
    }
}

// --- Funções para carregar detalhes do carrinho (para cart.html) ---
function loadCartDetails() {
    const cart = getCart();
    const cartItemsContainer = document.getElementById('cart-items-container');
    const emptyCartMessage = document.getElementById('empty-cart-message');
    const cartSubtotalSpan = document.getElementById('cart-subtotal');
    const cartShippingSpan = document.getElementById('cart-shipping');
    const cartTotalSpan = document.getElementById('cart-total');
    const checkoutButton = document.getElementById('checkout-button');

    if (!cartItemsContainer || !emptyCartMessage || !cartSubtotalSpan || !cartShippingSpan || !cartTotalSpan) {
        console.warn("[cart-script.js][loadCartDetails] Elementos do carrinho não encontrados no DOM. Ignorando loadCartDetails.");
        return;
    }

    cartItemsContainer.innerHTML = ''; // Limpa os itens existentes

    let subtotal = 0;

    if (cart.length === 0) {
        emptyCartMessage.style.display = 'block';
        if (checkoutButton) {
            checkoutButton.classList.add('disabled');
            checkoutButton.href = '#';
        }
        // console.log('[cart-script.js][loadCartDetails] Carrinho vazio.'); // Descomente para depuração
    } else {
        emptyCartMessage.style.display = 'none';
        if (checkoutButton) {
            checkoutButton.classList.remove('disabled');
            checkoutButton.href = '/checkout.html';
        }
        // console.log('[cart-script.js][loadCartDetails] Carrinho com itens. Renderizando itens...'); // Descomente para depuração

        cart.forEach(item => {
            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;

            // Garante que a URL da imagem é válida ou usa placeholder
            const imageUrl = item.image_url && item.image_url.length > 0 ?
                             (Array.isArray(item.image_url) ? item.image_url[0] : item.image_url) :
                             '/images/placeholder.png'; // Caminho para o placeholder

            let itemDescription = item.name;
            if (item.selected_size) itemDescription += ` (Tam: ${item.selected_size})`;
            if (item.selected_color) itemDescription += ` (Cor: ${item.selected_color})`;

            // Prepara argumentos para as funções onclick, garantindo que null seja string 'null'
            const sizeArg = item.selected_size === null ? 'null' : `'${item.selected_size}'`;
            const colorArg = item.selected_color === null ? 'null' : `'${item.selected_color}'`;
            const productCodeArg = item.product_code === null ? 'null' : `'${item.product_code}'`; // Garante product_code como string ou 'null'

            const itemDiv = document.createElement('div');
            itemDiv.classList.add('cart-item');
            itemDiv.innerHTML = `
                <img src="${imageUrl}" alt="${item.name}" class="cart-item-image">
                <div class="cart-item-details">
                    <h4 class="cart-item-name">${itemDescription}</h4>
                    <p class="cart-item-price">R$ ${item.price.toFixed(2).replace('.', ',')}</p>
                    <div class="cart-item-quantity-controls">
                        <button class="quantity-btn decrease-quantity" onclick="changeQuantity('${item.id}', ${productCodeArg}, ${sizeArg}, ${colorArg}, -1)">-</button>
                        <span class="cart-item-quantity">${item.quantity}</span>
                        <button class="quantity-btn increase-quantity" onclick="changeQuantity('${item.id}', ${productCodeArg}, ${sizeArg}, ${colorArg}, 1)">+</button>
                    </div>
                </div>
                <span class="cart-item-total">R$ ${(itemTotal).toFixed(2).replace('.', ',')}</span>
                <button class="remove-item-btn" onclick="removeFromCart('${item.id}', ${productCodeArg}, ${sizeArg}, ${colorArg})">Remover</button>
            `;
            cartItemsContainer.appendChild(itemDiv);
        });
    }

    const shipping = 0; // Frete fixo por enquanto
    const total = subtotal + shipping;

    cartSubtotalSpan.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    cartShippingSpan.textContent = `R$ ${shipping.toFixed(2).replace('.', ',')}`;
    cartTotalSpan.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    // console.log(`[cart-script.js][loadCartDetails] Subtotal: R$ ${subtotal.toFixed(2)}, Total: R$ ${total.toFixed(2)}`); // Descomente para depuração
}

// Funções globais para manipulação de quantidade e remoção na página do carrinho
// São chamadas pelos botões gerados dinamicamente no loadCartDetails
function changeQuantity(productId, productCodeStr, selectedSizeStr, selectedColorStr, delta) {
    let cart = getCart();
    // Converte 'null' string para null
    const productCode = (productCodeStr === 'null') ? null : productCodeStr;
    const selectedSize = (selectedSizeStr === 'null') ? null : selectedSizeStr;
    const selectedColor = (selectedColorStr === 'null') ? null : selectedColorStr;

    const itemIndex = cart.findIndex(item =>
        item.id === productId &&
        item.product_code === productCode &&
        item.selected_size === selectedSize &&
        item.selected_color === selectedColor
    );

    if (itemIndex > -1) {
        cart[itemIndex].quantity += delta;
        if (cart[itemIndex].quantity <= 0) {
            cart.splice(itemIndex, 1); // Remove o item se a quantidade for <= 0
        }
        saveCart(cart); // Salva e recarrega a exibição do carrinho
    }
}

function removeFromCart(productId, productCodeStr, selectedSizeStr, selectedColorStr) {
    let cart = getCart();
    // Converte 'null' string para null
    const productCode = (productCodeStr === 'null') ? null : productCodeStr;
    const selectedSize = (selectedSizeStr === 'null') ? null : selectedSizeStr;
    const selectedColor = (selectedColorStr === 'null') ? null : selectedColorStr;

    cart = cart.filter(item =>
        !(item.id === productId &&
          item.product_code === productCode &&
          item.selected_size === selectedSize &&
          item.selected_color === selectedColor)
    );
    saveCart(cart); // Salva e recarrega a exibição do carrinho
    showAlert('Item removido do carrinho.', 'info');
}

function showAlert(message, type = 'info', duration = 3000) {
    const alertContainer = document.getElementById('alert-container');
    // Cria o container se não existir (para ser reutilizado)
    if (!alertContainer) {
        const body = document.querySelector('body');
        const newAlertContainer = document.createElement('div');
        newAlertContainer.id = 'alert-container';
        newAlertContainer.style.position = 'fixed';
        newAlertContainer.style.top = '10px';
        newAlertContainer.style.left = '50%';
        newAlertContainer.style.transform = 'translateX(-50%)';
        newAlertContainer.style.zIndex = '1050';
        newAlertContainer.style.width = 'fit-content';
        newAlertContainer.style.minWidth = '250px';
        newAlertContainer.style.maxWidth = '90%';
        newAlertContainer.style.display = 'flex';
        newAlertContainer.style.flexDirection = 'column';
        newAlertContainer.style.alignItems = 'center';
        body.appendChild(newAlertContainer);
        // Tenta pegar novamente
        const retryAlertContainer = document.getElementById('alert-container');
        if (!retryAlertContainer) {
            console.warn('Elemento #alert-container ainda não encontrado após tentativa de criação.');
            return;
        }
    }


    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.style.minWidth = '250px';
    alert.style.maxWidth = '500px';
    alert.style.margin = '5px 0'; // Espaçamento entre alertas
    alert.style.opacity = '0.9';

    alert.innerHTML = `
        <span>${message}</span>
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close" onclick="this.parentElement.remove();"></button>
    `;

    // Garante que o container existe agora
    const currentAlertContainer = document.getElementById('alert-container');
    if (currentAlertContainer) {
        currentAlertContainer.appendChild(alert);

        setTimeout(() => {
            alert.remove(); // Remove o alerta após a duração
        }, duration);
    }
}


// --- Listener principal para carregar o conteúdo da página ---
document.addEventListener('DOMContentLoaded', () => {
    // console.log(`[cart-script.js][DOMContentLoaded] Evento DOMContentLoaded disparado. Página: ${window.location.pathname}`); // Descomente para depuração
    updateCartCounter(); // Atualiza o contador do carrinho no cabeçalho em todas as páginas

    // Verifica se a página atual é a do carrinho e carrega os detalhes
    if (window.location.pathname === '/cart.html') {
        loadCartDetails();
    } else {
        // console.log(`[cart-script.js][DOMContentLoaded] Nenhuma função de carregamento específica do carrinho para a página: ${window.location.pathname}`); // Descomente para depuração
    }
});

// Expondo funções para acesso global, se necessário (para product-script.js, por exemplo)
window.addToCart = addToCart;
window.changeQuantity = changeQuantity;
window.removeFromCart = removeFromCart;
window.getCart = getCart;
window.saveCart = saveCart; // Expondo saveCart se houver necessidade externa
window.showAlert = showAlert; // Expondo showAlert
