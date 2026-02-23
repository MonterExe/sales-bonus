/**
 * Функция для расчета выручки с одной позиции товара
 * @param {Object} purchase - элемент из массива items чека (sku, discount, quantity, sale_price)
 * @param {Object} _product - карточка товара (не используется в расчёте, но передаётся для совместимости)
 * @returns {number} выручка с учётом скидки
 */
function calculateSimpleRevenue(purchase, _product) {
    const { sale_price, quantity, discount = 0 } = purchase;
    // Коэффициент скидки: 1 - (discount / 100)
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
        return profit * 0.15; // 1 место – 15%
    } else if (index === 1 || index === 2) {
        return profit * 0.10; // 2 и 3 места – 10%
    } else if (index === total - 1) {
        return 0; // последнее место – 0%
    } else {
        return profit * 0.05; // остальные – 5%
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
    // Создаём массив статистики для каждого продавца (все продавцы, даже без продаж)
    const sellerStats = data.sellers.map(seller => ({
        id: seller.id,
        name: `${seller.first_name || ''} ${seller.last_name || ''}`.trim() || 'Unknown',
        revenue: 0,
        profit: 0,
        sales_count: 0,
        products_sold: {} // sku -> общее количество
    }));

    // Индекс для быстрого доступа к статистике продавца по id
    const sellerIndex = {};
    sellerStats.forEach(stat => {
        sellerIndex[stat.id] = stat;
    });

    // Индекс для быстрого доступа к товарам по sku
    const productIndex = {};
    data.products.forEach(product => {
        productIndex[product.sku] = product;
    });

    // ========== ОБРАБОТКА ЗАПИСЕЙ О ПРОДАЖАХ ==========
    data.purchase_records.forEach(record => {
        const seller = sellerIndex[record.seller_id];
        if (!seller) return; // на случай несуществующего продавца

        // Увеличиваем количество продаж (каждый чек — одна продажа)
        seller.sales_count += 1;

        // Увеличиваем общую выручку на сумму чека
        seller.revenue += record.total_amount;

        // Обрабатываем все позиции в чеке для расчёта прибыли и учёта товаров
        if (Array.isArray(record.items)) {
            record.items.forEach(item => {
                // Выручка за позицию (по правилам магазина)
                const revenueItem = calculateRevenue(item, productIndex[item.sku]);

                // Себестоимость товара
                const product = productIndex[item.sku];
                const cost = product ? product.purchase_price * item.quantity : 0;

                // Прибыль от этой позиции и добавляем к общей прибыли продавца
                seller.profit += (revenueItem - cost);

                // Учёт проданных товаров для будущего топа
                const sku = item.sku;
                if (!seller.products_sold[sku]) {
                    seller.products_sold[sku] = 0;
                }
                seller.products_sold[sku] += item.quantity;
            });
        }
    });

    // ========== СОРТИРОВКА ПРОДАВЦОВ ПО ПРИБЫЛИ (УБЫВАНИЕ) ==========
    sellerStats.sort((a, b) => b.profit - a.profit);

    // ========== РАСЧЁТ БОНУСОВ И ФОРМИРОВАНИЕ ТОП-10 ТОВАРОВ ==========
    const totalSellers = sellerStats.length;
    sellerStats.forEach((seller, index) => {
        // Расчёт бонуса
        seller.bonus = calculateBonus(index, totalSellers, seller);

        // Формирование топ-10 товаров
        const productList = Object.entries(seller.products_sold).map(([sku, quantity]) => ({ sku, quantity }));
        productList.sort((a, b) => {
            if (a.quantity !== b.quantity) {
                return b.quantity - a.quantity;
            } else {
                return a.sku.localeCompare(b.sku);
            }
        });
        seller.top_products = productList.slice(0, 10);
    });

    // ========== ФОРМИРОВАНИЕ ИТОГОВОГО ОТЧЁТА С ОКРУГЛЕНИЕМ ==========
    return sellerStats.map(seller => ({
        seller_id: seller.id,
        name: seller.name,
        revenue: +seller.revenue.toFixed(2),
        profit: +seller.profit.toFixed(2),
        sales_count: seller.sales_count, // целое число
        top_products: seller.top_products,
        bonus: +seller.bonus.toFixed(2)
    }));
}