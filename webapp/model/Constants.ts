export default class Constants {

    // Routes
    public static readonly ROUTES = {
        HOME: "RouteHome",
        PRODUCT_LIST: "RouteProductList",
        PRODUCT_DETAIL: "RouteProductDetail",
        CART: "RouteCart",
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
        SELECT_CATALOG: "CatalogUuid,Title,CatalogId",
        SELECT_CATALOG_ITEM_CARD: "CatalogItemUuid,ProductName,Material,NetPriceAmount,TransactionCurrency,ProductPictureUrl,CatalogUuid,addToShoppingCart_ac",
        SELECT_CART_HEADER: "ShoppingCartUuid,NetAmount,CurrencyCode",
        SELECT_CART_ITEM: "ShoppingCartItemUuid,ProductName,Material,NetPriceAmount,TransactionCurrency,ProductPictureUrl,Quantity"
    } as const;

    // List limits 
    public static readonly STORAGE = {
        RECENTLY_VIEWED_MAX: 6,
        WISHLIST_MAX: 50
    } as const;

    // UI limits
    public static readonly UI = {
        STEP_INPUT_MIN: 1
    } as const;
}
