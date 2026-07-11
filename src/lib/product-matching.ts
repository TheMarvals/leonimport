export function normalizeProductCode(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
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
  source: { sku: string; name: string; brand?: string | null; color?: string | null; size?: string | null },
  candidate: { sku: string; name: string; brand?: string | null; color?: string | null; size?: string | null },
): number {
  const sourceSku = normalizeProductCode(source.sku);
  const candidateSku = normalizeProductCode(candidate.sku);
  if (sourceSku && sourceSku === candidateSku) return 100;

  let skuScore = 0;
  if (sourceSku.length >= 4 && candidateSku.length >= 4) {
    if (sourceSku.includes(candidateSku) || candidateSku.includes(sourceSku)) skuScore = 78;
    else {
      let prefix = 0;
      while (prefix < sourceSku.length && prefix < candidateSku.length && sourceSku[prefix] === candidateSku[prefix]) prefix++;
      skuScore = Math.round((prefix / Math.max(sourceSku.length, candidateSku.length)) * 70);
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

  return Math.max(0, Math.max(skuScore, nameScore) - (conflictingVariant ? 25 : 0));
}
