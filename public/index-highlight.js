document.addEventListener('DOMContentLoaded', () => {
    const productGrid = document.querySelector('.product-grid');
    if (!productGrid) return;

    const highlightProduct = () => {
        const productCards = Array.from(productGrid.querySelectorAll('.product-card'));
        // Calcula o centro da viewport
        const viewportCenter = window.innerHeight / 2;
        let closestCard = null;
        let minDistance = Infinity;

        productCards.forEach(card => {
            const rect = card.getBoundingClientRect();
            // Calcula o centro do cartão
            const cardCenter = rect.top + rect.height / 2;
            // Calcula a distância do centro do cartão para o centro da viewport
            const distance = Math.abs(cardCenter - viewportCenter);

            // Remove destaque de todos os cartões primeiro para garantir que apenas um esteja destacado
            card.classList.remove('highlight');

            // Se o cartão estiver visível na viewport (ou quase visível)
            if (rect.bottom > 0 && rect.top < window.innerHeight) {
                if (distance < minDistance) {
                    minDistance = distance;
                    closestCard = card;
                }
            }
        });

        if (closestCard) {
            closestCard.classList.add('highlight');
        }
    };

    // Chamar no carregamento e em cada evento de scroll e redimensionamento
    highlightProduct();
    window.addEventListener('scroll', highlightProduct);
    window.addEventListener('resize', highlightProduct);
});
