import shop from '../../resources/item-categories.json'

export const ITEM_TIERS = ['素材・初期・消耗品', '中間アイテム', '完成アイテム'] as const
const tiers: Record<string, number> = shop.tiers
export const itemTier = (id: number) => tiers[id] ?? 0
export function compareShopItems(a: { id: number; gold: number }, b: { id: number; gold: number }) {
  return itemTier(a.id) - itemTier(b.id) || a.gold - b.gold || a.id - b.id
}
