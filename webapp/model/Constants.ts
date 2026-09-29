export default class Constants {

    // Routes
    public static readonly ROUTES = {
        HOME: "RouteHome",
        PRODUCT_LIST: "RouteProductList",
        PRODUCT_DETAIL: "RouteProductDetail",
        CART: "RouteCart",
        CHECKOUT: "RouteCheckout",
        WISHLIST: "RouteWishlist",
        ORDER_CONFIRM: "RouteOrderConfirm",
        ORDER_HISTORY: "RouteOrderHistory",
        PROFILE: "RouteProfile"
    } as const;

    // Models
    public static readonly MODELS = {
        CART: "cartModel",
        WISHLIST: "wishlistModel",
        ORDER_CONFIRM: "orderConfirmModel",
        CHECKOUT: "checkoutModel",
        CART_SERVICE: "cartService",
        I18N: "i18n",
        CONFIG: "config",
        DETAIL: "detailModel",
        CATALOG: "catalogModel"
    } as const;

    // OData paths, FunctionImports, and $select lists
    public static readonly ODATA = {
        FUNCTION_ADD_TO_CART: "/addToShoppingCart",
        FUNCTION_ORDER_CART: "/orderShoppingCart",
        ENTITY_CATALOG: "/Catalog",
        ENTITY_CATALOG_ITEM: "/CatalogItem",
        ENTITY_CART_ITEM: "/ShoppingCartItem",
        ENTITY_CART: "/ShoppingCart",
        NAV_CART_ITEMS: "to_ShoppingCartItem",
        SELECT_CATALOG: "CatalogUuid,Title,CatalogId",
        SELECT_CATALOG_ITEM_CARD: "CatalogItemUuid,ProductName,Material,NetPriceAmount,TransactionCurrency,ProductPictureUrl,CatalogUuid,addToShoppingCart_ac",
        SELECT_CART_HEADER: "ShoppingCartUuid,NetAmount,CurrencyCode,ApproverStatus,orderShoppingCart_ac,ExternalReference,Remark,DeliveryStreet,DeliveryCity,DeliveryPostalCode,DeliveryCountry",
        SELECT_CART_ITEM: "ShoppingCartItemUuid,ShoppingCartUuid,ProductName,Material,NetPriceAmount,TransactionCurrency,ProductPictureUrl,Quantity",
        SELECT_ORDER: "ShoppingCartUuid,ShoppingCartId,NetAmount,CurrencyCode,ApproverStatus,CreationDateTime,orderShoppingCart_ac,to_ApproverStatus/DomainValue_Text"
    } as const;

    // Cart approval status
    public static readonly ORDER_STATUS = {
        ORDERED: "5"
    } as const;

    // List limits
    public static readonly STORAGE = {
        RECENTLY_VIEWED_MAX: 6,
        WISHLIST_MAX: 50
    } as const;

    // UI limits
    public static readonly UI = {
        STEP_INPUT_MIN: 1,
        STEP_INPUT_MAX: 20,
        // Live search waits this long after the last keystroke before querying
        SEARCH_DEBOUNCE_MS: 300,
        // Upper end of the price filter
        PRICE_FILTER_MAX: 1_000_000_000
    } as const;
}
