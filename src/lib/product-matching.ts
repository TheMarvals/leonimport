export function normalizeProductCode(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function normalizeMarketplaceCode(value?: string | null): string {
  return normalizeProductCode(value).replace(/^0+(?=\d)/, '');
}

export function marketplaceSkuAliases(aliases?: string[] | null): string[] {
  return [...new Set((aliases || [])
    .map(alias => alias.trim())
    .filter(alias =>
      alias.length >= 3 &&
      alias.length <= 64 &&
      !/\s/.test(alias) &&
      /\d/.test(alias) &&
      !/^https?:/i.test(alias)
    ))];
}

export function normalizeProductName(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export function productMatchScore(
  source: {
    sku: string;
    name: string;
    brand?: string | null;
    color?: string | null;
    size?: string | null;
    mlAliases?: string[];
    marketplaceListings?: Array<{ sellerSku?: string | null }>;
  },
  candidate: {
    sku: string;
    name: string;
    brand?: string | null;
    color?: string | null;
    size?: string | null;
    mlAliases?: string[];
    marketplaceListings?: Array<{ sellerSku?: string | null }>;
  },
): number {
  const sourceMlSkus = [...new Set([
    ...(source.marketplaceListings || []).map(listing => listing.sellerSku || ''),
    ...marketplaceSkuAliases(source.mlAliases),
  ].map(normalizeMarketplaceCode).filter(Boolean))];
  const candidateMlSkus = [...new Set([
    ...(candidate.marketplaceListings || []).map(listing => listing.sellerSku || ''),
    ...marketplaceSkuAliases(candidate.mlAliases),
  ].map(normalizeMarketplaceCode).filter(Boolean))];

  let marketplaceSkuScore = 0;
  for (const sourceSku of sourceMlSkus) {
    for (const candidateSku of candidateMlSkus) {
      if (sourceSku === candidateSku) return 100;
      if (sourceSku.length >= 4 && candidateSku.length >= 4 && (sourceSku.includes(candidateSku) || candidateSku.includes(sourceSku))) {
        marketplaceSkuScore = Math.max(marketplaceSkuScore, 90);
      }
    }
  }

  const sourceSku = normalizeProductCode(source.sku);
  const candidateSku = normalizeProductCode(candidate.sku);

  let skuScore = 0;
  // El SKU interno solo es una señal de respaldo cuando falta un seller SKU de ML.
  if ((!sourceMlSkus.length || !candidateMlSkus.length) && sourceSku.length >= 4 && candidateSku.length >= 4) {
    if (sourceSku === candidateSku) skuScore = 88;
    else if (sourceSku.includes(candidateSku) || candidateSku.includes(sourceSku)) skuScore = 72;
    else {
      let prefix = 0;
      while (prefix < sourceSku.length && prefix < candidateSku.length && sourceSku[prefix] === candidateSku[prefix]) prefix++;
      skuScore = Math.round((prefix / Math.max(sourceSku.length, candidateSku.length)) * 60);
    }
  }

  const sourceTokens = new Set(normalizeProductName(source.name).split(' ').filter(token => token.length > 2));
  const candidateTokens = new Set(normalizeProductName(candidate.name).split(' ').filter(token => token.length > 2));
  const intersection = [...sourceTokens].filter(token => candidateTokens.has(token)).length;
  const union = new Set([...sourceTokens, ...candidateTokens]).size;
  const nameScore = union ? Math.round((intersection / union) * 75) : 0;

  const conflictingVariant = ['brand', 'color', 'size'].some(field => {
    const sourceValue = normalizeProductName(source[field as keyof typeof source] as string | null);
    const candidateValue = normalizeProductName(candidate[field as keyof typeof candidate] as string | null);
    return sourceValue && candidateValue && sourceValue !== candidateValue;
  });

  const baseScore = Math.max(marketplaceSkuScore, skuScore, nameScore);
  // Un seller SKU de ML coincidente pesa más que atributos incompletos o inconsistentes.
  const penalty = conflictingVariant && marketplaceSkuScore < 90 ? 25 : 0;
  return Math.max(0, baseScore - penalty);
}
