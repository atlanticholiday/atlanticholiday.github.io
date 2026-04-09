function toFiniteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

export function roundWelcomePackCurrency(value) {
    return Math.round(toFiniteNumber(value, 0) * 100) / 100;
}

export function formatWelcomePackCurrency(value) {
    return `€${roundWelcomePackCurrency(value).toFixed(2)}`;
}

export function normalizeWelcomePackItem(item = {}) {
    const quantityValue = Number.parseInt(item.quantity ?? item.qty ?? 1, 10);
    const quantity = Number.isInteger(quantityValue) && quantityValue > 0 ? quantityValue : 1;
    const costPrice = roundWelcomePackCurrency(item.costPrice);
    const sellPrice = roundWelcomePackCurrency(item.sellPrice);
    const costVatRate = toFiniteNumber(item.costVatRate, 22);
    const sellVatRate = toFiniteNumber(item.sellVatRate, 22);
    const costGross = roundWelcomePackCurrency(
        item.costGross ?? (costPrice * (1 + (costVatRate / 100)))
    );
    const sellGross = roundWelcomePackCurrency(
        item.sellGross ?? (sellPrice * (1 + (sellVatRate / 100)))
    );

    return {
        ...item,
        name: String(item.name || '').trim(),
        quantity,
        costPrice,
        sellPrice,
        costVatRate,
        sellVatRate,
        costGross,
        sellGross
    };
}

export function summarizeWelcomePackCart(items = [], chargedAmount = null) {
    const normalizedItems = Array.isArray(items)
        ? items.map((item) => normalizeWelcomePackItem(item)).filter((item) => item.name)
        : [];

    const totals = normalizedItems.reduce((summary, item) => {
        const quantity = item.quantity || 1;
        summary.totalLines += 1;
        summary.totalUnits += quantity;
        summary.totalCost = roundWelcomePackCurrency(summary.totalCost + (item.costPrice * quantity));
        summary.suggestedCharge = roundWelcomePackCurrency(summary.suggestedCharge + (item.sellPrice * quantity));
        return summary;
    }, {
        totalLines: 0,
        totalUnits: 0,
        totalCost: 0,
        suggestedCharge: 0
    });

    const hasManualCharge = chargedAmount !== null && chargedAmount !== undefined && chargedAmount !== '';
    const actualCharge = roundWelcomePackCurrency(
        hasManualCharge ? chargedAmount : totals.suggestedCharge
    );

    return {
        items: normalizedItems,
        totals: {
            ...totals,
            chargedAmount: actualCharge,
            profit: roundWelcomePackCurrency(actualCharge - totals.totalCost)
        }
    };
}

export function normalizeWelcomePackLog(log = {}) {
    const cartSummary = summarizeWelcomePackCart(log.items || []);
    const propertyName = String(log.propertyName || log.property || '').trim();
    const totalCost = roundWelcomePackCurrency(
        log.totalCost ?? cartSummary.totals.totalCost
    );
    const suggestedSell = roundWelcomePackCurrency(
        log.suggestedSell ?? cartSummary.totals.suggestedCharge
    );
    const chargedAmount = roundWelcomePackCurrency(
        log.chargedAmount ?? log.totalSell ?? suggestedSell
    );
    const profit = roundWelcomePackCurrency(
        log.profit ?? (chargedAmount - totalCost)
    );

    return {
        ...log,
        property: String(log.property || propertyName).trim(),
        propertyName,
        items: cartSummary.items,
        totalCost,
        suggestedSell,
        chargedAmount,
        totalSell: chargedAmount,
        profit,
        totalLines: cartSummary.totals.totalLines,
        totalUnits: cartSummary.totals.totalUnits
    };
}

export function summarizeWelcomePackLogs(logs = [], filters = {}) {
    const startDate = String(filters.startDate || '').trim();
    const endDate = String(filters.endDate || '').trim();

    const normalizedLogs = (Array.isArray(logs) ? logs : [])
        .map((log) => normalizeWelcomePackLog(log))
        .filter((log) => {
            const date = String(log.date || '').trim();
            if (startDate && date < startDate) {
                return false;
            }
            if (endDate && date > endDate) {
                return false;
            }
            return true;
        });

    const totals = normalizedLogs.reduce((summary, log) => {
        summary.count += 1;
        summary.units += log.totalUnits || 0;
        summary.revenue = roundWelcomePackCurrency(summary.revenue + log.chargedAmount);
        summary.cost = roundWelcomePackCurrency(summary.cost + log.totalCost);
        summary.profit = roundWelcomePackCurrency(summary.profit + log.profit);
        return summary;
    }, {
        count: 0,
        units: 0,
        revenue: 0,
        cost: 0,
        profit: 0
    });

    totals.margin = totals.revenue > 0
        ? roundWelcomePackCurrency((totals.profit / totals.revenue) * 100)
        : 0;
    totals.averageCharge = totals.count > 0
        ? roundWelcomePackCurrency(totals.revenue / totals.count)
        : 0;
    totals.averageCost = totals.count > 0
        ? roundWelcomePackCurrency(totals.cost / totals.count)
        : 0;
    totals.averageProfit = totals.count > 0
        ? roundWelcomePackCurrency(totals.profit / totals.count)
        : 0;

    const byPropertyMap = new Map();
    normalizedLogs.forEach((log) => {
        const label = log.propertyName || log.property || 'Unknown property';
        const current = byPropertyMap.get(label) || {
            label,
            count: 0,
            units: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
            lastDate: ''
        };

        current.count += 1;
        current.units += log.totalUnits || 0;
        current.revenue = roundWelcomePackCurrency(current.revenue + log.chargedAmount);
        current.cost = roundWelcomePackCurrency(current.cost + log.totalCost);
        current.profit = roundWelcomePackCurrency(current.profit + log.profit);
        current.lastDate = !current.lastDate || String(log.date) > current.lastDate
            ? String(log.date || '')
            : current.lastDate;
        byPropertyMap.set(label, current);
    });

    const byProperty = Array.from(byPropertyMap.values())
        .map((entry) => ({
            ...entry,
            margin: entry.revenue > 0
                ? roundWelcomePackCurrency((entry.profit / entry.revenue) * 100)
                : 0
        }))
        .sort((left, right) => {
            if (right.profit !== left.profit) {
                return right.profit - left.profit;
            }
            if (right.revenue !== left.revenue) {
                return right.revenue - left.revenue;
            }
            return left.label.localeCompare(right.label);
        });

    const recentLogs = [...normalizedLogs].sort((left, right) => {
        const rightKey = `${right.date || ''} ${right.createdAt || ''}`;
        const leftKey = `${left.date || ''} ${left.createdAt || ''}`;
        return rightKey.localeCompare(leftKey);
    });

    return {
        logs: normalizedLogs,
        totals,
        byProperty,
        recentLogs
    };
}

export function summarizeWelcomePackInventory(items = []) {
    const normalizedItems = (Array.isArray(items) ? items : [])
        .map((item) => normalizeWelcomePackItem(item))
        .filter((item) => item.name);

    const totals = normalizedItems.reduce((summary, item) => {
        summary.materialCount += 1;
        summary.stockUnits += item.quantity || 0;
        summary.stockCostValue = roundWelcomePackCurrency(
            summary.stockCostValue + ((item.quantity || 0) * item.costPrice)
        );
        summary.stockSellValue = roundWelcomePackCurrency(
            summary.stockSellValue + ((item.quantity || 0) * item.sellPrice)
        );
        return summary;
    }, {
        materialCount: 0,
        stockUnits: 0,
        stockCostValue: 0,
        stockSellValue: 0
    });

    const lowStockItems = normalizedItems.filter((item) => (item.quantity || 0) < 5);

    return {
        items: normalizedItems,
        lowStockItems,
        totals: {
            ...totals,
            lowStockCount: lowStockItems.length,
            potentialProfit: roundWelcomePackCurrency(totals.stockSellValue - totals.stockCostValue)
        }
    };
}
