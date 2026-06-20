/**
 * Shopify Flip Book API
 * 
 * Funciones para obtener y formatear productos de Shopify
 * para usar en el flip book interactivo
 */

/**
 * Obtiene productos de una colección de Shopify
 * @param {string} collectionHandle - Handle de la colección
 * @param {number} limit - Número máximo de productos
 * @returns {Promise<Array>} Array de productos formateados
 */
export async function getCollectionProducts(collectionHandle, limit = 20) {
  try {
    const response = await fetch(`/api/shopify-flipbook?collection=${collectionHandle}&limit=${limit}`);
    
    if (!response.ok) {
      throw new Error('Error fetching products');
    }
    
    const data = await response.json();
    return formatProducts(data.products);
  } catch (error) {
    console.error('Error in getCollectionProducts:', error);
    return [];
  }
}

/**
 * Obtiene productos específicos por IDs
 * @param {Array<string>} productIds - Array de IDs de productos
 * @returns {Promise<Array>} Array de productos formateados
 */
export async function getProductsByIds(productIds) {
  try {
    const response = await fetch('/api/shopify-flipbook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productIds }),
    });
    
    if (!response.ok) {
      throw new Error('Error fetching products');
    }
    
    const data = await response.json();
    return formatProducts(data.products);
  } catch (error) {
    console.error('Error in getProductsByIds:', error);
    return [];
  }
}

/**
 * Formatea productos de Shopify para el flip book
 * @param {Array} products - Productos raw de Shopify
 * @returns {Array} Productos formateados
 */
function formatProducts(products) {
  return products.map(product => ({
    id: product.id,
    title: product.title,
    description: product.description || '',
    price: formatPrice(product.variants[0]?.price),
    compareAtPrice: product.variants[0]?.compareAtPrice ? formatPrice(product.variants[0].compareAtPrice) : null,
    image: product.images[0]?.src || product.featuredImage?.url || '',
    images: product.images?.map(img => img.src || img.url) || [],
    url: `/products/${product.handle}`,
    handle: product.handle,
    vendor: product.vendor || '',
    tags: product.tags || [],
    available: product.availableForSale || product.available,
    variants: product.variants || [],
  }));
}

/**
 * Formatea precio
 * @param {string|number} price - Precio
 * @returns {string} Precio formateado
 */
function formatPrice(price) {
  if (!price) return '$0.00';
  
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  return `$${numPrice.toFixed(2)}`;
}

/**
 * Organiza productos en páginas para el flip book
 * @param {Array} products - Array de productos
 * @param {number} productsPerPage - Productos por página
 * @param {Object} options - Opciones adicionales
 * @returns {Array} Array de páginas
 */
export function organizeIntoPages(products, productsPerPage = 2, options = {}) {
  const {
    includeCover = true,
    includeBackCover = true,
    coverData = {},
    backCoverData = {},
  } = options;

  const pages = [];

  // Página de portada
  if (includeCover) {
    pages.push({
      type: 'cover',
      content: {
        title: coverData.title || 'Catálogo de Productos',
        subtitle: coverData.subtitle || 'Colección Destacada',
        season: coverData.season || new Date().getFullYear(),
        image: coverData.image || null,
      }
    });
  }

  // Páginas de productos
  for (let i = 0; i < products.length; i += productsPerPage) {
    pages.push({
      type: 'products',
      content: products.slice(i, i + productsPerPage),
      pageNumber: Math.floor(i / productsPerPage) + 1,
    });
  }

  // Página de contraportada
  if (includeBackCover) {
    pages.push({
      type: 'back',
      content: {
        message: backCoverData.message || '¡Gracias por ver nuestro catálogo!',
        cta: backCoverData.cta || 'Visita nuestra tienda online',
        ctaUrl: backCoverData.ctaUrl || '/',
        socialLinks: backCoverData.socialLinks || [],
      }
    });
  }

  return pages;
}

/**
 * Genera configuración de flip book basada en productos
 * @param {Array} products - Array de productos
 * @param {Object} customConfig - Configuración personalizada
 * @returns {Object} Configuración completa
 */
export function generateFlipBookConfig(products, customConfig = {}) {
  return {
    products,
    productsPerPage: customConfig.productsPerPage || 2,
    layout: customConfig.layout || 'grid', // 'grid', 'list', 'magazine'
    theme: customConfig.theme || 'default', // 'default', 'dark', 'minimal'
    navigation: {
      showArrows: customConfig.showArrows !== false,
      showThumbnails: customConfig.showThumbnails !== false,
      showPageNumbers: customConfig.showPageNumbers !== false,
      enableKeyboard: customConfig.enableKeyboard !== false,
      enableSwipe: customConfig.enableSwipe !== false,
    },
    animation: {
      duration: customConfig.animationDuration || 600,
      easing: customConfig.animationEasing || 'cubic-bezier(0.645, 0.045, 0.355, 1)',
    },
    cover: {
      enabled: customConfig.coverEnabled !== false,
      ...customConfig.coverData,
    },
    backCover: {
      enabled: customConfig.backCoverEnabled !== false,
      ...customConfig.backCoverData,
    },
  };
}

/**
 * Filtra productos por criterios
 * @param {Array} products - Array de productos
 * @param {Object} filters - Filtros a aplicar
 * @returns {Array} Productos filtrados
 */
export function filterProducts(products, filters = {}) {
  let filtered = [...products];

  // Filtrar por disponibilidad
  if (filters.availableOnly) {
    filtered = filtered.filter(p => p.available);
  }

  // Filtrar por rango de precio
  if (filters.minPrice || filters.maxPrice) {
    filtered = filtered.filter(p => {
      const price = parseFloat(p.price.replace('$', ''));
      if (filters.minPrice && price < filters.minPrice) return false;
      if (filters.maxPrice && price > filters.maxPrice) return false;
      return true;
    });
  }

  // Filtrar por tags
  if (filters.tags && filters.tags.length > 0) {
    filtered = filtered.filter(p => 
      filters.tags.some(tag => p.tags.includes(tag))
    );
  }

  // Filtrar por vendor
  if (filters.vendor) {
    filtered = filtered.filter(p => p.vendor === filters.vendor);
  }

  return filtered;
}

/**
 * Ordena productos
 * @param {Array} products - Array de productos
 * @param {string} sortBy - Criterio de ordenamiento
 * @returns {Array} Productos ordenados
 */
export function sortProducts(products, sortBy = 'default') {
  const sorted = [...products];

  switch (sortBy) {
    case 'price-asc':
      return sorted.sort((a, b) => {
        const priceA = parseFloat(a.price.replace('$', ''));
        const priceB = parseFloat(b.price.replace('$', ''));
        return priceA - priceB;
      });

    case 'price-desc':
      return sorted.sort((a, b) => {
        const priceA = parseFloat(a.price.replace('$', ''));
        const priceB = parseFloat(b.price.replace('$', ''));
        return priceB - priceA;
      });

    case 'title-asc':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));

    case 'title-desc':
      return sorted.sort((a, b) => b.title.localeCompare(a.title));

    case 'newest':
      // Asume que los productos más nuevos tienen IDs más altos
      return sorted.sort((a, b) => b.id - a.id);

    default:
      return sorted;
  }
}

/**
 * Genera URL compartible del flip book
 * @param {Object} config - Configuración del flip book
 * @returns {string} URL compartible
 */
export function generateShareableUrl(config) {
  const params = new URLSearchParams();
  
  if (config.collection) {
    params.append('collection', config.collection);
  }
  
  if (config.productIds) {
    params.append('products', config.productIds.join(','));
  }
  
  if (config.page) {
    params.append('page', config.page);
  }

  return `/flipbook?${params.toString()}`;
}

/**
 * Exporta flip book como PDF (requiere backend)
 * @param {string} flipbookId - ID del flip book
 * @returns {Promise<Blob>} PDF blob
 */
export async function exportToPDF(flipbookId) {
  try {
    const response = await fetch(`/api/flipbook-export?id=${flipbookId}`, {
      method: 'POST',
    });
    
    if (!response.ok) {
      throw new Error('Error exporting to PDF');
    }
    
    return await response.blob();
  } catch (error) {
    console.error('Error in exportToPDF:', error);
    throw error;
  }
}

/**
 * Guarda estado del flip book en localStorage
 * @param {string} flipbookId - ID del flip book
 * @param {Object} state - Estado a guardar
 */
export function saveFlipBookState(flipbookId, state) {
  try {
    const key = `flipbook_${flipbookId}`;
    localStorage.setItem(key, JSON.stringify({
      ...state,
      timestamp: Date.now(),
    }));
  } catch (error) {
    console.error('Error saving flip book state:', error);
  }
}

/**
 * Recupera estado del flip book de localStorage
 * @param {string} flipbookId - ID del flip book
 * @returns {Object|null} Estado guardado o null
 */
export function loadFlipBookState(flipbookId) {
  try {
    const key = `flipbook_${flipbookId}`;
    const saved = localStorage.getItem(key);
    
    if (!saved) return null;
    
    const state = JSON.parse(saved);
    
    // Verificar que no sea muy antiguo (24 horas)
    const maxAge = 24 * 60 * 60 * 1000;
    if (Date.now() - state.timestamp > maxAge) {
      localStorage.removeItem(key);
      return null;
    }
    
    return state;
  } catch (error) {
    console.error('Error loading flip book state:', error);
    return null;
  }
}

/**
 * Tracking de eventos del flip book
 * @param {string} event - Nombre del evento
 * @param {Object} data - Datos del evento
 */
export function trackFlipBookEvent(event, data = {}) {
  try {
    // Google Analytics
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', event, {
        event_category: 'FlipBook',
        ...data,
      });
    }

    // Klaviyo
    if (typeof window !== 'undefined' && window._learnq) {
      window._learnq.push(['track', `FlipBook ${event}`, data]);
    }

    // Console log para desarrollo
    console.log('FlipBook Event:', event, data);
  } catch (error) {
    console.error('Error tracking flip book event:', error);
  }
}
