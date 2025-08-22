// public/product-script.js
// Removendo a importação do Supabase e as credenciais diretas
// import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
// const SUPABASE_URL = '...';
// const SUPABASE_ANON_KEY = '...';
// const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- FUNÇÃO DE CONSOLE REMOTO ---
(function() {
    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
    };

    function sendRemoteLog(type, args) {
        const isEnabled = localStorage.getItem('showRemoteConsole') === 'true';
        if (!isEnabled) {
            return; // Não envia se o console remoto estiver desabilitado
        }

        let message = args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return '[Object Circular Reference]'; // Lidar com referências circulares
                }
            }
            return String(arg);
        }).join(' ');

        // Limitar o tamanho da mensagem para evitar payloads muito grandes
        if (message.length > 1000) {
            message = message.substring(0, 1000) + '... (truncated)';
        }

        fetch('/api/log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: type,
                message: message,
                timestamp: Date.now(),
                page: window.location.pathname + window.location.search,
                userAgent: navigator.userAgent
            })
        }).catch(err => {
            // Falha silenciosa se não conseguir enviar o log
            // originalConsole.error('Failed to send remote log:', err);
        });
    }

    // Sobrescreve as funções do console
    console.log = function(...args) {
        originalConsole.log.apply(this, args); // Chama o console original primeiro
        sendRemoteLog('log', args);
    };

    console.warn = function(...args) {
        originalConsole.warn.apply(this, args);
        sendRemoteLog('warn', args);
    };

    console.error = function(...args) {
        originalConsole.error.apply(this, args);
        sendRemoteLog('error', args);
    };

    // Você pode adicionar mais overrides para console.info, .debug, etc. se necessário
    console.info = function(...args) {
        originalConsole.info.apply(this, args);
        sendRemoteLog('info', args);
    };

    console.debug = function(...args) {
        originalConsole.debug.apply(this, args);
        sendRemoteLog('debug', args);
    };

    // Log inicial para confirmar que a configuração foi carregada
    console.log('[Remote Console] Remote console initialized.');
    console.log(`[Remote Console] Status: ${localStorage.getItem('showRemoteConsole') === 'true' ? 'ENABLED' : 'DISABLED'}`);

})();
// --- FIM DA FUNÇÃO DE CONSOLE REMOTO ---

// Função para atualizar as meta tags de SEO
function updateSeoTags(product) {
    const head = document.head;
    const siteName = document.querySelector('.site-name')?.textContent || 'Sua Loja Online';
    const title = `${product.name} - ${siteName}`;
    const description = product.short_description || product.description;
    const imageUrl = Array.isArray(product.image_url) && product.image_url.length > 0
        ? product.image_url[0]
        : (typeof product.image_url === 'string' && product.image_url.trim() !== ''
            ? product.image_url
            : '/images/placeholder.png');
    const productUrl = window.location.href;

    // Atualiza a tag <title>
    document.title = title;

    // Cria/atualiza a meta description
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
        metaDescription = document.createElement('meta');
        metaDescription.name = 'description';
        head.appendChild(metaDescription);
    }
    metaDescription.content = description;

    // Cria/atualiza meta tags para Open Graph (Facebook, etc.)
    const updateOrCreateMeta = (property, content) => {
        let meta = document.querySelector(`meta[property="${property}"]`);
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('property', property);
            head.appendChild(meta);
        }
        meta.content = content;
    };

    updateOrCreateMeta('og:title', title);
    updateOrCreateMeta('og:description', description);
    updateOrCreateMeta('og:image', imageUrl);
    updateOrCreateMeta('og:url', productUrl);
    updateOrCreateMeta('og:type', 'product');

    // Cria/atualiza meta tags para Twitter Card
    updateOrCreateMeta('twitter:card', 'summary_large_image');
    updateOrCreateMeta('twitter:title', title);
    updateOrCreateMeta('twitter:description', description);
    updateOrCreateMeta('twitter:image', imageUrl);

    console.log('[SEO] Meta tags atualizadas para o produto:', product.name);
}


document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    let productId = urlParams.get('id');

    if (!productId) {
        const pathSegments = window.location.pathname.split('/');
        const productsIndex = pathSegments.indexOf('products');
        if (productsIndex > -1 && pathSegments.length > productsIndex + 1) {
            productId = pathSegments[productsIndex + 1];
        }
    }

    const loadingMessage = document.getElementById('loading-message');
    const errorMessage = document.getElementById('error-message');
    const productContent = document.getElementById('product-content');

    let currentProductData = null; // Variável global para armazenar os dados do produto

    const imageZoomModal = document.getElementById('image-zoom-modal');
    const zoomedImage = document.getElementById('zoomed-image');
    const closeButton = document.querySelector('.image-zoom-modal .close-button');
    if (imageZoomModal) {
        imageZoomModal.style.display = 'none';
    }

    const productTechnicalSpecificationsContent = document.getElementById('product-technical-specifications-content');

    if (!productId) {
        loadingMessage.style.display = 'none';
        errorMessage.style.display = 'block';
        errorMessage.textContent = 'ID do produto não encontrado na URL. Verifique o link.';
        console.log('[product-script.js] ERRO: ID do produto não encontrado na URL.'); // Log
        return;
    }

    try {
        console.log(`[product-script.js] Buscando detalhes do produto com ID: ${productId}`); // Log
        // Requisição para o backend para buscar o produto principal
        const response = await fetch(`/api/products/${productId}`);
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Produto não encontrado.');
            }
            throw new Error(`Erro ao carregar produto: ${response.statusText}`);
        }

        const product = await response.json();
        if (product.error) {
            loadingMessage.style.display = 'none';
            errorMessage.style.display = 'block';
            errorMessage.textContent = `Erro ao carregar produto: ${product.error}`;
            console.error('[product-script.js] Erro na API ao carregar produto:', product.details || product.error); // Log
            return;
        }

        currentProductData = product;
        console.log(`[product-script.js] Detalhes do produto carregados: ${currentProductData.name}`); // Log

        // --- AQUI VEM A CHAMADA PARA ATUALIZAR AS META TAGS ---
        updateSeoTags(currentProductData);


        loadingMessage.style.display = 'none';
        productContent.style.display = 'flex';

        document.getElementById('product-title-dynamic').textContent = currentProductData.name;
        document.getElementById('product-name').textContent = currentProductData.name;
        document.getElementById('product-short-description').textContent = currentProductData.short_description || currentProductData.description || '';
        document.getElementById('product-price').textContent = `R$ ${currentProductData.price.toFixed(2).replace('.', ',')}`;
        document.getElementById('product-long-description-content').innerHTML = (currentProductData.long_description || currentProductData.description || '').replace(/\n/g, '<br>');

        if (productTechnicalSpecificationsContent) {
            if (currentProductData.technical_specifications && Array.isArray(currentProductData.technical_specifications) && currentProductData.technical_specifications.length > 0) {
                let specsHtml = '<ul>';
                currentProductData.technical_specifications.forEach(spec => {
                    if (spec.titulo && spec.valor) {
                        specsHtml += `<li><strong>${spec.titulo}:</strong> ${spec.valor}</li>`;
                    }
                });
                specsHtml += '</ul>';
                productTechnicalSpecificationsContent.innerHTML = specsHtml;
            } else {
                productTechnicalSpecificationsContent.innerHTML = 'Nenhuma especificação técnica disponível.';
            }
        }

        document.getElementById('product-id').value = currentProductData.id;
        document.getElementById('product-amount').value = currentProductData.price;
        document.getElementById('product-description-hidden').value = currentProductData.name;

        // --- Lógica do Carrossel de Imagens Principal ---
        const imageCarouselMain = document.getElementById('image-carousel-main');
        const imageCarouselThumbnails = document.getElementById('image-carousel-thumbnails');
        const prevButton = document.getElementById('prev-image');
        const nextButton = document.getElementById('next-image');
        let currentImageIndex = 0;
        let images = [];
        let autoAdvanceInterval;

        const showImage = (index) => {
            if (images.length === 0) return;
            images.forEach((img, i) => {
                if (i === index) {
                    img.classList.add('active');
                } else {
                    img.classList.remove('active');
                }
            });
            const thumbnails = imageCarouselThumbnails.querySelectorAll('img');
            thumbnails.forEach((thumb, i) => {
                if (i === index) {
                    thumb.classList.add('active-thumbnail');
                } else {
                    thumb.classList.remove('active-thumbnail');
                }
            });
        };

        const startAutoAdvance = () => {
            clearInterval(autoAdvanceInterval);
            if (images.length > 1) {
                autoAdvanceInterval = setInterval(() => {
                    currentImageIndex = (currentImageIndex + 1) % images.length;
                    showImage(currentImageIndex);
                }, 5000);
            }
        };

        let imageUrls = [];
        if (Array.isArray(currentProductData.image_url)) {
            imageUrls = currentProductData.image_url;
        } else if (typeof currentProductData.image_url === 'string') {
            try {
                const parsed = JSON.parse(currentProductData.image_url);
                if (Array.isArray(parsed)) {
                    imageUrls = parsed;
                } else {
                    imageUrls = [currentProductData.image_url];
                }
            } catch (e) {
                imageUrls = [currentProductData.image_url];
            }
        }
        imageUrls = imageUrls.filter(url => url && url.trim() !== '');

        if (imageCarouselMain) {
            imageCarouselMain.innerHTML = '';
            imageCarouselThumbnails.innerHTML = '';
        }

        if (imageUrls.length > 0) {
            imageUrls.forEach((imgUrl, index) => {
                const imgElement = document.createElement('img');
                imgElement.src = imgUrl;
                imgElement.alt = `${currentProductData.name} - Imagem ${index + 1}`;
                imgElement.loading = 'lazy'; // Lazy loading adicionado aqui
                imageCarouselMain.appendChild(imgElement);

                imgElement.addEventListener('click', () => {
                    zoomedImage.src = imgUrl;
                    imageZoomModal.style.display = 'flex';
                });

                const thumbnailElement = document.createElement('img');
                thumbnailElement.src = imgUrl;
                thumbnailElement.alt = `Miniatura ${index + 1}`;
                thumbnailElement.loading = 'lazy'; // Lazy loading adicionado aqui
                thumbnailElement.addEventListener('click', () => {
                    clearInterval(autoAdvanceInterval);
                    currentImageIndex = index;
                    showImage(currentImageIndex);
                    startAutoAdvance();
                });
                imageCarouselThumbnails.appendChild(thumbnailElement);
            });
            images = imageCarouselMain.querySelectorAll('img');
            if (images.length > 0) {
                currentImageIndex = 0;
                showImage(currentImageIndex);
                prevButton.style.display = images.length > 1 ? 'block' : 'none';
                nextButton.style.display = images.length > 1 ? 'block' : 'none';
                startAutoAdvance();
                prevButton.addEventListener('click', () => {
                    clearInterval(autoAdvanceInterval);
                    currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
                    showImage(currentImageIndex);
                    startAutoAdvance();
                });
                nextButton.addEventListener('click', () => {
                    clearInterval(autoAdvanceInterval);
                    currentImageIndex = (currentImageIndex + 1) % images.length;
                    showImage(currentImageIndex);
                    startAutoAdvance();
                });
            } else {
                prevButton.style.display = 'none';
                nextButton.style.display = 'none';
            }
        } else {
            const imgElement = document.createElement('img');
            imgElement.src = '/images/placeholder.png';
            imgElement.alt = 'Sem Imagem';
            imgElement.loading = 'lazy'; // Lazy loading adicionado aqui
            imageCarouselMain.appendChild(imgElement);
            imgElement.classList.add('active');
            prevButton.style.display = 'none';
            nextButton.style.display = 'none';
            imgElement.addEventListener('click', () => {
                zoomedImage.src = imgElement.src;
                imageZoomModal.style.display = 'flex';
            });
        }
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                imageZoomModal.style.display = 'none';
            });
        }

        if (imageZoomModal) {
            imageZoomModal.addEventListener('click', (event) => {
                if (event.target === imageZoomModal) {
                    imageZoomModal.style.display = 'none';
                }
            });
        }
        // Lógica de Seleção de Tamanho (COM RADIO BUTTONS)
        const productOptionsContainer = document.getElementById('product-options-container');
        const sizeOptionsGrid = document.getElementById('size-options-grid');
        const selectedSizeHiddenInput = document.getElementById('selected-size-hidden');
        let selectedSize = null;
        let availableSizesArray = [];
        if (typeof currentProductData.available_sizes === 'string' && currentProductData.available_sizes.length > 0) {
            availableSizesArray = currentProductData.available_sizes.split(',').map(size => size.trim());
        } else if (Array.isArray(currentProductData.available_sizes)) {
            availableSizesArray = currentProductData.available_sizes;
        }
        availableSizesArray = availableSizesArray.filter(size => size && size.trim() !== '');

        if (availableSizesArray.length > 0) {
            productOptionsContainer.style.display = 'block';

            sizeOptionsGrid.innerHTML = '';
            availableSizesArray.forEach((size, index) => {
                const sizeOptionDiv = document.createElement('div');
                sizeOptionDiv.classList.add('size-option');

                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = 'product_size_option';
                radio.id = `size-${size.replace(/\s+/g, '-')}`;
                radio.value = size;
                if (index === 0) {
                    radio.checked = true;
                    selectedSize = size;
                }
                const label = document.createElement('label');
                label.htmlFor = `size-${size.replace(/\s+/g, '-')}`;
                label.textContent = size;
                sizeOptionDiv.appendChild(radio);
                sizeOptionDiv.appendChild(label);
                sizeOptionsGrid.appendChild(sizeOptionDiv);
            });
            sizeOptionsGrid.addEventListener('change', (event) => {
                if (event.target.type === 'radio' && event.target.name === 'product_size_option') {
                    selectedSize = event.target.value;
                }
            });
        } else {
            productOptionsContainer.style.display = 'none';
            selectedSize = null;
        }
        // Adição da lógica para os ícones de segurança na página do produto
        const securityBadgesContainer = document.querySelector('.security-badges .badges-grid');
        if (securityBadgesContainer) {
            securityBadgesContainer.innerHTML = '';
            const badges = [
                { src: '/images/escudo.png', text: 'Compra Segura' },
                { src: '/images/entregador.png', text: 'Envio Rápido' },
                { src: '/images/parceria.png', text: 'Satisfação Garantida' },
                { src: '/images/atendimento.png', text: 'Atendimento 24h' }
            ];
            badges.forEach(badge => {
                const badgeItem = document.createElement('div');
                badgeItem.classList.add('badge-item');
                const img = document.createElement('img');
                img.src = badge.src;
                img.alt = badge.text;
                img.loading = 'lazy'; // Lazy loading adicionado aqui
                const span = document.createElement('span');
                span.textContent = badge.text;
                badgeItem.appendChild(img);
                badgeItem.appendChild(span);
                securityBadgesContainer.appendChild(badgeItem);
            });
        }

        // --- Lógica para o Botão "Comprar Agora" ---
        const checkoutForm = document.getElementById('checkout-form');
        if (checkoutForm) {
            checkoutForm.addEventListener('submit', (event) => {
                event.preventDefault();
                console.log('[product-script.js] Botão "Comprar Agora" clicado.');
                if (productOptionsContainer.style.display === 'block' && !selectedSize) {
                    alert('Por favor, selecione um tamanho antes de comprar.');
                    return;
                }
                if (!currentProductData) {
                    alert('Erro: Dados do produto não carregados para adicionar ao carrinho.');
                    console.error('[product-script.js] Dados do produto ausentes para "Comprar Agora".'); // Log
                    return;
                }
                const productForCart = {
                    id: currentProductData.id,
                    product_code: currentProductData.product_code || '',
                    name: currentProductData.name,
                    price: currentProductData.price,
                    image_url: imageUrls.length > 0 ? imageUrls[0] : '/images/placeholder.png',
                    selected_size: selectedSize || null,
                    selected_color: null
                };

                if (typeof addToCart === 'function') {
                    addToCart(productForCart);
                    console.log(`[product-script.js] Produto '${productForCart.name}' adicionado ao carrinho via "Comprar Agora".`); // Log
                    window.location.href = '/checkout.html';
                } else {
                    alert('Erro: Função de adicionar ao carrinho não disponível. Não foi possível comprar agora.');
                    console.error('[product-script.js] Função addToCart não encontrada. Verifique a ordem dos scripts.'); // Log
                }
            });
        }
        // --- Lógica para o Botão "Adicionar ao Carrinho" ---
        const addToCartButton = document.getElementById('add-to-cart-button');
        if (addToCartButton) {
            addToCartButton.addEventListener('click', () => {
                if (productOptionsContainer.style.display === 'block' && !selectedSize) {
                    alert('Por favor, selecione um tamanho antes de adicionar ao carrinho.');
                    return;
                }
                if (!currentProductData) {
                    alert('Erro: Dados do produto não carregados para adicionar ao carrinho.');
                    return;
                }
                const productForCart = {
                    id: currentProductData.id,
                    product_code: currentProductData.product_code || '',
                    name: currentProductData.name,
                    price: currentProductData.price,
                    image_url: imageUrls.length > 0 ? imageUrls[0] : '/images/placeholder.png',
                    selected_size: selectedSize || null,
                    selected_color: null
                };

                if (typeof addToCart === 'function') {
                    addToCart(productForCart);
                    console.log(`[product-script.js] Produto '${productForCart.name}' adicionado ao carrinho.`); // Log
                } else {
                    alert('Erro: A função de adicionar ao carrinho não está disponível.');
                    console.error('[product-script.js] Função addToCart não encontrada. Verifique a ordem dos scripts.'); // Log
                }
            });
        }

        // --- Funções do Carrossel de Produtos Relacionados ---
        const relatedProductsCarousel = document.getElementById('related-products-carousel');
        const relatedPrevButton = document.getElementById('related-prev-button');
        const relatedNextButton = document.getElementById('related-next-button');
        const relatedProductsPerView = 3; // Definido para 3 produtos por vez
        const relatedSlideIntervalTime = 10000; // 10 segundos
        let relatedCarouselInterval;
        let currentRelatedIndex = 0;
        let totalRelatedProducts = 0;
        let allRelatedProductsData = []; // Armazenará todos os produtos relacionados para repetição

        const updateRelatedCarousel = () => {
            if (allRelatedProductsData.length === 0 || !relatedProductsCarousel.children[0]) {
                document.querySelector('.related-products').style.display = 'none';
                return;
            }
            document.querySelector('.related-products').style.display = 'block';

            // Calcula o número total de "slides" com base nos produtos *visíveis*.
            const totalSlides = Math.ceil(allRelatedProductsData.length / relatedProductsPerView);

            currentRelatedIndex = currentRelatedIndex % totalSlides;
            if (currentRelatedIndex < 0) { // Lida com casos de navegação para trás no loop
                currentRelatedIndex = totalSlides + currentRelatedIndex;
            }

            const offset = -currentRelatedIndex * 100; // Isso vai mover o carrossel em porcentagem
            relatedProductsCarousel.style.transform = `translateX(${offset}%)`;
        };

        const startRelatedCarouselAutoAdvance = () => {
            clearInterval(relatedCarouselInterval);
            if (allRelatedProductsData.length > relatedProductsPerView) {
                relatedCarouselInterval = setInterval(() => {
                    currentRelatedIndex = (currentRelatedIndex + 1);
                    const totalSlides = Math.ceil(allRelatedProductsData.length / relatedProductsPerView);
                    if (currentRelatedIndex >= totalSlides) {
                        currentRelatedIndex = 0; // Volta para o primeiro slide
                    }
                    updateRelatedCarousel();
                }, relatedSlideIntervalTime);
            }
        };

        // Adiciona event listeners para os botões de navegação
        if (relatedPrevButton && relatedNextButton) {
            relatedPrevButton.addEventListener('click', () => {
                clearInterval(relatedCarouselInterval); // Para o auto-avanço ao interagir
                const totalSlides = Math.ceil(allRelatedProductsData.length / relatedProductsPerView);
                currentRelatedIndex = (currentRelatedIndex - 1 + totalSlides) % totalSlides; // Garante loop para trás
                updateRelatedCarousel();
                startRelatedCarouselAutoAdvance(); // Reinicia o auto-avanço
            });

            relatedNextButton.addEventListener('click', () => {
                clearInterval(relatedCarouselInterval); // Para o auto-avanço ao interagir
                const totalSlides = Math.ceil(allRelatedProductsData.length / relatedProductsPerView);
                currentRelatedIndex = (currentRelatedIndex + 1) % totalSlides; // Garante loop para frente
                updateRelatedCarousel();
                startRelatedCarouselAutoAdvance(); // Reinicia o auto-avanço
            });
        }

        // FUNÇÃO DE BUSCA PARA PRODUTOS RELACIONADOS
        const fetchRelatedProducts = async () => {
            try {
                const response = await fetch(`/api/products?excludeId=${currentProductData.id}&limit=10`);
                if (!response.ok) {
                    throw new Error('Erro ao carregar produtos relacionados.');
                }

                const data = await response.json();
                let fetchedProducts = Array.isArray(data) ? data : data.products || [];

                if (!Array.isArray(fetchedProducts)) {
                    console.error('[product-script.js] DEBUG ERRO: fetchedProducts não é um array após processamento.', fetchedProducts);
                    throw new Error('Formato inesperado da resposta da API de produtos relacionados.');
                }

                // Filtrar apenas se houver um productData e category
                let filteredProducts = fetchedProducts;
                if (currentProductData && currentProductData.category) {
                    filteredProducts = fetchedProducts.filter(p =>
                        p.category === currentProductData.category && p.id !== currentProductData.id
                    );
                } else {
                    // Se não há categoria no produto atual, apenas exclui o próprio produto
                    filteredProducts = fetchedProducts.filter(p => p.id !== currentProductData.id);
                }

                // Lógica para garantir que tenhamos produtos suficientes para exibir o carrossel.
                // Se o número de produtos relacionados é menor que `relatedProductsPerView` ou não o suficiente para um loop,
                // podemos preencher com mais produtos aleatórios ou repetir os existentes.
                if (filteredProducts.length < relatedProductsPerView * 2 && fetchedProducts.length > filteredProducts.length) {
                    // Adiciona produtos aleatórios de outras categorias se os relacionados são poucos
                    const additionalProducts = fetchedProducts.filter(p =>
                        !filteredProducts.some(fp => fp.id === p.id) && p.id !== currentProductData.id
                    );
                    // Embaralha e adiciona até ter um número razoável para o carrossel
                    additionalProducts.sort(() => 0.5 - Math.random());
                    for (let i = 0; filteredProducts.length < relatedProductsPerView * 2 && i < additionalProducts.length; i++) {
                        filteredProducts.push(additionalProducts[i]);
                    }
                }
                // Embaralha os produtos resultantes para que a ordem mude
                filteredProducts.sort(() => 0.5 - Math.random());

                // Se ainda tivermos menos que 3 produtos, podemos duplicá-los para preencher o carrossel.
                // Isso garante que sempre haja algo para o carrossel rodar, mesmo que os produtos sejam repetidos.
                while (filteredProducts.length < relatedProductsPerView * 2 && filteredProducts.length > 0) {
                    filteredProducts = filteredProducts.concat(filteredProducts); // Duplica os existentes
                }

                // Limita para um número máximo razoável, se duplicarmos muito
                allRelatedProductsData = filteredProducts.slice(0, 20); // Limita a 20 produtos para evitar carrossel gigante
                totalRelatedProducts = allRelatedProductsData.length;

                if (totalRelatedProducts === 0) {
                    document.querySelector('.related-products').style.display = 'none';
                    return;
                }
                document.querySelector('.related-products').style.display = 'block';

                relatedProductsCarousel.innerHTML = '';

                allRelatedProductsData.forEach(product => {
                    const productCard = document.createElement('div');
                    productCard.classList.add('suggested-product-card');
                    // IMPORTANTE: O .product-link agora está dentro do .suggested-product-card
                    // e o .suggested-product-card é o item flex.
                    // O link deve envolver tudo para que o clique em qualquer parte do card leve à página do produto.
                    let relatedImageUrl = Array.isArray(product.image_url) && product.image_url.length > 0
                        ? product.image_url[0]
                        : (typeof product.image_url === 'string' && product.image_url.trim() !== ''
                            ? product.image_url
                            : '/images/placeholder.png');

                    // NOVO HTML PARA O CARD: `a.product-link` ENVOLVE TODO O CONTEÚDO DO CARD
                    productCard.innerHTML = `
                        <a href="/products/${product.id}" class="product-link">
                            <img src="${relatedImageUrl}" alt="${product.name}" loading="lazy">
                            <div class="overlay">
                                <h4>${product.name}</h4>
                                <button class="buy-button">Ver Detalhes</button>
                            </div>
                        </a>
                    `;
                    relatedProductsCarousel.appendChild(productCard);
                });
                updateRelatedCarousel();
                startRelatedCarouselAutoAdvance();
            } catch (error) {
                console.error('[product-script.js] Erro ao carregar produtos relacionados do backend:', error.message);
                document.querySelector('.related-products').style.display = 'none';
            }
        };

        // Chame a função de carregamento do carrossel RELACIONADO
        fetchRelatedProducts();
    } catch (error) {
        loadingMessage.style.display = 'none';
        productContent.style.display = 'none';
        errorMessage.style.display = 'block';
        errorMessage.textContent = `Erro: ${error.message}. Não foi possível carregar os detalhes do produto.`;
        console.error('[product-script.js] Erro fatal ao buscar detalhes do produto ou inicializar:', error); // Log
    }
});
