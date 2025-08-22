document.addEventListener('DOMContentLoaded', () => {
    // Referências aos elementos do HTML
    const step5Form = document.getElementById('step5Form');
    const prevStepButton = document.getElementById('prevStepButton');
    const productDataSummaryDiv = document.getElementById('productDataSummary');
    const statusMessageDiv = document.getElementById('statusMessage');

    // Função para exibir mensagens de status
    function showStatusMessage(message, type) {
        statusMessageDiv.textContent = message;
        statusMessageDiv.className = '';
        statusMessageDiv.classList.add(type);
        statusMessageDiv.style.display = 'block';
    }

    // Função para exibir o resumo dos dados do produto
    function displaySummary(productData) {
        let htmlContent = '<h4>Dados do Produto</h4>';
        htmlContent += `<p><strong>Código:</strong> ${productData.product_code || 'N/A'}</p>`;
        htmlContent += `<p><strong>Nome:</strong> ${productData.name || 'N/A'}</p>`;
        htmlContent += `<p><strong>Preço Final:</strong> ${parseFloat(productData.final_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>`;
        htmlContent += `<p><strong>Valor de Compra:</strong> ${parseFloat(productData.cost_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>`;
        htmlContent += `<p><strong>Margem de Lucro:</strong> ${productData.profit_margin || 'N/A'}%</p>`;
        htmlContent += `<p><strong>Regime Tributário:</strong> ${productData.product_type || 'N/A'}</p>`;
        htmlContent += `<p><strong>Descrição:</strong></p><p>${productData.description || 'N/A'}</p>`;
        htmlContent += `<p><strong>Descrição Longa:</strong></p><p>${productData.long_description || 'N/A'}</p>`;

        if (productData.technical_specifications && productData.technical_specifications.length > 0) {
            htmlContent += `<h4>Especificações Técnicas:</h4><ul>`;
            productData.technical_specifications.forEach(spec => {
                htmlContent += `<li><strong>${spec.titulo}:</strong> ${spec.valor}</li>`;
            });
            htmlContent += `</ul>`;
        } else {
             htmlContent += `<p><strong>Especificações Técnicas:</strong> Nenhuma</p>`;
        }

        if (productData.product_sizes && productData.product_sizes.length > 0) {
            htmlContent += `<h4>Tamanhos:</h4><ul>`;
            productData.product_sizes.forEach(size => {
                htmlContent += `<li>${size}</li>`;
            });
            htmlContent += `</ul>`;
        } else {
            htmlContent += `<p><strong>Tamanhos:</strong> Nenhum</p>`;
        }
        
        if (productData.product_colors && productData.product_colors.length > 0) {
            htmlContent += `<h4>Cores:</h4><ul>`;
            productData.product_colors.forEach(color => {
                htmlContent += `<li><span style="display: inline-block; width: 15px; height: 15px; border-radius: 50%; background-color:${color}; border: 1px solid #ccc; margin-right: 5px;"></span>${color}</li>`;
            });
            htmlContent += `</ul>`;
        } else {
            htmlContent += `<p><strong>Cores:</strong> Nenhuma</p>`;
        }
        
        if (productData.images && productData.images.length > 0) {
            htmlContent += `<h4>Imagens:</h4><div class="image-preview-container">`;
            productData.images.forEach(image => {
                htmlContent += `<div class="image-preview-item"><img src="${image}" alt="Imagem do Produto"></div>`;
            });
            htmlContent += `</div>`;
        } else {
            htmlContent += `<p><strong>Imagens:</strong> Nenhuma</p>`;
        }
        
        productDataSummaryDiv.innerHTML = htmlContent;
    }

    // Carrega os dados do sessionStorage ao carregar a página
    const productData = JSON.parse(sessionStorage.getItem('newProductData'));
    if (!productData || !productData.product_code) {
        showStatusMessage('Dados do produto não encontrados. Redirecionando para a Etapa 1.', 'error');
        setTimeout(() => {
            window.location.href = './step1.html';
        }, 2000);
    } else {
        displaySummary(productData);
    }

    // Event listener para o botão "Anterior"
    prevStepButton.addEventListener('click', () => {
        window.location.href = './step4.html';
    });

    // Event listener para o formulário de submissão
    step5Form.addEventListener('submit', async function(event) {
        event.preventDefault();
        
        // Desativa os botões para evitar cliques múltiplos
        document.getElementById('completeRegistrationButton').disabled = true;
        document.getElementById('prevStepButton').disabled = true;

        showStatusMessage('Iniciando cadastro do produto...', 'info');

        const formData = new FormData();
        formData.append('product_code', productData.product_code);
        formData.append('name', productData.name);
        formData.append('description', productData.description);
        formData.append('long_description', productData.long_description);
        formData.append('technical_specifications', JSON.stringify(productData.technical_specifications));
        formData.append('price', productData.final_price);
        formData.append('cost_price', productData.cost_price);
        formData.append('size_type', productData.size_type);
        formData.append('available_sizes', JSON.stringify(productData.product_sizes));
        formData.append('colors', JSON.stringify(productData.product_colors));
        
        // Adiciona os arquivos de imagem ao FormData
        for (const url of productData.images) {
            const response = await fetch(url);
            const blob = await response.blob();
            const file = new File([blob], `${productData.product_code}_${Date.now()}.jpg`, { type: blob.type });
            formData.append('images', file);
        }

        try {
            const response = await fetch('/admin/products', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();

            if (response.ok) {
                showStatusMessage('Produto cadastrado com sucesso!', 'success');
                sessionStorage.removeItem('newProductData');
                setTimeout(() => {
                    // Redireciona para a página de login
                    window.location.replace('/admin-login.html');
                }, 3000);
            } else {
                console.error('Erro ao salvar o produto:', result);
                showStatusMessage(`Erro ao salvar: ${result.message || 'Ocorreu um erro.'}`, 'error');
            }
        } catch (error) {
            console.error('Erro de rede ou servidor ao cadastrar produto:', error);
            showStatusMessage('Erro de rede ou servidor ao cadastrar produto.', 'error');
        }

        document.getElementById('completeRegistrationButton').disabled = false;
        document.getElementById('prevStepButton').disabled = false;
    });
});
