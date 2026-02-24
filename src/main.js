/**
 * Функция для расчета выручки с одной позиции товара
 * @param {Object} purchase - элемент из массива items чека (sku, discount, quantity, sale_price)
 * @param {Object} _product - карточка товара (не используется в расчёте, но передаётся для совместимости)
 * @returns {number} выручка с учётом скидки
 */
function calculateSimpleRevenue(purchase, _product) {
    const { sale_price, quantity, discount = 0 } = purchase;
    return sale_price * quantity * (1 - discount / 100);
}

/**
 * Функция для расчета бонуса на основе позиции в рейтинге
 * @param {number} index - индекс в отсортированном по убыванию прибыли массиве (0 — первое место)
 * @param {number} total - общее количество продавцов
 * @param {Object} seller - объект продавца (содержит profit)
 * @returns {number} бонус в рублях
 */
function calculateBonusByProfit(index, total, seller) {
    const profit = seller.profit;
    if (index === 0) {
        return profit * 0.15;
    } else if (index === 1 || index === 2) {
        return profit * 0.10;
    } else if (index === total - 1) {
        return 0;
    } else {
        return profit * 0.05;
    }
}

/**
 * Главная функция анализа данных продаж
 * @param {Object} data - объект с коллекциями customers, products, sellers, purchase_records
 * @param {Object} options - настройки, обязательно содержит calculateRevenue и calculateBonus
 * @returns {Array} массив объектов с итоговой статистикой по каждому продавцу
 */
function analyzeSalesData(data, options) {
    // ========== ПРОВЕРКА ВХОДНЫХ ДАННЫХ ==========
    if (!data ||
        !Array.isArray(data.products) ||
        !Array.isArray(data.sellers) ||
        !Array.isArray(data.purchase_records) ||
        data.products.length === 0 ||
        data.sellers.length === 0 ||
        data.purchase_records.length === 0) {
        throw new Error('Некорректные входные данные');
    }

    // ========== ПРОВЕРКА НАЛИЧИЯ ФУНКЦИЙ В ОПЦИЯХ ==========
    if (typeof options !== 'object' || options === null) {
        throw new Error('Опции должны быть объектом');
    }
    const { calculateRevenue, calculateBonus } = options;
    if (typeof calculateRevenue !== 'function' || typeof calculateBonus !== 'function') {
        throw new Error('В опциях отсутствуют требуемые функции calculateRevenue и/или calculateBonus');
    }

    // ========== ПОДГОТОВКА ПРОМЕЖУТОЧНЫХ ДАННЫХ ==========
    const sellerStats = data.sellers.map(seller => ({
        id: seller.id,
        name: `${seller.first_name || ''} ${seller.last_name || ''}`.trim() || 'Unknown',
        revenue: 0,
        profit: 0,
        sales_count: 0,
        products_sold: {}
    }));

    const sellerIndex = {};
    sellerStats.forEach(stat => { sellerIndex[stat.id] = stat; });

    const productIndex = {};
    data.products.forEach(product => { productIndex[product.sku] = product; });

    // ========== ОБРАБОТКА ЗАПИСЕЙ О ПРОДАЖАХ ==========
    data.purchase_records.forEach(record => {
        const seller = sellerIndex[record.seller_id];
        if (!seller) return;

        seller.sales_count += 1;
        seller.revenue += record.total_amount;

        if (Array.isArray(record.items)) {
            record.items.forEach(item => {
                const revenueItem = calculateRevenue(item, productIndex[item.sku]);
                const product = productIndex[item.sku];
                const cost = product ? product.purchase_price * item.quantity : 0;
                seller.profit += (revenueItem - cost);

                const sku = item.sku;
                if (!seller.products_sold[sku]) {
                    seller.products_sold[sku] = 0;
                }
                seller.products_sold[sku] += item.quantity;
            });
        }
    });

    // ========== СОРТИРОВКА ПРОДАВЦОВ ПО ПРИБЫЛИ ==========
    sellerStats.sort((a, b) => b.profit - a.profit);

    // ========== РАСЧЁТ БОНУСОВ И ФОРМИРОВАНИЕ ТОП-10 ==========
    const totalSellers = sellerStats.length;
    sellerStats.forEach((seller, index) => {
        seller.bonus = calculateBonus(index, totalSellers, seller);

        const productList = Object.entries(seller.products_sold).map(([sku, quantity]) => ({ sku, quantity }));
        // Только сортировка по убыванию количества, при равных количествах порядок сохраняется (стабильная сортировка)
        productList.sort((a, b) => b.quantity - a.quantity);
        seller.top_products = productList.slice(0, 10);
    });

    // ========== ИТОГОВЫЙ ОТЧЁТ ==========
    return sellerStats.map(seller => ({
        seller_id: seller.id,
        name: seller.name,
        revenue: +seller.revenue.toFixed(2),
        profit: +seller.profit.toFixed(2),
        sales_count: seller.sales_count,
        top_products: seller.top_products,
        bonus: +seller.bonus.toFixed(2)
    }));
}