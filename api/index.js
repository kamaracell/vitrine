require('dotenv').config();
const express = require('express');
const path = require('path');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const fs = require('fs');
const app = express();

// Configuração do Mercado Pago
const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
if (!accessToken) {
    console.error('ERRO CRÍTICO: MERCADO_PAGO_ACCESS_TOKEN não está definido no arquivo .env!');
}
const client = new MercadoPagoConfig({ accessToken: accessToken, options: { timeout: 10000 } });

// Inicializa o cliente Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('ERRO CRÍTICO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não estão definidos no arquivo .env!');
}

// ADIÇÃO CRÍTICA: Configuração do cliente Supabase para usar IPv4
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        persistSession: false
    },
    global: {
        // Força o fetch a usar IPv4, o que é necessário para algumas configurações do Termux
        fetch: (url, options) => fetch(url, { ...options, family: 4 })
    }
});

console.log('--- Configuração Inicial do Servidor ---');
console.log('Chave Supabase lida (últimos 5 caracteres):', supabaseServiceRoleKey ? supabaseServiceRoleKey.slice(-5) : 'N/A');
console.log('Token MP lido (últimos 5 caracteres):', accessToken ? accessToken.slice(-5) : 'N/A');
console.log('APP_BASE_URL lido:', process.env.APP_BASE_URL || 'NÃO DEFINIDO');
console.log('-----------------------------------------');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

const uploadProduct = multer({ storage: multer.memoryStorage() }).array('images', 5);
const imagesDir = path.join(__dirname, '../public', 'images');
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
    console.log(`Diretório ${imagesDir} criado.`);
}
// NOVO: A configuração do multer agora salva o arquivo temporariamente com um nome aleatório.
const storageLayoutImages = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, imagesDir); },
    filename: (req, file, cb) => {
        const originalExtension = path.extname(file.originalname);
        const fileName = file.fieldname + '-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + originalExtension;
        cb(null, fileName);
    }
});
const uploadLayoutImage = multer({ storage: storageLayoutImages });

// --- ROTAS DA LOJA E ADMIN ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public', 'index.html')));
app.get('/admin/products', (req, res) => res.sendFile(path.join(__dirname, '../public', 'admin-product.html')));

app.post('/admin/products', uploadProduct, async (req, res) => {
    // ATENÇÃO AQUI: Adicionando long_description e technical_specifications ao destructuring do req.body
    const { id, product_code, name, description, long_description, price, cost_price, size_type, available_sizes, colors, technical_specifications } = req.body;
    const imageFiles = req.files;
    console.log('Admin Product Data:', { product_code, name, price, long_description, technical_specifications });

    if (!product_code || !name || !description || !price) {
        return res.status(400).send('Código do Produto, Nome, descrição e preço são obrigatórios.');
    }
    let sizesArray = available_sizes ? JSON.parse(available_sizes) : []; // Já vem como JSON string do frontend
    let colorsArray = colors ? JSON.parse(colors) : []; // Já vem como JSON string do frontend
    let technicalSpecsArray = technical_specifications ? JSON.parse(technical_specifications) : []; // NOVO: Parsear JSON
    let imageUrls = [];
    // Tratamento de imagens: se novas imagens são enviadas, elas substituem as existentes.
    // Se não há novas imagens, e existem 'existing_image_urls', estas são mantidas.
    if (imageFiles && imageFiles.length > 0) {
        const bucketName = 'product-images';
        for (const imageFile of imageFiles) {
            const fileName = `public/${Date.now()}_${imageFile.originalname}`;
            try {
                const { data, error } = await supabase.storage.from(bucketName).upload(fileName, imageFile.buffer, { contentType: imageFile.mimetype, upsert: false });
                if (error) { throw error; }
                const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);

                imageUrls.push(publicUrlData.publicUrl);
            } catch (uploadError) {
                console.error('Erro ao fazer upload da imagem para o Supabase Storage:', uploadError);
                return res.status(500).send(`Erro ao fazer upload da imagem: ${imageFile.originalname}.`);
            }
        }
    } else {
        // Se nenhuma nova imagem foi enviada, manter as imagens existentes (se houver)
        if (req.body.existing_image_urls) {
            imageUrls = JSON.parse(req.body.existing_image_urls);
        }
    }
    try {
        const upsertData = {
            product_code: product_code,
            name,
            description,
            long_description: long_description || null, // NOVO: Incluir descrição longa
            technical_specifications: technicalSpecsArray.length > 0 ? technicalSpecsArray : null, // NOVO: Incluir especificações técnicas
            cost_price: cost_price ? parseFloat(cost_price) : null, // NOVO: Incluir o custo do produto
            price: parseFloat(price),
            size_type: size_type || 'none',
            available_sizes: sizesArray.length > 0 ? sizesArray : null,
            colors: colorsArray.length > 0 ? colorsArray : null,
            updated_at: new Date().toISOString(),
            ...(imageUrls.length > 0 && { image_url: imageUrls })
        };
        const { data, error } = await supabase.from('products').upsert(upsertData, { onConflict: 'product_code', ignoreDuplicates: false }).select();
        if (error) { throw error; }
        res.status(200).json({ message: 'Produto cadastrado/atualizado com sucesso!', product: data[0] });

    } catch (dbError) {
        console.error('Erro ao salvar produto no banco de dados:', dbError);
        res.status(500).send(`Erro interno do servidor ao cadastrar/atualizar produto: ${dbError.message || 'Erro desconhecido'}`);
    }
});

app.get('/api/products', async (req, res) => {
    console.log(`GET /api/products para listagem completa.`);
    try {
        const { data: products, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
        if (error) { throw error; }
        const formattedProducts = products.map(p => ({
            ...p,
            image_url: Array.isArray(p.image_url) ? p.image_url : (p.image_url ? JSON.parse(p.image_url) : []),
            available_sizes: Array.isArray(p.available_sizes) ? p.available_sizes : (p.available_sizes ? JSON.parse(p.available_sizes) : []),
            colors: Array.isArray(p.colors) ? p.colors : (p.colors ? JSON.parse(p.colors) : []),
            technical_specifications: Array.isArray(p.technical_specifications) ? p.technical_specifications : (p.technical_specifications ? JSON.parse(p.technical_specifications) : [])
        }));
        res.json({ products: formattedProducts });
    } catch (error) {
        console.error('Erro ao buscar todos os produtos:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar produtos.', details: error.message });
    }
});

app.get('/api/products-admin', async (req, res) => {
    const { limit = 10, offset = 0, product_code, search, excludeId } = req.query;
    console.log(`GET /api/products-admin: limit=${limit}, offset=${offset}, code=${product_code || 'N/A'}, search=${search || 'N/A'}, excludeId=${excludeId || 'N/A'}`);
    try {
        let query = supabase.from('products').select('*', { count: 'exact' });
        if (product_code) { query = query.eq('product_code', product_code); }
        if (search) { query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`); }
        if (excludeId) {
            console.log(`[Backend API] Aplicando filtro excludeId: ${excludeId}`);
            query = query.neq('id', excludeId);
        }
        const { count, error: countError } = await query.range(0, 0);
        if (countError) { console.error('Erro ao contar produtos:', countError); }
        const { data: products, error: productsError } = await query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
        if (productsError) { throw productsError; }
        const formattedProducts = products.map(p => ({
            ...p,
            image_url: Array.isArray(p.image_url) ? p.image_url : (p.image_url ? JSON.parse(p.image_url) : []),
            available_sizes: Array.isArray(p.available_sizes) ? p.available_sizes : (p.available_sizes ? JSON.parse(p.available_sizes) : []),
            colors: Array.isArray(p.colors) ? p.colors : (p.colors ? JSON.parse(p.colors) : []),
            technical_specifications: Array.isArray(p.technical_specifications) ? p.technical_specifications : (p.technical_specifications ? JSON.parse(p.technical_specifications) : [])
        }));
        console.log(`[Backend API] Produtos retornados: ${formattedProducts.length} (total no banco: ${count || 0})`);
        res.json({ products: formattedProducts, totalCount: count || 0, hasMore: (offset + limit) < (count || 0) });
    } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar produtos.', details: error.message });
    }
});

// Rota para buscar os pedidos com os itens e informações do produto
app.get('/api/orders', async (req, res) => {
    console.log(`GET /api/orders para painel de visão geral.`);
    try {
        // CORREÇÃO: Incluindo 'description' na consulta
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    id, quantity, selected_size, unit_price,
                    products (
                        product_code, id, image_url, name, colors, description
                    )
                )
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Erro ao buscar pedidos no Supabase (Service Role Key):', error.message);
            return res.status(500).json({ error: 'Erro interno do servidor ao buscar pedidos.', details: error.message });
        }

        // Formata os dados para o frontend
        const formattedOrders = orders.map(order => ({
            ...order,
            order_items: order.order_items.map(item => ({
                product_id: item.products.id,
                product_name: item.products.name,
                product_code: item.products.product_code,
                product_description: item.products.description, // NOVO: Incluindo a descrição
                image_url: Array.isArray(item.products.image_url) ? item.products.image_url[0] : null,
                selected_size: item.selected_size,
                selected_color: item.products.colors, // Pega o array de cores da tabela 'products'
                quantity: item.quantity,
                unit_price: item.unit_price,
            }))
        }));

        console.log(`[Backend API] Pedidos retornados: ${formattedOrders.length}`);
        res.status(200).json({ orders: formattedOrders });
    } catch (error) {
        console.error('Erro inesperado ao buscar pedidos:', error);
        res.status(500).json({ error: 'Erro interno do servidor.', details: error.message });
    }
});

// NOVO: Endpoint para atualizar o status do pedido
app.post('/api/orders/update-status', async (req, res) => {
    const { orderId, newStatus } = req.body;
    console.log(`Recebida requisição para atualizar pedido ${orderId} para status: ${newStatus}`);

    if (!orderId || !newStatus) {
        return res.status(400).json({ error: 'ID do pedido e novo status são obrigatórios.' });
    }

    try {
        const { data, error } = await supabase
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId)
            .select();

        if (error) {
            console.error('Erro Supabase (atualizar status):', error);
            return res.status(500).json({ error: 'Falha ao atualizar o status do pedido no banco de dados.', details: error.message });
        }

        if (data.length === 0) {
            return res.status(404).json({ error: 'Pedido não encontrado.' });
        }

        res.status(200).json({ success: true, message: `Status do pedido ${orderId} atualizado para ${newStatus}.`, order: data[0] });

    } catch (error) {
        console.error('Erro inesperado ao atualizar status do pedido:', error);
        res.status(500).json({ error: 'Erro interno do servidor.', details: error.message });
    }
});

// Endpoint para buscar e filtrar pedidos concluídos
app.get('/api/delivered-orders', async (req, res) => {
    const { q } = req.query;
    console.log(`GET /api/delivered-orders com query: "${q || 'nenhuma'}"`);

    try {
        // Busca todos os pedidos concluídos sem a filtragem de texto do Supabase
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    *,
                    products (*)
                )
            `)
            .eq('status', 'delivered')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Erro ao buscar pedidos concluídos:', error.message);
            return res.status(500).json({ error: 'Erro interno do servidor ao buscar pedidos.', details: error.message });
        }

        // Função auxiliar para normalizar strings (remover acentos, pontuação, etc.)
        const normalizeString = (str) => {
            if (!str) return '';
            return str.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, '');
        };
        
        // Se houver um termo de busca, faz a filtragem no próprio servidor para maior flexibilidade
        const filteredOrders = q ? orders.filter(order => {
            const normalizedQuery = normalizeString(q);
            
            // Constrói uma única string de pesquisa com todos os campos relevantes
            const searchableText = [
                normalizeString(order.customer_name),
                normalizeString(order.customer_phone),
                normalizeString(order.shipping_address),
                normalizeString(order.shipping_number),
                normalizeString(order.shipping_complement),
                normalizeString(order.shipping_neighborhood),
                normalizeString(order.shipping_city),
                normalizeString(order.shipping_state),
                normalizeString(order.shipping_zip_code),
                normalizeString(order.order_code),
                // Adiciona os campos de cada item do pedido
                ...order.order_items.flatMap(item => [
                    normalizeString(item.products.name),
                    normalizeString(item.products.product_code),
                ])
            ].join(' ');

            return searchableText.includes(normalizedQuery);
        }) : orders;
        
        // Formata os dados para o frontend
        const formattedOrders = filteredOrders.map(order => ({
            ...order,
            order_items: order.order_items.map(item => ({
                ...item,
                product_name: item.products.name,
                product_code: item.products.product_code,
                image_url: Array.isArray(item.products.image_url) ? item.products.image_url[0] : null,
                selected_color: item.products.colors
            }))
        }));

        console.log(`[Backend API] ${formattedOrders.length} pedidos concluídos encontrados.`);
        res.status(200).json(formattedOrders);
    } catch (error) {
        console.error('Erro inesperado ao buscar pedidos concluídos:', error);
        res.status(500).json({ error: 'Erro interno do servidor.', details: error.message });
    }
});

app.get('/api/products/:id', async (req, res) => {
    const productId = req.params.id;
    console.log(`GET /api/products/:id -> ID: ${productId}`);
    try {
        const { data: product, error } = await supabase.from('products').select('*').eq('id', productId).single();
        if (error) {
            console.error(`Erro ao buscar produto ${productId}:`, error);
            return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: 'Produto não encontrado ou falha na busca.', details: error.message });
        }
        if (!product) { return res.status(404).json({ error: 'Produto não encontrado.' }); }
        const formattedProduct = {
            ...product,
            image_url: Array.isArray(product.image_url) ? product.image_url : (product.image_url ? JSON.parse(product.image_url) : []),
            available_sizes: Array.isArray(product.available_sizes) ? product.available_sizes : (product.available_sizes ? JSON.parse(product.available_sizes) : []),
            colors: Array.isArray(product.colors) ? product.colors : (p.colors ? JSON.parse(p.colors) : []),
            technical_specifications: Array.isArray(product.technical_specifications) ? product.technical_specifications : (product.technical_specifications ? JSON.parse(product.technical_specifications) : [])
        };
        res.json(formattedProduct);
    } catch (error) {
        console.error('Erro inesperado ao buscar detalhes do produto:', error);
        res.status(500).json({ error: 'Erro interno do servidor.', details: error.message });
    }
});

app.get('/products/:id', (req, res) => res.sendFile(path.join(__dirname, '../public', 'product.html')));

app.get('/admin/layout', (req, res) => res.sendFile(path.join(__dirname, '../public', 'admin-layout.html')));

// A LÓGICA DE RENOMEAR FOI MOVIDA PARA A ROTA!
app.post('/api/admin/upload-image', uploadLayoutImage.single('image'), (req, res) => {
    if (!req.file) { return res.status(400).json({ success: false, message: 'Nenhum arquivo de imagem de layout enviado.' }); }

    const originalFileName = req.file.filename;
    const customFileName = req.body.customFileName;

    console.log(`[NOVA LÓGICA] Upload recebido. Nome temporário: "${originalFileName}". Nome customizado recebido: "${customFileName}"`);

    // Verifica se um nome customizado válido foi fornecido
    if (customFileName && customFileName.trim() !== '') {
        const originalExtension = path.extname(originalFileName);
        const newFileName = customFileName.replace(/[^a-zA-Z0-9\-\_.]/g, '_') + originalExtension;
        const oldPath = path.join(imagesDir, originalFileName);
        const newPath = path.join(imagesDir, newFileName);

        fs.rename(oldPath, newPath, (err) => {
            if (err) {
                console.error('Erro ao renomear arquivo:', err);
                return res.status(500).json({ success: false, message: `Erro ao renomear a imagem para ${newFileName}.` });
            }
            console.log(`[NOVA LÓGICA] Arquivo "${originalFileName}" renomeado para "${newFileName}".`);
            const imageUrl = `/images/${newFileName}`;
            res.json({ success: true, message: 'Imagem de layout enviada e renomeada com sucesso!', imageUrl: imageUrl, fileName: newFileName });
        });
    } else {
        // Se não houver nome customizado, retorna o nome original (aleatório)
        console.log(`[NOVA LÓGICA] Nenhum nome customizado fornecido. Mantendo nome: "${originalFileName}".`);
        const imageUrl = `/images/${originalFileName}`;
        res.json({ success: true, message: 'Imagem de layout enviada com sucesso!', imageUrl: imageUrl, fileName: originalFileName });
    }
});

app.get('/api/admin/images', (req, res) => {
    fs.readdir(imagesDir, (err, files) => {
        if (err) { return res.status(500).json({ success: false, message: 'Erro ao listar imagens.', details: err.message }); }
        const imageFiles = files.filter(file => ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(path.extname(file).toLowerCase()));
        res.json({ success: true, images: imageFiles });
    });
});

app.delete('/api/admin/images/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    const filePath = path.join(imagesDir, fileName);

    if (!path.normalize(filePath).startsWith(imagesDir)) {
        console.warn(`Tentativa de acesso ilegal de arquivo: ${fileName}`);
        return res.status(400).json({ success: false, message: 'Operação de exclusão inválida.' });
    }

    fs.unlink(filePath, (err) => {
        if (err) { return res.status(err.code === 'ENOENT' ? 404 : 500).json({ success: false, message: `Erro ao excluir imagem ${fileName}.`, details: err.message }); }
        console.log(`Arquivo ${fileName} excluído.`);
        res.json({ success: true, message: `Imagem ${fileName} excluída com sucesso.` });
    });
});

// Função para gerar um código de pedido amigável
function generateOrderCode() {
    const now = new Date();
    // Formato YYYYMMDD
    const datePart = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0');
    // Gera 4 caracteres aleatórios alfanuméricos
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${datePart}-${randomPart}`;
}

// NOVO: Função para gerar um código de cliente vinculado ao nome e E-MAIL
function generateCustomerCode(customerName, customerEmail) {
    if (!customerName || !customerEmail) {
        return null;
    }
    const firstLetter = customerName.trim().charAt(0).toUpperCase();
    // Gera um hash simples do email inteiro usando char codes, e pega uma parte.
    let sum = 0;
    for (let i = 0; i < customerEmail.length; i++) {
        sum += customerEmail.charCodeAt(i);
    }
    // Converte a soma para base 36 e pega os últimos 4 caracteres
    // Multiplicar por um primo ajuda a espalhar os hashes
    const hashPart = (sum * 997).toString(36).slice(-4).toUpperCase();
    return `${firstLetter}-${hashPart}`;
}

// --- ROTA CRÍTICA PARA CRIAÇÃO DE PREFERÊNCIA DE PAGAMENTO (CHECKOUT PRO) ---
app.post('/create_preference', async (req, res) => {
    const { cartItems, customerInfo } = req.body;
    console.log('--- Início da Requisição /create_preference ---');
    console.log('Dados recebidos (cartItems):', JSON.stringify(cartItems.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity, selected_size: item.selected_size, selected_color: item.selected_color })), null, 2));
    console.log('Dados recebidos (customerInfo):', JSON.stringify(customerInfo, null, 2));
    // 1. Validação de entrada
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
        console.error('Erro 400: Nenhum item válido para processar Checkout Pro.');
        return res.status(400).json({ error: 'Nenhum item válido para processar o pagamento. Verifique os dados enviados.' });
    }
    if (!customerInfo || !customerInfo.email || !customerInfo.name || !customerInfo.address || !customerInfo.phone) {
        console.error('Erro 400: Informações incompletas do cliente para Checkout Pro (email, nome, endereço, telefone são obrigatórios).');
        return res.status(400).json({ error: 'Informações do cliente (e-mail, nome, endereço, telefone) são obrigatórias.' });
    }
    // Adaptar os itens do carrinho para o Mercado Pago e para o banco de dados
    const itemsToProcess = cartItems.map(item => {
        const itemPrice = parseFloat(item.price);
        const itemQuantity = Number(item.quantity);

        if (isNaN(itemPrice) || itemPrice <= 0 || isNaN(itemQuantity) || itemQuantity <= 0) {
            console.error('Validação Interna: Item com preço ou quantidade inválida antes de enviar para MP:', item);
        }
        return {
            id: String(item.id), // ID do produto
            title: String(item.name + (item.selected_size ? ` (Tam: ${item.selected_size})` : '') + (item.selected_color ? ` (Cor: ${item.selected_color})` : '')),
            quantity: itemQuantity,
            unit_price: parseFloat(itemPrice.toFixed(2)),
            picture_url: item.image_url && item.image_url.length > 0 ? (Array.isArray(item.image_url) ? String(item.image_url[0]) : String(item.image_url)) : `${process.env.APP_BASE_URL}/images/placeholder.png`,
            // Campos úteis para o registro local (tabela order_items)
            product_code: item.product_code,
            selected_size: item.selected_size || null,
            selected_color: item.selected_color || null
        };
    });
    for (const item of itemsToProcess) {
        if (item.quantity <= 0 || item.unit_price <= 0) {
            console.error('Erro 400: Item inválido encontrado (quantidade ou preço zero/negativo) após mapeamento:', item);
            return res.status(400).json({ error: 'Todos os itens devem ter quantidade e preço maiores que zero.' });
        }
    }
    // Calcular a quantidade TOTAL de UNIDADES de itens na ordem
    const totalQuantity = itemsToProcess.reduce((sum, item) => sum + item.quantity, 0);
    console.log('Quantidade total de unidades na ordem (total_quantity):', totalQuantity);
    // Calcular o total_amount diretamente dos itens
    const totalAmount = itemsToProcess.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

    console.log('Valor total da ordem (total_amount):', totalAmount.toFixed(2));
    const appBaseUrl = process.env.APP_BASE_URL;
    if (!appBaseUrl) {
        console.error('ERRO CRÍTICO: APP_BASE_URL não está definido no arquivo .env! Isto pode causar falha no redirecionamento e webhooks.');
    }
    // Gerar o código do pedido
    const newOrderCode = generateOrderCode();
    console.log('Código do pedido gerado:', newOrderCode);
    // Gerar o código do cliente
    const customerCode = generateCustomerCode(customerInfo.name, customerInfo.email);
    console.log('Código do cliente gerado:', customerCode);
    try {
        // 2. Inserir o registro principal do pedido na tabela 'orders'
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .insert([
                {
                    order_code: newOrderCode,
                    customer_code: customerCode,
                    total_amount: totalAmount,
                    total_quantity: totalQuantity, // Passando a quantidade total de UNIDADES
                    status: 'pending_mp', // Status inicial: pendente do Mercado Pago
                    payer_email: String(customerInfo.email),
                    customer_name: String(customerInfo.name),
                    customer_email: String(customerInfo.email),
                    customer_phone: String(customerInfo.phone),
                    shipping_address: String(customerInfo.address.street),
                    shipping_number: customerInfo.address.number ? String(customerInfo.address.number) : null,
                    shipping_complement: customerInfo.address.complement ? String(customerInfo.address.complement) : null,
                    shipping_neighborhood: customerInfo.address.neighborhood ? String(customerInfo.address.neighborhood) : null,
                    shipping_city: String(customerInfo.address.city),
                    shipping_state: String(customerInfo.address.state),
                    shipping_zip_code: String(customerInfo.address.cep).replace(/\D/g, ''),
                }
            ])
            .select();
        if (orderError) {
            console.error('Erro Supabase: Falha ao criar ordem principal no banco de dados:', orderError);
            return res.status(500).json({ error: 'Falha ao criar ordem no banco de dados.', details: orderError.message });
        }
        const orderId = orderData[0].id; // O ID do pedido recém-criado na tabela 'orders' (o UUID técnico)
        console.log('Ordem principal criada no Supabase com ID:', orderId, 'e Código:', newOrderCode);

        // 3. Inserir cada item do carrinho na tabela 'order_items'
        const orderItemsToInsert = itemsToProcess.map(item => ({
            order_id: orderId, // Link para o pedido principal (UUID técnico)
            product_id: item.id,
            product_code: item.product_code,
            product_name: item.title.split(' (Tam:')[0].split(' (Cor:')[0], // Limpa o title para o nome base
            selected_size: item.selected_size,
            selected_color: item.selected_color,
            quantity: item.quantity, // Quantidade deste item específico
            unit_price: item.unit_price,
            image_url: item.picture_url
        }));
        const { error: orderItemsError } = await supabase
            .from('order_items')
            .insert(orderItemsToInsert);
        if (orderItemsError) {
            console.error('Erro Supabase: Falha ao inserir itens do pedido:', orderItemsError);
            return res.status(500).json({ error: 'Falha ao salvar detalhes dos itens do pedido.', details: orderItemsError.message });
        }
        console.log(`[${newOrderCode}] ${orderItemsToInsert.length} itens do pedido inseridos na tabela 'order_items'.`);

        // 4. Criar preferência no Mercado Pago
        const mpItems = itemsToProcess.map(item => ({
            id: item.id,
            title: item.title, // Já formatado com tamanho/cor para o MP
            quantity: item.quantity,
            unit_price: item.unit_price,
            picture_url: item.picture_url
        }));
        const preference = new Preference(client);
        const body = {
            items: mpItems,
            payer: {
                email: String(customerInfo.email),
                name: String(customerInfo.name.split(' ')[0]),
                surname: String(customerInfo.name.split(' ').slice(1).join(' ')),
                address: {
                    zip_code: String(customerInfo.address.cep).replace(/\D/g, ''),
                    street_name: String(customerInfo.address.street),
                    street_number: customerInfo.address.number ? String(customerInfo.address.number) : undefined,
                    neighborhood: customerInfo.address.neighborhood ? String(customerInfo.address.neighborhood) : undefined,
                    city: String(customerInfo.address.city),
                    state: String(customerInfo.address.state)
                },
                phone: {
                    area_code: String(customerInfo.phone).substring(0, 2),
                    number: String(customerInfo.phone).substring(2)
                }
            },
            back_urls: {
                success: `${appBaseUrl}/success`,
                failure: `${appBaseUrl}/failure`,
                pending: `${appBaseUrl}/pending`,
            },
            notification_url: `${appBaseUrl}/webhook`,
            auto_return: 'approved',
            external_reference: String(orderId), // Usa o ID da ordem principal (UUID) para referência no MP
        };
        console.log('Corpo da preferência enviado ao Mercado Pago (debug):', JSON.stringify(body, null, 2));
        const mpPreference = await preference.create({ body });
        console.log('Preferência do Mercado Pago criada. ID MP:', mpPreference.id);

        // Atualizar a ordem principal com o ID da preferência do Mercado Pago
        const { error: updateOrderError } = await supabase
            .from('orders')
            .update({ mp_preference_id: String(mpPreference.id) })
            .eq('id', orderId);
        if (updateOrderError) {
            console.error('Erro Supabase: Falha ao atualizar mp_preference_id na ordem principal:', updateOrderError);
        }
        const redirectUrl = process.env.NODE_ENV === 'production' ? mpPreference.init_point : mpPreference.sandbox_init_point;
        console.log('URL de redirecionamento final gerada:', redirectUrl);
        res.status(200).json({ redirectUrl: redirectUrl });
    } catch (error) {
        console.error('ERRO FATAL (API MP/Supabase):', error);
        let errorMessage = 'Erro interno do servidor ao processar o pagamento.';
        if (error.cause && error.cause.message) {
            errorMessage = `Erro da API do Mercado Pago: ${error.cause.message}`;
        } else if (error.message) {
            errorMessage = `Erro: ${error.message}`;
        }
        res.status(500).json({ error: errorMessage, details: error.message, originalError: error.toString() });
    }
    console.log('--- Fim da Requisição /create_preference ---');
});

app.delete('/admin/products/:product_code', async (req, res) => {
    const productCode = req.params.product_code;
    console.log(`DELETE /admin/products/${productCode}`);
    try {
        // Passo 1: Buscar o produto para obter o nome do arquivo de imagem
        const { data, error: fetchError } = await supabase
            .from('products')
            .select('image_url')
            .eq('product_code', productCode)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            throw fetchError;
        }

        const bucketName = 'product-images';

        // Passo 2: Se o produto existir e tiver URLs de imagem, excluí-las da bucket
        if (data && data.image_url && data.image_url.length > 0) {
            const imagePaths = data.image_url.map(url => {
                // O URL do Supabase é algo como https://<id>.supabase.co/storage/v1/object/public/<bucket>/<path/to/file>
                // Precisamos extrair apenas o '<path/to/file>'
                const pathSegments = url.split('/');
                const publicIndex = pathSegments.indexOf('public');
                if (publicIndex !== -1 && publicIndex + 2 < pathSegments.length) {
                    return pathSegments.slice(publicIndex + 2).join('/');
                }
                return null;
            }).filter(path => path !== null);

            if (imagePaths.length > 0) {
                console.log(`Excluindo imagens da bucket do Supabase:`, imagePaths);
                const { error: deleteImageError } = await supabase.storage.from(bucketName).remove(imagePaths);
                if (deleteImageError) {
                    console.error('Erro ao excluir imagem da bucket do Supabase:', deleteImageError);
                    // Não lançamos um erro fatal aqui, apenas registramos, pois a prioridade é excluir o registro do banco de dados
                }
            }
        }

        // Passo 3: Excluir o registro do produto da tabela 'products'
        const { error: deleteError } = await supabase.from('products').delete().eq('product_code', productCode);
        if (deleteError) {
            throw deleteError;
        }

        res.status(200).json({ message: `Produto ${productCode} e suas imagens excluídos com sucesso.` });
    }
    catch (error) {
        console.error(`Erro ao excluir produto ${productCode}:`, error);
        res.status(500).json({ error: 'Falha ao excluir produto.', details: error.message });
    }
});

app.get('/success', (req, res) => { console.log('Redirecionado para /success:', req.query); res.sendFile(path.join(__dirname, '../public', 'success.html')); });
app.get('/failure', (req, res) => { console.log('Redirecionado para /failure:', req.query); res.sendFile(path.join(__dirname, '../public', 'failure.html')); });
app.get('/pending', (req, res) => { console.log('Redirecionado para /pending:', req.query); res.sendFile(path.join(__dirname, '../public', 'pending.html')); });
// --- ROTA DO WEBHOOK DO MERCADO PAGO ---
app.post('/webhook', async (req, res) => {
    console.log('--- Webhook do Mercado Pago Recebido ---');
    console.log('Headers:', req.headers);
    console.log('Corpo da requisição (parcial):', JSON.stringify(req.body).substring(0, 500) + '...');
    console.log('Parâmetros de query:', req.query);
    let type, resourceId;
    if (req.query.topic && req.query.id) {
        type = req.query.topic;
        resourceId = req.query.id;
        console.log(`Webhook: Extraído de query -> type: ${type}, id: ${resourceId}`);
    } else if (req.body.type && req.body.data && req.body.data.id) {
        type = req.body.type;
        resourceId = req.body.data.id;
        console.log(`Webhook: Extraído de body -> type: ${type}, id: ${resourceId}`);
    } else {
        console.warn('Webhook: Não foi possível extrair tipo ou ID do recurso. Ignorando. Verifique a configuração do webhook no MP.');
        return res.status(400).send('Missing identifiable resource type or ID.');
    }
    if (type === 'payment') {
        try {
            console.log(`Webhook: Processando notificação de PAGAMENTO. ID do MP: ${resourceId}`);
            const paymentClient = new Payment(client);
            let paymentDetails;
            try {
                paymentDetails = await paymentClient.get({ id: resourceId });
                console.log('Detalhes do pagamento obtidos do Mercado Pago:', paymentDetails.id, paymentDetails.status, paymentDetails.external_reference);
            } catch (mpApiError) {
                console.error('Erro ao buscar detalhes do pagamento na API do Mercado Pago (pode ser temporário):', mpApiError.message);
                return res.status(200).send('Falha ao obter detalhes do pagamento do Mercado Pago. Tentaremos novamente.');
            }
            const externalReference = paymentDetails.external_reference; // Este é o 'id' da nossa tabela 'orders'
            const mpPaymentStatus = paymentDetails.status;
            if (!externalReference) {
                console.error('Erro Webhook: external_reference não encontrado nos detalhes do pagamento do MP. Não é possível associar a uma ordem.');
                return res.status(400).send('Missing external_reference from MP API response.');
            }
            const { data, error } = await supabase
                .from('orders')
                .update({
                    mp_payment_id: String(resourceId),
                    mp_status: String(mpPaymentStatus),
                    status: mpPaymentStatus === 'approved' ? 'payment_approved' : `payment_${mpPaymentStatus}`,
                    mp_preference_id: String(paymentDetails.preference_id || null)
                })
                .eq('id', externalReference) // Usa o 'id' da nossa tabela 'orders'
                .select();
            if (error) {
                console.error('Erro Supabase (Webhook): Falha ao ATUALIZAR ordem:', error);
                if (error.code === '23505') { console.warn('Webhook reenviado para ID de pagamento existente. Ignorando duplicação.'); return res.status(200).send('Webhook processado anteriormente.'); }

                return res.status(500).send('Erro ao processar webhook e salvar no Supabase.');
            }
            console.log('Ordem (ID:', externalReference, ') atualizada no Supabase com sucesso. Status:', data[0].status);
            res.status(200).send('Webhook de pagamento processado e ordem atualizada.');
        } catch (error) {
            console.error('ERRO FATAL no processamento do webhook de pagamento:', error);
            res.status(500).send('Erro interno ao processar webhook de pagamento.');
        }
    } else if (type === 'merchant_order') {
        console.log(`Webhook: Tipo 'merchant_order' (${resourceId}) recebido. (Não tratado no DB por agora).`);
        res.status(200).send('Webhook de ordem de compra recebido.');
    } else {
        console.log(`Webhook: Tipo '${type}' (${resourceId}) não tratado. Ignorando.`);
        res.status(200).send(`Notification type ${type} received.`);
    }
    console.log('--- Fim do Webhook ---');
});

// Endpoint para buscar e filtrar pedidos concluídos
app.get('/api/delivered-orders', async (req, res) => {
    const { q } = req.query;
    console.log(`GET /api/delivered-orders com query: "${q || 'nenhuma'}"`);

    try {
        // Busca todos os pedidos concluídos sem a filtragem de texto do Supabase
        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    *,
                    products (*)
                )
            `)
            .eq('status', 'delivered')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Erro ao buscar pedidos concluídos:', error.message);
            return res.status(500).json({ error: 'Erro interno do servidor ao buscar pedidos.', details: error.message });
        }

        // Função auxiliar para normalizar strings (remover acentos, pontuação, etc.)
        const normalizeString = (str) => {
            if (!str) return '';
            return str.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, '');
        };
        
        // Se houver um termo de busca, faz a filtragem no próprio servidor para maior flexibilidade
        const filteredOrders = q ? orders.filter(order => {
            const normalizedQuery = normalizeString(q);
            
            // Constrói uma única string de pesquisa com todos os campos relevantes
            const searchableText = [
                normalizeString(order.customer_name),
                normalizeString(order.customer_phone),
                normalizeString(order.shipping_address),
                normalizeString(order.shipping_number),
                normalizeString(order.shipping_complement),
                normalizeString(order.shipping_neighborhood),
                normalizeString(order.shipping_city),
                normalizeString(order.shipping_state),
                normalizeString(order.shipping_zip_code),
                normalizeString(order.order_code),
                // Adiciona os campos de cada item do pedido
                ...order.order_items.flatMap(item => [
                    normalizeString(item.products.name),
                    normalizeString(item.products.product_code),
                ])
            ].join(' ');

            return searchableText.includes(normalizedQuery);
        }) : orders;
        
        // Formata os dados para o frontend
        const formattedOrders = filteredOrders.map(order => ({
            ...order,
            order_items: order.order_items.map(item => ({
                ...item,
                product_name: item.products.name,
                product_code: item.products.product_code,
                image_url: Array.isArray(item.products.image_url) ? item.products.image_url[0] : null,
                selected_color: item.products.colors
            }))
        }));

        console.log(`[Backend API] ${formattedOrders.length} pedidos concluídos encontrados.`);
        res.status(200).json(formattedOrders);
    } catch (error) {
        console.error('Erro inesperado ao buscar pedidos concluídos:', error);
        res.status(500).json({ error: 'Erro interno do servidor.', details: error.message });
    }
});

app.get('/api/products/:id', async (req, res) => {
    const productId = req.params.id;
    console.log(`GET /api/products/:id -> ID: ${productId}`);
    try {
        const { data: product, error } = await supabase.from('products').select('*').eq('id', productId).single();
        if (error) {
            console.error(`Erro ao buscar produto ${productId}:`, error);
            return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: 'Produto não encontrado ou falha na busca.', details: error.message });
        }
        if (!product) { return res.status(404).json({ error: 'Produto não encontrado.' }); }
        const formattedProduct = {
            ...product,
            image_url: Array.isArray(product.image_url) ? product.image_url : (product.image_url ? JSON.parse(product.image_url) : []),
            available_sizes: Array.isArray(product.available_sizes) ? product.available_sizes : (product.available_sizes ? JSON.parse(product.available_sizes) : []),
            colors: Array.isArray(product.colors) ? product.colors : (p.colors ? JSON.parse(p.colors) : []),
            technical_specifications: Array.isArray(product.technical_specifications) ? product.technical_specifications : (product.technical_specifications ? JSON.parse(product.technical_specifications) : [])
        };
        res.json(formattedProduct);
    } catch (error) {
        console.error('Erro inesperado ao buscar detalhes do produto:', error);
        res.status(500).json({ error: 'Erro interno do servidor.', details: error.message });
    }
});

app.get('/products/:id', (req, res) => res.sendFile(path.join(__dirname, '../public', 'product.html')));

app.get('/admin/layout', (req, res) => res.sendFile(path.join(__dirname, '../public', 'admin-layout.html')));

// A LÓGICA DE RENOMEAR FOI MOVIDA PARA A ROTA!
app.post('/api/admin/upload-image', uploadLayoutImage.single('image'), (req, res) => {
    if (!req.file) { return res.status(400).json({ success: false, message: 'Nenhum arquivo de imagem de layout enviado.' }); }

    const originalFileName = req.file.filename;
    const customFileName = req.body.customFileName;

    console.log(`[NOVA LÓGICA] Upload recebido. Nome temporário: "${originalFileName}". Nome customizado recebido: "${customFileName}"`);

    // Verifica se um nome customizado válido foi fornecido
    if (customFileName && customFileName.trim() !== '') {
        const originalExtension = path.extname(originalFileName);
        const newFileName = customFileName.replace(/[^a-zA-Z0-9\-\_.]/g, '_') + originalExtension;
        const oldPath = path.join(imagesDir, originalFileName);
        const newPath = path.join(imagesDir, newFileName);

        fs.rename(oldPath, newPath, (err) => {
            if (err) {
                console.error('Erro ao renomear arquivo:', err);
                return res.status(500).json({ success: false, message: `Erro ao renomear a imagem para ${newFileName}.` });
            }
            console.log(`[NOVA LÓGICA] Arquivo "${originalFileName}" renomeado para "${newFileName}".`);
            const imageUrl = `/images/${newFileName}`;
            res.json({ success: true, message: 'Imagem de layout enviada e renomeada com sucesso!', imageUrl: imageUrl, fileName: newFileName });
        });
    } else {
        // Se não houver nome customizado, retorna o nome original (aleatório)
        console.log(`[NOVA LÓGICA] Nenhum nome customizado fornecido. Mantendo nome: "${originalFileName}".`);
        const imageUrl = `/images/${originalFileName}`;
        res.json({ success: true, message: 'Imagem de layout enviada com sucesso!', imageUrl: imageUrl, fileName: originalFileName });
    }
});

app.get('/api/admin/images', (req, res) => {
    fs.readdir(imagesDir, (err, files) => {
        if (err) { return res.status(500).json({ success: false, message: 'Erro ao listar imagens.', details: err.message }); }
        const imageFiles = files.filter(file => ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(path.extname(file).toLowerCase()));
        res.json({ success: true, images: imageFiles });
    });
});

app.delete('/api/admin/images/:fileName', (req, res) => {
    const fileName = req.params.fileName;
    const filePath = path.join(imagesDir, fileName);

    if (!path.normalize(filePath).startsWith(imagesDir)) {
        console.warn(`Tentativa de acesso ilegal de arquivo: ${fileName}`);
        return res.status(400).json({ success: false, message: 'Operação de exclusão inválida.' });
    }

    fs.unlink(filePath, (err) => {
        if (err) { return res.status(err.code === 'ENOENT' ? 404 : 500).json({ success: false, message: `Erro ao excluir imagem ${fileName}.`, details: err.message }); }
        console.log(`Arquivo ${fileName} excluído.`);
        res.json({ success: true, message: `Imagem ${fileName} excluída com sucesso.` });
    });
});

// Função para gerar um código de pedido amigável
function generateOrderCode() {
    const now = new Date();
    // Formato YYYYMMDD
    const datePart = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0');
    // Gera 4 caracteres aleatórios alfanuméricos
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${datePart}-${randomPart}`;
}

// NOVO: Função para gerar um código de cliente vinculado ao nome e E-MAIL
function generateCustomerCode(customerName, customerEmail) {
    if (!customerName || !customerEmail) {
        return null;
    }
    const firstLetter = customerName.trim().charAt(0).toUpperCase();
    // Gera um hash simples do email inteiro usando char codes, e pega uma parte.
    let sum = 0;
    for (let i = 0; i < customerEmail.length; i++) {
        sum += customerEmail.charCodeAt(i);
    }
    // Converte a soma para base 36 e pega os últimos 4 caracteres
    // Multiplicar por um primo ajuda a espalhar os hashes
    const hashPart = (sum * 997).toString(36).slice(-4).toUpperCase();
    return `${firstLetter}-${hashPart}`;
}

// --- ROTA CRÍTICA PARA CRIAÇÃO DE PREFERÊNCIA DE PAGAMENTO (CHECKOUT PRO) ---
app.post('/create_preference', async (req, res) => {
    const { cartItems, customerInfo } = req.body;
    console.log('--- Início da Requisição /create_preference ---');
    console.log('Dados recebidos (cartItems):', JSON.stringify(cartItems.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity, selected_size: item.selected_size, selected_color: item.selected_color })), null, 2));
    console.log('Dados recebidos (customerInfo):', JSON.stringify(customerInfo, null, 2));
    // 1. Validação de entrada
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
        console.error('Erro 400: Nenhum item válido para processar Checkout Pro.');
        return res.status(400).json({ error: 'Nenhum item válido para processar o pagamento. Verifique os dados enviados.' });
    }
    if (!customerInfo || !customerInfo.email || !customerInfo.name || !customerInfo.address || !customerInfo.phone) {
        console.error('Erro 400: Informações incompletas do cliente para Checkout Pro (email, nome, endereço, telefone são obrigatórios).');
        return res.status(400).json({ error: 'Informações do cliente (e-mail, nome, endereço, telefone) são obrigatórias.' });
    }
    // Adaptar os itens do carrinho para o Mercado Pago e para o banco de dados
    const itemsToProcess = cartItems.map(item => {
        const itemPrice = parseFloat(item.price);
        const itemQuantity = Number(item.quantity);

        if (isNaN(itemPrice) || itemPrice <= 0 || isNaN(itemQuantity) || itemQuantity <= 0) {
            console.error('Validação Interna: Item com preço ou quantidade inválida antes de enviar para MP:', item);
        }
        return {
            id: String(item.id), // ID do produto
            title: String(item.name + (item.selected_size ? ` (Tam: ${item.selected_size})` : '') + (item.selected_color ? ` (Cor: ${item.selected_color})` : '')),
            quantity: itemQuantity,
            unit_price: parseFloat(itemPrice.toFixed(2)),
            picture_url: item.image_url && item.image_url.length > 0 ? (Array.isArray(item.image_url) ? String(item.image_url[0]) : String(item.image_url)) : `${process.env.APP_BASE_URL}/images/placeholder.png`,
            // Campos úteis para o registro local (tabela order_items)
            product_code: item.product_code,
            selected_size: item.selected_size || null,
            selected_color: item.selected_color || null
        };
    });
    for (const item of itemsToProcess) {
        if (item.quantity <= 0 || item.unit_price <= 0) {
            console.error('Erro 400: Item inválido encontrado (quantidade ou preço zero/negativo) após mapeamento:', item);
            return res.status(400).json({ error: 'Todos os itens devem ter quantidade e preço maiores que zero.' });
        }
    }
    // Calcular a quantidade TOTAL de UNIDADES de itens na ordem
    const totalQuantity = itemsToProcess.reduce((sum, item) => sum + item.quantity, 0);
    console.log('Quantidade total de unidades na ordem (total_quantity):', totalQuantity);
    // Calcular o total_amount diretamente dos itens
    const totalAmount = itemsToProcess.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

    console.log('Valor total da ordem (total_amount):', totalAmount.toFixed(2));
    const appBaseUrl = process.env.APP_BASE_URL;
    if (!appBaseUrl) {
        console.error('ERRO CRÍTICO: APP_BASE_URL não está definido no arquivo .env! Isto pode causar falha no redirecionamento e webhooks.');
    }
    // Gerar o código do pedido
    const newOrderCode = generateOrderCode();
    console.log('Código do pedido gerado:', newOrderCode);
    // Gerar o código do cliente
    const customerCode = generateCustomerCode(customerInfo.name, customerInfo.email);
    console.log('Código do cliente gerado:', customerCode);
    try {
        // 2. Inserir o registro principal do pedido na tabela 'orders'
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .insert([
                {
                    order_code: newOrderCode,
                    customer_code: customerCode,
                    total_amount: totalAmount,
                    total_quantity: totalQuantity, // Passando a quantidade total de UNIDADES
                    status: 'pending_mp', // Status inicial: pendente do Mercado Pago
                    payer_email: String(customerInfo.email),
                    customer_name: String(customerInfo.name),
                    customer_email: String(customerInfo.email),
                    customer_phone: String(customerInfo.phone),
                    shipping_address: String(customerInfo.address.street),
                    shipping_number: customerInfo.address.number ? String(customerInfo.address.number) : null,
                    shipping_complement: customerInfo.address.complement ? String(customerInfo.address.complement) : null,
                    shipping_neighborhood: customerInfo.address.neighborhood ? String(customerInfo.address.neighborhood) : null,
                    shipping_city: String(customerInfo.address.city),
                    shipping_state: String(customerInfo.address.state),
                    shipping_zip_code: String(customerInfo.address.cep).replace(/\D/g, ''),
                }
            ])
            .select();
        if (orderError) {
            console.error('Erro Supabase: Falha ao criar ordem principal no banco de dados:', orderError);
            return res.status(500).json({ error: 'Falha ao criar ordem no banco de dados.', details: orderError.message });
        }
        const orderId = orderData[0].id; // O ID do pedido recém-criado na tabela 'orders' (o UUID técnico)
        console.log('Ordem principal criada no Supabase com ID:', orderId, 'e Código:', newOrderCode);

        // 3. Inserir cada item do carrinho na tabela 'order_items'
        const orderItemsToInsert = itemsToProcess.map(item => ({
            order_id: orderId, // Link para o pedido principal (UUID técnico)
            product_id: item.id,
            product_code: item.product_code,
            product_name: item.title.split(' (Tam:')[0].split(' (Cor:')[0], // Limpa o title para o nome base
            selected_size: item.selected_size,
            selected_color: item.selected_color,
            quantity: item.quantity, // Quantidade deste item específico
            unit_price: item.unit_price,
            image_url: item.picture_url
        }));
        const { error: orderItemsError } = await supabase
            .from('order_items')
            .insert(orderItemsToInsert);
        if (orderItemsError) {
            console.error('Erro Supabase: Falha ao inserir itens do pedido:', orderItemsError);
            return res.status(500).json({ error: 'Falha ao salvar detalhes dos itens do pedido.', details: orderItemsError.message });
        }
        console.log(`[${newOrderCode}] ${orderItemsToInsert.length} itens do pedido inseridos na tabela 'order_items'.`);

        // 4. Criar preferência no Mercado Pago
        const mpItems = itemsToProcess.map(item => ({
            id: item.id,
            title: item.title, // Já formatado com tamanho/cor para o MP
            quantity: item.quantity,
            unit_price: item.unit_price,
            picture_url: item.picture_url
        }));
        const preference = new Preference(client);
        const body = {
            items: mpItems,
            payer: {
                email: String(customerInfo.email),
                name: String(customerInfo.name.split(' ')[0]),
                surname: String(customerInfo.name.split(' ').slice(1).join(' ')),
                address: {
                    zip_code: String(customerInfo.address.cep).replace(/\D/g, ''),
                    street_name: String(customerInfo.address.street),
                    street_number: customerInfo.address.number ? String(customerInfo.address.number) : undefined,
                    neighborhood: customerInfo.address.neighborhood ? String(customerInfo.address.neighborhood) : undefined,
                    city: String(customerInfo.address.city),
                    state: String(customerInfo.address.state)
                },
                phone: {
                    area_code: String(customerInfo.phone).substring(0, 2),
                    number: String(customerInfo.phone).substring(2)
                }
            },
            back_urls: {
                success: `${appBaseUrl}/success`,
                failure: `${appBaseUrl}/failure`,
                pending: `${appBaseUrl}/pending`,
            },
            notification_url: `${appBaseUrl}/webhook`,
            auto_return: 'approved',
            external_reference: String(orderId), // Usa o ID da ordem principal (UUID) para referência no MP
        };
        console.log('Corpo da preferência enviado ao Mercado Pago (debug):', JSON.stringify(body, null, 2));
        const mpPreference = await preference.create({ body });
        console.log('Preferência do Mercado Pago criada. ID MP:', mpPreference.id);

        // Atualizar a ordem principal com o ID da preferência do Mercado Pago
        const { error: updateOrderError } = await supabase
            .from('orders')
            .update({ mp_preference_id: String(mpPreference.id) })
            .eq('id', orderId);
        if (updateOrderError) {
            console.error('Erro Supabase: Falha ao atualizar mp_preference_id na ordem principal:', updateOrderError);
        }
        const redirectUrl = process.env.NODE_ENV === 'production' ? mpPreference.init_point : mpPreference.sandbox_init_point;
        console.log('URL de redirecionamento final gerada:', redirectUrl);
        res.status(200).json({ redirectUrl: redirectUrl });
    } catch (error) {
        console.error('ERRO FATAL (API MP/Supabase):', error);
        let errorMessage = 'Erro interno do servidor ao processar o pagamento.';
        if (error.cause && error.cause.message) {
            errorMessage = `Erro da API do Mercado Pago: ${error.cause.message}`;
        } else if (error.message) {
            errorMessage = `Erro: ${error.message}`;
        }
        res.status(500).json({ error: errorMessage, details: error.message, originalError: error.toString() });
    }
    console.log('--- Fim da Requisição /create_preference ---');
});

app.delete('/admin/products/:product_code', async (req, res) => {
    const productCode = req.params.product_code;
    console.log(`DELETE /admin/products/${productCode}`);
    try {
        // Passo 1: Buscar o produto para obter o nome do arquivo de imagem
        const { data, error: fetchError } = await supabase
            .from('products')
            .select('image_url')
            .eq('product_code', productCode)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            throw fetchError;
        }

        const bucketName = 'product-images';

        // Passo 2: Se o produto existir e tiver URLs de imagem, excluí-las da bucket
        if (data && data.image_url && data.image_url.length > 0) {
            const imagePaths = data.image_url.map(url => {
                // O URL do Supabase é algo como https://<id>.supabase.co/storage/v1/object/public/<bucket>/<path/to/file>
                // Precisamos extrair apenas o '<path/to/file>'
                const pathSegments = url.split('/');
                const publicIndex = pathSegments.indexOf('public');
                if (publicIndex !== -1 && publicIndex + 2 < pathSegments.length) {
                    return pathSegments.slice(publicIndex + 2).join('/');
                }
                return null;
            }).filter(path => path !== null);

            if (imagePaths.length > 0) {
                console.log(`Excluindo imagens da bucket do Supabase:`, imagePaths);
                const { error: deleteImageError } = await supabase.storage.from(bucketName).remove(imagePaths);
                if (deleteImageError) {
                    console.error('Erro ao excluir imagem da bucket do Supabase:', deleteImageError);
                    // Não lançamos um erro fatal aqui, apenas registramos, pois a prioridade é excluir o registro do banco de dados
                }
            }
        }

        // Passo 3: Excluir o registro do produto da tabela 'products'
        const { error: deleteError } = await supabase.from('products').delete().eq('product_code', productCode);
        if (deleteError) {
            throw deleteError;
        }

        res.status(200).json({ message: `Produto ${productCode} e suas imagens excluídos com sucesso.` });
    }
    catch (error) {
        console.error(`Erro ao excluir produto ${productCode}:`, error);
        res.status(500).json({ error: 'Falha ao excluir produto.', details: error.message });
    }
});

app.get('/success', (req, res) => { console.log('Redirecionado para /success:', req.query); res.sendFile(path.join(__dirname, '../public', 'success.html')); });
app.get('/failure', (req, res) => { console.log('Redirecionado para /failure:', req.query); res.sendFile(path.join(__dirname, '../public', 'failure.html')); });
app.get('/pending', (req, res) => { console.log('Redirecionado para /pending:', req.query); res.sendFile(path.join(__dirname, '../public', 'pending.html')); });
// --- ROTA DO WEBHOOK DO MERCADO PAGO ---
app.post('/webhook', async (req, res) => {
    console.log('--- Webhook do Mercado Pago Recebido ---');
    console.log('Headers:', req.headers);
    console.log('Corpo da requisição (parcial):', JSON.stringify(req.body).substring(0, 500) + '...');
    console.log('Parâmetros de query:', req.query);
    let type, resourceId;
    if (req.query.topic && req.query.id) {
        type = req.query.topic;
        resourceId = req.query.id;
        console.log(`Webhook: Extraído de query -> type: ${type}, id: ${resourceId}`);
    } else if (req.body.type && req.body.data && req.body.data.id) {
        type = req.body.type;
        resourceId = req.body.data.id;
        console.log(`Webhook: Extraído de body -> type: ${type}, id: ${resourceId}`);
    } else {
        console.warn('Webhook: Não foi possível extrair tipo ou ID do recurso. Ignorando. Verifique a configuração do webhook no MP.');
        return res.status(400).send('Missing identifiable resource type or ID.');
    }
    if (type === 'payment') {
        try {
            console.log(`Webhook: Processando notificação de PAGAMENTO. ID do MP: ${resourceId}`);
            const paymentClient = new Payment(client);
            let paymentDetails;
            try {
                paymentDetails = await paymentClient.get({ id: resourceId });
                console.log('Detalhes do pagamento obtidos do Mercado Pago:', paymentDetails.id, paymentDetails.status, paymentDetails.external_reference);
            } catch (mpApiError) {
                console.error('Erro ao buscar detalhes do pagamento na API do Mercado Pago (pode ser temporário):', mpApiError.message);
                return res.status(200).send('Falha ao obter detalhes do pagamento do Mercado Pago. Tentaremos novamente.');
            }
            const externalReference = paymentDetails.external_reference; // Este é o 'id' da nossa tabela 'orders'
            const mpPaymentStatus = paymentDetails.status;
            if (!externalReference) {
                console.error('Erro Webhook: external_reference não encontrado nos detalhes do pagamento do MP. Não é possível associar a uma ordem.');
                return res.status(400).send('Missing external_reference from MP API response.');
            }
            const { data, error } = await supabase
                .from('orders')
                .update({
                    mp_payment_id: String(resourceId),
                    mp_status: String(mpPaymentStatus),
                    status: mpPaymentStatus === 'approved' ? 'payment_approved' : `payment_${mpPaymentStatus}`,
                    mp_preference_id: String(paymentDetails.preference_id || null)
                })
                .eq('id', externalReference) // Usa o 'id' da nossa tabela 'orders'
                .select();
            if (error) {
                console.error('Erro Supabase (Webhook): Falha ao ATUALIZAR ordem:', error);
                if (error.code === '23505') { console.warn('Webhook reenviado para ID de pagamento existente. Ignorando duplicação.'); return res.status(200).send('Webhook processado anteriormente.'); }

                return res.status(500).send('Erro ao processar webhook e salvar no Supabase.');
            }
            console.log('Ordem (ID:', externalReference, ') atualizada no Supabase com sucesso. Status:', data[0].status);
            res.status(200).send('Webhook de pagamento processado e ordem atualizada.');
        } catch (error) {
            console.error('ERRO FATAL no processamento do webhook de pagamento:', error);
            res.status(500).send('Erro interno ao processar webhook de pagamento.');
        }
    } else if (type === 'merchant_order') {
        console.log(`Webhook: Tipo 'merchant_order' (${resourceId}) recebido. (Não tratado no DB por agora).`);
        res.status(200).send('Webhook de ordem de compra recebido.');
    } else {
        console.log(`Webhook: Tipo '${type}' (${resourceId}) não tratado. Ignorando.`);
        res.status(200).send(`Notification type ${type} received.`);
    }
    console.log('--- Fim do Webhook ---');
});

const PORT = process.env.PORT || 3000;
try {
    app.listen(PORT, () => {
        console.log(`Servidor Express rodando em http://localhost:${PORT}`);
        console.log('Verifique o console do Termux para logs de requisições e erros.');
        console.log('Pressione Ctrl+C para parar o servidor.');
    });
} catch (error) {
    console.error('Falha ao iniciar o servidor Express:', error);
}
module.exports = app;

const normalizeString = (str) => {
    if (!str) return '';
    return str.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, '');
};

const configFilePath = path.join(__dirname, '..', 'config.json');
const readLayoutConfig = () => {
    try {
        if (fs.existsSync(configFilePath)) { return JSON.parse(fs.readFileSync(configFilePath, 'utf8')); }
    } catch (error) { console.error('Erro ao ler config.json:', error); }
    return { siteName: 'Sua Loja Online', siteNameColor: '#61dafb', headerColor: '#343a40', headerLinkColor: '#ffffff', footerColor: '#343a40', footerTextColor: '#ffffff', buttonColor: '#007bff' };
};
app.get('/api/layout-config', (req, res) => res.json(readLayoutConfig()));
app.post('/api/layout-config', (req, res) => {
    const newConfig = req.body;
    try {
        const validatedConfig = {
            siteName: newConfig.siteName || 'Sua Loja Online',
            siteNameColor: newConfig.siteNameColor || '#61dafb',
            headerColor: newConfig.headerColor || '#343a40', headerLinkColor: newConfig.headerLinkColor || '#ffffff',
            footerColor: newConfig.footerColor || '#343a40',
            footerTextColor: newConfig.footerTextColor || '#ffffff',
            buttonColor: newConfig.buttonColor || '#007bff',
        };
        fs.writeFileSync(configFilePath, JSON.stringify(validatedConfig, null, 2), 'utf8');
        res.json({ success: true, message: 'Configurações de layout salvas com sucesso!' });
    } catch (error) {
        console.error('Erro ao salvar config.json:', error);
        res.status(500).json({ success: false, message: 'Erro ao salvar configurações de layout.', details: error.message });
    }
});
