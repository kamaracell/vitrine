// public/script.js - Gerencia a página de checkout.html e outras interações globais.

// Função para logar mensagens no console, na página (se houver page-logs)
// E também envia para o console remoto dinâmico (se carregado)
function remoteLog(message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const formattedMessage = `[${level.toUpperCase()}] ${timestamp}: ${message}`;

    // 1. Loga no elemento #page-logs (se existir, da sua estrutura original)
    const pageLogsDiv = document.getElementById('page-logs');
    if (pageLogsDiv) {
        const logEntry = document.createElement('div');
        logEntry.classList.add('log-entry', level);
        logEntry.innerHTML = formattedMessage;
        pageLogsDiv.appendChild(logEntry);
        pageLogsDiv.scrollTop = pageLogsDiv.scrollHeight; // Rolar para o final
    }

    // 2. Loga no console nativo do navegador
    if (level === 'error') console.error(formattedMessage);
    else if (level === 'warn') console.warn(formattedMessage);
    else if (level === 'debug') console.debug(formattedMessage);
    else console.log(formattedMessage);

    // 3. Dispara um evento para o console dinâmico (se ele estiver ouvindo)
    // Isso permite que o remote-console.js capture e exiba.
    const event = new CustomEvent('remoteLogEvent', {
        detail: { message: message, level: level }
    });
    window.dispatchEvent(event);
}

// Public Key do Mercado Pago
const PUBLIC_KEY = 'TEST-97c386da-0d34-4308-b2df-d0ffb68c5619'; // Use sua chave pública de teste ou produção

remoteLog(`[INICIO] Script carregado. Iniciando...`, 'info');
remoteLog(`[INICIO] Public Key do Mercado Pago: ${PUBLIC_KEY}`, 'info');

const mp = new MercadoPago(PUBLIC_KEY, { locale: 'pt-BR' });
// Variável para controlar múltiplos submits
let isSubmitting = false;

// --- Funções para o contador de carrinho (usada em todas as páginas com o elemento) ---
function updateCartCounter() {
    const cartCounter = document.getElementById('cart-counter');
    if (cartCounter) {
        try {
            const cart = JSON.parse(localStorage.getItem('cart')) || [];
            const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
            cartCounter.textContent = totalItems;
            cartCounter.style.display = totalItems > 0 ? 'inline-block' : 'none';
            remoteLog(`[CART_COUNTER] Contador do carrinho atualizado: ${totalItems} itens.`, 'debug');
        } catch (e) {
            remoteLog(`[CART_COUNTER] Erro ao atualizar contador do carrinho: ${e.message}`, 'error');
            cartCounter.style.display = 'none';
        }
    }
}

// --- Funções para a Página de Checkout (checkout.html) ---

// NOVO: Função para obter itens, priorizando a URL se for uma compra direta
function getCheckoutItems() {
    remoteLog('[CHECKOUT_LOGIC] Verificando se é uma compra direta (via URL) ou do carrinho.', 'info');
    const urlParams = new URLSearchParams(window.location.search);

    const productId = urlParams.get('product_id');
    const amount = urlParams.get('amount');
    const description = urlParams.get('description');
    const payerEmail = urlParams.get('payer_email');
    const quantity = urlParams.get('quantity');
    const selectedSize = urlParams.get('selected_size');
    const imageUrl = urlParams.get('image_url');

    if (productId && amount && description && quantity) {
        remoteLog(`[CHECKOUT_LOGIC] Dados de compra direta encontrados na URL: Produto ID ${productId}`, 'info');
        // Pré-popular o e-mail se vier da URL
        const payerEmailInput = document.getElementById('payerEmail');
        if (payerEmailInput && payerEmail) {
            payerEmailInput.value = payerEmail;
            remoteLog(`[CHECKOUT_LOGIC] E-mail do pagador pré-preenchido com valor da URL: ${payerEmail}`, 'debug');
        }

        // Retorna um array com o item único para simular a estrutura do carrinho
        return [{
            id: productId,
            name: description,
            price: parseFloat(amount), // Certifica-se de que é um número
            quantity: parseInt(quantity), // Certifica-se de que é um número
            image_url: imageUrl || '/placeholder.png', // Usar URL da imagem, ou placeholder
            selected_size: selectedSize || null // Adiciona o tamanho selecionado
        }];
    } else {
        remoteLog('[CHECKOUT_LOGIC] Dados de compra direta NÃO encontrados na URL. Carregando itens do carrinho.', 'info');
        try {
            const storedCart = JSON.parse(localStorage.getItem('cart')) || [];
            remoteLog(`[CHECKOUT_LOGIC] Itens do carrinho do localStorage: ${JSON.stringify(storedCart)}`, 'debug');
            return storedCart;
        } catch (e) {
            remoteLog(`[CHECKOUT_LOGIC] Erro ao ler o carrinho do localStorage: ${e.message}`, 'error');
            return [];
        }
    }
}


// Função para renderizar os itens (do carrinho ou da compra direta) e atualizar os totais na checkout.html
function renderCheckoutItemsAndTotals() {
    remoteLog('[CHECKOUT_LOGIC] Iniciando renderização de itens e totais na checkout.html.', 'info');
    const checkoutItems = getCheckoutItems(); // Usa a nova função
    const container = document.getElementById('checkout-items-container');
    const subtotalSpan = document.getElementById('checkout-subtotal');
    const shippingSpan = document.getElementById('checkout-shipping');
    const totalSpan = document.getElementById('checkout-total');
    const amountInput = document.getElementById('amount'); // Input hidden para o Mercado Pago
    const paymentForm = document.getElementById('form-checkout'); // Seu formulário de pagamento
    const submitButton = document.getElementById('submit-button'); // Botão de submit
    const cardPaymentSection = document.getElementById('card-payment-section');
    const pixPaymentSection = document.getElementById('pix-payment-section');
    const boletoPaymentSection = document.getElementById('boleto-payment-section');


    if (!container || !subtotalSpan || !shippingSpan || !totalSpan || !amountInput || !paymentForm || !submitButton || !cardPaymentSection || !pixPaymentSection || !boletoPaymentSection) {
        remoteLog('Um ou mais elementos essenciais do checkout não foram encontrados no DOM para renderização dos itens. Verifique os IDs.', 'error');
        return 0;
    }

    container.innerHTML = '';
    let subtotal = 0;

    if (checkoutItems.length === 0) {
        container.innerHTML = '<p>Nenhum item para checkout. Adicione produtos para prosseguir.</p>';
        cardPaymentSection.classList.add('hidden');
        pixPaymentSection.classList.add('hidden');
        boletoPaymentSection.classList.add('hidden');
        submitButton.disabled = true;
        submitButton.textContent = 'Nenhum Item para Checkout';
        remoteLog('[CHECKOUT_LOGIC] Nenhum item para checkout. Seções de pagamento ocultadas e botão desabilitado.', 'warn');
    } else {
        cardPaymentSection.classList.add('active');
        cardPaymentSection.classList.remove('hidden');
        pixPaymentSection.classList.add('hidden');
        pixPaymentSection.classList.remove('active');
        boletoPaymentSection.classList.add('hidden');
        boletoPaymentSection.classList.remove('active');

        checkoutItems.forEach(item => {
            if (item.name && item.price !== undefined && item.quantity > 0) {
                const itemTotal = item.price * item.quantity;
                subtotal += itemTotal;
                const imageUrl = Array.isArray(item.image_url) ? item.image_url[0] : item.image_url;

                const itemDiv = document.createElement('div');
                itemDiv.classList.add('checkout-item');
                itemDiv.innerHTML = `
                    <img src="${imageUrl}" alt="${item.name}" class="checkout-item-image">
                    <div class="checkout-item-details">
                        <h4 class="checkout-item-name">${item.name}</h4>
                        <p class="checkout-item-price">Qtd: ${item.quantity} x R$ ${item.price.toFixed(2).replace('.', ',')} ${item.selected_size ? `(Tam: ${item.selected_size})` : ''}</p>
                </div>
                    <span class="checkout-item-total">R$ ${itemTotal.toFixed(2).replace('.', ',')}</span>
                `;
                container.appendChild(itemDiv);
                remoteLog(`[CHECKOUT_LOGIC] Item "${item.name}" (Qtd: ${item.quantity}, Tam: ${item.selected_size || 'N/A'}) renderizado.`, 'debug');
            } else {
                remoteLog(`[CHECKOUT_LOGIC] Não foi possível renderizar um item devido a dados incompletos ou inválidos: ${JSON.stringify(item)}`, 'error');
            }
        });
    }

    const shipping = 0; // Frete zero para o exemplo
    const total = subtotal + shipping;

    subtotalSpan.textContent = `R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    shippingSpan.textContent = `R$ ${shipping.toFixed(2).replace('.', ',')}`;
    totalSpan.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
    amountInput.value = total.toFixed(2); // Atualiza o valor para o Mercado Pago SDK

    remoteLog(`[CHECKOUT_LOGIC] Totais atualizados. Subtotal: ${subtotal.toFixed(2)}, Total: ${total.toFixed(2)}.`, 'info');

    validateFormFields();
    return total;
}


// --- Lógica de Validação do Formulário e Ativação/Desativação do Botão ---
let currentPaymentMethod = 'card'; // Variável para armazenar o método de pagamento selecionado

function validateFormFields() {
    remoteLog('[VALIDATION] Iniciando validação dos campos do formulário.', 'debug');
    const submitButton = document.getElementById('submit-button');
    const confirmPixButton = document.querySelector('.confirm-pix-payment');
    const confirmBoletoButton = document.querySelector('.confirm-boleto-payment');

    if (!submitButton || !confirmPixButton || !confirmBoletoButton) {
        remoteLog('[VALIDATION] Um ou mais botões de submit/confirmação não encontrados. A validação não pode prosseguir.', 'error');
        return;
    }

    let allFieldsValid = true;
    let missingFields = [];

    // Validar campos de Entrega (sempre obrigatórios)
    const shippingFields = [
        document.getElementById('fullName'),
        document.getElementById('address'),
        document.getElementById('city'),
        document.getElementById('state'),
        document.getElementById('zipCode')
    ];

    shippingFields.forEach(field => {
        if (field && field.value.trim() === '') {
            allFieldsValid = false;
            if (!missingFields.includes(field.id)) missingFields.push(field.id);
        }
    });

    // Validar campos específicos do método de pagamento ativo
    if (currentPaymentMethod === 'card') {
        const cardFields = [
            document.getElementById('cardNumber'),
            document.getElementById('expirationDate'),
            document.getElementById('securityCode'),
            document.getElementById('cardholderName'),
            document.getElementById('docNumber'),
            document.getElementById('payerEmail')
        ];

        cardFields.forEach(field => {
            if (field && field.value.trim() === '') {
                allFieldsValid = false;
                if (!missingFields.includes(field.id)) missingFields.push(field.id);
            }
        });

        // Validação específica para e-mail
        const payerEmail = document.getElementById('payerEmail');
        if (payerEmail && !payerEmail.value.includes('@')) {
            allFieldsValid = false;
            if (!missingFields.includes('payerEmail')) missingFields.push('payerEmail');
        }

        // Validação específica para data de vencimento (MM/AA)
        const expirationDate = document.getElementById('expirationDate');
        if (expirationDate) {
            const value = expirationDate.value.trim();
            const regex = /^(0[1-9]|1[0-2])\/?([0-9]{2})$/; // MM/AA
            if (!regex.test(value)) {
                allFieldsValid = false;
                if (!missingFields.includes('expirationDate')) missingFields.push('expirationDate');
            }
        }

        // Controlar o botão de cartão
        if (allFieldsValid) {
            submitButton.disabled = false;
            submitButton.textContent = 'Finalizar Pagamento';
            remoteLog('[VALIDATION][Card] Todos os campos obrigatórios preenchidos. Botão "Finalizar Pagamento" ATIVO.', 'info');
        } else {
            submitButton.disabled = true;
            submitButton.textContent = 'Preencha todos os campos';
            remoteLog(`[VALIDATION][Card] Campos faltando/inválidos: ${missingFields.join(', ')}. Botão "Finalizar Pagamento" INATIVO.`, 'warn');
        }

        // Outros botões desabilitados quando 'card' está ativo
        confirmPixButton.disabled = true;
        confirmBoletoButton.disabled = true;

    } else if (currentPaymentMethod === 'pix') {
        if (allFieldsValid) {
            confirmPixButton.disabled = false;
            confirmPixButton.textContent = 'Confirmar Pagamento Pix';
            remoteLog('[VALIDATION][Pix] Campos de entrega preenchidos. Botão "Confirmar Pagamento Pix" ATIVO.', 'info');
        } else {
            confirmPixButton.disabled = true;
            confirmPixButton.textContent = 'Preencha os dados de entrega';
            remoteLog(`[VALIDATION][Pix] Campos de entrega faltando/inválidos: ${missingFields.join(', ')}. Botão "Confirmar Pagamento Pix" INATIVO.`, 'warn');
        }

        submitButton.disabled = true;
        confirmBoletoButton.disabled = true;

    } else if (currentPaymentMethod === 'boleto') {
        if (allFieldsValid) {
            confirmBoletoButton.disabled = false;
            confirmBoletoButton.textContent = 'Confirmar Pagamento Boleto';
            remoteLog('[VALIDATION][Boleto] Campos de entrega preenchidos. Botão "Confirmar Pagamento Boleto" ATIVO.', 'info');
        } else {
            confirmBoletoButton.disabled = true;
            confirmBoletoButton.textContent = 'Preencha os dados de entrega';
            remoteLog(`[VALIDATION][Boleto] Campos de entrega faltando/inválidos: ${missingFields.join(', ')}. Botão "Confirmar Pagamento Boleto" INATIVO.`, 'warn');
        }

        submitButton.disabled = true;
        confirmPixButton.disabled = true;
    }
}


// --- Lógica para alternar métodos de pagamento ---
function setupPaymentMethodSelection() {
    const paymentOptions = document.querySelectorAll('.payment-option');
    const cardSection = document.getElementById('card-payment-section');
    const pixSection = document.getElementById('pix-payment-section');
    const boletoSection = document.getElementById('boleto-payment-section');

    paymentOptions.forEach(option => {
        option.addEventListener('click', () => {
            paymentOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');

            const method = option.querySelector('img').dataset.method;
            currentPaymentMethod = method;

            remoteLog(`[PAYMENT_METHOD] Método de pagamento selecionado: ${method}`, 'info');

            cardSection.classList.add('hidden');
            pixSection.classList.add('hidden');
            boletoSection.classList.add('hidden');
            cardSection.classList.remove('active');
            pixSection.classList.remove('active');
            boletoSection.classList.remove('active');

            if (method === 'card') {
                cardSection.classList.remove('hidden');
                cardSection.classList.add('active');
            } else if (method === 'pix') {
                pixSection.classList.remove('hidden');
                pixSection.classList.add('active');
            } else if (method === 'boleto') {
                boletoSection.classList.remove('hidden');
                boletoSection.classList.add('active');
            }

            validateFormFields();
        });
    });
}


// --- Inicialização do Script Baseada na Página Atual ---
document.addEventListener('DOMContentLoaded', () => {
    updateCartCounter();

    // Verificamos explicitamente se estamos na checkout.html
    if (window.location.pathname.includes('/checkout.html')) {
        remoteLog(`[INIT] Página atual: ${window.location.pathname}. Iniciando a lógica para mostrar o pedido e o Mercado Pago.`, 'info');

        const totalAmount = renderCheckoutItemsAndTotals(); // Primeiro, monta os itens e calcula o total.
        initializeMercadoPagoForm(totalAmount);
        setupPaymentMethodSelection();

        // Adiciona listeners para os campos do formulário de checkout para validação dinâmica
        const formCheckout = document.getElementById('form-checkout');
        if (formCheckout) {
            const inputs = formCheckout.querySelectorAll('input, select');
            inputs.forEach(input => {
                input.addEventListener('input', validateFormFields);
                input.addEventListener('change', validateFormFields);
            });
        }
        // Adiciona listeners para os campos de envio
        const shippingSection = document.querySelector('.shipping-section');
        if (shippingSection) {
            const shippingInputs = shippingSection.querySelectorAll('input');
            shippingInputs.forEach(input => {
                input.addEventListener('input', validateFormFields);
                input.addEventListener('change', validateFormFields);
            });
        }

        // Lógica de simulação para botões de Pix/Boleto (para demonstração)
        const copyPixBtn = document.querySelector('.copy-pix-code-btn');
        if (copyPixBtn) {
            copyPixBtn.addEventListener('click', () => {
                const pixCode = document.querySelector('.pix-code-display').textContent.replace('Código Pix: ', '');
                navigator.clipboard.writeText(pixCode).then(() => {
                    alert('Código Pix copiado!');
                    remoteLog('[PIX] Código Pix copiado para a área de transferência.', 'info');
                }).catch(err => {
                    console.error('Erro ao copiar Pix:', err);
                    remoteLog('[PIX] Erro ao copiar código Pix.', 'error');
                });
            });
        }

        const generateBoletoBtn = document.querySelector('.generate-boleto-btn');
        const boletoCodeDisplay = document.querySelector('.boleto-code-display');
        const copyBoletoBtn = document.querySelector('.copy-boleto-code-btn');
        const downloadBoletoBtn = document.querySelector('.download-boleto-btn');

        if (generateBoletoBtn) {
            generateBoletoBtn.addEventListener('click', () => {
                const simulatedBoletoCode = '12345.67890 12345.678901 23456.789012 3 12345678901234'; // Simulado
                boletoCodeDisplay.textContent = `Código de Barras: ${simulatedBoletoCode}`;
                remoteLog('[BOLETO] Boleto simulado gerado.', 'info');
            });
        }
        if (copyBoletoBtn) {
            copyBoletoBtn.addEventListener('click', () => {
                const boletoCode = boletoCodeDisplay.textContent.replace('Código de Barras: ', '');
                navigator.clipboard.writeText(boletoCode).then(() => {
                    alert('Código de barras do boleto copiado!');
                    remoteLog('[BOLETO] Código de barras do boleto copiado para a área de transferência.', 'info');
                }).catch(err => {
                    console.error('Erro ao copiar Boleto:', err);
                    remoteLog('[BOLETO] Erro ao copiar código de barras do boleto.', 'error');
                });
            });
        }
        if (downloadBoletoBtn) {
            downloadBoletoBtn.addEventListener('click', () => {
                alert('Download do boleto simulado iniciado!');
                remoteLog('[BOLETO] Download de boleto simulado.', 'info');
                // Lógica real aqui envolveria um backend para gerar o PDF
            });
        }

        const confirmPixPaymentBtn = document.querySelector('.confirm-pix-payment');
        const confirmBoletoPaymentBtn = document.querySelector('.confirm-boleto-payment');

        if (confirmPixPaymentBtn) {
            confirmPixPaymentBtn.addEventListener('click', () => {
                alert('Pagamento Pix confirmado (simulado)! Redirecionando...');
                remoteLog('[PIX] Pagamento Pix confirmado (simulado).', 'info');
                const checkoutItems = getCheckoutItems();
                if (checkoutItems.length === 1 && new URLSearchParams(window.location.search).get('product_id')) {
                    // Se foi uma compra direta, não limpa o carrinho real
                    remoteLog('[PIX] Compra direta. Não limpando o carrinho real.', 'debug');
                } else {
                    localStorage.removeItem('cart'); // Limpa carrinho após sucesso do PIX (se for do carrinho)
                    updateCartCounter();
                    remoteLog('[PIX] Carrinho real limpo após pagamento Pix (se não for compra direta).', 'debug');
                }
                setTimeout(() => window.location.href = '/success.html', 1500);
            });
        }
        if (confirmBoletoPaymentBtn) {
            confirmBoletoPaymentBtn.addEventListener('click', () => {
                alert('Pagamento Boleto confirmado (simulado)! Redirecionando...');
                remoteLog('[BOLETO] Pagamento Boleto confirmado (simulado).', 'info');
                const checkoutItems = getCheckoutItems();
                if (checkoutItems.length === 1 && new URLSearchParams(window.location.search).get('product_id')) {
                    // Se foi uma compra direta, não limpa o carrinho real
                    remoteLog('[BOLETO] Compra direta. Não limpando o carrinho real.', 'debug');
                } else {
                    localStorage.removeItem('cart'); // Limpa carrinho após sucesso do Boleto (se for do carrinho)
                    updateCartCounter();
                    remoteLog('[BOLETO] Carrinho real limpo após pagamento Boleto (se não for compra direta).', 'debug');
                }
                setTimeout(() => window.location.href = '/success.html', 1500);
            });
        }

    } else {
        // As lógicas para index.html e details.html foram movidas para seus respectivos arquivos:
        // public/index-script.js e public/product-script.js
        remoteLog(`[INIT] Página atual: ${window.location.pathname}. Este script é focado em checkout.html.`, 'info');
    }
});

// Função initializeMercadoPagoForm
function initializeMercadoPagoForm(amount) {
    // Verifica se já existe uma instância do cardForm para evitar re-inicialização
    if (window.mpCardFormInstance) {
        remoteLog('[MP-SDK] cardForm já inicializado. Ignorando nova inicialização.', 'warn');
        // Se a quantidade mudou, é preciso atualizar a instância existente
        window.mpCardFormInstance.amount = amount.toFixed(2);
        remoteLog(`[MP-SDK] Valor total do cardForm atualizado para: R$ ${amount.toFixed(2).replace('.', ',')}`, 'info');
        return;
    }

    if (amount === 0 || !amount) {
        remoteLog('[MP-SDK] Valor total para o cardForm é zero ou inválido. Não foi possível inicializar o formulário de pagamento.', 'warn');
        const submitButton = document.getElementById('submit-button');
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Carrinho Vazio / Erro no Valor';
        }
        const formElements = document.querySelectorAll('#form-checkout input, #form-checkout select');
        formElements.forEach(element => {
            element.disabled = true;
        });
        return;
    }
    remoteLog(`[MP-SDK] Valor total para o cardForm definido como: R$ ${amount.toFixed(2).replace('.', ',')}`, 'info');

    const cardForm = mp.cardForm({
        amount: amount.toFixed(2),
        autoMount: true,
        form: {
            id: "form-checkout",
            cardholderName: {
                id: "cardholderName",
                placeholder: "Nome no Cartão"
            },
            cardholderEmail: {
                id: "payerEmail",
                placeholder: "E-mail"
            },
            cardNumber: {
                id: "cardNumber",
                placeholder: "Número do Cartão"
            },
            expirationDate: {
                id: "expirationDate",
                placeholder: "MM/AA"
            },
            securityCode: {
                id: "securityCode",
                placeholder: "CVV"
            },
        identificationType: {
                id: "docType"
            },
        identificationNumber: {
                id: "docNumber",
                placeholder: "CPF"
            },
        installments: {
                id: "installments",
                placeholder: "Parcelas"
            },
        issuer: {
                id: "issuer",
                placeholder: "Bandeira"
            }
        },
        callbacks: {
            onFormMounted: error => {
                if (error) {
                    remoteLog(`[MP-SDK][Callback] ERRO ao montar formulário: ${error.message}`, 'error');
                    return;
                }
                remoteLog("[MP-SDK][Callback] Formulário do Mercado Pago MONTADO com sucesso. Campos devem estar visíveis e digitáveis.", 'info');
                validateFormFields();
            },
            onSubmit: async event => {
                event.preventDefault();
                remoteLog('[MP-SDK][Callback] Evento de SUBMIT interceptado no cardForm.', 'info');

                if (isSubmitting) {
                    remoteLog('[MP-SDK][Callback] Tentativa de submit IGNORADA: já em processo.', 'warn');
                    return;
                }

                if (currentPaymentMethod !== 'card') {
                    remoteLog(`[MP-SDK][Callback] Submit ignorado: método de pagamento atual não é cartão (${currentPaymentMethod}).`, 'info');
                    return;
                }

                isSubmitting = true;
                const submitButton = document.getElementById('submit-button');
                if(submitButton) {
                    submitButton.disabled = true;
                    submitButton.textContent = 'Processando...';
                    remoteLog('[FORM] Botão de submit desabilitado.', 'debug');
                }

                remoteLog('[MP-SDK][Callback] Solicitando dados do cartão para TOKENIZAÇÃO...', 'info');
                try {
                    const formData = await cardForm.createCardToken();
                    const token = formData.token;

                    remoteLog(`[MP-SDK][Callback] TOKEN DO CARTÃO GERADO COM SUCESSO: ${token}`, 'info');

                    const tokenOutputDiv = document.getElementById('token-output');
                    if (tokenOutputDiv) {
                        tokenOutputDiv.innerText = token
                            ? `Token gerado com sucesso:\n\n${token}`
                            : 'Não foi possível gerar o token. Verifique os campos.';
                        remoteLog('[EXIBICAO] Token exibido na tela.', 'debug');
                    } else {
                        alert(`Token gerado: ${token}`);
                        remoteLog('[EXIBICAO] Token exibido via alert (div de output não encontrada).', 'warn');
                    }

                    // *** COLETAR DADOS DO FORMULÁRIO COMPLETO AQUI ANTES DE ENVIAR PARA O BACKEND ***
                    const fullFormData = {
                        transaction_amount: amount.toFixed(2),
                        token: token,
                        description: 'Compra na Sua Loja Online', // Pode ser ajustado para um item único ou múltiplos
                        payment_method_id: cardForm.payment_method_id,
                        installments: parseInt(document.getElementById('installments').value),
                        issuer_id: document.getElementById('issuer').value,
                        payer: {
                            email: document.getElementById('payerEmail').value,
                            first_name: document.getElementById('cardholderName').value.split(' ')[0],
                            last_name: document.getElementById('cardholderName').value.split(' ').slice(1).join(' '),
                            identification: {
                                type: document.getElementById('docType').value,
                                number: document.getElementById('docNumber').value,
                            },
                        },
                        shipping_address: {
                            full_name: document.getElementById('fullName').value,
                            address: document.getElementById('address').value,
                            complement: document.getElementById('complement').value,
                            city: document.getElementById('city').value,
                            state: document.getElementById('state').value,
                            zip_code: document.getElementById('zipCode').value,
                        },
                        // AQUI ESTÁ A MUDANÇA PRINCIPAL: Usa a função getCheckoutItems() para pegar os itens
                        // Isso garante que seja o item da URL ou os itens do carrinho.
                        cart_items: getCheckoutItems()
                    };

                    remoteLog("Dados completos para enviar ao backend:" + JSON.stringify(fullFormData), 'info');

                    // TODO: Aqui você faria a requisição AJAX (fetch) para o seu backend Express.js
                    /*
                    const response = await fetch('/process_payment', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(fullFormData)
                    });
                    const result = await response.json();
                    if (response.ok) {
                        tokenOutputDiv.innerText += '\nPagamento processado com sucesso! Resposta do backend: ' + JSON.stringify(result);
                        // Limpar carrinho SOMENTE SE NÃO FOR UMA COMPRA DIRETA
                        const isDirectBuy = new URLSearchParams(window.location.search).get('product_id');
                        if (!isDirectBuy) {
                           localStorage.removeItem('cart');
                           updateCartCounter();
                           remoteLog('[MP-SDK] Carrinho real limpo após pagamento bem-sucedido.', 'debug');
                        } else {
                           remoteLog('[MP-SDK] Compra direta. Não limpando o carrinho real.', 'debug');
                        }
                        // Redirecionar para página de sucesso
                        // setTimeout(() => window.location.href = '/success.html', 2000);
                    } else {
                        tokenOutputDiv.innerText += '\nErro no processamento do pagamento: ' + (result.message || JSON.stringify(result));
                    }
                    */
                    tokenOutputDiv.innerText += "\n(Envio ao backend simulado com sucesso!)";

                    // Simula o sucesso e o redirecionamento
                    // Remover esta parte quando a chamada ao backend for real
                    const isDirectBuy = new URLSearchParams(window.location.search).get('product_id');
                    if (!isDirectBuy) {
                       localStorage.removeItem('cart'); // Limpa carrinho se não for compra direta
                       updateCartCounter();
                       remoteLog('[MP-SDK] Carrinho real limpo após pagamento simulado.', 'debug');
                    } else {
                       remoteLog('[MP-SDK] Compra direta. Não limpando o carrinho real (simulado).', 'debug');
                    }
                    setTimeout(() => window.location.href = '/success.html', 2000);


                } catch (err) {
                    remoteLog(`[MP-SDK][Callback] ERRO ao gerar token: ${err.message}`, 'error');
                    const tokenOutputDiv = document.getElementById('token-output');
                    if (tokenOutputDiv) {
                        tokenOutputDiv.innerText = `Erro ao gerar token: ${err.message}. Verifique os campos e o console.`;
                    }
                    alert("Ocorreu um erro ao gerar o token. Verifique os dados do cartão e tente novamente.");
                } finally {
                    if(submitButton) {
                        submitButton.disabled = false;
                        submitButton.textContent = 'Finalizar Pagamento';
                        remoteLog('[FORM] Botão de submit reabilitado.', 'debug');
                    }
                    isSubmitting = false;
                    remoteLog('[MP-SDK][Callback] Processo de geração de token FINALIZADO.', 'info');
                }
            },
            onIdentificationTypesReceived: (error, identificationTypes) => {
                if (error) { remoteLog(`[MP-SDK][Callback] Erro ao receber tipos de documento: ${error.message}`, 'warn'); return; }
                remoteLog(`[MP-SDK][Callback] Tipos de documento recebidos: ${identificationTypes.length} tipos.`, 'debug');
            },
            onInstallmentsReceived: (error, installments) => {
                if (error) {
                    remoteLog(`[MP-SDK][Callback] ERRO ao receber parcelas: ${error.message}`, 'error');
                    return;
                }
                remoteLog(`[MP-SDK][Callback] Parcelas recebidas: ${installments ? installments.length + ' opções.' : '0 opções.'}`, 'info');
                if (installments && installments.length > 0) {
                    const installmentOptions = installments.map(opt => `${opt.installments}x de R$ ${opt.installment_amount.toFixed(2)}`).join(', ');
                    remoteLog(`[MP-SDK][Callback] Opções de parcelas: ${installmentOptions}`, 'debug');
                }
            },
            onPaymentMethodReceived: (error, paymentMethod) => {
                if (error) { remoteLog(`[MP-SDK][Callback] Erro ao receber método de pagamento: ${error.message}`, 'warn'); return; }
                remoteLog(`[MP-SDK][Callback] Método de pagamento recebido: ${paymentMethod ? paymentMethod.id : 'N/A'}`, 'info');
            },
            onValidityChange: (error, field) => {
                validateFormFields();
            }
        }
    });
    window.mpCardFormInstance = cardForm; // Armazena a instância para evitar recriação
    remoteLog('[MP-SDK] Instância do cardForm criada. Pronta para interagir com o formulário.', 'info');
}

// Remove as funções que não pertencem mais a este arquivo (index.html e details.html)
// As funções `renderProducts` e `loadProductDetails` foram movidas para `index-script.js` e `product-script.js` respectivamente.
// A lista `productsForIndexAndDetails` também foi movida.
