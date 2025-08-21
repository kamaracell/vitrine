// public/checkout-script.js
document.addEventListener('DOMContentLoaded', () => {
    const checkoutItemsContainer = document.getElementById('checkout-items-container');
    const checkoutSubtotalSpan = document.getElementById('checkout-subtotal');
    const checkoutShippingSpan = document.getElementById('checkout-shipping');
    const checkoutTotalSpan = document.getElementById('checkout-total');
    const processPaymentButton = document.getElementById('process-payment-button');
    const checkoutForm = document.getElementById('checkout-form');

    let itemsToCheckout = [];
    let subtotalAmount = 0;
    const shippingCost = 0.00; // Frete fixo em 0.00 por enquanto

    function loadCheckoutItems() {
        const urlParams = new URLSearchParams(window.location.search);
        const fromSource = urlParams.get('from');

        if (fromSource === 'buy_now') {
            const buyNowItem = JSON.parse(localStorage.getItem('buyNowItem'));
            if (buyNowItem) {
                itemsToCheckout = [buyNowItem];
            }
        } else {
            itemsToCheckout = JSON.parse(localStorage.getItem('cart')) || [];
        }

        if (itemsToCheckout.length === 0) {
            alert('Não há itens para processar o pagamento. Redirecionando para a página inicial.');
            window.location.href = '/';
            return;
        }

        checkoutItemsContainer.innerHTML = '';
        subtotalAmount = 0;

        itemsToCheckout.forEach(item => {
            const itemTotal = item.price * item.quantity;
            subtotalAmount += itemTotal;

            const itemDiv = document.createElement('div');
            itemDiv.classList.add('checkout-item');
            const imageUrl = item.image_url && item.image_url.length > 0
                ? (Array.isArray(item.image_url) ? item.image_url[0] : item.image_url)
                : '/images/placeholder.png';

            itemDiv.innerHTML = `
                <img src="${imageUrl}" alt="${item.name}">
                <div class="item-details">
                    <h3>${item.name}</h3>
                    <p>Preço: R$ ${parseFloat(item.price).toFixed(2).replace('.', ',')}</p>
                    <p>Quantidade: ${item.quantity}</p>
                    ${item.selected_size ? `<p>Tamanho: ${item.selected_size}</p>` : ''}
                    ${item.selected_color ? `<p>Cor: ${item.selected_color}</p>` : ''}
                    <p>Subtotal do item: R$ ${itemTotal.toFixed(2).replace('.', ',')}</p>
                </div>
            `;
            checkoutItemsContainer.appendChild(itemDiv);
        });

        checkoutSubtotalSpan.textContent = `R$ ${subtotalAmount.toFixed(2).replace('.', ',')}`;
        checkoutShippingSpan.textContent = `R$ ${shippingCost.toFixed(2).replace('.', ',')}`;
        checkoutTotalSpan.textContent = `R$ ${(subtotalAmount + shippingCost).toFixed(2).replace('.', ',')}`;
        document.getElementById('amount').value = (subtotalAmount + shippingCost).toFixed(2);
    }

    checkoutForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (itemsToCheckout.length === 0) {
            alert('Não há itens para processar o pagamento.');
            return;
        }

        processPaymentButton.disabled = true;
        processPaymentButton.textContent = 'Processando Pagamento...';

        // Coleta as informações do cliente com os nomes de campo do HTML
        const customerInfo = {
            name: document.getElementById('fullName').value,
            email: document.getElementById('payerEmail').value,
            phone: document.getElementById('phoneNumber').value.replace(/\D/g, ''),
            address: { // Este objeto `address` será mapeado para colunas separadas no backend
                cep: document.getElementById('zipCode').value.replace(/\D/g, ''),
                street: document.getElementById('street').value, // ATUALIZADO: agora é 'street'
                number: document.getElementById('number').value, // NOVO: Campo 'number' separado
                complement: document.getElementById('complement').value,
                neighborhood: document.getElementById('neighborhood').value,
                city: document.getElementById('city').value,
                state: document.getElementById('state').value,
            }
        };

        try {
            console.log('Enviando requisição POST para /create_preference com:', { cartItems: itemsToCheckout, customerInfo: customerInfo });
            const response = await fetch('/create_preference', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ cartItems: itemsToCheckout, customerInfo: customerInfo })
            });

            console.log('Resposta recebida do servidor (status):', response.status);

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Erro ao criar preferência de pagamento:', errorData);
                alert(`Erro ao iniciar pagamento: ${errorData.error || 'Ocorreu um erro desconhecido.'}\nDetalhes: ${errorData.details || 'N/A'}`);
                processPaymentButton.disabled = false;
                processPaymentButton.textContent = 'Finalizar Pedido no Mercado Pago';
                return;
            }

            const result = await response.json();
            if (result.redirectUrl) {
                console.log('Redirecionando para:', result.redirectUrl);
                // Limpa o carrinho/buyNowItem antes de redirecionar
                const urlParams = new URLSearchParams(window.location.search);
                const fromSource = urlParams.get('from');
                if (fromSource === 'buy_now') {
                    localStorage.removeItem('buyNowItem');
                } else {
                    localStorage.removeItem('cart');
                }
                updateCartCountDisplay();
                window.location.href = result.redirectUrl;
            } else {
                alert('Erro: URL de redirecionamento não recebida do servidor. Verifique os logs do servidor.');
                console.error('Resposta do servidor não contém redirectUrl:', result);
                processPaymentButton.disabled = false;
                processPaymentButton.textContent = 'Finalizar Pedido no Mercado Pago';
            }
        } catch (error) {
            console.error('Erro na requisição de pagamento (frontend catch):', error);
            alert('Erro de conexão ou servidor ao tentar processar o pagamento. Verifique o console do Termux.');
            processPaymentButton.disabled = false;
            processPaymentButton.textContent = 'Finalizar Pedido no Mercado Pago';
        }
    });

    loadCheckoutItems();
    updateCartCountDisplay();
});

// A função updateCartCountDisplay é definida em cart-script.js
// Ela precisa estar acessível aqui também.
// Normalmente seria importada, mas para simplicidade, mantemos a declaração global.
function updateCartCountDisplay() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    const cartCountSpan = document.getElementById('cart-counter');
    if (cartCountSpan) {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCountSpan.textContent = totalItems;
    }
}
