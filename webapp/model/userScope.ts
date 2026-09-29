import UserService from "./UserService";
import WishlistService from "./WishlistService";
import RecentlyViewedService from "./RecentlyViewedService";
import { isForeignUser, rememberUser, storedUser } from "./itemStore";

// Wishlist and recently viewed live in the browser, they are dropped once start_up names a different user.
class Scope {
    public static pending: Promise<boolean> | undefined;
}

// Resolves once it is settled whether the stored lists belong to the current user
export function listsReady(): Promise<boolean> {
    if (!Scope.pending) {
        Scope.pending = UserService.load().then((oUser) => {
            const sUserId = oUser?.id ?? "";
            // No identity means no decision
            if (!sUserId) {return false;}

            const bForeign = isForeignUser(sUserId, storedUser());
            rememberUser(sUserId);
            if (!bForeign) {return false;}

            WishlistService.clear();
            RecentlyViewedService.clear();
            return true;
        });
    }
    return Scope.pending;
}
