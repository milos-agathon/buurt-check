interface DigitalGoodsPrice {
  currency: string;
  value: string;
}

interface DigitalGoodsItemDetails {
  itemId: string;
  title?: string;
  description?: string;
  price: DigitalGoodsPrice;
}

interface DigitalGoodsPurchaseDetails {
  itemId: string;
  purchaseToken: string;
}

interface DigitalGoodsService {
  getDetails(itemIds: string[]): Promise<DigitalGoodsItemDetails[]>;
  listPurchases(): Promise<DigitalGoodsPurchaseDetails[]>;
  consume(purchaseToken: string): Promise<void>;
}

interface Window {
  getDigitalGoodsService?: (paymentMethod: string) => Promise<DigitalGoodsService>;
}
