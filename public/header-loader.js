document.addEventListener('DOMContentLoaded', async () => {
    const headerPlaceholder = document.getElementById('header-placeholder');
    if (headerPlaceholder) {
        try {
            const response = await fetch('/header-unificado.html');
            if (response.ok) {
                const headerHtml = await response.text();
                headerPlaceholder.innerHTML = headerHtml;
            } else {
                console.error('Failed to load unified header:', response.statusText);
            }
        } catch (error) {
            console.error('Error fetching unified header:', error);
        }
    }
});
