import Log from "sap/base/Log";

export interface CurrentUser {
    id: string;
    fullName: string;
    initials: string;
    email: string;
}

interface StartUpResponse {
    id?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    email?: string;
}

// Reads the logged-in user from the NetWeaver start-up service
export default class UserService {
    private static readonly URL = "/sap/bc/ui2/start_up";
    private static _pLoad: Promise<CurrentUser | null> | undefined;

    // Resolves with null when the service is unavailable; callers keep their fallback display
    public static load(): Promise<CurrentUser | null> {
        if (UserService._pLoad) {
            return UserService._pLoad;
        }

        UserService._pLoad = fetch(UserService.URL, { headers: { Accept: "application/json" } })
            .then((oResponse) => {
                if (!oResponse.ok) {throw new Error(`start_up returned ${oResponse.status}`);}
                return oResponse.json() as Promise<StartUpResponse>;
            })
            .then((oData) => UserService.toUser(oData))
            .catch((oErr: unknown) => {
                // Allow a later retry instead of caching the failure
                UserService._pLoad = undefined;
                Log.warning("Current user not available.", String(oErr));
                return null;
            });

        return UserService._pLoad;
    }

    public static toUser(oData: StartUpResponse): CurrentUser | null {
        const sId = (oData.id ?? "").trim();
        if (!sId) {return null;}

        const sFullName = (oData.fullName ?? "").trim()
            || [oData.firstName, oData.lastName].map((s) => (s ?? "").trim()).filter(Boolean).join(" ")
            || sId;

        return {
            id: sId,
            fullName: sFullName,
            initials: UserService.initialsOf(sFullName),
            email: (oData.email ?? "").trim()
        };
    }

    public static initialsOf(sName: string): string {
        return sName
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((s) => s.charAt(0).toUpperCase())
            .join("");
    }
}
