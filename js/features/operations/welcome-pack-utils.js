function toFiniteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

export const WELCOME_PACK_VAT_RATE = 22;

export function roundWelcomePackCurrency(value) {
    return Math.round(toFiniteNumber(value, 0) * 100) / 100;
}

export function formatWelcomePackCurrency(value) {
    return `\u20AC${roundWelcomePackCurrency(value).toFixed(2)}`;
}

export function applyWelcomePackVat(netAmount, vatRate = WELCOME_PACK_VAT_RATE) {
    const net = roundWelcomePackCurrency(netAmount);
    const rate = toFiniteNumber(vatRate, WELCOME_PACK_VAT_RATE);
    const vat = roundWelcomePackCurrency(net * (rate / 100));
    const gross = roundWelcomePackCurrency(net + vat);

    return { net, vat, gross, vatRate: rate };
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
        name: String(item.name || "").trim(),
        quantity,
        costPrice,
        sellPrice,
        costVatRate,
        sellVatRate,
        costGross,
        sellGross
    };
}

export function summarizeWelcomePackCart(items = [], chargedAmountNet = null) {
    const normalizedItems = Array.isArray(items)
        ? items.map((item) => normalizeWelcomePackItem(item)).filter((item) => item.name)
        : [];

    const totals = normalizedItems.reduce((summary, item) => {
        const quantity = item.quantity || 1;
        summary.totalLines += 1;
        summary.totalUnits += quantity;
        summary.totalCost = roundWelcomePackCurrency(summary.totalCost + (item.costPrice * quantity));
        summary.suggestedChargeNet = roundWelcomePackCurrency(summary.suggestedChargeNet + (item.sellPrice * quantity));
        return summary;
    }, {
        totalLines: 0,
        totalUnits: 0,
        totalCost: 0,
        suggestedChargeNet: 0
    });

    const suggestedVat = applyWelcomePackVat(totals.suggestedChargeNet);
    const hasManualCharge = chargedAmountNet !== null && chargedAmountNet !== undefined && chargedAmountNet !== "";
    const actualVat = applyWelcomePackVat(
        hasManualCharge ? chargedAmountNet : totals.suggestedChargeNet
    );
    const profit = roundWelcomePackCurrency(actualVat.net - totals.totalCost);

    return {
        items: normalizedItems,
        totals: {
            ...totals,
            suggestedChargeGross: suggestedVat.gross,
            chargedAmountNet: actualVat.net,
            chargedAmountGross: actualVat.gross,
            vatAmount: actualVat.vat,
            profit,
            margin: actualVat.net > 0
                ? roundWelcomePackCurrency((profit / actualVat.net) * 100)
                : 0
        }
    };
}

export function normalizeWelcomePackLog(log = {}) {
    const cartSummary = summarizeWelcomePackCart(log.items || []);
    const propertyName = String(log.propertyName || log.property || "").trim();
    const totalCost = roundWelcomePackCurrency(
        log.totalCost ?? cartSummary.totals.totalCost
    );
    const suggestedSellNet = roundWelcomePackCurrency(
        log.suggestedSell ?? log.suggestedSellNet ?? cartSummary.totals.suggestedChargeNet
    );
    const suggestedSellGross = roundWelcomePackCurrency(
        log.suggestedSellGross ?? applyWelcomePackVat(suggestedSellNet).gross
    );
    const chargedAmountNet = roundWelcomePackCurrency(
        log.chargedAmountNet ?? log.chargedAmount ?? log.totalSell ?? suggestedSellNet
    );
    const chargedAmountGross = roundWelcomePackCurrency(
        log.chargedAmountGross ?? applyWelcomePackVat(chargedAmountNet).gross
    );
    const vatAmount = roundWelcomePackCurrency(
        log.vatAmount ?? (chargedAmountGross - chargedAmountNet)
    );
    const profit = roundWelcomePackCurrency(
        log.profit ?? (chargedAmountNet - totalCost)
    );

    return {
        ...log,
        property: String(log.property || propertyName).trim(),
        propertyName,
        items: cartSummary.items,
        totalCost,
        suggestedSell: suggestedSellNet,
        suggestedSellNet,
        suggestedSellGross,
        chargedAmount: chargedAmountGross,
        chargedAmountNet,
        chargedAmountGross,
        vatAmount,
        totalSell: chargedAmountGross,
        profit,
        totalLines: cartSummary.totals.totalLines,
        totalUnits: cartSummary.totals.totalUnits
    };
}

export function summarizeWelcomePackLogs(logs = [], filters = {}) {
    const startDate = String(filters.startDate || "").trim();
    const endDate = String(filters.endDate || "").trim();

    const normalizedLogs = (Array.isArray(logs) ? logs : [])
        .map((log) => normalizeWelcomePackLog(log))
        .filter((log) => {
            const date = String(log.date || "").trim();
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
        summary.netRevenue = roundWelcomePackCurrency(summary.netRevenue + log.chargedAmountNet);
        summary.grossRevenue = roundWelcomePackCurrency(summary.grossRevenue + log.chargedAmountGross);
        summary.vatCollected = roundWelcomePackCurrency(summary.vatCollected + log.vatAmount);
        summary.cost = roundWelcomePackCurrency(summary.cost + log.totalCost);
        summary.profit = roundWelcomePackCurrency(summary.profit + log.profit);
        return summary;
    }, {
        count: 0,
        units: 0,
        netRevenue: 0,
        grossRevenue: 0,
        vatCollected: 0,
        cost: 0,
        profit: 0
    });

    totals.revenue = totals.grossRevenue;
    totals.margin = totals.netRevenue > 0
        ? roundWelcomePackCurrency((totals.profit / totals.netRevenue) * 100)
        : 0;
    totals.averageNetCharge = totals.count > 0
        ? roundWelcomePackCurrency(totals.netRevenue / totals.count)
        : 0;
    totals.averageGrossCharge = totals.count > 0
        ? roundWelcomePackCurrency(totals.grossRevenue / totals.count)
        : 0;
    totals.averageVat = totals.count > 0
        ? roundWelcomePackCurrency(totals.vatCollected / totals.count)
        : 0;
    totals.averageCharge = totals.averageGrossCharge;
    totals.averageCost = totals.count > 0
        ? roundWelcomePackCurrency(totals.cost / totals.count)
        : 0;
    totals.averageProfit = totals.count > 0
        ? roundWelcomePackCurrency(totals.profit / totals.count)
        : 0;

    const byPropertyMap = new Map();
    const byDateMap = new Map();
    const materialUsageMap = new Map();

    normalizedLogs.forEach((log) => {
        const label = log.propertyName || log.property || "Unknown property";
        const current = byPropertyMap.get(label) || {
            label,
            count: 0,
            units: 0,
            netRevenue: 0,
            grossRevenue: 0,
            vatCollected: 0,
            cost: 0,
            profit: 0,
            lastDate: ""
        };

        current.count += 1;
        current.units += log.totalUnits || 0;
        current.netRevenue = roundWelcomePackCurrency(current.netRevenue + log.chargedAmountNet);
        current.grossRevenue = roundWelcomePackCurrency(current.grossRevenue + log.chargedAmountGross);
        current.vatCollected = roundWelcomePackCurrency(current.vatCollected + log.vatAmount);
        current.cost = roundWelcomePackCurrency(current.cost + log.totalCost);
        current.profit = roundWelcomePackCurrency(current.profit + log.profit);
        current.lastDate = !current.lastDate || String(log.date) > current.lastDate
            ? String(log.date || "")
            : current.lastDate;
        byPropertyMap.set(label, current);

        const dateKey = String(log.date || "").trim();
        if (dateKey) {
            const daily = byDateMap.get(dateKey) || {
                date: dateKey,
                count: 0,
                grossRevenue: 0,
                netRevenue: 0,
                profit: 0
            };
            daily.count += 1;
            daily.grossRevenue = roundWelcomePackCurrency(daily.grossRevenue + log.chargedAmountGross);
            daily.netRevenue = roundWelcomePackCurrency(daily.netRevenue + log.chargedAmountNet);
            daily.profit = roundWelcomePackCurrency(daily.profit + log.profit);
            byDateMap.set(dateKey, daily);
        }

        log.items.forEach((item) => {
            const itemLabel = String(item.name || "").trim();
            if (!itemLabel) {
                return;
            }
            const material = materialUsageMap.get(itemLabel) || {
                label: itemLabel,
                units: 0,
                totalCost: 0
            };
            const quantity = item.quantity || 1;
            material.units += quantity;
            material.totalCost = roundWelcomePackCurrency(material.totalCost + ((item.costPrice || 0) * quantity));
            materialUsageMap.set(itemLabel, material);
        });
    });

    const byProperty = Array.from(byPropertyMap.values())
        .map((entry) => ({
            ...entry,
            revenue: entry.grossRevenue,
            margin: entry.netRevenue > 0
                ? roundWelcomePackCurrency((entry.profit / entry.netRevenue) * 100)
                : 0,
            averageGrossCharge: entry.count > 0
                ? roundWelcomePackCurrency(entry.grossRevenue / entry.count)
                : 0
        }))
        .sort((left, right) => {
            if (right.profit !== left.profit) {
                return right.profit - left.profit;
            }
            if (right.grossRevenue !== left.grossRevenue) {
                return right.grossRevenue - left.grossRevenue;
            }
            return left.label.localeCompare(right.label);
        });

    const byDate = Array.from(byDateMap.values())
        .sort((left, right) => left.date.localeCompare(right.date));

    const topMaterials = Array.from(materialUsageMap.values())
        .sort((left, right) => {
            if (right.units !== left.units) {
                return right.units - left.units;
            }
            return left.label.localeCompare(right.label);
        })
        .slice(0, 8);

    const recentLogs = [...normalizedLogs].sort((left, right) => {
        const rightKey = `${right.date || ""} ${right.createdAt || ""}`;
        const leftKey = `${left.date || ""} ${left.createdAt || ""}`;
        return rightKey.localeCompare(leftKey);
    });

    return {
        logs: normalizedLogs,
        totals,
        byProperty,
        byDate,
        topMaterials,
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
